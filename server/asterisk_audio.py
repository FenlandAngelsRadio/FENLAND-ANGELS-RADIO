"""ARI media adapter. Requires a separate PBX and trusted answered-channel events.

No trunk, endpoint or public stream is created by this module. Operator channels
must already be answered and owned by the FAR Stasis application.
"""
import base64
import json
import threading
from urllib.parse import urlencode, quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from call_centre import QueueError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class ARI:
    def __init__(self, url, username, password):
        parts = urlsplit(url)
        if parts.scheme != 'https' and not (
                parts.scheme == 'http' and parts.hostname in {'127.0.0.1', 'localhost', '::1'}):
            raise ValueError('ARI requires HTTPS or a loopback connection.')
        if parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError('Use separate credentials and a plain ARI URL.')
        self.url = url.rstrip('/')
        self.auth = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()
        self.client = build_opener(NoRedirect())

    def request(self, method, path, **params):
        url = self.url + path + ('?' + urlencode(params) if params else '')
        request = Request(url, method=method, headers={'Authorization': self.auth})
        try:
            with self.client.open(request, timeout=5) as response:
                raw = response.read(65537)
                if len(raw) > 65536:
                    raise QueueError('Phone system response was too large.')
                return json.loads(raw) if raw else None
        except (HTTPError, URLError, TimeoutError, ValueError):
            raise QueueError('The phone system could not confirm the audio change.') from None


class AsteriskAudio:
    def __init__(self, ari, programme_bridge=None):
        self.ari = ari
        self.programme_bridge = programme_bridge
        self.sessions = {}
        self.operators = {}
        self.lock = threading.RLock()
        self.ready = False  # Event consumer must reconcile channels before enabling.

    def register(self, provider_id, category, caller_channel, holding_bridge):
        if category not in {'games', 'show', 'business'}:
            raise QueueError('Unknown destination.')
        with self.lock:
            if provider_id in self.sessions:
                raise QueueError('Call already registered.')
            bridge = self.ari.request('GET', '/bridges/' + quote(holding_bridge, safe=''))
            channel = self.ari.request('GET', '/channels/' + quote(caller_channel, safe=''))
            if channel.get('state') != 'Up' or bridge.get('channels') != [caller_channel]:
                raise QueueError('Caller needs an isolated holding room.')
            if holding_bridge == self.programme_bridge:
                raise QueueError('A waiting caller cannot start in the programme room.')
            self.sessions[provider_id] = {'category': category, 'channel': caller_channel,
                                          'home': holding_bridge, 'bridge': holding_bridge}

    def operator_answered(self, actor_id, channel, bridge):
        """Only trusted PBX events may register an answered operator connection."""
        with self.lock:
            room = self.ari.request('GET', '/bridges/' + quote(bridge, safe=''))
            answered = self.ari.request('GET', '/channels/' + quote(channel, safe=''))
            if answered.get('state') != 'Up' or room.get('channels') != [channel]:
                raise QueueError('Operator needs a separate answered connection.')
            if bridge == self.programme_bridge or any(s['home'] == bridge for s in self.sessions.values()):
                raise QueueError('Operator room is already in use.')
            if any(o['bridge'] == bridge or o['channel'] == channel for o in self.operators.values()):
                raise QueueError('Operator connection is already assigned.')
            self.operators[actor_id] = {'channel': channel, 'bridge': bridge}

    def apply(self, action, call, actor):
        with self.lock:
            if not self.ready:
                raise QueueError('Phone connections are being checked.')
            session = self.sessions.get(call['provider_id'])
            if not session or session['category'] != call['category']:
                raise QueueError('Caller connection is no longer available.')
            private = session['category'] == 'business'
            if private and action not in {'answer_private', 'voicemail', 'end'}:
                raise QueueError('Private calls cannot enter programme audio.')
            cid = quote(session['channel'], safe='')
            if action == 'end':
                self.ari.request('DELETE', '/channels/' + cid)
                del self.sessions[call['provider_id']]
                return True
            if action == 'voicemail':
                raise QueueError('Voicemail is not connected yet.')
            if action == 'mute':
                self.ari.request('POST', '/channels/' + cid + '/mute', direction='in')
                return True
            if action in {'screen', 'answer_private'}:
                operator = self.operators.get(actor['id'])
                if not operator:
                    raise QueueError('Answer your phone connection first.')
                target = operator['bridge']
                room = self.ari.request('GET', '/bridges/' + quote(target, safe=''))
                if room.get('channels') != [operator['channel']]:
                    raise QueueError('Your private connection is already in use.')
            elif action in {'ready', 'hold'}:
                target = session['home']
            elif action == 'put_on_air':
                target = self.programme_bridge
                if not target:
                    raise QueueError('Programme audio has not been connected.')
            else:
                raise QueueError('Unknown audio control.')
            try:
                self.ari.request('POST', '/bridges/' + quote(target, safe='') + '/addChannel',
                                 channel=session['channel'])
                room = self.ari.request('GET', '/bridges/' + quote(target, safe=''))
                if session['channel'] not in room.get('channels', []):
                    raise QueueError('Caller audio connection was not confirmed.')
                self.ari.request('DELETE', '/channels/' + cid + '/mute', direction='in')
                session['bridge'] = target
                return True
            except QueueError:
                # An unconfirmed partial move must never remain silently on air.
                self.ready = False
                try:
                    self.ari.request('DELETE', '/channels/' + cid)
                except QueueError:
                    raise QueueError('Audio change and disconnection were not confirmed. Check the phone system.') from None
                raise QueueError('Audio change failed. Caller was disconnected; refresh the queue.') from None
