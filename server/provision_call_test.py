"""Run as root on the Cloud Live host. Creates a loopback-only staging PBX.

Never edits the existing FAR audio services. Default Asterisk stays masked.
"""
import glob
import json
import os
from pathlib import Path
import pwd
import secrets
import subprocess


def provision():
    root = Path('/opt/far-call-test')
    account = pwd.getpwnam('ubuntu')
    root.mkdir(mode=0o700, exist_ok=True)
    for folder in ['etc', 'run', 'log', 'data', 'spool', 'spool/recording', 'cache', 'code']:
        (root / folder).mkdir(mode=0o700, parents=True, exist_ok=True)
    secrets_path = root / 'settings.json'
    if secrets_path.exists():
        settings = json.loads(secrets_path.read_text())
        if settings.get('test_mode') is not True:
            raise RuntimeError('Refusing to rewrite a non-test configuration.')
    else:
        settings = {'ari_url': 'http://127.0.0.1:8769/ari', 'ari_user': 'far-test',
                    'ari_password': secrets.token_urlsafe(40),
                    'staff_token': secrets.token_urlsafe(40),
                    'provider_token': secrets.token_urlsafe(40),
                    'test_mode': True, 'operators': {'operator': 'test-owner'},
                    'queue_path': str(root / 'data/queue.json')}
        secrets_path.write_text(json.dumps(settings))
    modules = glob.glob('/usr/lib/*/asterisk/modules/res_ari.so')
    if not modules:
        modules = glob.glob('/usr/lib/asterisk/modules/res_ari.so')
    if len(modules) != 1:
        raise RuntimeError('Could not identify installed Asterisk modules.')
    configs = {
        'asterisk.conf': '[directories]\n' + '\n'.join(
            f'{key} => {root / value}' for key, value in {
                'astetcdir': 'etc', 'astvarlibdir': 'data', 'astdbdir': 'data',
                'astkeydir': 'data', 'astdatadir': 'data', 'astspooldir': 'spool',
                'astrundir': 'run', 'astlogdir': 'log', 'astcachedir': 'cache',
            }.items()) + f'\nastmoddir => {Path(modules[0]).parent}\n[options]\n'
            'nofork=yes\nverbose=0\ndebug=0\n',
        'http.conf': '[general]\nenabled=yes\nbindaddr=127.0.0.1\nbindport=8769\n',
        'ari.conf': '[general]\nenabled=yes\npretty=no\n'
            f'[{settings["ari_user"]}]\ntype=user\nread_only=no\n'
            f'password={settings["ari_password"]}\n',
        'modules.conf': '[modules]\nautoload=yes\n'
            + '\n'.join(f'noload={name}.so' for name in [
                'chan_iax2', 'chan_pjsip', 'chan_sip', 'chan_skinny',
                'chan_mgcp', 'chan_ooh323', 'chan_dahdi', 'res_snmp',
                'res_hep', 'res_hep_rtcp', 'res_hep_pjsip', 'pbx_ael', 'pbx_lua',
                'res_config_ldap', 'res_config_pgsql', 'cdr_pgsql', 'cel_pgsql',
            ]) + '\n',
        'manager.conf': '[general]\nenabled=no\n',
        'logger.conf': '[general]\n[logfiles]\nconsole=error\n',
        'pjsip.conf': '; No transports or external endpoints in this test instance.\n',
        'extensions.conf': '[general]\nstatic=yes\nwriteprotect=yes\n'
            '[far-test]\n' + '\n'.join(
                f'exten => {name},1,Answer()\n same => n,Playtones({tone})\n'
                ' same => n,Wait(600)\n same => n,Hangup()'
                for name, tone in [('caller', 440), ('operator', 660), ('studio', 880)]
            ) + '\n',
    }
    for name, content in configs.items():
        (root / 'etc' / name).write_text(content)
    # Asterisk needs the installed XML docs to initialise Stasis types.
    for name in ['documentation', 'rest-api', 'sounds']:
        destination = root / 'data' / name
        if not destination.exists():
            destination.symlink_to(Path('/usr/share/asterisk') / name, target_is_directory=True)
    for parent, dirs, files in os.walk(root):
        os.chown(parent, account.pw_uid, account.pw_gid)
        os.chmod(parent, 0o700)
        for name in files:
            path = Path(parent) / name
            os.chown(path, account.pw_uid, account.pw_gid)
            os.chmod(path, 0o600)
    unit = '''[Unit]
Description=FAR isolated phone audio test (no public calls)
After=network.target
[Service]
User=ubuntu
Group=ubuntu
ExecStart=/usr/sbin/asterisk -f -C /opt/far-call-test/etc/asterisk.conf
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/far-call-test
ProtectHome=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=localhost
UMask=0077
'''
    Path('/etc/systemd/system/far-call-test.service').write_text(unit)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'start', 'far-call-test'], check=True)
    print('Isolated PBX started; credentials retained on server; not enabled at boot.')


if __name__ == '__main__':
    provision()
