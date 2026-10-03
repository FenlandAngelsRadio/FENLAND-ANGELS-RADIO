"""Short-lived staff interview rooms. No audio or guest details are stored."""
import fcntl
import json
import os
from pathlib import Path
import secrets
import time


class InterviewRooms:
    def __init__(self, directory, clock=time.time):
        self.directory = Path(directory)
        self.clock = clock

    def handle(self, body):
        actor = body.get('actor') or {}
        management = actor.get('role') in {'owner', 'deputy_manager'}
        if not actor.get('id') or not (management or 'cloud_live' in actor.get('permissions', [])):
            return {'status': 403, 'data': {'error': 'Cloud Live access is required.'}}
        action = body.get('action')
        if action not in {'interview_state', 'interview_start', 'interview_end'}:
            return {'status': 400, 'data': {'error': 'Choose a valid interview control.'}}
        with (self.directory / 'room.lock').open('a') as lock:
            os.chmod(lock.name, 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX)
            path = self.directory / 'room.json'
            state = json.loads(path.read_text()) if path.exists() else None
            if state and state['expires_at'] <= self.clock():
                state = None
            if action == 'interview_start':
                if state and state['owner'] != actor['id']:
                    return {'status': 409, 'data': {'error': 'Another presenter has an interview room open. Ask them to finish it first.'}}
                if not state:
                    state = {'id': secrets.token_urlsafe(24), 'room': 'FAR' + secrets.token_hex(12),
                             'password': secrets.token_hex(24), 'director_password': secrets.token_hex(24), 'owner': actor['id'],
                             'expires_at': int(self.clock()) + 4 * 60 * 60}
                    temp = self.directory / 'room.tmp'
                    temp.write_text(json.dumps(state))
                    os.chmod(temp, 0o600)
                    temp.replace(path)
            elif action == 'interview_end':
                if state and (body.get('id') != state['id'] or not (management or state['owner'] == actor['id'])):
                    return {'status': 409, 'data': {'error': 'Refresh the current interview before ending it.'}}
                if path.exists():
                    path.unlink()
                state = None
            room = None if state is None else {key: state[key] for key in ('id', 'room', 'password', 'expires_at')}
            if state and (management or state['owner'] == actor['id']):
                room['director_password'] = state['director_password']
            return {'status': 200, 'data': {'interview': room,
                    'can_control': bool(state and (management or state['owner'] == actor['id'])),
                    'route_verified': False, 'delay_protected': False}}
