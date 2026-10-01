# FAR Call Centre — isolated audio test installed

The call screen and an isolated Asterisk test system are built. This is not yet a public phone service. Existing DJ gateway, Icecast, Liquidsoap, studio and listener audio were not switched or restarted. No Supabase schema or SQL changed.

## Staff screen

Existing cloud_live permission is required. Owner and Deputy Manager see private business callers; ordinary permitted staff see game/show callers only. Screening, Ready and explicit confirmation precede Put on air. Queues refresh every five seconds while visible, pausing during confirmation and after an error. Voicemail is disabled until supported.

Local examples: http://localhost:8766/far-call-centre.html?preview=example&example_role=owner (or example_role=staff). These simulate controls only.

Single-number menu: 1 games/competitions; 2 show/interviews; 3 private business; 0 repeat. asterisk-menu.conf.example is a template, not an installed public menu.

## Implementation

- call_centre.py: atomic JSON persistence, version checks, operator claims, first answer wins, one on-air caller, private permissions, disconnect cleanup. Provider references excluded from staff snapshots; terminal metadata pruned after 24 hours on arrival; audit capped at 500. No phone numbers or real call recordings stored.
- call_centre_http.py: loopback port 8768, separate staff/provider tokens, 16 KB request cap, 10-second socket timeout. Provider events cannot put callers on air.
- asterisk_audio.py: authenticated ARI moves for screen/ready/hold/programme/mute/end. Isolated caller/operator rooms; private calls cannot enter programme audio. Uncertain movement disconnects the caller and disables the adapter.
- asterisk_events.py: trusted Stasis events, configured endpoint-to-staff mappings, hangup cleanup, operator loss cleanup, ten-minute expiry for waiting/held/ready calls. Reconnection clears stale application channels, owned rooms and queue labels before enabling controls.
- run_call_service.py: Linux service with exclusive OS file lock; one shared queue for HTTP/events. Depends on Ubuntu python3-websocket.
- supabase/functions/far-call-centre/index.ts: actual login and permissions, server-derived actor, private filtering, HTTPS bridge with timeout and no redirects. Not deployed/configured yet.

API sources: [ARI channels](https://docs.asterisk.org/Latest_API/API_Documentation/Asterisk_REST_Interface/Channels_REST_API/) and [bridges](https://docs.asterisk.org/Latest_API/API_Documentation/Asterisk_REST_Interface/Bridges_REST_API/).

## Host staging

Cloud Live host directory: /opt/far-call-test. provision_call_test.py creates separate PBX configuration. Default asterisk.service is masked. far-call-test and far-call-controller-test run but are not enabled at boot. Both have IPAddressDeny=any and IPAddressAllow=localhost. HTTP/ARI bind to 127.0.0.1; no public SIP transport exists. Oracle networking/firewall and broadcasting configuration remain unchanged.

Server-generated settings.json is mode 0600 inside a 0700 directory and contains independent ARI/staff/provider secrets. Never commit it or expose it to the browser. The test dialplan generates 440 Hz caller, 660 Hz operator and 880 Hz studio tones. The programme room is internal; no public audio output is connected. The controller unit is supplied as far-call-controller-test.service; provision_call_test.py only installs the PBX unit and refuses to rewrite a non-test settings file.

## Verification

Local: python -m unittest discover -s server -p 'test_*.py' -v (21 tests). Node scripts/check-call-centre.cjs checks the mocked Edge Function; scripts/check-admin.cjs checks links/permissions/scripts.

Real isolated host: python3 /opt/far-call-test/code/check_call_test.py --settings /opt/far-call-test/settings.json. Only Local test channels are originated. Generated tone recordings are analysed and deleted. Passed: two-way screening, no screening leakage to programme, caller audio after selection, mute/hold separation, end cleanup, private filtering/separation, operator-loss cleanup. A restart of only the test controller while a caller was on air cleared stale calls/rooms and reconnected. Final state: zero active channels, rooms or queue entries; existing radio services active.

## Remaining

Spoken menu, number/provider, Android locked-screen ringing for both recipients, voicemail/alerts, live return audio/mix-minus, authenticated HTTPS bridge and deployed Edge Function remain incomplete. Existing DJ manager REST/telnet compatibility needs repair and separate testing; do not replace it with the repository stub. No live DJ selection was tested or changed.

Browser interview links are deferred under the user's cost condition: ordinary incoming A&A 01/02/03 SIP calls have no incoming per-minute charge. Basic rental currently £1.56/month and setup £12 include VAT. Outgoing calls, mobile forwarding and 0800 inbound are chargeable; guests' providers may charge them. [A&A pricing](https://www.aa.net.uk/voice-and-mobile/prices/) and [handbook](https://support.aa.net.uk/images/a/ac/VoIP-Info.pdf), checked 1 October 2026. No number or account purchased.
