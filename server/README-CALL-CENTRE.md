# FAR Call Centre — first build

This is an isolated call-queue foundation, not a working phone service. It does not change the existing DJ gateway, Icecast, Liquidsoap, studio or public stream. No Supabase tables or SQL are needed.

The staff screen is `far-call-centre.html`, linked from Cloud Live. It uses existing `cloud_live` access. Owner and Deputy Manager see the private business queue; other permitted staff see only show/game callers. All buttons use shared Admin styles. A local-only example is available at `http://localhost:8766/far-call-centre.html?preview=example&example_role=owner`. Use `example_role=staff` to check the private queue is absent. Examples do not make calls or control audio.

The intended single-number menu is: press 1 games/competitions, press 2 live show/interviews, press 3 private station business. Press 0 can repeat the menu. The two programme queues cannot receive private business calls. Going on air requires screening, Ready and explicit confirmation. The private queue has no programme audio actions.

## Components and safeguards

- `call_centre.py`: persistent atomic JSON queue, per-request version checks, one winner for competing answers, operator claims, only one on-air caller, provider disconnect cleanup. Caller name capped at 80 characters, provider ID omitted from staff snapshots; terminal entries pruned after 24 hours on next arrival; audit capped at 500 metadata entries. No audio recordings or phone numbers stored by this build.
- `call_centre_http.py`: binds **127.0.0.1:8768 only**; staff and provider use separate tokens, minimum 32 characters. Provider events cannot put callers on air. Run one process per queue file; the lock coordinates threads, not separate processes. Request bodies capped at 16 KB; credentials/names excluded from HTTP logs.
- `supabase/functions/far-call-centre/index.ts`: authenticates the real login and existing staff permissions, replaces client-supplied identity, filters private calls again, calls a configured HTTPS bridge with timeout and no redirects. Missing bridge returns unavailable. The new function has **not been deployed**.
- `UnconnectedAudio` deliberately rejects every media operation. Queue transitions are confirmed only after an audio adapter reports success. The UI disables controls without audio readiness and after an unconfirmed request; refresh is required before trying again.

## Not connected yet

An actual SIP/PBX/guest-room adapter is required for screening, holding, mute, on-air routing, mix-minus, business answer/voicemail and notifications. The included API cannot ring Android phones, generate guest links, automatically expire a queued call or run the phone menu. No number/provider is purchased. Private first-answer queue locking is tested; actual first-answer ringing behaviour is untested. The existing working DJ manager is separate and still needs a compatible authenticated website bridge; do not install the repository stub over it.

Before any live installation: preserve existing configurations securely, build a separate audio test route, implement the adapter with business-room separation, verify reboot/disconnect reconciliation and failed-operation isolation, add provider event signature verification and replay/expiry policy, set file/directory restrictions, enforce bridge TLS and firewall access, set process/request timeouts, and test locked-screen Android ringing for both recipients. Do not expose this loopback port directly. Environment names for the eventual service: `FAR_CALL_QUEUE_PATH`, `FAR_CALL_STAFF_TOKEN`, `FAR_CALL_PROVIDER_TOKEN`. Edge Function settings: `FAR_CALL_CENTRE_URL`, `FAR_CALL_STAFF_TOKEN`. Keep tokens out of frontend files and commits.

## Verification

Run `python -m unittest discover -s server -p test_call_centre.py -v` from the website repository, and `node scripts/check-call-centre.cjs`. These cover queue safety and a mocked Edge Function; they are not live call tests. Existing Admin, upload, service and preview suites also pass. Browser example checks cover Screen -> Ready -> confirmed Put on air -> Mute -> Hold and private answering, plus ordinary staff view. Responsive CSS uses one column below 760px; real Android audio and ringing remain untested.

Files in this increment: `far-call-centre.html`, `far-call-centre.css`, `far-call-centre.js`, `far-live-gateway.html`, `server/call_centre.py`, `server/call_centre_http.py`, `server/test_call_centre.py`, `server/README-CALL-CENTRE.md`, `supabase/functions/far-call-centre/index.ts`, `scripts/check-call-centre.cjs`.
