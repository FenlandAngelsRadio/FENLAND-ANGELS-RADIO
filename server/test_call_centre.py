import tempfile
import threading
import unittest
from pathlib import Path
from call_centre import CallQueue, QueueError


OWNER = {"id": "owner", "role": "owner", "permissions": []}
NICK = {"id": "nick", "role": "deputy_manager", "permissions": []}
STAFF = {"id": "dj", "role": "staff", "permissions": ["cloud_live"]}


class Audio:
    ready = True
    def __init__(self): self.actions = []; self.accept = True
    def apply(self, action, call, actor):
        self.actions.append((action, call["category"], actor["id"]))
        return self.accept


class CallQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/"queue.json"
        self.audio = Audio()
        self.q = CallQueue(self.path, self.audio)

    def act(self, actor, call, action):
        return self.q.act(actor, call, action, self.q.snapshot(actor)["version"])

    def test_private_calls_are_hidden_and_cannot_be_broadcast(self):
        call = self.q.arrive("business", "phone", "Business caller", "private-1")
        self.assertEqual(self.q.snapshot(STAFF)["calls"], [])
        with self.assertRaises(QueueError): self.act(STAFF, call, "end")
        for action in self.q.programme_actions:
            with self.assertRaises(QueueError): self.act(OWNER, call, action)
        self.assertEqual(self.audio.actions, [])

    def test_first_private_answer_wins_under_concurrent_requests(self):
        call = self.q.arrive("business", "phone", "Caller", "private-2")
        version = self.q.snapshot(OWNER)["version"]
        results = []
        def answer(actor):
            try: self.q.act(actor, call, "answer_private", version); results.append("answered")
            except QueueError: results.append("rejected")
        threads = [threading.Thread(target=answer, args=(a,)) for a in [OWNER, NICK]]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertCountEqual(results, ["answered", "rejected"])
        self.assertEqual(len(self.audio.actions), 1)

    def test_manual_screening_required_and_only_one_on_air(self):
        first = self.q.arrive("games", "phone", "Game caller", "1")
        second = self.q.arrive("show", "guest", "Interview guest", "2")
        with self.assertRaises(QueueError): self.act(STAFF, first, "put_on_air")
        for call in [first, second]:
            self.act(STAFF, call, "screen"); self.act(STAFF, call, "ready")
        self.act(STAFF, first, "put_on_air")
        with self.assertRaises(QueueError): self.act(STAFF, second, "put_on_air")
        self.act(STAFF, first, "hold"); self.act(STAFF, second, "put_on_air")
        self.q.disconnected("2")
        self.assertEqual(len(self.q.snapshot(STAFF)["calls"]), 1)

    def test_audio_failure_never_reports_success(self):
        call = self.q.arrive("show", "guest", "Guest", "3")
        self.audio.accept = False
        with self.assertRaises(QueueError): self.act(STAFF, call, "screen")
        self.assertEqual(self.q.snapshot(STAFF)["calls"][0]["state"], "waiting")

    def test_unconnected_service_does_not_claim_to_screen(self):
        q = CallQueue(self.path)
        call = q.arrive("show", "phone", "Caller", "4")
        with self.assertRaises(QueueError): q.act(OWNER, call, "screen", 1)
        self.assertFalse(q.snapshot(OWNER)["audio_ready"])

    def test_malformed_identity_and_permissions_fail_closed(self):
        for actor in [None, [], {'id': []}, {'id': 'x', 'role': [], 'permissions': ['cloud_live']}, {'id': 'x', 'role': 'staff', 'permissions': 'cloud_live'},
                      {'id': 'x', 'permissions': None}]:
            self.assertFalse(self.q.authorised(actor))
        with self.assertRaises(QueueError):
            self.q.arrive('show', 'phone', 'Caller', {'id': 'bad'})

    def test_retries_and_restart_preserve_queue(self):
        call = self.q.arrive("show", "phone", "Caller", "5")
        self.assertEqual(self.q.arrive("show", "phone", "Caller", "5"), call)
        reloaded = CallQueue(self.path, self.audio)
        self.assertEqual(reloaded.snapshot(OWNER)["calls"][0]["id"], call)
        self.assertNotIn("provider_id", reloaded.snapshot(OWNER)["calls"][0])
        with self.assertRaises(QueueError): reloaded.snapshot({"id":"stranger", "role":"staff"})

    def test_save_failure_attempts_audio_isolation_and_does_not_claim_success(self):
        call = self.q.arrive("show", "phone", "Caller", "6")
        self.q._save = lambda _: (_ for _ in ()).throw(OSError("disk full"))
        with self.assertRaisesRegex(QueueError, "disconnected for safety"):
            self.act(STAFF, call, "screen")
        self.assertEqual(self.audio.actions[-1][0], "end")
        self.assertEqual(self.q.snapshot(STAFF)["calls"][0]["state"], "waiting")

    def test_separate_provider_token_cannot_control_programme(self):
        import json
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from call_centre_http import handler
        staff_token, provider_token = "s"*32, "p"*32
        server = ThreadingHTTPServer(("127.0.0.1",0),handler(self.q,staff_token,provider_token))
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        def request(path, token, body):
            req=urllib.request.Request("http://127.0.0.1:%s%s"%(server.server_port,path),
                data=json.dumps(body).encode(),headers={"Authorization":"Bearer "+token})
            return urllib.request.urlopen(req)
        with self.assertRaises(urllib.error.HTTPError) as denied:
            request("/queue",provider_token,{"action":"list","actor":OWNER})
        self.assertEqual(denied.exception.code,401)
        with self.assertRaises(urllib.error.HTTPError) as denied:
            request("/provider-event",provider_token,{"action":"put_on_air"})
        self.assertEqual(denied.exception.code,409)
        with request("/provider-event",provider_token,{"action":"arrive","category":"games","source":"phone","name":"Caller","provider_id":"http-1"}) as r:
            self.assertIn("id",json.load(r))


if __name__ == "__main__": unittest.main()
