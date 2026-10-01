import unittest
from asterisk_audio import ARI, AsteriskAudio
from call_centre import QueueError


class FakeARI:
    def __init__(self):
        self.rooms = {'hold': ['caller'], 'private': ['operator'], 'programme': ['studio']}
        self.operations = []
        self.fail = False

    def request(self, method, path, **params):
        self.operations.append((method, path, params))
        if method == 'GET' and path.startswith('/channels/'):
            return {'state': 'Up'}
        if method == 'GET':
            return {'channels': self.rooms[path.split('/')[2]][:]}
        if method == 'DELETE' and path == '/channels/caller':
            for members in self.rooms.values():
                if 'caller' in members:
                    members.remove('caller')
        if path.endswith('/addChannel'):
            target = path.split('/')[2]
            for members in self.rooms.values():
                if 'caller' in members:
                    members.remove('caller')
            self.rooms[target].append('caller')
            if self.fail:
                raise QueueError('Injected partial failure')


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.ari = FakeARI()
        self.audio = AsteriskAudio(self.ari, 'programme')
        self.audio.register('ref', 'show', 'caller', 'hold')
        self.audio.operator_answered('owner', 'operator', 'private')
        self.audio.ready = True
        self.call = {'provider_id': 'ref', 'category': 'show'}
        self.actor = {'id': 'owner'}

    def test_screen_ready_programme_hold(self):
        for action, room in [('screen', 'private'), ('ready', 'hold'),
                             ('put_on_air', 'programme'), ('hold', 'hold')]:
            self.assertTrue(self.audio.apply(action, self.call, self.actor))
            self.assertIn('caller', self.ari.rooms[room])
            self.assertEqual(sum('caller' in r for r in self.ari.rooms.values()), 1)

    def test_private_never_programme(self):
        self.audio.sessions['ref']['category'] = 'business'
        self.call['category'] = 'business'
        before = len(self.ari.operations)
        with self.assertRaises(QueueError):
            self.audio.apply('put_on_air', self.call, self.actor)
        self.assertEqual(len(self.ari.operations), before)
        self.assertTrue(self.audio.apply('answer_private', self.call, self.actor))
        self.assertNotIn('caller', self.ari.rooms['programme'])

    def test_unconfirmed_move_disconnects_and_disables(self):
        self.ari.fail = True
        with self.assertRaisesRegex(QueueError, 'disconnected'):
            self.audio.apply('put_on_air', self.call, self.actor)
        self.assertFalse(self.audio.ready)
        self.assertFalse(any('caller' in room for room in self.ari.rooms.values()))

    def test_shared_operator_room_rejected(self):
        self.ari.rooms['private'].append('someone-else')
        with self.assertRaises(QueueError):
            self.audio.apply('screen', self.call, self.actor)
        self.assertEqual(self.ari.rooms['hold'], ['caller'])

    def test_credentials_require_private_transport(self):
        with self.assertRaises(ValueError):
            ARI('http://example.com/ari', 'user', 'secret')
        with self.assertRaises(ValueError):
            ARI('https://user:secret@example.com/ari', 'user', 'secret')

    def test_no_implicit_readiness_or_voicemail(self):
        self.audio.ready = False
        with self.assertRaises(QueueError):
            self.audio.apply('screen', self.call, self.actor)
        self.audio.ready = True
        with self.assertRaises(QueueError):
            self.audio.apply('voicemail', self.call, self.actor)


if __name__ == '__main__':
    unittest.main()
