"""Single-process queue + ARI events; staging settings stay outside source files."""
import argparse
import fcntl
import json
from pathlib import Path
import threading
from http.server import ThreadingHTTPServer
from asterisk_audio import ARI, AsteriskAudio
from asterisk_events import CallEvents
from call_centre import CallQueue
from call_centre_http import handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', required=True)
    args = parser.parse_args()
    settings = json.loads(Path(args.settings).read_text())
    lock = open(settings['queue_path'] + '.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    ari = ARI(settings['ari_url'], settings['ari_user'], settings['ari_password'])
    audio = AsteriskAudio(ari, hold_music_class=settings.get('hold_music_class'))
    queue = CallQueue(settings['queue_path'], audio)
    events = CallEvents(queue, audio, settings.get('operators', {}), settings.get('test_mode', False),
                        studio_endpoint=settings.get('studio_endpoint'))
    server = ThreadingHTTPServer(('127.0.0.1', 8768), handler(
        queue, settings['staff_token'], settings['provider_token']))
    server.daemon_threads = True
    thread = threading.Thread(target=events.run, daemon=True)
    thread.start()
    try:
        server.serve_forever()
    finally:
        audio.ready = False
        events.stop.set()
        server.server_close()
        thread.join(timeout=7)
        lock.close()


if __name__ == '__main__':
    main()
