import tempfile
import unittest
from browser_interviews import InterviewRooms


class InterviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = 1000
        self.rooms = InterviewRooms(self.temp.name, lambda: self.now)
        self.owner = {'id': 'nath', 'role': 'owner'}
        self.presenter = {'id': 'presenter', 'role': 'dj', 'permissions': ['cloud_live']}

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, actor=None, **values):
        return self.rooms.handle({'action': action, 'actor': actor or self.owner, **values})

    def test_unauthorised_cannot_read_or_create(self):
        for action in ['interview_state', 'interview_start', 'interview_end']:
            self.assertEqual(self.call(action, {'id': 'public', 'role': 'listener'})['status'], 403)

    def test_room_has_unpredictable_credentials_and_is_not_air_confirmation(self):
        result = self.call('interview_start')['data']
        self.assertGreaterEqual(len(result['interview']['password']), 32)
        self.assertFalse(result['route_verified'])
        self.assertFalse(result['delay_protected'])
        self.assertNotIn('owner', result['interview'])

    def test_another_presenter_cannot_replace_active_room(self):
        first = self.call('interview_start')['data']['interview']
        self.assertEqual(self.call('interview_start', self.presenter)['status'], 409)
        self.assertEqual(self.call('interview_state')['data']['interview'], first)

    def test_retry_start_is_idempotent(self):
        first = self.call('interview_start')['data']['interview']
        self.assertEqual(self.call('interview_start')['data']['interview'], first)

    def test_director_secret_is_separate_and_hidden_from_other_staff(self):
        first = self.call('interview_start')['data']['interview']
        self.assertRegex(first['password'], r'^[a-f0-9]{48}$')
        self.assertLess(len(first['room']), 31)
        self.assertNotEqual(first['password'], first['director_password'])
        other = self.call('interview_state', self.presenter)['data']['interview']
        self.assertNotIn('director_password', other)

    def test_stale_end_does_not_end_room(self):
        self.call('interview_start')
        self.assertEqual(self.call('interview_end', id='old-id')['status'], 409)
        self.assertIsNotNone(self.call('interview_state')['data']['interview'])

    def test_presenter_cannot_end_another_presenter_room(self):
        first = self.call('interview_start')['data']['interview']
        self.assertEqual(self.call('interview_end', self.presenter, id=first['id'])['status'], 409)

    def test_current_end_clears_room_and_new_room_rotates(self):
        first = self.call('interview_start')['data']['interview']
        self.assertIsNone(self.call('interview_end', id=first['id'])['data']['interview'])
        second = self.call('interview_start')['data']['interview']
        self.assertNotEqual(first['room'], second['room'])
        self.assertNotEqual(first['password'], second['password'])

    def test_expiry_and_staff_control(self):
        first = self.call('interview_start', self.presenter)['data']['interview']
        self.assertTrue(self.call('interview_state', self.presenter)['data']['can_control'])
        self.assertFalse(self.call('interview_state', {'id':'other','permissions':['cloud_live']})['data']['can_control'])
        self.now = first['expires_at']
        self.assertIsNone(self.call('interview_state')['data']['interview'])
        self.assertNotEqual(first['id'], self.call('interview_start')['data']['interview']['id'])


if __name__ == '__main__':
    unittest.main()
