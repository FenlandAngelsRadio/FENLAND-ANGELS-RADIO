"""Authenticated DJ bridge for the existing dedicated Liquidsoap gateway.

Credential/input changes rebuild only the gateway, and refuse while any DJ is
connected. Station output and public streaming services are never restarted.
"""
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB=Path('/var/lib/far-live/dj-manager/djs.json')
STATE=DB.with_name('state.json')
GATEWAY=Path('/etc/liquidsoap/far-dj-gateway.liq')
LOCK=threading.RLock()


def read(path, default):
    try:return json.loads(path.read_text())
    except FileNotFoundError:return default


def save(path, value):
    descriptor,tmp=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor,'w') as out:
            json.dump(value,out);out.flush();os.fsync(out.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def liquidsoap(command):
    if '\n' in command or '\r' in command:raise ValueError('Invalid control command.')
    with socket.create_connection(('127.0.0.1',1237),3) as connection:
        connection.settimeout(3)
        connection.sendall((command+'\nquit\n').encode())
        raw=bytearray()
        while len(raw)<65536:
            part=connection.recv(4096)
            if not part:break
            raw.extend(part)
        if len(raw)>=65536:raise RuntimeError('DJ response was too large.')
    # Banners and END delimiters are not confirmation of an audio operation.
    lines=[line.strip() for line in raw.decode(errors='replace').splitlines()]
    if any('ERROR' in line.upper() or 'UNKNOWN COMMAND' in line.upper() for line in lines):
        raise RuntimeError('The DJ gateway rejected the command.')
    return lines


def connected(ident):
    response=liquidsoap('far.connected '+ident)
    values=[line for line in response if line in {'true','false'}]
    if len(values)!=1:raise RuntimeError('DJ connection status could not be confirmed.')
    return values[0]=='true'


def rebuild(djs, previous):
    for ident in previous:
        if connected(ident):raise ValueError('A DJ is connected. Change inputs when all DJs have disconnected.')
    old_script=GATEWAY.read_bytes()
    save(DB,djs)
    try:
        subprocess.run(['/usr/bin/python3','/opt/far-live/dj_gateway.py'],check=True,capture_output=True,timeout=15)
        subprocess.run(['/usr/bin/liquidsoap','--check',str(GATEWAY)],check=True,capture_output=True,timeout=25)
        subprocess.run(['systemctl','restart','far-dj-gateway.service'],check=True,capture_output=True,timeout=20)
    except Exception:
        save(DB,previous);GATEWAY.write_bytes(old_script)
        subprocess.run(['systemctl','restart','far-dj-gateway.service'],capture_output=True,timeout=20)
        raise RuntimeError('DJ input update failed. The previous configuration was restored.') from None


def execute(method,path,body):
    djs=read(DB,{})
    state=read(STATE,{'on_air':None})
    if method=='GET' and path=='/djs':
        selections=[line.split(':',1)[1] for line in liquidsoap('far.selected') if line.startswith('SELECTED:')]
        if len(selections)!=1:raise RuntimeError('Live DJ selection could not be confirmed.')
        selected=selections[0]
        return {'djs':[{'id':ident,'display_name':dj['display_name'],
                       'show_name':dj.get('show_name'),'stream_username':dj['username'],
                       'mount_name':dj['mount'],'enabled':bool(dj.get('enabled')),
                       'stream_url':'http://141.147.76.212:8000'+dj['mount'],
                       'connection_allowed':bool(dj.get('enabled')),
                       'connected':connected(ident), 'on_air':selected==ident}
                      for ident,dj in djs.items()],
                'server':'141.147.76.212','port':8085,
                'programme_url':'http://141.147.76.212:8000/far-live-output'}
    if method=='POST' and path=='/djs':
        ident=body.get('id');username=body.get('stream_username');mount=body.get('mount_name')
        if not isinstance(ident,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',ident):raise ValueError('Invalid DJ ID.')
        if ident in djs:raise ValueError('DJ already exists.')
        if not isinstance(username,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,40}',username):raise ValueError('Invalid DJ username.')
        if not isinstance(mount,str) or not re.fullmatch(r'/dj-[A-Za-z0-9_-]{1,64}',mount):raise ValueError('Invalid DJ connection.')
        if any(d['username']==username or d['mount']==mount for d in djs.values()):raise ValueError('DJ connection already exists.')
        name=body.get('display_name','').strip()[:80]
        if not name:raise ValueError('Enter the DJ name.')
        password=secrets.token_urlsafe(24)
        updated={**djs,ident:{'display_name':name,'show_name':str(body.get('show_name') or '')[:100],
                               'username':username,'mount':mount,'password':password,'enabled':True}}
        rebuild(updated,djs)
        return {'password':password,'server':'141.147.76.212','port':8085,
                'dj':{'id':ident,'stream_username':username,'mount_name':mount,'display_name':name,
                      'stream_url':'http://141.147.76.212:8000'+mount}}
    if path=='/return-automation' and method=='POST':
        if 'OK' not in liquidsoap('far.return_auto'):raise RuntimeError('Automation change was not confirmed.')
        save(STATE,{'on_air':None});return {'ok':True}
    parts=path.strip('/').split('/')
    if len(parts)<2 or parts[0]!='djs' or parts[1] not in djs:raise ValueError('DJ not found.')
    ident=parts[1]
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',ident):raise ValueError('Invalid DJ ID.')
    operation=parts[2] if len(parts)==3 else ''
    if operation=='take-live' and method=='POST':
        if not djs[ident].get('enabled') or not connected(ident):raise ValueError('This DJ is not connected and enabled.')
        if 'OK' not in liquidsoap('far.select_dj '+ident):raise RuntimeError('The live change was not confirmed.')
        save(STATE,{'on_air':ident});return {'ok':True}
    updated=json.loads(json.dumps(djs))
    result={'ok':True}
    if operation=='enabled' and method=='POST':
        if not isinstance(body.get('enabled'),bool):raise ValueError('Choose enabled or locked.')
        updated[ident]['enabled']=body['enabled']
    elif operation=='password' and method=='POST':
        result.update(password=secrets.token_urlsafe(24),server='141.147.76.212',port=8085)
        updated[ident]['password']=result['password']
    elif len(parts)==2 and method=='DELETE':updated.pop(ident)
    else:raise ValueError('Unknown DJ control.')
    rebuild(updated,djs)
    if state.get('on_air')==ident:save(STATE,{'on_air':None})
    return result


def handler(token):
    if not token or len(token)<24:raise ValueError('A strong server token is required.')
    class Handler(BaseHTTPRequestHandler):
        def route(self,method):
            self.connection.settimeout(10)
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):
                return self.reply(401,{'error':'Unauthorised.'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<=length<=16384:raise ValueError('Request too large.')
                if self.headers.get('Transfer-Encoding'):raise ValueError('Unsupported request.')
                body=json.loads(self.rfile.read(length) or b'{}') if method=='POST' else {}
                if not isinstance(body,dict):raise ValueError('Invalid request.')
                with LOCK:result=execute(method,self.path,body)
                self.reply(200,result)
            except (ValueError,TypeError):self.reply(409,{'error':'DJ control could not be completed. Check the connection and try again when all DJs are disconnected.'})
            except Exception:self.reply(503,{'error':'DJ gateway could not confirm the action. Existing settings were retained where possible.'})
        def reply(self,status,result):
            payload=json.dumps(result).encode();self.send_response(status)
            self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def do_GET(self):self.route('GET')
        def do_POST(self):self.route('POST')
        def do_DELETE(self):self.route('DELETE')
        def log_message(self,*args):pass
    return Handler


if __name__=='__main__':
    token=os.environ.get('FAR_LIVE_ADMIN_TOKEN')
    if not token:
        token=next(line.split('=',1)[1].strip().strip('"').strip("'") for line in Path('/etc/far-live-dj-control.env').read_text().splitlines() if line.startswith('FAR_LIVE_ADMIN_TOKEN='))
    ThreadingHTTPServer(('127.0.0.1',8765),handler(token)).serve_forever()
