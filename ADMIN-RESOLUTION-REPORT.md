# Admin follow-up resolutions

Pages deletion and staff access removal now use accessible in-page confirmations with cancel, explicit confirmation, request locking and error feedback. This avoids the browser-dialog automation blockage while retaining explicit human confirmation.

Server source fixes (require separate Supabase function deployment): protect existing Owner accounts from invitation updates; allow station-wide Return to Automation without a DJ ID; report database failures instead of success. No schema or SQL changes.

check-admin.cjs and check-services.cjs pass. Server tests mock authentication, database and live bridge: no broadcasting switches or messages are sent by those tests. Page confirmation cancellation and confirmed deletion passed in the protected browser preview. Live cleanup and real restricted-account sign-in verification follow deployment.

Exact files changed: admin-pages.html, admin-staff.html, supabase/functions/far-staff-admin/index.ts, supabase/functions/far-dj-admin/index.ts, scripts/check-services.cjs, ADMIN-RESOLUTION-REPORT.md.
