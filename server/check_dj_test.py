"""Isolated real Liquidsoap check; no station input/output or secrets are used."""
import argparse
import importlib.util
import json
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
from dj_gateway import render


def control(command):
    with socket.create_connection(('127.0.0.1',1238),1) as sock:
        sock.settimeout(2);sock.sendall((command+'\nquit\n').encode());raw=bytearray()
        while True:
            data=sock.recv(4096)
            if not data:break
            raw.extend(data)
    return raw.decode(errors='replace')


def wait(check):
    until=time.monotonic()+20
    while time.monotonic()<until:
        try:
            if check():return
        except (OSError,TimeoutError):pass
        time.sleep(.2)
    raise AssertionError('Isolated DJ test timed out')


def main():
    with tempfile.TemporaryDirectory(prefix='far-dj-test-') as directory:
        root=Path(directory);password=secrets.token_urlsafe(24)
        script=render({'isolated':{'username':'isolated','password':password,'mount':'/dj-isolated','enabled':True}},
                      {'host':'127.0.0.1','port':18000,'user':'source','password':'test-only'})
        script=script.split('output.icecast(')[0]+'output.dummy(programme)\n'
        script=script.replace('port := 1237','port := 1238').replace('port=8085','port=18085')
        script='settings.harbor.bind_addrs := ["127.0.0.1"]\n'+script
        gateway_file=root/'gateway.liq';gateway_file.write_text(script)
        encoder_file=root/'encoder.liq'
        encoder_file.write_text('output.icecast(%mp3(bitrate=320,samplerate=48000,stereo=true),host="127.0.0.1",port=18085,user="isolated",password='+json.dumps(password)+',mount="/dj-isolated",sine())\n')
        for path in [gateway_file,encoder_file]:
            subprocess.run(['liquidsoap','--check',str(path)],check=True,capture_output=True,timeout=30)
        children=[]
        with open(root/'log','wb') as log:
            try:
                children.append(subprocess.Popen(['liquidsoap',str(gateway_file)],stdout=log,stderr=log))
                wait(lambda:'false' in control('far.connected isolated').splitlines())
                assert 'ERROR: DJ is not connected' in control('far.select_dj isolated')
                children.append(subprocess.Popen(['liquidsoap',str(encoder_file)],stdout=log,stderr=log))
                wait(lambda:'true' in control('far.connected isolated').splitlines())
                assert 'OK' in control('far.select_dj isolated').splitlines()
                assert 'OK' in control('far.return_auto').splitlines()
                children[-1].terminate();children[-1].wait(timeout=10)
                wait(lambda:'false' in control('far.connected isolated').splitlines())
                assert 'false' in control('far.connected unknown').splitlines()
                print('Passed real isolated DJ connect, selection confirmation, automation return and disconnect. No public audio route used.')
            finally:
                for child in children:
                    if child.poll() is None:
                        child.terminate()
                        try:child.wait(timeout=10)
                        except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)


if __name__=='__main__':main()
