"""Connect the selected DJ feed to the existing PlayIt Live programme URL.

Refuses any current DJ, legacy source or listener. Backs up and validates before
restarting only the unused Cloud Live output, never the public streaming service.
"""
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.request


def render(existing):
    if 'dj_cloud_live = input.http' in existing:
        return existing
    original='[dj_private_major, silence]'
    if existing.count(original) != 1 or existing.count('live_feed = fallback(') != 1:
        raise ValueError('Existing programme routing needs review.')
    return existing.replace('live_feed = fallback(',
        'dj_cloud_live = input.http("http://127.0.0.1:8000/far-dj-feed")\n\nlive_feed = fallback(',1).replace(original,'[dj_cloud_live, dj_private_major, silence]',1)


def main():
    if json.loads(Path('/var/lib/far-live/dj-manager/djs.json').read_text() or '{}'):
        raise RuntimeError('DJ accounts already exist; do not change the active route.')
    stats=json.load(urllib.request.urlopen('http://127.0.0.1:8000/status-json.xsl',timeout=5))['icestats']
    sources=stats.get('source',[])
    if isinstance(sources,dict):sources=[sources]
    for source in sources:
        mount=source.get('listenurl','').rsplit('/',1)[-1]
        if mount.startswith('dj-') or (mount in {'far-live-output','far-dj-feed'} and int(source.get('listeners',0))):
            raise RuntimeError('Cloud Live input or output is in use; installation refused.')
    path=Path('/etc/liquidsoap/far-live.liq');original=path.read_bytes()
    updated=render(original.decode())
    if updated.encode()==original:
        print('PlayIt Live route already installed.');return
    backup=Path('/opt/far-live/backups')/time.strftime('playit-%Y%m%dT%H%M%SZ',time.gmtime())
    backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    (backup/'far-live.liq').write_bytes(original);(backup/'far-live.liq').chmod(0o600)
    staging=backup/'checked.liq';staging.write_text(updated);staging.chmod(0o600)
    subprocess.run(['liquidsoap','--check',str(staging)],check=True,capture_output=True,timeout=30)
    try:
        path.write_text(updated)
        subprocess.run(['systemctl','restart','far-live.service'],check=True,capture_output=True,timeout=25)
        for _ in range(40):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8000/far-live-output',timeout=2) as response:
                    if response.headers.get('Content-Type')=='audio/mpeg' and len(response.read(1024))==1024:break
            except Exception:time.sleep(.25)
        else:raise RuntimeError('Cloud Live programme output was not confirmed.')
    except Exception:
        path.write_bytes(original)
        subprocess.run(['systemctl','restart','far-live.service'],capture_output=True,timeout=25)
        raise RuntimeError('PlayIt Live route failed; previous configuration restored.') from None
    print('PlayIt Live programme route installed and MP3 confirmed. Zero DJs/listeners were required; public streaming was not changed.')


if __name__=='__main__':main()
