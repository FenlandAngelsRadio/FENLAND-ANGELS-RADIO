"""Install verified control compatibility only while no dedicated DJ exists.

Never restarts far-live or Icecast. Refuses any existing DJ account/selection.
"""
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.request import Request,urlopen


def main():
    if os.geteuid()!=0:raise RuntimeError('Run on the Cloud Live host as root.')
    db=Path('/var/lib/far-live/dj-manager/djs.json')
    state=db.with_name('state.json')
    if db.exists() and json.loads(db.read_text()):raise RuntimeError('Existing DJ accounts require a scheduled migration.')
    if state.exists() and json.loads(state.read_text()).get('on_air'):raise RuntimeError('A DJ is selected. Migration refused.')
    stage=Path('/opt/far-call-test/code');live=Path('/opt/far-live')
    gateway=Path('/etc/liquidsoap/far-dj-gateway.liq')
    backup=live/'backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True,mode=0o700)
    for path in [live/'dj-manager.py',live/'dj_gateway.py',gateway]:
        if path.exists():shutil.copy2(path,backup/path.name)
    stage_name='generate'
    try:
        shutil.copy2(stage/'dj_gateway.py',live/'dj_gateway.py')
        subprocess.run(['python3',str(live/'dj_gateway.py')],check=True,capture_output=True,timeout=15)
        stage_name='compile'
        subprocess.run(['liquidsoap','--check',str(gateway)],check=True,capture_output=True,timeout=30)
        stage_name='restart control'
        shutil.copy2(stage/'dj_manager.py',live/'dj-manager.py')
        for path in [live/'dj-manager.py',live/'dj_gateway.py']:path.chmod(0o644)
        subprocess.run(['systemctl','stop','far-dj-control'],check=True,timeout=15)
        subprocess.run(['systemctl','restart','far-dj-gateway','far-dj-manager'],check=True,timeout=25)
        token=next(line.split('=',1)[1].strip().strip('"').strip("'") for line in Path('/etc/far-live-dj-control.env').read_text().splitlines() if line.startswith('FAR_LIVE_ADMIN_TOKEN='))
        stage_name='confirm live response'
        import time
        for attempt in range(20):
            try:
                request=Request('http://127.0.0.1:8765/djs',headers={'Authorization':'Bearer '+token})
                with urlopen(request,timeout=4) as response:result=json.load(response)
                if result.get('djs')!=[] or result.get('port')!=8085:raise RuntimeError('DJ list verification failed.')
                break
            except Exception as error:
                if attempt==19:
                    print('Verification failure type:',type(error).__name__,'HTTP status:',getattr(error,'code','not HTTP'))
                    raise
                time.sleep(.5)
        subprocess.run(['systemctl','is-active','far-live','icecast2','far-dj-gateway','far-dj-manager'],check=True)
        subprocess.run(['systemctl','disable','far-dj-control'],check=True,capture_output=True)
        print('DJ compatibility installed; zero accounts confirmed; station output services were not restarted. Backup retained.')
    except Exception:
        for path in [live/'dj-manager.py',gateway]:
            original=backup/path.name
            if original.exists():shutil.copy2(original,path)
        subprocess.run(['systemctl','restart','far-dj-gateway','far-dj-manager'],timeout=25)
        raise RuntimeError('Compatibility install failed at '+stage_name+'; previous configuration restored.') from None


if __name__=='__main__':main()
