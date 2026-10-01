# Admin follow-up resolutions

Pages deletion and staff access removal use accessible in-page confirmations with cancel, explicit confirmation, request locking and error feedback. The temporary unpublished upload-test page is absent from live Pages. The mistaken invitation has had its station access removed.

Real restricted staff verification completed with the intended temporary account: only Analytics appears on the dashboard, Analytics loads, and 18 restricted direct routes deny access or redirect. Invitation delivery, acceptance and staff sign-in completed. The account remains Analytics-only.

The Owner invitation safeguard was deployed to the existing far-staff-admin service on 1 October 2026. The deployed source was backed up first, working logic preserved, deployment timestamp refreshed, and the guard verified in reloaded deployed code. No SQL, schema or broadcast changes were made.

Broadcast management remains incomplete: far-dj-admin is absent from the deployed functions and FAR_LIVE_ADMIN_URL/FAR_LIVE_ADMIN_TOKEN are absent from custom secrets. The server deployment guide also requires review of existing Icecast authentication before wiring per-DJ credentials. The website now reports the missing connection clearly and disables creation/automation controls when the service cannot load. Existing public radio playback is untouched. The repository broadcast fixes remain source-only.

Validation: check-admin.cjs, check-media.cjs, check-services.cjs and preview/check.cjs pass. Service tests mock authentication, storage/database and live bridge; they do not assert successful live broadcasting. A tiny upload fixture may remain in storage after its unpublished page was removed.

Exact files changed in this follow-up: far-dj-management.html, supabase/functions/far-staff-admin/index.ts, ADMIN-RESOLUTION-REPORT.md. Previous resolution files: admin-pages.html, admin-staff.html, supabase/functions/far-dj-admin/index.ts, scripts/check-services.cjs.
