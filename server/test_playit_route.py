import unittest
from install_playit_route import render


class PlayItRouteTests(unittest.TestCase):
    def test_existing_input_and_output_preserved(self):
        source='dj_private_major = input.http("legacy")\nsilence = blank()\nlive_feed = fallback(track_sensitive=false, [dj_private_major, silence])\noutput.icecast(password="test-only",mount="/far-live-output",live_feed)'
        result=render(source)
        self.assertIn('[dj_cloud_live, dj_private_major, silence]',result)
        self.assertIn('mount="/far-live-output"',result)
        self.assertIn('input.http("legacy")',result)
        self.assertEqual(render(result),result)

    def test_unrecognised_routing_is_not_rewritten(self):
        with self.assertRaises(ValueError):render('unknown active station route')
