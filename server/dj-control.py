#!/usr/bin/env python3
"""FAR Live DJ control bridge. Bind to 127.0.0.1 or a private interface only."""
import json,os,secrets,subprocess,tempfile
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
TOKEN=os.environ["FAR_LIVE_ADMIN_TOKEN"]; DB=Path("/var/lib/far-live/djs.json"); ACTIVE=Path("/var/lib/far-live/on-air")
DB.parent.mkdir(parents=True,exist_ok=True)
def load():
 try:return json.loads(DB.read_text())
 except:return {}
def save(x):
 fd,p=tempfile.mkstemp(dir=str(DB.parent));os.write(fd,json.dumps(x,indent=2).encode());os.close(fd);os.chmod(p,0o600);os.replace(p,DB)
def apply():
 # Adapter hook: keep the control plane safe until Icecast auth is switched to the generated auth file.
 subprocess.run(["systemctl","try-reload-or-restart","far-live.service"],check=False)
class H(BaseHTTPRequestHandler):
 def auth(self):return self.headers.get("Authorization")=="Bearer "+TOKEN
 def body(self):n=int(self.headers.get("Content-Length","0"));return json.loads(self.rfile.read(n) or b"{}")
 def out(self,n=200,x={"ok":True}):b=json.dumps(x).encode();self.send_response(n);self.send_header("Content-Type","application/json");self.end_headers();self.wfile.write(b)
 def route(self,method):
  if not self.auth():return self.out(401,{"error":"unauthorized"})
  p=self.path.strip("/").split("/");d=load();b=self.body() if method=="POST" else {}
  if method=="POST" and p==["djs"]:
   d[b["id"]]={"display_name":b["display_name"],"username":b["stream_username"],"mount":b["mount_name"],"password":b["password"],"enabled":True};save(d);apply();return self.out()
  if len(p)>=2 and p[0]=="djs" and p[1] in d:
   i=p[1]
   if method=="DELETE":d.pop(i);save(d);apply();return self.out()
   if len(p)==3 and p[2]=="enabled":d[i]["enabled"]=bool(b["enabled"]);save(d);apply();return self.out()
   if len(p)==3 and p[2]=="password":d[i]["password"]=b["password"];save(d);apply();return self.out()
  if p==["on-air"]:
   if method=="DELETE":ACTIVE.unlink(missing_ok=True);apply();return self.out()
   if method=="POST" and b.get("dj_id") in d and d[b["dj_id"]].get("enabled"):ACTIVE.write_text(b["dj_id"]);apply();return self.out()
  return self.out(404,{"error":"not found"})
 def do_POST(self):self.route("POST")
 def do_DELETE(self):self.route("DELETE")
 def log_message(self,*a):pass
ThreadingHTTPServer(("127.0.0.1",8765),H).serve_forever()
