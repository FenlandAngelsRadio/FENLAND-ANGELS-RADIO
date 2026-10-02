"""Management-only phone menu and bounded recording uploads, outside the website."""
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import threading
import time
import wave
from phone_menu import DEFAULT_OPTIONS, validate_options, dialplan_options
from call_centre import QueueError

SLOTS = {'menu', 'waiting', 'business', 'unavailable', 'voicemail'}


class PhoneManagement:
    def __init__(self, root, run=subprocess.run):
        self.root = Path(root)
        self.run = run
        self.lock = threading.RLock()
        self.uploads = {}
        self.settings = self.root / 'menu-settings.json'

    def _read(self):
        return json.loads(self.settings.read_text()) if self.settings.exists() else {'version': 0, 'options': DEFAULT_OPTIONS}

    def _command(self, command):
        result = self.run(['asterisk', '-C', str(self.root / 'etc/asterisk.conf'), '-rx', command],
                          capture_output=True, text=True, timeout=10)
        if result.returncode:
            raise QueueError('The phone service could not confirm the change.')
        return result.stdout

    def _idle(self):
        if '0 active channels' not in self._command('core show channels count'):
            raise QueueError('A call is in progress. Try again after it finishes.')

    def handle(self, body, actor):
        if actor.get('role') not in {'owner', 'deputy_manager'}:
            raise QueueError('Only station management can change the phone menu or recordings.')
        with self.lock:
            # Abandoned transfers expire without ever becoming live recordings.
            for key, value in list(self.uploads.items()):
                if time.monotonic() - value['time'] > 600:
                    value['path'].unlink(missing_ok=True); del self.uploads[key]
            action = body['action']
            current = self._read()
            if action == 'phone_settings':
                current['recordings'] = {slot: self._target(slot).exists() for slot in sorted(SLOTS)}
                return current
            if action == 'phone_save':
                if body.get('version') != current['version']:
                    raise QueueError('The phone menu has changed. Reload it before saving.')
                options = validate_options(body.get('options'))
                self._idle()
                path = self.root / 'etc/extensions.conf'
                old = path.read_text()
                start, end = old.index('exten => 1,1,Playback(far/waiting)') if 'exten => 1,1,Playback(far/waiting)' in old else -1, old.index('exten => i,1,Goto(s,menu)')
                if '; FAR MANAGED OPTIONS BEGIN' in old:
                    start = old.index('; FAR MANAGED OPTIONS BEGIN')
                if start < 0:
                    raise QueueError('The phone menu needs a configuration check before editing.')
                new = old[:start] + '; FAR MANAGED OPTIONS BEGIN\n' + dialplan_options(options) + '\n; FAR MANAGED OPTIONS END\n' + old[end:]
                self._atomic(path, new.encode())
                try:
                    self._command('dialplan reload')
                except Exception:
                    self._atomic(path, old.encode()); self._command('dialplan reload'); raise
                current = {'version': current['version'] + 1, 'options': options}
                self._atomic(self.settings, json.dumps(current).encode())
                return current
            if action == 'phone_upload_start':
                slot, size = body.get('slot'), body.get('size')
                if slot not in SLOTS or type(size) is not int or not 1 <= size <= 8 * 1024 * 1024:
                    raise QueueError('Choose a recording up to 8 MB.')
                if len(self.uploads) >= 3:
                    raise QueueError('Finish the current recording uploads first.')
                key = secrets.token_hex(24)
                directory = self.root / 'cache/uploads'; directory.mkdir(mode=0o700, exist_ok=True)
                path = directory / key; path.touch(mode=0o600)
                self.uploads[key] = dict(path=path, slot=slot, size=size, received=0, owner=actor['id'], time=time.monotonic())
                return {'upload': key}
            transfer = self.uploads.get(body.get('upload'))
            if not transfer or transfer['owner'] != actor['id']:
                raise QueueError('This upload has expired. Choose your recording again.')
            if action == 'phone_upload_chunk':
                encoded = body.get('data')
                if not isinstance(encoded, str) or len(encoded) > 11000 or body.get('offset') != transfer['received']:
                    raise QueueError('Recording transfer was interrupted. Start again.')
                raw = base64.b64decode(encoded, validate=True)
                if not raw or transfer['received'] + len(raw) > transfer['size']:
                    raise QueueError('Invalid recording size.')
                with transfer['path'].open('ab') as target: target.write(raw)
                transfer['received'] += len(raw); transfer['time'] = time.monotonic()
                return {'received': transfer['received']}
            if action != 'phone_upload_finish' or transfer['received'] != transfer['size']:
                raise QueueError('Finish transferring the recording before publishing it.')
            self._idle()
            converted = transfer['path'].with_suffix('.wav')
            try:
                result = self.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                                   '-i', str(transfer['path']), '-vn', '-t', '181', '-ac', '1', '-ar', '8000',
                                   '-c:a', 'pcm_s16le', '-y', str(converted)], capture_output=True, timeout=30)
                if result.returncode: raise QueueError('This file could not be read as audio. Try WAV, MP3 or M4A.')
                with wave.open(str(converted)) as recording:
                    duration = recording.getnframes() / recording.getframerate()
                    if not 0.5 <= duration <= 180: raise QueueError('Record between half a second and three minutes.')
                target = self._target(transfer['slot']); target.parent.mkdir(parents=True, exist_ok=True)
                self._atomic(target.with_suffix('.previous.wav'), target.read_bytes()) if target.exists() else None
                self._atomic(target, converted.read_bytes())
                if transfer['slot'] == 'waiting':
                    self._atomic(self.root / 'hold-prompts/waiting.wav', target.read_bytes())
                    self._command('moh reload')
                return {'ok': True, 'slot': transfer['slot'], 'seconds': round(duration, 1)}
            finally:
                transfer['path'].unlink(missing_ok=True); converted.unlink(missing_ok=True)
                del self.uploads[body['upload']]

    def _target(self, slot):
        if slot == 'voicemail': return self.root / 'spool/voicemail/far-private/300/unavail.wav'
        return self.root / 'data/sounds/far' / (slot + '.wav')

    @staticmethod
    def _atomic(path, raw):
        temporary = path.with_name(path.name + '.new')
        with temporary.open('wb') as target:
            target.write(raw); target.flush(); os.fsync(target.fileno())
        temporary.chmod(0o600); os.replace(temporary, path)
