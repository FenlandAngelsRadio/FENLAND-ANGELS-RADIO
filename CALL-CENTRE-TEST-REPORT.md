# FAR Cloud Live build status — 1 October 2026

## Verified

37 Python tests and all five grouped JavaScript checks passed: Admin links and permissions, service responses, call-centre authentication and private access, audience calculations, and uploads. Service API tests are mocked.

Separate real Asterisk audio checks passed for screening, programme separation, selection, mute, hold, ending, private access, operator loss and restart recovery. Separate real Liquidsoap checks passed for DJ connect, selection, return and disconnect. Generated test audio is not listener activity.

The DJ compatibility repair is installed. Existing station output and Icecast were not restarted. All four station/DJ services were active in the final read-only host check. The obsolete duplicate DJ control service is disabled.

Both Supabase functions are deployed with their own direct sign-in checks. Their restricted website-to-server bridge is installed and configured. Deno successfully read the real DJ endpoint and rejected an incorrect server identity. The restricted server key also rejected an arbitrary shell command. An authenticated Owner call-queue check remains pending; the available FAR browser session is the restricted audience-only test account.

Production phone configuration and four spoken prompts are prepared. The configuration separates private owner/Nick ringing and voicemail from programme audio, disallows outbound calls, and requires trusted studio audio before callers can be put on air. The public provider connection is not installed or verified.

The staff home-screen manifest and Android help are included in this release. A home-screen shortcut does not provide reliable locked-screen ringing. Publication is being verified separately.

## Files changed or added for the Cloud Live increment

- far-call-centre.html
- far-call-centre.css
- far-call-centre.js
- far-live-gateway.html
- far-dj-management.html
- far-staff.webmanifest
- .github/workflows/far-cloud-live-checks.yml
- supabase/functions/_shared/server-bridge.ts
- server/web_bridge.py
- server/test_web_bridge.py
- supabase/functions/far-call-centre/index.ts
- supabase/functions/far-dj-admin/index.ts
- server/call_centre.py
- server/call_centre_http.py
- server/asterisk_audio.py
- server/asterisk_events.py
- server/run_call_service.py
- server/provision_call_test.py
- server/check_call_test.py
- server/test_asterisk_audio.py
- server/test_asterisk_events.py
- server/test_call_centre.py
- server/far-call-controller-test.service
- server/asterisk-menu.conf.example
- server/build_phone_config.py
- server/render_phone_prompts.py
- server/test_phone_config.py
- server/far-phone.service.example
- server/bridge-proxy.conf.example
- server/dj_manager.py
- server/dj_gateway.py
- server/check_dj_test.py
- server/test_dj_manager.py
- server/install_dj_compatibility.py
- server/dj-control.py
- server/README-DJ-CONTROL.md
- server/README-CALL-CENTRE.md
- scripts/check-call-centre.cjs
- scripts/check-services.cjs
- CALL-CENTRE-TEST-REPORT.md

Host reference copies and generated caches are not deliverable source files. Earlier Admin/analytics edits are outside this increment.

## Remaining gaps

1. Complete the signed-in Owner check of both website functions. The restricted SSH connection avoids needing a new public HTTPS control endpoint, DNS record or firewall opening.
2. A&A must release the account stop on ordered number 01945 383909. Real incoming calls cannot be verified before activation; the reason for the stop is not established.
3. Configure actual SIP credentials, test menu choices and private first-answer-wins routing with the provider, and verify voicemail notification delivery.
4. Connect and test live programme return audio/mix-minus. On-air controls must remain unavailable until programme audio is confirmed.
5. Configure owner/Nick Android calling apps and verify ringing with each phone locked.
6. Verify the published website release and the DJ handoff to the existing public streaming provider. The inspected Cloud Live outputs currently have no downstream listeners, so selecting a dedicated DJ input does not prove a public broadcast handoff. Browser interview links remain deferred under the user's incoming-call-cost condition.

The build is not yet a finished live telephone service. Passing isolated and mocked checks does not prove these remaining integrations.
