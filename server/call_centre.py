"""Isolated FAR call queue. No connection to the existing radio services.

An audio adapter must confirm each operation before a call changes state.
Private business calls are never permitted on the programme audio path.
"""
import copy
import json
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path


class QueueError(Exception):
    pass


class UnconnectedAudio:
    ready = False

    def apply(self, action, call, actor):
        raise QueueError("Audio connections are not set up yet.")


class CallQueue:
    categories = {"games", "show", "business"}
    programme_actions = {"screen", "ready", "hold", "put_on_air", "mute"}
    management = {"owner", "deputy_manager"}
    terminal = {"ended", "voicemail"}

    def __init__(self, path, audio=None, clock=time.time):
        self.path = Path(path)
        self.audio = audio or UnconnectedAudio()
        self.clock = clock
        self.lock = threading.RLock()
        self.data = {"version": 0, "calls": [], "audit": []}
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))

    @classmethod
    def authorised(cls, actor):
        return bool(actor.get("id")) and (
            actor.get("role") in cls.management
            or "cloud_live" in actor.get("permissions", [])
        )

    def _save(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as out:
                json.dump(data, out)
                out.flush()
                os.fsync(out.fileno())
            os.chmod(name, 0o600)
            os.replace(name, self.path)
            self.data = data
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def _commit(self, data, action, call_id, actor):
        data["version"] += 1
        data["audit"].append({"at": self.clock(), "action": action,
                              "call_id": call_id, "actor": actor})
        data["audit"] = data["audit"][-500:]
        self._save(data)

    def arrive(self, category, source, name, provider_id):
        """Trusted provider adapter only. Never exposed to staff/public clients."""
        if category not in self.categories or source not in {"phone", "guest"}:
            raise QueueError("Choose a valid call destination.")
        if not provider_id or len(provider_id) > 200:
            raise QueueError("A provider call reference is required.")
        with self.lock:
            for call in self.data["calls"]:
                if call["provider_id"] == provider_id:
                    return call["id"]
            data = copy.deepcopy(self.data)
            # Only terminal metadata is pruned. Live call references must remain.
            data["calls"] = [c for c in data["calls"]
                             if c["state"] not in self.terminal or c["updated_at"] > self.clock()-86400]
            if len(data["calls"]) >= 200:
                raise QueueError("Call queue is full.")
            call_id = secrets.token_hex(16)
            data["calls"].append({"id": call_id, "provider_id": provider_id,
                                  "name": str(name).strip()[:80] or "Caller",
                                  "category": category, "source": source,
                                  "state": "waiting", "claimed_by": None,
                                  "created_at": self.clock(), "updated_at": self.clock()})
            self._commit(data, "arrive", call_id, "provider")
            return call_id

    def snapshot(self, actor):
        if not self.authorised(actor):
            raise QueueError("Cloud Live access is required.")
        with self.lock:
            calls = [{k: v for k, v in call.items() if k != "provider_id"}
                     for call in self.data["calls"]
                     if call["state"] not in self.terminal
                     and (call["category"] != "business" or actor["role"] in self.management)]
            return {"version": self.data["version"], "calls": calls,
                    "audio_ready": self.audio.ready,
                    "private_access": actor["role"] in self.management}

    def act(self, actor, call_id, action, version):
        if not self.authorised(actor):
            raise QueueError("Cloud Live access is required.")
        with self.lock:
            if version != self.data["version"]:
                raise QueueError("Another team member changed the queue. Refresh and try again.")
            data = copy.deepcopy(self.data)
            call = next((c for c in data["calls"] if c["id"] == call_id), None)
            if not call or call["state"] in self.terminal:
                raise QueueError("This call has already ended.")
            private = call["category"] == "business"
            if private and actor["role"] not in self.management:
                raise QueueError("Owner or Deputy Manager access is required for private calls.")
            if private and action in self.programme_actions:
                raise QueueError("Private business calls cannot enter the broadcast.")
            if not private and action in {"answer_private", "voicemail"}:
                raise QueueError("This is a show call, not a private business call.")
            if call["claimed_by"] not in {None, actor["id"]}:
                raise QueueError("Another team member is handling this call.")
            transitions = {
                "screen": ({"waiting", "held"}, "screening"),
                "ready": ({"screening"}, "ready"),
                "hold": ({"screening", "ready", "on_air", "muted"}, "held"),
                "put_on_air": ({"ready", "muted"}, "on_air"),
                "mute": ({"on_air"}, "muted"),
                "answer_private": ({"waiting"}, "private_answered"),
                "voicemail": ({"waiting", "private_answered"}, "voicemail"),
                "end": ({"waiting", "held", "screening", "ready", "on_air", "muted", "private_answered"}, "ended"),
            }
            if action not in transitions or call["state"] not in transitions[action][0]:
                raise QueueError("This control is not available for the call's current stage.")
            if action == "put_on_air" and any(c["state"] in {"on_air", "muted"}
                                               and c["id"] != call_id for c in data["calls"]):
                raise QueueError("Hold or end the current on-air caller first.")
            # Queue labels are never proof that the audio operation succeeded.
            if self.audio.apply(action, copy.deepcopy(call), actor) is not True:
                raise QueueError("The phone system did not confirm this action.")
            call["state"] = transitions[action][1]
            call["claimed_by"] = None if action == "hold" else actor["id"]
            call["updated_at"] = self.clock()
            try:
                self._commit(data, action, call_id, actor["id"])
            except OSError:
                # Best-effort isolation if persistence fails after an audio action.
                try:
                    disconnected = self.audio.apply("end", call, actor) is True
                except Exception:
                    disconnected = False
                raise QueueError("The action could not be saved. " + (
                    "The call was disconnected for safety." if disconnected
                    else "Disconnection could not be confirmed. Check the audio system immediately."
                ))
            return self.snapshot(actor)

    def disconnected(self, provider_id):
        """Provider confirms disconnect; remove it from every staff queue."""
        with self.lock:
            data = copy.deepcopy(self.data)
            call = next((c for c in data["calls"] if c["provider_id"] == provider_id), None)
            if call and call["state"] not in self.terminal:
                call.update(state="ended", updated_at=self.clock())
                self._commit(data, "disconnected", call["id"], "provider")
