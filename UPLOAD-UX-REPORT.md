# Admin image uploads

Pages (main image and image sections), Schedule, Presenters & Team and podcast artwork now share a choose-image, preview, remove and save flow. Existing image addresses remain available under a collapsible control. Existing URLs/filenames are preserved.

Accepted files: JPG, PNG, WebP and GIF, up to 10 MB. Invalid/empty/oversized files are rejected before upload. Upload errors are understandable; existing images are retained when an upload fails. Relevant save/clear controls are disabled during upload and restored afterwards. Upload success explicitly says the item still needs saving.

No SQL/schema/storage policy changes. The existing far-cms-media bucket and upload policies are reused. The repository policy allows Owner/Deputy Manager uploads; other staff can retain or reuse image addresses and receive a clear explanation. Hosted podcast audio links remain because this bucket accepts images only. Public File currently provides text sections; no document upload control was added.

Verification: check-admin.cjs and check-media.cjs passed. Browser review covered Pages main and image sections, Schedule, presenter photos and podcast artwork in the protected preview. Real-account upload verification awaits Owner sign-in; live policy behaviour is not confirmed by mocks.

Exact files changed:
- admin-media.js
- admin-pages.html
- admin-schedule.html
- admin-website-manager.html
- scripts/check-media.cjs
- UPLOAD-UX-REPORT.md

## Consistent Admin controls

Added admin-ui.css to all 13 Admin/Cloud Live screens. Shared 44px minimum button height, typography, borders, focus indicators, neutral/primary/destructive actions and disabled styling. Text inputs, dropdowns and checkboxes now share styling; Schedule checkbox labels align beside their controls. Public navigation retains its own styling. Browser checks confirmed matching computed button sizes/colours on Schedule and Presenters & Team, and existing link/script checks passed.

Additional exact files changed:
- admin-ui.css
- admin-audience.html
- admin-content.html
- admin-dashboard.html
- admin-events.html
- admin-inbox.html
- admin-navigation.html
- admin-news.html
- admin-staff.html
- far-live-gateway.html
- far-dj-management.html
