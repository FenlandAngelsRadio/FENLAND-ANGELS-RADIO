import unittest
from audience_recorder import parse_count

class RecorderTests(unittest.TestCase):
    def test_mount_html_and_zero(self):
        self.assertEqual(parse_count('<td>Current Listeners:</td><td>3</td>'),3)
        self.assertEqual(parse_count('Current Listeners: 0'),0)
    def test_missing_or_multiple_mounts_are_not_zero(self):
        for text in ['Maintenance', 'Current Listeners: 1 Current Listeners: 2']:
            with self.assertRaises(ValueError):parse_count(text)

if __name__=='__main__':unittest.main()
