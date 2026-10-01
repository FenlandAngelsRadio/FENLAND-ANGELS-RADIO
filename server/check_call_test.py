"""Real loopback PBX checks. Uses generated tones, never a trunk or live stream."""
import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
import time
from urllib.request import Request, urlopen
import wave
from asterisk_audio import ARI


def wait_until(check, seconds=8):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(.1)
    raise AssertionError('Timed out waiting for test phone operation')


def run(settings_path):
    settings = json.loads(Path(settings_path).read_text())
    if settings.get('test_mode') is not True or settings['ari_url'] != 'http://127.0.0.1:8769/ari':
        raise RuntimeError('This check only runs on the isolated loopback PBX.')
    ari = ARI(settings['ari_url'], settings['ari_user'], settings['ari_password'])
    owner = {'id': 'test-owner', 'role': 'owner', 'permissions': []}
    staff = {'id': 'test-staff', 'role': 'staff', 'permissions': ['cloud_live']}
    created = []

    def queue(action='list', actor=owner, **fields):
        request = Request('http://127.0.0.1:8768/queue', method='POST',
            data=json.dumps({'action': action, 'actor': actor, **fields}).encode(),
            headers={'Authorization': 'Bearer ' + settings['staff_token'], 'Content-Type': 'application/json'})
        with urlopen(request, timeout=10) as response:
            return json.load(response)

    def originate(endpoint, destination):
        channel = ari.request('POST', '/channels', endpoint='Local/' + endpoint + '@far-test/n',
                              app='far-calls', appArgs=destination, timeout=5)
        created.append(channel['id'])
        return channel['id']

    def call_state(cid, expected='waiting'):
        return next((c for c in queue()['calls'] if c['id'] == cid and c['state'] == expected), None)

    def act(cid, operation):
        current = queue()
        return queue('act', id=cid, operation=operation, version=current['version'])

    def tone_power(bridge, label):
        name = 'far-check-' + label
        ari.request('POST', '/bridges/' + bridge + '/record', name=name,
                    format='wav', maxDurationSeconds=5, ifExists='overwrite')
        recording = Path('/opt/far-call-test/spool/recording') / (name + '.wav')
        wait_until(lambda: recording.exists())
        time.sleep(1.5)
        ari.request('POST', '/recordings/live/' + name + '/stop')
        wait_until(lambda: ari.request('GET', '/recordings/stored/' + name))
        with wave.open(str(recording), 'rb') as source:
            assert source.getsampwidth() == 2 and source.getnchannels() == 1
            rate = source.getframerate()
            samples = struct.unpack('<' + 'h' * source.getnframes(), source.readframes(source.getnframes()))
        samples = samples[len(samples)//4:len(samples)*3//4]
        assert len(samples) >= rate // 2, 'No usable audio received'
        power = {}
        for frequency in [440, 660, 880]:
            real = sum(value * math.cos(2*math.pi*frequency*i/rate) for i, value in enumerate(samples))
            imag = sum(value * math.sin(2*math.pi*frequency*i/rate) for i, value in enumerate(samples))
            power[frequency] = (real*real + imag*imag) / len(samples)**2
        recording.unlink()
        return power

    try:
        wait_until(lambda: queue()['audio_ready'])
        assert queue()['calls'] == [], 'Test queue must start empty'
        operator = originate('operator', 'operator')
        studio = originate('studio', 'studio')
        wait_until(lambda: len(ari.request('GET', '/bridges')) >= 2)
        # Both channels must have entered their rooms, not merely answered.
        time.sleep(.3)
        studio_room = wait_until(lambda: next((b['id'] for b in ari.request('GET', '/bridges')
                                              if studio in b.get('channels', [])), None))
        raw = originate('caller', 'show')
        caller = wait_until(lambda: next((c for c in queue()['calls'] if c['category'] == 'show'), None))
        cid = caller['id']
        act(cid, 'screen')
        assert call_state(cid, 'screening')
        private_room = next(b['id'] for b in ari.request('GET', '/bridges') if operator in b.get('channels', []))
        screening = tone_power(private_room, 'screening')
        assert screening[440] > 1000 and screening[660] > 1000, 'Two-way screening audio absent'
        isolated = tone_power(studio_room, 'screening-isolated')
        assert isolated[880] > 1000 and isolated[440] < isolated[880] * .01, 'Screened caller leaked to programme'
        act(cid, 'ready')
        assert call_state(cid, 'ready')
        act(cid, 'put_on_air')
        assert call_state(cid, 'on_air')
        programme = tone_power(studio_room, 'programme')
        assert programme[440] > 1000 and programme[880] > 1000, 'Programme caller audio absent'
        act(cid, 'mute')
        muted = tone_power(studio_room, 'muted')
        assert muted[440] < muted[880] * .01, 'Muted caller remained audible'
        act(cid, 'hold')
        assert call_state(cid, 'held')
        held = tone_power(studio_room, 'held')
        assert held[440] < held[880] * .01, 'Held caller leaked to programme'
        act(cid, 'end')
        wait_until(lambda: not queue()['calls'])
        raw_business = originate('caller', 'business')
        business = wait_until(lambda: next((c for c in queue()['calls'] if c['category'] == 'business'), None))
        assert not queue(actor=staff)['calls'], 'Staff saw private call'
        act(business['id'], 'answer_private')
        separated = tone_power(studio_room, 'business-isolated')
        assert separated[440] < separated[880] * .01, 'Business call leaked to programme'
        ari.request('DELETE', '/channels/' + operator)
        wait_until(lambda: not queue()['calls'])
        assert all(raw_business not in b.get('channels', []) for b in ari.request('GET', '/bridges'))
        # Restart the staging controller with an active caller: stale on-air
        # metadata must disappear and no abandoned room may remain audible.
        operator = originate('operator', 'operator')
        time.sleep(.3)
        originate('caller', 'games')
        game = wait_until(lambda: next((c for c in queue()['calls'] if c['category'] == 'games'), None))
        for operation in ['screen', 'ready', 'put_on_air']:
            act(game['id'], operation)
        subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'far-call-controller-test'], check=True)
        def recovered():
            try:
                snapshot = queue()
                return snapshot['audio_ready'] and not snapshot['calls']
            except OSError:
                return False
        wait_until(recovered, seconds=12)
        wait_until(lambda: not ari.request('GET', '/bridges'))
        print('PASS real PBX: screening audio, isolated screening, programme audio, mute, hold, end, private-call filtering/separation and operator-disconnect cleanup.')
        print('PASS real restart: active caller disconnected, stale queue cleared, owned rooms removed and controller reconnected.')
    finally:
        for cid in created:
            try:
                ari.request('DELETE', '/channels/' + cid)
            except Exception:
                pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', required=True)
    run(parser.parse_args().settings)
