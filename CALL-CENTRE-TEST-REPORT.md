# FAR call-centre build and test report — 1 October 2026

The real isolated phone test runs on Cloud Live. Public calls and the website connection are not enabled.

Passed against real Asterisk with generated audio: screening-room audio, no screening leakage into the programme room, caller audio after selection, mute and hold separation, call ending, private business separation, staff visibility restrictions, operator disconnect cleanup and controller restart recovery during an active test call.

All 21 local Python tests and the call-centre authentication and Admin checks passed. The Edge Function checks use mocks; no real Android/phone-provider call was tested. Final host check: zero active test calls, channels or rooms. Existing far-live, far-dj-gateway and icecast2 remained active.

## Exact repository files changed in this increment

- far-call-centre.js
- server/asterisk_audio.py
- server/asterisk_events.py
- server/call_centre.py
- server/call_centre_http.py
- server/run_call_service.py
- server/provision_call_test.py
- server/check_call_test.py
- server/test_asterisk_events.py
- server/test_call_centre.py
- server/far-call-controller-test.service
- server/README-CALL-CENTRE.md
- CALL-CENTRE-TEST-REPORT.md (this report)

## Server changes

Installed Asterisk and python3-websocket without upgrading or restarting existing radio services. Default asterisk.service is masked. Separate configuration, secrets, queue and code reside in /opt/far-call-test. Separate far-call-test and far-call-controller-test units run but are not enabled at boot. Both restrict network access to loopback. No public SIP endpoint, number purchase, paid upgrade, Oracle network change or Supabase SQL/schema change occurred.

## Remaining work

Real number/account, spoken menu, secure website-to-phone bridge and deployed Edge Function; Android locked-screen ringing for you and Nick; voicemail and alerts; live programme audio/mix-minus; existing DJ-control compatibility and verification. Browser interview service deferred under your condition because normal incoming A&A SIP calls have no station per-minute charge. Guests may pay their own provider.

Pricing checked: ordinary basic number £1.56/month, £12 setup including VAT. Mobile forwarding, outgoing calls and 0800 inbound cost extra. [A&A pricing](https://www.aa.net.uk/voice-and-mobile/prices/), [handbook](https://support.aa.net.uk/images/a/ac/VoIP-Info.pdf).
