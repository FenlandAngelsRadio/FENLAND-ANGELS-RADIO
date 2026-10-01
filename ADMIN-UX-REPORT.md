# FAR Admin interface changes

Built against the current GitHub main branch; proposed changes are separate from the live website. No SQL was run, no Supabase schema or policies were changed, and no live records or staff permissions were modified.

## Result

- Dashboard groups each job once, hides inaccessible cards and empty groups, and preserves full Owner/Deputy Manager access.
- Website Home owns homepage/station information. Advertising, Sponsors and Vouchers are separate views of existing content, with advertising packages and enquiries in Advertising.
- Pages retains all nine reusable section types. New pages start unpublished; saving keeps the editor open for adding sections. Page publication and menu settings remain with the page. Link sections now render links, and image sections display their captions.
- Navigation shows the four named menus, with editable links, movement and visibility controls. Public header menus load ordinary links from the existing navigation table and custom page links from existing Pages settings through one shared resolver. Legacy duplicate menu records targeting custom pages are ignored; Pages owns those links. Empty menus disappear. Fixed station branding/Listen Live and footer contact links remain available.
- Specialist screens open the requested module, use plain descriptions and hide other module tabs. Inbox filters respect each staff permission.
- Staff invitations, temporary-password actions and access removal moved from Cloud Live to Staff & Permissions. Existing server restrictions are retained. Cloud Live focuses on monitoring and DJ connections.
- Repeated navigation includes removed and the navigation script version updated on all public/Admin pages that use it.

## Verification

`node scripts/check-admin.cjs` passed. It checks dashboard permission visibility (staff, Owner and Deputy Manager), duplicate modules, publication/navigation rules, unsafe link protocols, all static local links/assets, duplicate navigation includes, and JavaScript parsing for 33 inline scripts and the changed external scripts. Git whitespace checks passed.

Browser checks used an isolated localhost preview with sample data, replacing service access. Verified Owner dashboard, restricted staff dashboard, draft creation/save, immediate section addition, existing page disabling, navigation link save, team module routing, unauthorized module access, shared commercial-text read-only state, account control visibility, and Inbox filter visibility. No production write tests were performed. Dashboard screenshot is available in the task workspace.

## Follow-up review and safe preview

Fixed main-menu link styling and added actionable save-failure messages for page and specialist visibility/deletion controls. Page list menu names now use the human-readable names. Checks also cover failed mutation feedback. A persistent localhost preview supports example roles and optional real sign-in/read access. Preview edits stay in per-account, per-tab local copies; network guards block live content, storage, function and credential writes. Real uploads and account actions are disabled. End-to-end browser checks confirmed draft creation, section content, publication, menu placement and public rendering across page visits. The local preview helper is outside the website source and is not deployed with the PR. Preview safety tests passed. Real sign-in awaits the user; no real-account write policies have been verified.

## Dashboard return links

Added the missing dashboard return link to Events and DJ Management, and standardised existing Admin return links as “Return to Admin Dashboard”. The DJ Management link back to Cloud Live is retained.

## Remaining gaps and constraints

1. News is an existing automated feed. There is no staff story editor or editable news storage in this repository. The new News screen explains this clearly.
2. Existing content policies require `website_content` permission to save shared advertising, voucher and sponsor text. Staff with only the specialist permission can view that text; advertising package editing uses the existing advertising permission. This pass does not change those policies.
3. Navigation now controls the public header, but is not a single database table for every link: custom page links continue to use Pages metadata so a Pages-only staff member can publish and place a page without receiving broader Navigation access. Navigation-only staff need Pages permission to change a custom page’s own link. A single-table design with equivalent granular access would need backend changes beyond this interface-only pass.
4. Sponsors currently manages the existing sponsorship message, not individual sponsor profiles; no sponsor-profile storage exists here.
5. The existing invitation service accepts only six initial permissions and automatically adds Analytics. All granular permissions remain editable afterwards in Staff & Permissions. The service itself was not changed or deployed.
6. Live authentication, row-level policy behaviour, uploads, invitations, password actions and broadcasting must still be verified with authorized real accounts after review. Navigation keeps the existing standard-link fallback if its service cannot be reached; a successful empty response shows no menu links.

## Exact repository files changed

- `ADMIN-UX-REPORT.md`
- `admin-audience.html`
- `admin-content.html`
- `admin-dashboard.html`
- `admin-events.html`
- `admin-inbox.html`
- `admin-navigation.html`
- `admin-navigation.js`
- `admin-news.html`
- `admin-pages.html`
- `admin-schedule.html`
- `admin-staff.html`
- `admin-website-manager.html`
- `advertising-enquiry.html`
- `advertising.html`
- `apply.html`
- `contact.html`
- `events.html`
- `far-live-gateway.html`
- `far-navigation.js`
- `index.html`
- `news.html`
- `other-ways-to-listen.html`
- `page.html`
- `podcasts.html`
- `public-file.html`
- `schedule.html`
- `scripts/check-admin.cjs`
- `site-nav.css`
- `site-nav.js`
- `submit-event.html`
- `team.html`
- `vouchers.html`
- `weather.html`

Additional file changed for dashboard return links: `far-dj-management.html`.
