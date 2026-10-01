# FAR Admin verification — 1 October 2026

Checked live signed-in Owner access to 20 dashboard/tool routes plus DJ Management. Every specialist route loaded with its expected title and dashboard return link. Website Home and commercial content loaded; Navigation showed all four human-readable menus; Analytics loaded programme cards; Cloud Live reported online; Staff & Permissions loaded existing staff. No account credentials or broadcasting settings were changed.

Checked 12 public destinations: homepage, schedule, team, podcasts, events, news, listening options, public file, advertising, vouchers, existing custom page and unpublished upload-test page. Published page rendered; unpublished page returned Page unavailable. Sampled browser console errors were empty.

Real Owner image upload succeeded, image decoded, draft save succeeded, and reopening after reload retained the image. Draft remained unpublished and outside menus. Temporary draft `far-upload-check-20261001` remains: browser automation stalls at delete confirmation. Uploaded one-pixel test image also remains in media storage. Existing published pages were not altered.

Protected preview: specialist create/save flows for team, podcasts, listening options and public file passed. Restricted staff dashboard showed only assigned tools; direct team/navigation/staff/inbox access was denied as appropriate. Deputy Manager dashboard included full management access. Prior page-builder/publication/navigation flows passed.

Automated checks passed: check-admin.cjs (static links/assets, script parsing, dashboard permissions, shared navigation publication/safety, failed saves), check-media.cjs (invalid/empty/oversized images never sent, successful/failed/offline uploads), and preview/check.cjs (live-write blocking and isolated local data).

Corrected Sponsors panel heading and save button to Sponsorship message instead of Advertising. Only admin-content.html and this report changed in this follow-up.

Limits: real non-Owner login/policy tests not performed; no real invitations/password resets/access removal, DJ creation/switching, or published-content mutations performed as routine tests. Podcast audio uploads are unsupported by the existing image-only bucket; ordinary staff uploads retain the existing Owner/Deputy restriction. Browser viewport override did not change measured width, so this run cannot confirm phone layout. No SQL/schema/policy changes.

## Player interruption check

Server status was online and named the current song. Both homepage and separate popup players connected, reached readyState 4 and advanced playback time without media errors. This does not establish the cause of the user's earlier interruption. Corrected homepage error-state ordering so its error message is no longer overwritten by generic idle text; ended playback now shows reconnect guidance. Both players reload a failed media connection before a manual retry. Homepage script version increased. Homepage audio remains tied to its page; the separate Listen Live player is available for listening while browsing.

Additional files changed: app.js, player.html, index.html.
