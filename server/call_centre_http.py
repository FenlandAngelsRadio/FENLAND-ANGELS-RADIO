"""Loopback-only queue API. Not installed or enabled by this repository.

Staff requests come from the authenticated FAR Edge Function. Provider
events use a separate token and can only arrive/disconnect, never go on air.
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from call_centre import CallQueue, QueueError


def handler(queue, staff_token, provider_token):
    if min(len(staff_token), len(provider_token)) < 32 or staff_token == provider_token:
        raise ValueError("Two different tokens of at least 32 characters are required.")

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *args):
            pass  # Never put caller names or authentication into logs.

        def out(self, status, body):
            raw = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            provider = self.path == "/provider-event"
            if self.path not in {"/queue", "/provider-event"}:
                return self.out(404, {"error": "Not found"})
            token = provider_token if provider else staff_token
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.out(401, {"error": "Unauthorised"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
                if not 0 < n <= 16384:
                    return self.out(413, {"error": "Request too large or empty"})
                body = json.loads(self.rfile.read(n))
                if not isinstance(body, dict):
                    raise ValueError()
                action = body.get("action")
                if provider:
                    if action == "arrive":
                        call_id = queue.arrive(body.get("category"), body.get("source"),
                                              body.get("name", "Caller"), body.get("provider_id"))
                        return self.out(200, {"id": call_id})
                    if action == "disconnect":
                        queue.disconnected(body.get("provider_id"))
                        return self.out(200, {"ok": True})
                    raise QueueError("Provider events cannot control the broadcast.")
                actor = body.get("actor", {})
                if not isinstance(actor, dict) or not queue.authorised(actor):
                    return self.out(403, {"error": "Cloud Live access is required."})
                if action == "list":
                    return self.out(200, queue.snapshot(actor))
                if action == "act":
                    return self.out(200, queue.act(actor, body.get("id"),
                                                 body.get("operation"), body.get("version")))
                raise QueueError("Choose a valid call control.")
            except (ValueError, TypeError, KeyError):
                self.out(400, {"error": "Invalid request"})
            except QueueError as error:
                self.out(409, {"error": str(error)})
            except Exception:
                self.out(503, {"error": "Call service unavailable. Refresh before trying again."})

    return Handler


if __name__ == "__main__":
    queue = CallQueue(os.environ["FAR_CALL_QUEUE_PATH"])
    server = ThreadingHTTPServer(("127.0.0.1", 8768), handler(
        queue, os.environ["FAR_CALL_STAFF_TOKEN"], os.environ["FAR_CALL_PROVIDER_TOKEN"]))
    server.serve_forever()
