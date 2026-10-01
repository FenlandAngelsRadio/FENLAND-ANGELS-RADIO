"""Generate a separate A&A PBX configuration. Never activates it or edits radio.

Settings and generated files contain secrets: store outside the repository.
Use a routed/VPN address for staff phones. Do not expose unencrypted SIP publicly.
"""
import argparse
import json
import os
from pathlib import Path
import re

PROMPTS = {
    'menu': 'Welcome to Fenland Angels Radio. Press one for games and competitions. Press two for live show interviews. Press three for private station business. Press zero to hear these options again.',
    'waiting': 'Thank you. Please hold while the station team checks your call. You are not on air.',
    'business': 'We are connecting you privately to the station management team. This call will not be broadcast.',
    'unavailable': 'Sorry, nobody is available to take your call. Please try again later.',
}


def field(settings, key, pattern=r'[A-Za-z0-9_.:@+/-]+'):
    value = settings.get(key)
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError('Missing or invalid setting: ' + key)
    return value


def build(settings):
    number = field(settings, 'number', r'\+44\d{10}')
    sip_user = field(settings, 'sip_username', r'\+?\d{10,15}')
    sip_password = field(settings, 'sip_password', r'[A-Za-z0-9!#$%&()*+,./:<=>?@^_{}~\-]{16,128}')
    address = field(settings, 'staff_bind_address', r'\d{1,3}(?:\.\d{1,3}){3}')
    # Staff listeners must bind to a private/VPN address, never all interfaces.
    import ipaddress
    if not ipaddress.ip_address(address).is_private or address in {'0.0.0.0', '127.0.0.1'}:
        raise ValueError('Staff SIP requires a private/VPN bind address.')
    voicemail_pin = field(settings, 'voicemail_pin', r'\d{8,16}')
    email = field(settings, 'voicemail_email', r'[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+')
    root = field(settings, 'runtime_dir', r'/[A-Za-z0-9_/-]+')
    if root in {'/', '/etc', '/opt', '/var'}:
        raise ValueError('Use a dedicated runtime directory.')
    ari_password=field(settings,'ari_password',r'[A-Za-z0-9_-]{32,128}')
    modules=field(settings,'module_directory',r'/usr/lib/[A-Za-z0-9_/-]+')
    peer_lines = ['[staff-udp]', 'type=transport', 'protocol=udp', f'bind={address}:5062',
                  '[provider-udp]', 'type=transport', 'protocol=udp', 'bind=0.0.0.0:5060',
                  '[aa-auth]', 'type=auth', 'auth_type=userpass',
                  f'username={sip_user}', f'password={sip_password}',
                  '[aa-registration]', 'type=registration', 'transport=provider-udp',
                  'outbound_auth=aa-auth', f'client_uri=sip:{sip_user}@voiceless.aa.net.uk',
                  'server_uri=sip:voiceless.aa.net.uk', 'contact_user=far-incoming',
                  'expiration=120', 'retry_interval=60',
                  '[aa]', 'type=endpoint', 'transport=provider-udp', 'context=far-incoming',
                  'disallow=all', 'allow=alaw', 'dtmf_mode=rfc4733',
                  'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes',
                  '[aa-identify]', 'type=identify', 'endpoint=aa', 'match=voiceless.aa.net.uk']
    for endpoint in ['owner', 'nick', 'studio']:
        password = field(settings, endpoint + '_password', r'[A-Za-z0-9_-]{24,128}')
        peer_lines += [f'[{endpoint}-auth]', 'type=auth', 'auth_type=userpass',
                       f'username={endpoint}', f'password={password}',
                       f'[{endpoint}]', 'type=aor', 'max_contacts=1', 'remove_existing=yes',
                       'qualify_frequency=30', f'[{endpoint}]', 'type=endpoint',
                       'transport=staff-udp', 'context=far-staff',
                       f'auth={endpoint}-auth', f'aors={endpoint}',
                       'disallow=all', 'allow=alaw', 'direct_media=no',
                       'rtp_symmetric=yes', 'rewrite_contact=yes', 'force_rport=yes']
    extensions = f'''[general]
static=yes
writeprotect=yes
[far-incoming]
exten => far-incoming,1,Goto(s,1)
exten => {number},1,Goto(s,1)
exten => s,1,Answer()
 same => n,Set(FAR_MENU_ATTEMPTS=0)
 same => n(menu),Set(FAR_MENU_ATTEMPTS=$[${{FAR_MENU_ATTEMPTS}}+1])
 same => n,GotoIf($[${{FAR_MENU_ATTEMPTS}}>3]?finish)
 same => n,Background(far/menu)
 same => n,WaitExten(8)
 same => n(finish),Playback(far/unavailable)
 same => n,Hangup()
exten => 0,1,Goto(s,menu)
exten => 1,1,Playback(far/waiting)
 same => n,Stasis(far-calls,games)
 same => n,Hangup()
exten => 2,1,Playback(far/waiting)
 same => n,Stasis(far-calls,show)
 same => n,Hangup()
exten => 3,1,Goto(far-business,s,1)
exten => i,1,Goto(s,menu)
exten => t,1,Goto(s,menu)
[far-business]
exten => s,1,Playback(far/business)
 same => n,Dial(PJSIP/owner&PJSIP/nick,25)
 same => n,GotoIf($["${{DIALSTATUS}}"="ANSWER"]?finish)
 same => n,VoiceMail(300@far-private,u)
 same => n(finish),Hangup()
[far-staff]
exten => 700,1,Answer()
 same => n,Stasis(far-calls,operator)
 same => n,Hangup()
; The trusted event adapter rejects any endpoint except the configured studio.
exten => 701,1,Answer()
 same => n,Stasis(far-calls,studio)
 same => n(finish),Hangup()
exten => 703,1,VoiceMailMain(300@far-private)
 same => n,Hangup()
; No outbound telephone route. Unknown destinations end here.
exten => _X.,1,Hangup(21)
'''
    directories={'astetcdir':'etc','astvarlibdir':'data','astdbdir':'data','astkeydir':'data',
                 'astdatadir':'data','astspooldir':'spool','astrundir':'run','astlogdir':'log','astcachedir':'cache'}
    return {'pjsip.conf': '\n'.join(peer_lines)+'\n', 'extensions.conf': extensions,
            'asterisk.conf':'[directories]\n'+''.join(f'{key} => {root}/{value}\n' for key,value in directories.items())+f'astmoddir => {modules}\n[options]\nnofork=yes\n',
            'http.conf':'[general]\nenabled=yes\nbindaddr=127.0.0.1\nbindport=8779\n',
            'ari.conf':f'[general]\nenabled=yes\n[far-controller]\ntype=user\nread_only=no\npassword={ari_password}\n',
            'manager.conf':'[general]\nenabled=no\n',
            'logger.conf':'[general]\n[logfiles]\nconsole=error\n',
            'modules.conf':'[modules]\nautoload=yes\n'+''.join(f'noload={name}.so\n' for name in ['chan_iax2','chan_skinny','chan_mgcp','chan_ooh323','chan_dahdi','res_snmp','res_hep','res_hep_rtcp','res_hep_pjsip']),
            'voicemail.conf': '[general]\nformat=wav\nattach=no\ndelete=no\nmaxsecs=120\nmaxmsg=50\n'
            f'[far-private]\n300 => {voicemail_pin},FAR private business,{email}\n',
            'rtp.conf': '[general]\nrtpstart=12000\nrtpend=12100\n',
            'musiconhold.conf': f'[far-waiting]\nmode=files\ndirectory={root}/hold-prompts\n',
            'indications.conf': '[general]\ncountry=uk\n',
            'PROMPTS.json': json.dumps(PROMPTS, indent=2)+'\n'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    settings_path = Path(args.settings)
    if os.name != 'nt' and settings_path.stat().st_mode & 0o077:
        raise ValueError('Settings must be readable only by their owner (mode 0600).')
    configs = build(json.loads(settings_path.read_text()))
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use an empty output directory; existing configuration is never overwritten.')
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    for name, content in configs.items():
        path = output/name
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as target:
            target.write(content)
    print('Private configuration generated. No services, firewall rules or phone routes changed.')


if __name__ == '__main__':
    main()
