import base64
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from phone_management import PhoneManagement
from phone_menu import DEFAULT_OPTIONS
from call_centre import QueueError


class PhoneManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); (self.root/'etc').mkdir(); (self.root/'cache').mkdir()
        self.calls = []
        def run(args, **kwargs):
            self.calls.append(args[-1])
            return SimpleNamespace(returncode=0,stdout='0 active channels\n')
        self.manager = PhoneManagement(self.root,run)
        self.owner = {'id':'owner-uuid','role':'owner'}

    def test_management_only_and_stale_menu_rejected(self):
        with self.assertRaises(QueueError):
            self.manager.handle({'action':'phone_settings'},{'id':'dj','role':'staff'})
        with self.assertRaises(QueueError):
            self.manager.handle({'action':'phone_save','version':4,'options':DEFAULT_OPTIONS},self.owner)
        self.assertEqual(self.calls,[])

    def test_upload_bound_to_owner_and_offsets_checked(self):
        transfer=self.manager.handle({'action':'phone_upload_start','slot':'menu','size':4},self.owner)
        request={'action':'phone_upload_chunk','upload':transfer['upload'],'offset':0,'data':base64.b64encode(b'abcd').decode()}
        with self.assertRaises(QueueError):self.manager.handle(request,{'id':'nick','role':'deputy_manager'})
        self.assertEqual(self.manager.handle(request,self.owner),{'received':4})
        with self.assertRaises(QueueError):self.manager.handle(request,self.owner)
        with self.assertRaises(QueueError):self.manager.handle({'action':'phone_upload_start','slot':'../password','size':4},self.owner)

    def test_private_destination_stays_separate_when_saving(self):
        path=self.root/'etc/extensions.conf'
        path.write_text('exten => 0,1,Goto(s,menu)\nexten => 1,1,Playback(far/waiting)\n same => n,Stasis(far-calls,games)\nexten => i,1,Goto(s,menu)\n[far-business]\nPRIVATE\n')
        result=self.manager.handle({'action':'phone_save','version':0,'options':DEFAULT_OPTIONS},self.owner)
        self.assertEqual(result['version'],1)
        self.assertIn('exten => 3,1,Goto(far-business,s,1)',path.read_text())
        self.assertTrue(path.read_text().endswith('[far-business]\nPRIVATE\n'))
        self.assertEqual(self.calls[-1],'dialplan reload')
        self.manager.handle({'action':'phone_save','version':1,'options':DEFAULT_OPTIONS},self.owner)
        self.assertEqual(path.read_text().count('; FAR MANAGED OPTIONS BEGIN'),1)


if __name__=='__main__':unittest.main()
