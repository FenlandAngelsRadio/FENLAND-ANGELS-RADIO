# Mobile website and Cloud Live progress

The shared navigation now has a compact phone/tablet Menu button with expandable sections, visible focus, Escape/outside-click closing, and scrollable menus. Existing CMS navigation remains the source of links. On phones, the homepage puts the live player first and reduces programme artwork. No separate duplicate mobile website was created.

Validation: 13 public pages checked at 320, 390 and 768 pixels using the browser viewport override. A 320px homepage overflow was corrected; menu expand/collapse and Escape checked. Admin static link/script/permission checks and mocked service checks pass. Existing audio sources were not changed.

Cloud Live remains pending server access and phone-service selection. User requires both listener phone calls for games and browser interview guests, with automated arrival/holding and one small-team call queue. Do not deploy mock controls or claim real calls work before service and broadcast routing exist. Radio-server bridge secrets and deployed DJ service were absent during the preceding review. DJ creation source now rejects missing bridge configuration instead of returning unusable credentials. This source fix has not been deployed to Supabase. No SQL or schema changes.

Exact changed files:
- site-nav.js
- site-nav.css
- admin-audience.html
- admin-content.html
- admin-dashboard.html
- admin-events.html
- admin-inbox.html
- admin-navigation.html
- admin-news.html
- admin-pages.html
- admin-schedule.html
- admin-staff.html
- admin-website-manager.html
- advertising-enquiry.html
- advertising.html
- apply.html
- contact.html
- events.html
- far-live-gateway.html
- index.html
- news.html
- other-ways-to-listen.html
- page.html
- podcasts.html
- public-file.html
- schedule.html
- submit-event.html
- team.html
- vouchers.html
- weather.html
- supabase/functions/far-dj-admin/index.ts
- scripts/check-services.cjs
- MOBILE-CLOUD-REPORT.md
