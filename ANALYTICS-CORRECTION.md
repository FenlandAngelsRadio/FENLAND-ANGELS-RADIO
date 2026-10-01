# Analytics correction — 1 October 2026

The dashboard now loads complete, consistently ordered pages instead of one capped query. Date filters use UK time; session duration is clipped to the selected period, including sessions crossing midnight. Larger ranges cannot silently lose recent records because of a server response cap. Only devices with playback events count as listening devices. Repeated page loads no longer count as separate visits within the same browser session.

The milestone uses all recorded history, independently of the date buttons. The existing 300.62-hour launch baseline is retained and labelled as carried forward from the previous calculations to preserve listening history lost by StationHQ; this change does not invent evidence for that baseline or subtract guessed self-listening.

Stream totals, hourly cards and programme cards use the same capped, non-overlapping measured intervals. Hour/show boundaries split those intervals correctly. Unavailable readings and gaps are not zero listeners. Recorded coverage and latest sample time are visible. Missing live counts display unavailable, and unmatched connections are not presented as a known external player type. Owner/staff listening remains included because current records cannot identify it reliably.

## Recorder repair

The old GitHub hourly workflow actually ran at approximately 01:25, 08:01 and 15:24 today, each covering about an hour. A new independent systemd timer on Cloud Live reads the existing YesStreaming count every five minutes and writes actual readings to the existing table. It does not host or control audio. Failed reads do not become guessed zeros. A first real reading was saved successfully. The old workflow remains a manual diagnostic fallback, with automatic scheduling removed to avoid competing recorders.

Host files: /opt/far-audience-monitor/audience_recorder.py, monitor.env; /etc/systemd/system/far-audience-monitor.service and .timer. Monitor uses a dynamic system user, read-only filesystem and bounded network timeouts. Existing broadcasting services were not restarted. No SQL/schema or country-access rules changed.

## Validation and limits

scripts/check-audience.cjs passes pagination under server caps, overlapping periods, midnight/DST, regressing durations, listening-only device counts, gap coverage and hour/programme boundaries. Recorder parsing tests and existing Admin references/scripts checks pass. Browser preview confirms unavailable counts and missing samples are labelled clearly. Live browser date-filter and coverage verification follows publication.

Historic readings missed by the old schedule cannot be reconstructed. Counts still include your own listening, and device/session counts do not establish unique people. The carried-forward launch baseline is preserved as the owner confirmed; it is not recalculated from incomplete StationHQ history. StationHQ has independent session accounting, so its totals need not equal sampled stream estimates. The public far-audience Edge Function is unchanged; this correction concerns the authenticated Analytics dashboard and continuous snapshot collection.

## Exact repository files

- admin-audience.html
- far-audience-math.js
- scripts/check-audience.cjs
- server/audience_recorder.py
- server/test_audience_recorder.py
- .github/workflows/far-icecast-audience.yml
- ANALYTICS-CORRECTION.md

Local preview/adapter.js also gained pagination support; it is not deployed.
