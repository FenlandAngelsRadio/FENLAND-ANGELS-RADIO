import tempfile
import unittest
from pathlib import Path
from asterisk_audio import AsteriskAudio
from asterisk_events import CallEvents
from call_centre import CallQueue, QueueError


class EventARI:
    def __init__(self):
        self.channels = {}
        self.bridges = {}
        self.hungup = []

    def request(self, method, path, **params):
        parts = path.strip('/').split('/')
        if parts[0] == 'applications':
            return {'channel_ids': list(self.channels)}
        if parts[0] == 'channels':
            cid = parts[1]
            if method == 'DELETE':
                self.hungup.append(cid)
                self.channels.pop(cid, None)
                for members in self.bridges.values():
                    if cid in members:
                        members.remove(cid)
            elif method == 'GET':
                return self.channels[cid]
            return None
        if path == '/bridges':
            return [{'id': bid} for bid in self.bridges]
        bid = parts[1]
        if method == 'GET':
            return {'channels': self.bridges[bid][:]}
        if method == 'DELETE':
            self.bridges.pop(bid, None)
        elif len(parts) == 2:
            self.bridges[bid] = []
        else:
            cid = params['channel']
            for members in self.bridges.values():
                if cid in members:
                    members.remove(cid)
            self.bridges[bid].append(cid)


class EventTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ari = EventARI()
        self.audio = AsteriskAudio(self.ari)
        self.queue = CallQueue(Path(self.tmp.name) / 'queue.json', self.audio, clock=lambda: 1000)
        self.events = CallEvents(self.queue, self.audio, {'operator': 'owner'}, True, clock=lambda: 2000)
        self.audio.ready = True
        self.owner = {'id': 'owner', 'role': 'owner'}

    def tearDown(self):
        self.tmp.cleanup()

    def test_production_studio_requires_configured_endpoint(self):
        self.events.test_mode=False
        self.events.studio_endpoint='studio'
        with self.assertRaises(QueueError):
            self.start('intruder','studio','PJSIP/owner-000001')
        self.assertIsNone(self.audio.programme_bridge)
        self.start('studio-real','studio','PJSIP/studio-000001')
        self.assertIsNotNone(self.audio.programme_bridge)

    def start(self, cid, destination, name=None):
        channel = {'id': cid, 'state': 'Up', 'name': name or 'Local/caller@far-test-1;1'}
        self.ari.channels[cid] = channel
        self.events.handle({'type': 'StasisStart', 'channel': channel, 'args': [destination]})

    def test_arrival_disconnect_and_duplicate_events(self):
        self.start('caller', 'games')
        self.start('caller', 'games')
        self.assertEqual(len(self.queue.data['calls']), 1)
        self.events.handle({'type': 'StasisEnd', 'channel': {'id': 'caller'}})
        self.assertEqual(self.queue.snapshot(self.owner)['calls'], [])
        self.assertEqual(self.ari.bridges, {})

    def test_operator_identity_cannot_come_from_call_arguments(self):
        with self.assertRaises(QueueError):
            self.start('caller', 'operator', 'PJSIP/random-123')
        self.assertFalse(self.audio.operators)
        self.assertIn('caller', self.ari.hungup)

    def test_lost_operator_disconnects_private_caller(self):
        self.start('op', 'operator', 'Local/operator@far-test-1;1')
        self.start('caller', 'business')
        call = self.queue.data['calls'][0]
        self.queue.act(self.owner, call['id'], 'answer_private', self.queue.data['version'])
        self.events.handle({'type': 'StasisEnd', 'channel': {'id': 'op'}})
        self.assertIn('caller', self.ari.hungup)
        self.assertEqual(self.queue.snapshot(self.owner)['calls'], [])

    def test_restart_clears_stale_queue_and_owned_rooms_only(self):
        self.start('caller', 'show')
        self.ari.bridges['unrelated-room'] = []
        self.events.reconcile()
        self.assertEqual(self.queue.snapshot(self.owner)['calls'], [])
        self.assertEqual(self.ari.bridges, {'unrelated-room': []})
        self.assertTrue(self.audio.ready)

    def test_waiting_call_expires(self):
        self.start('caller', 'games')
        self.events.expire_waiting()
        self.assertEqual(self.queue.snapshot(self.owner)['calls'], [])
        self.assertIn('caller', self.ari.hungup)

    def test_studio_loss_removes_on_air_caller(self):
        self.start('studio', 'studio', 'Local/studio@far-test-1;1')
        self.start('op', 'operator', 'Local/operator@far-test-1;1')
        self.start('caller', 'show')
        call = self.queue.data['calls'][0]
        for action in ['screen', 'ready', 'put_on_air']:
            self.queue.act(self.owner, call['id'], action, self.queue.data['version'])
        self.events.handle({'type': 'StasisEnd', 'channel': {'id': 'studio'}})
        self.assertIn('caller', self.ari.hungup)
        self.assertIsNone(self.audio.programme_bridge)


if __name__ == '__main__':
    unittest.main()
