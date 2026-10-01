import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import dj_manager as D
from dj_gateway import render


class DJTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        self.paths=patch.multiple(D,DB=root/'djs.json',STATE=root/'state.json',GATEWAY=root/'gateway.liq')
        self.paths.start();self.addCleanup(self.paths.stop)
        self.dj={'dj-one':{'display_name':'One','username':'one','password':'private-test-only','mount':'/dj-one','enabled':True}}
        D.save(D.DB,self.dj);D.GATEWAY.write_text('old gateway')

    def test_listing_hides_password_and_uses_gateway_status(self):
        with patch.object(D,'connected',return_value=True),patch.object(D,'liquidsoap',return_value=['SELECTED:']):result=D.execute('GET','/djs',{})
        self.assertTrue(result['djs'][0]['connected'])
        self.assertNotIn('password',json.dumps(result))
        self.assertEqual(result['port'],8085)
        self.assertEqual(result['djs'][0]['stream_url'],'http://141.147.76.212:8000/dj-one')

    def test_no_false_success_on_missing_audio_confirmation(self):
        with patch.object(D,'connected',return_value=True),patch.object(D,'liquidsoap',return_value=['END']):
            with self.assertRaises(RuntimeError):D.execute('POST','/djs/dj-one/take-live',{})
        self.assertFalse(D.STATE.exists())

    def test_connected_dj_blocks_disruptive_rebuild(self):
        with patch.object(D,'connected',return_value=True),patch.object(D.subprocess,'run') as run:
            with self.assertRaises(ValueError):D.execute('POST','/djs/dj-one/password',{})
            run.assert_not_called()
        self.assertEqual(json.loads(D.DB.read_text()),self.dj)

    def test_gateway_failure_restores_previous_credentials(self):
        with patch.object(D,'connected',return_value=False),patch.object(D.subprocess,'run',side_effect=[RuntimeError('fail'),None]):
            with self.assertRaises(RuntimeError):D.rebuild({},self.dj)
        self.assertEqual(json.loads(D.DB.read_text()),self.dj)
        self.assertEqual(D.GATEWAY.read_text(),'old gateway')

    def test_unknown_connection_and_control_injection_rejected(self):
        with self.assertRaises(ValueError):D.execute('POST','/djs',{'id':'x\nfar.return_auto'})
        with self.assertRaises(ValueError):D.liquidsoap('help\nfar.return_auto')

    def test_generator_preserves_output_and_restricts_selection(self):
        script=render(self.dj,{'host':'127.0.0.1','port':8000,'user':'source','password':'test-only'})
        self.assertIn('port=8085',script);self.assertIn('far-dj-feed',script)
        self.assertIn('if connected(id) == "true"',script)
        self.assertIn('settings.server.telnet.port := 1237',script)
        self.assertIn('fallible=true',script)
        self.assertIn('mount="/dj-one"',script)


if __name__=='__main__':unittest.main()
