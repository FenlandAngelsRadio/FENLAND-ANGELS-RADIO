"""Trusted ARI event consumer. All rooms belong to the isolated FAR application.

Restart/reconnect ends stale calls rather than trusting saved on-air labels.
Caller endpoints cannot choose a staff identity. Operators map to configured
endpoint names; staging permits only explicit Local test endpoints.
"""
import json
import secrets
import threading
import time
from urllib.parse import quote, urlsplit, urlunsplit
from call_centre import QueueError


class CallEvents:
    def __init__(self, queue, audio, operators, test_mode=False, clock=time.time, studio_endpoint=None):
        self.queue, self.audio, self.ari = queue, audio, audio.ari
        self.operators = operators
        self.test_mode = test_mode
        self.clock = clock
        self.studio_endpoint = studio_endpoint
        self.rooms = {}  # channel -> room, removed on hangup
        self.studio = None
        self.stop = threading.Event()

    def _room(self, channel):
        room = 'far-call-' + secrets.token_hex(12)
        self.ari.request('POST', '/bridges/' + room, type='mixing,proxy_media,dtmf_events')
        self.rooms[channel] = room
        self.ari.request('POST', '/bridges/' + room + '/addChannel', channel=channel)
        return room

    def _hangup(self, channel):
        self.ari.request('DELETE', '/channels/' + quote(channel, safe=''))

    def reconcile(self):
        with self.queue.lock, self.audio.lock:
            self.audio.ready = False
            app = self.ari.request('GET', '/applications/far-calls')
            for cid in app.get('channel_ids', []):
                self._hangup(cid)
            for bridge in self.ari.request('GET', '/bridges'):
                if bridge['id'].startswith('far-call-'):
                    self.ari.request('DELETE', '/bridges/' + quote(bridge['id'], safe=''))
            for call in list(self.queue.data['calls']):
                if call['state'] not in self.queue.terminal:
                    self.queue.disconnected(call['provider_id'])
            self.audio.sessions.clear()
            self.audio.operators.clear()
            self.audio.programme_bridge = None
            self.rooms.clear()
            self.studio = None
            self.audio.ready = True

    def handle(self, event):
        channel = event.get('channel', {})
        cid = channel.get('id')
        if not cid:
            return
        with self.queue.lock, self.audio.lock:
            if event['type'] == 'StasisStart':
                if cid in self.rooms:  # duplicate delivery cannot create a second room
                    return
                args = event.get('args', [])
                destination = args[0] if args else ''
                try:
                    if not self.audio.ready:
                        raise QueueError('Connection not ready.')
                    if channel.get('state') != 'Up':
                        self.ari.request('POST', '/channels/' + quote(cid, safe='') + '/answer')
                    room = self._room(cid)
                    if destination in self.queue.categories:
                        self.audio.register(cid, destination, cid, room)
                        # Do not store caller numbers from the PBX event.
                        self.queue.arrive(destination, 'phone', 'Caller', cid)
                    elif destination == 'operator':
                        name = channel.get('name', '')
                        endpoint = next((key for key in self.operators
                            if name.startswith('PJSIP/' + key + '-') or (
                                self.test_mode and name.startswith('Local/' + key + '@far-test-'))), None)
                        if not endpoint:
                            raise QueueError('Unrecognised operator endpoint.')
                        actor_id = self.operators[endpoint]
                        if actor_id in self.audio.operators:
                            raise QueueError('Operator already connected.')
                        self.audio.operator_answered(actor_id, cid, room)
                    elif destination == 'studio' and (
                        self.test_mode and channel.get('name', '').startswith('Local/studio@far-test-')
                        or not self.test_mode and self.studio_endpoint and
                        channel.get('name', '').startswith('PJSIP/' + self.studio_endpoint + '-')
                    ):
                        if self.studio:
                            raise QueueError('Test studio already connected.')
                        self.studio = cid
                        self.audio.programme_bridge = room
                    else:
                        raise QueueError('Unknown call destination.')
                except Exception:
                    self.audio.forget(cid)
                    try:
                        self._hangup(cid)
                    finally:
                        self.cleanup(cid)
                    raise
            elif event['type'] in {'StasisEnd', 'ChannelDestroyed'}:
                self.cleanup(cid)

    def cleanup(self, cid):
        # The event thread and HTTP actions always take locks in this order.
        with self.queue.lock, self.audio.lock:
            self.audio.forget(cid)
            self.queue.disconnected(cid)
            actor_ids = [actor for actor, op in self.audio.operators.items() if op['channel'] == cid]
            if actor_ids or cid == self.studio:
                affected = [c for c in self.queue.data['calls'] if c['state'] not in self.queue.terminal
                            and (c['claimed_by'] in actor_ids or (cid == self.studio and c['state'] in {'on_air', 'muted'}))]
                for call in affected:
                    try:
                        self._hangup(call['provider_id'])
                    except QueueError:
                        self.audio.ready = False
                        raise
                    self.queue.disconnected(call['provider_id'])
                    self.audio.forget(call['provider_id'])
            for actor in actor_ids:
                self.audio.operators.pop(actor, None)
            if cid == self.studio:
                self.studio = None
                self.audio.programme_bridge = None
            room = self.rooms.pop(cid, None)
            if room:
                self.ari.request('DELETE', '/bridges/' + room)

    def expire_waiting(self, seconds=600):
        with self.queue.lock, self.audio.lock:
            for call in list(self.queue.data['calls']):
                if call['state'] in {'waiting', 'held', 'ready'} and self.clock() - call['updated_at'] > seconds:
                    self._hangup(call['provider_id'])
                    self.cleanup(call['provider_id'])

    def run(self):
        import websocket  # Ubuntu python3-websocket; never needs browser secrets.
        parts = urlsplit(self.ari.url)
        url = urlunsplit(('wss' if parts.scheme == 'https' else 'ws', parts.netloc,
                         parts.path + '/events', 'app=far-calls', ''))
        while not self.stop.is_set():
            connection = None
            try:
                connection = websocket.create_connection(url, timeout=5,
                    header=['Authorization: ' + self.ari.auth], enable_multithread=True)
                self.reconcile()
                last_expiry = self.clock()
                while not self.stop.is_set():
                    try:
                        raw = connection.recv()
                        if not raw or len(raw) > 65536:
                            raise QueueError('Phone event connection closed.')
                        self.handle(json.loads(raw))
                    except websocket.WebSocketTimeoutException:
                        connection.ping()
                    if self.clock() - last_expiry > 5:
                        self.expire_waiting()
                        last_expiry = self.clock()
            except Exception:
                # Never log event payloads, credentials or caller details.
                self.audio.ready = False
                self.stop.wait(2)
            finally:
                if connection:
                    connection.close()
