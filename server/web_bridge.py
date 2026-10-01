"""Restricted SSH command: forwards only the two authenticated FAR APIs.

Run as a dedicated unprivileged account with a forced command and no forwarding.
No shell commands, arbitrary URLs, provider events or credentials are returned.
"""
import json
import os
from pathlib import Path
import re
import signal
import sys
import urllib.error
import urllib.request

LIMIT = 16384
CONFIG = Path('/opt/far-web-bridge/settings.json')


def validate(request):
    if not isinstance(request, dict):
        raise ValueError('Invalid request.')
    service, method, path = (request.get(key) for key in ('service', 'method', 'path'))
    body = request.get('body')
    if service == 'djs':
        allowed = (method == 'GET' and path == '/djs') or (method == 'POST' and path in {'/djs', '/return-automation'})
        if isinstance(path, str) and re.fullmatch(r'/djs/[A-Za-z0-9_-]{1,64}', path):
            allowed = method == 'DELETE'
        if isinstance(path, str) and re.fullmatch(r'/djs/[A-Za-z0-9_-]{1,64}/(enabled|password|take-live)', path):
            allowed = method == 'POST'
        if not allowed:
            raise ValueError('Invalid DJ route.')
    elif service == 'calls':
        if method != 'POST' or path != '/queue' or not isinstance(body, dict) or body.get('action') not in {'list', 'act'}:
            raise ValueError('Invalid call route.')
    else:
        raise ValueError('Invalid service.')
    if body is not None and not isinstance(body, dict):
        raise ValueError('Invalid body.')
    return service, method, path, body


def forward(request, settings):
    service, method, path, body = validate(request)
    port = 8765 if service == 'djs' else 8768
    token = settings['dj_token' if service == 'djs' else 'call_token']
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError('Bridge settings unavailable.')
    req = urllib.request.Request('http://127.0.0.1:' + str(port) + path,
        data=json.dumps(body or {}).encode() if method == 'POST' else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method=method)
    # Disable proxies and redirects: credentials may only reach the fixed local service.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(req, timeout=120 if service == 'djs' else 12)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError('Response too large.')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('Invalid service response.')
        return {'status': response.code, 'data': result}


def main():
    signal.alarm(135)
    try:
        if os.environ.get('SSH_ORIGINAL_COMMAND') != 'far-api':
            raise ValueError('Restricted command.')
        raw = sys.stdin.buffer.read(LIMIT + 1)
        if not raw or len(raw) > LIMIT:
            raise ValueError('Invalid request size.')
        request = json.loads(raw)
        validate(request)
        result = forward(request, json.loads(CONFIG.read_text()))
    except (ValueError, TypeError, KeyError):
        result = {'status': 400, 'data': {'error': 'Invalid FAR bridge request.'}}
    except Exception:
        result = {'status': 503, 'data': {'error': 'FAR server connection unavailable.'}}
    sys.stdout.write(json.dumps(result))


if __name__ == '__main__':
    main()
