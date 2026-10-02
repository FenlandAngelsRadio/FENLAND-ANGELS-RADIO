import unittest
from phone_menu import DEFAULT_OPTIONS, dialplan_options, validate_options


class PhoneMenuTests(unittest.TestCase):
    def test_extra_options_can_share_queue_without_broadcasting_private_calls(self):
        options = DEFAULT_OPTIONS + [dict(digit='4', label='Birthday messages',
                                         destination='show', enabled=True)]
        output = dialplan_options(options)
        self.assertIn('exten => 4,1,Playback(far/waiting)', output)
        private = output.split('exten => 3,')[1].split('exten => 4,')[0]
        self.assertIn('Goto(far-business,s,1)', private)
        self.assertNotIn('Stasis', private)

    def test_rejects_duplicate_repeat_key_and_dialplan_injection(self):
        for field, value in [('digit', '0'), ('digit', '1\nHangup()'),
                             ('destination', 'show)\nDial(PJSIP/aa)'),
                             ('enabled', 'true')]:
            option = dict(DEFAULT_OPTIONS[0]); option[field] = value
            with self.assertRaises(ValueError): validate_options([option])
        with self.assertRaises(ValueError): validate_options([DEFAULT_OPTIONS[0]] * 2)

    def test_disabled_options_are_not_callable_and_all_disabled_is_rejected(self):
        options = [dict(option) for option in DEFAULT_OPTIONS]
        options[0]['enabled'] = False
        self.assertNotIn('exten => 1,', dialplan_options(options))
        for option in options: option['enabled'] = False
        with self.assertRaises(ValueError): validate_options(options)


if __name__ == '__main__': unittest.main()
