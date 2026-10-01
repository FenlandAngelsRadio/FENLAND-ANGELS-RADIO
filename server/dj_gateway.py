"""Generate dedicated harbor inputs without touching the station output service."""
import json
from pathlib import Path
import re

DB=Path('/var/lib/far-live/dj-manager/djs.json')
OUT=Path('/etc/liquidsoap/far-dj-gateway.liq')
LIVE=Path('/etc/liquidsoap/far-live.liq')


def render(djs, ice):
    q=lambda value: json.dumps(str(value))
    lines=['settings.frame.audio.samplerate := 48000', 'settings.frame.audio.channels := 2',
           'settings.server.telnet := true', 'settings.server.telnet.bind_addr := "127.0.0.1"',
           'settings.server.telnet.port := 1237', 'selected = ref("")']
    enabled=[]
    for ident,dj in djs.items():
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',ident):raise ValueError('Invalid DJ identifier')
        if not dj.get('enabled',True):continue
        var='dj_'+ident.replace('-','_')
        enabled.append((ident,var))
        lines += [f'{var} = input.harbor(id={q(var)}, port=8085, user={q(dj["username"])},',
                  f'password={q(dj["password"])}, buffer=8., timeout=30., {q(dj["mount"])})']
    lines+=['def connected(id) =']
    # Nested conditions avoid forward references and never accept unknown inputs.
    for ident,var in enabled:
        lines += [f'  if id == {q(ident)} then', f'    if {var}.is_ready() then "true" else "false" end', '  else']
    lines += ['    "false"']+['  end']*len(enabled)+['end']
    lines += ['def select_dj(id) =', '  if connected(id) == "true" then',
              '    selected := id', '    "OK"', '  else', '    "ERROR: DJ is not connected"', '  end', 'end',
              'def return_auto(_) =', '  selected := ""', '  "OK"', 'end',
              'server.register(namespace="far", "connected", connected)',
              'server.register(namespace="far", "selected", fun (_) -> "SELECTED:" ^ selected())',
              'server.register(namespace="far", "select_dj", select_dj)',
              'server.register(namespace="far", "return_auto", return_auto)']
    if enabled:
        lines+=['programme = switch(track_sensitive=false, [']
        lines += [f'  ({{selected() == {q(ident)}}}, {var}),' for ident,var in enabled]
        lines+=['  ({true}, blank())', '])']
    else:lines+=['programme = blank()']
    lines += ['output.icecast(%mp3(bitrate=320, samplerate=48000, stereo=true),',
              f'host={q(ice["host"])}, port={int(ice["port"])}, user={q(ice["user"])},',
              f'password={q(ice["password"])}, mount="/far-dj-feed", name="Fenland Angels Radio DJ Feed", programme)']
    return '\n'.join(lines)+'\n'


def main():
    text=LIVE.read_text()
    def grab(pattern):
        found=re.search(pattern,text,re.M)
        if not found:raise ValueError('Missing existing station output setting')
        return found.group(1)
    ice={key:grab(r'\b'+key+r'\s*=\s*"([^"\n]+)"') for key in ['host','user','password']}
    ice['port']=int(grab(r'\bport\s*=\s*(\d+)'))
    content=render(json.loads(DB.read_text()) if DB.exists() else {},ice)
    OUT.write_text(content);OUT.chmod(0o640)


if __name__=='__main__':main()
