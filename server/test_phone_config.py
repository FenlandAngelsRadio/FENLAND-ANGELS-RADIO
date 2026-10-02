import unittest
from build_phone_config import build


class PhoneConfigTests(unittest.TestCase):
    def settings(self):
        return dict(number='+441945383909', sip_username='+441945383909',
                    sip_password='test_password_only_123456', staff_bind_address='10.0.0.114',
                    owner_password='owner_test_password_123456789', nick_password='nick_test_password_123456789',
                    studio_password='studio_test_password_123456789', voicemail_pin='12345678',
                    voicemail_email='test@example.test', runtime_dir='/opt/far-phone',
                    ari_password='isolated_ari_password_for_test_123456',module_directory='/usr/lib/aarch64-linux-gnu/asterisk/modules')

    def test_private_ringing_and_no_paid_outbound_route(self):
        config=build(self.settings())
        business=config['extensions.conf'].split('[far-business]')[1].split('[far-staff]')[0]
        self.assertIn('Dial(PJSIP/owner&PJSIP/nick,25)', business)
        self.assertNotIn('Stasis', business)
        self.assertIn('VoiceMail(300@far-private,u)', business)
        self.assertNotIn('@aa', config['extensions.conf'])
        self.assertIn('Hangup(21)', config['extensions.conf'])
        self.assertIn('dtmf_mode=rfc4733', config['pjsip.conf'])

    def test_reject_injection_and_public_staff_sip(self):
        for key,value in [('sip_password','secret\ncontext=public'), ('staff_bind_address','0.0.0.0'),
                          ('staff_bind_address','141.147.76.212'), ('voicemail_email','x\n@test.test')]:
            settings=self.settings();settings[key]=value
            with self.assertRaises(ValueError):build(settings)

    def test_no_browser_phone_secrets_or_fabricated_account(self):
        config=build(self.settings())
        self.assertNotIn('bmgl1@a', config['pjsip.conf'])
        self.assertIn('Press three for private station business', config['PROMPTS.json'])

    def test_cloud_nat_and_provider_identity_survive_regeneration(self):
        settings = self.settings()
        settings.update(public_address='141.147.76.212',
                        local_networks=['10.0.0.0/24', '10.77.0.0/24'],
                        provider_networks=['81.187.30.110/31', '90.155.3.0/24'])
        config = build(settings)
        provider = config['pjsip.conf'].split('[provider-udp]')[1].split('[aa-auth]')[0]
        self.assertIn('external_media_address=141.147.76.212', provider)
        self.assertIn('local_net=10.77.0.0/24', provider)
        self.assertIn('match=81.187.30.110/31,90.155.3.0/24', config['pjsip.conf'])
        self.assertIn('noload=app_voicemail_imap.so', config['modules.conf'])
        self.assertIn('noload=app_voicemail_odbc.so', config['modules.conf'])


if __name__ == '__main__':unittest.main()
