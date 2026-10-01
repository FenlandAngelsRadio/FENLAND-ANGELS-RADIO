import unittest
from web_bridge import validate


class BridgeTests(unittest.TestCase):
    def test_dj_routes(self):
        for method, path in [('GET', '/djs'), ('POST', '/djs'), ('POST', '/return-automation'),
                             ('POST', '/djs/abc/password'), ('POST', '/djs/abc/enabled'),
                             ('POST', '/djs/abc/take-live'), ('DELETE', '/djs/abc')]:
            validate({'service': 'djs', 'method': method, 'path': path})

    def test_arbitrary_routes_and_commands_denied(self):
        for path in ['/etc/passwd', '/djs/../token', '/djs?token=1', 'http://evil.test', '/djs/abc/other']:
            with self.assertRaises(ValueError):
                validate({'service': 'djs', 'method': 'GET', 'path': path})
        with self.assertRaises(ValueError):
            validate({'service': 'shell', 'method': 'POST', 'path': '/djs'})

    def test_call_events_cannot_use_bridge(self):
        for path, action in [('/provider-event', 'arrive'), ('/queue', 'arrive'), ('/queue', 'disconnect')]:
            with self.assertRaises(ValueError):
                validate({'service': 'calls', 'method': 'POST', 'path': path, 'body': {'action': action}})

    def test_calls_only_queue_controls(self):
        for action in ['list', 'act']:
            validate({'service': 'calls', 'method': 'POST', 'path': '/queue', 'body': {'action': action}})
        with self.assertRaises(ValueError):
            validate({'service': 'calls', 'method': 'POST', 'path': '/queue', 'body': []})
