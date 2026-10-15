# FAR Voucher Hub

An addition to Fenland Angels Radio’s existing static website and Supabase project. It is not a separate subscription platform. **The voucher tables, private storage bucket and server function have been installed. Sales remain OFF; payment, accounting and email delivery are not connected.** See `DEPLOYMENT-STATUS.md` for the current handover.

## Everyday use

1. FAR staff sign in with an existing FAR account. Owners and deputy managers have access; other staff need the existing `vouchers` permission.
2. Add the business and create its offer. Enter the actual voucher face value and agreed quantity. Advertising credit automatically equals face value × quantity (£1 of advertising for each £1 of vouchers). The customer price automatically rounds each voucher’s face value to the nearest whole pound (50p rounds up), then takes 50%. For example: £20.49 → £10; £20.50 → £10.50; £20.75 → £10.50. Advertising credit still uses the actual face value. Record expiry, advertising package, start/end dates and delivery commitment.
3. Upload the signed agreement and original voucher file privately. Add the agreed quantity or paste the business’s unique voucher codes. The hub creates its own unique FAR code per voucher.
4. Approve and invite the business’s email. The business signs in using an email link and only sees its own redemption screen.
5. Once launch configuration is verified and sales are explicitly enabled, the customer pays through SumUp hosted checkout. Verified payment issues one voucher, queues its email and queues Pandle bookkeeping. Stock is reserved during payment, preventing the last voucher being sold twice.
6. The business scans the customer QR or types the code. “Check voucher” shows the entitlement and terms. “Confirm redemption” consumes it once, recording the time and user. A network error never reports successful redemption.
7. Staff see available, issued and redeemed totals, advertising commitments, and queued tasks. Download the private register as CSV when needed. The database remains the live source of truth.

Advertising dates are recorded commitments, not an automatic advertising scheduler. Uploading a PDF does not automatically extract or validate its legal terms. Staff enter the agreed fields once. Sold offer terms are protected; create a new offer to change them.

Saved offers have a **Create agreement draft** button. It downloads a printable HTML document populated with the business, voucher quantity, actual face value, advertising credit, resale price, expiry, package and campaign commitments. It remains visibly unsigned and includes open terms for the parties to complete. It is not automatically treated as a signed agreement. Review/sign it outside the app, then upload the final signed version. Approved agreement wording can replace the initial draft template.

The launch target is **Friday 30 October 2026**. Recording that target does not enable payments or schedule an automatic opening.

## SumUp and accounting boundaries

The hub owns the voucher catalogue and stock. It uses SumUp’s documented hosted checkout API; payments appear in the connected SumUp account. It does **not** synchronise the native SumUp Online Store product catalogue. No documented supported catalogue API was established for that requirement. Do not sell the same voucher stock separately in SumUp’s native shop: those sales would bypass this register.

Pandle integration code is prepared against its published API, but live API access on the current Pandle plan and authentication still need verification. It is not yet connected or tested with this account. Pandle authentication tokens rotate and are stored server-side. Missing configuration leaves a visible queue; it never marks an unposted sale as synced.

Pandle entries are gross cash sales into FAR’s payment-clearing account plus separate actual SumUp fees. They use explicit verified nominal/tax/currency IDs, not displayed account codes. The agreed advertising value is stored in the agreement but **does not become a cash receipt**. The non-cash voucher-for-advertising exchange, advertising recognition over the commitment period, and voucher accounting treatment need the accountant’s mapping before automation is extended. SumUp bank payouts/transfers must be reconciled against clearing, not counted as another sale. Refunds and chargebacks are flagged for review and never replenish stock automatically. Refund bookkeeping and cancellation are not automatic in this version.

No Pandle subscription or paid hosting/email service has been purchased. Available free allowances and API eligibility must be checked before choosing a production plan.

## Build and tests

Requires Node 22+ and pnpm. From this directory:

```
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

The production files are `dist/voucher-app.html`, `dist/voucher-app.js`, `dist/voucher-app.css`, served alongside the existing public `events-config.js`. No private service key belongs in that configuration.

`node demo/server.mjs` starts a **loopback-only** sample database and UI at `http://127.0.0.1:8774/voucher-app.html`. It prints a sample code and ticket link. The adapter is compiled only for this demo; it is not in the production build, does not use live customer data, and cannot send invitations, upload live files, charge cards or post accounting. Sample changes reset when the process restarts.

Tests execute migrations and access rules in PostgreSQL (PGlite), including payment mismatch rejection, repeated payment/import idempotence, sold-out stock, protected sold terms, business isolation, document privacy, double-redemption rejection, and refund handling. They also verify payment checks, accounting amounts/date mapping, escaped email content and QR decoding. These are not a substitute for a provider sandbox test. Physical phone camera scanning, production authentication/email, real storage upload, SumUp and Pandle remain unverified until the live connections exist.

## Production installation — leave sales OFF

1. The seven migrations have been applied to FAR’s Supabase project in numeric order, following a check of the existing `far_admins` schema and confirmation no voucher tables existed. They add the private `far-voucher-documents` bucket and keep internal offer records staff-only. Do not rerun these creation scripts on the installed project. For a fresh staging project, back up first and apply them in numeric order. Adding SQL files to GitHub does not apply them automatically.
2. Deploy `supabase/functions/far-voucher-api` with its `core.mjs`. Its gateway `verify_jwt=false` permits public checkout/webhooks; the handler itself authenticates staff actions and separately authenticates the worker. Only server service-role calls can reserve, issue, release stock or post accounting jobs.
3. Configure server secrets from `.env.example`, through Supabase secrets/Vault only. Supabase supplies its standard URL/service/anon variables. Set `APP_ORIGIN` to the exact production origin and `APP_URL` to the final hub page. Keep `SALES_ENABLED=false` and the database `far_voucher_settings.sales_enabled=false`.
4. Add the exact hub URL to Supabase Auth’s redirect allowlist, keep email confirmation enabled, use invitation-only business accounts, and configure a real SMTP sender for login links. Existing FAR staff can also enter via their existing authenticated dashboard session. Do not enable arbitrary public staff permissions.
5. Create a SumUp integration/API credential for FAR’s merchant through SumUp’s supported process, with checkout and transaction-read permissions. Set its merchant code and server API key. Verify hosted checkout availability using a sandbox merchant, never a real card as an automated test.
6. Configure a verified email sender and server Resend credential for voucher delivery. The email contains the FAR code and a private link to its QR voucher. No email is sent by simply deploying this source.
7. Owners/deputy managers can use **Connections → Connect Pandle securely**. The password is sent once via FAR’s Supabase function to Pandle’s documented API sign-in endpoint; it is not stored. The server verifies the legal company and exact FAR account/category names, GBP and No VAT codes, then saves only API authentication headers and the verified record IDs in private connector state. It leaves posting disabled. API eligibility is only confirmed after this check succeeds. The alternative manual `PANDLE_MAPPING` / server token configuration remains supported. Set `PANDLE_ENABLED=true` only after a controlled posting has been reviewed. Displayed category codes are not API IDs.
8. Create a random `WORKER_SECRET` and `RATE_LIMIT_SALT` server-side. Put the worker URL/token in Supabase Vault as described in `supabase/schedule-worker.sql`, then run that script once. It reconciles payments and handles queued delivery/accounting once per minute. Monitor failed cron/network jobs. There is no guarantee of automation if the worker is not scheduled.
9. Deploy the three production files to the existing website. Point the staff dashboard’s voucher tile to `voucher-app.html` once installed. Customer catalogue URL is `voucher-app.html?shop=1`. Business redemption is the same page after login. QR links use `?voucher=...`; private customer tickets use `?ticket=...`.
10. Perform an end-to-end staging check: invited business login, staff upload, stock import/retry, last-stock simultaneous checkout, forged/duplicate/missed callback, payment expiry, delayed email, Pandle timeout/reconciliation, cross-business denial, phone scan/manual entry, repeat redemption and refunded payment. Confirm content/terms and account mappings. Only then deliberately enable both live-sales controls and replace the public Coming Soon link.

## Operational safeguards and limits

- No card details, API credentials or original agreement files in browser bundles or Git. Business accounts cannot list unissued supplier codes or customer emails. Private file links expire after 60 seconds.
- Emails/financial tasks use leased jobs. Duplicate payment notifications do not create another voucher or job. Pandle posts use stable references and reconciliation; an uncertain POST is never blindly repeated. An administrator must investigate a missing uncertain entry before manually resolving it.
- The worker checks a small rotating batch of orders to keep within function limits. For a small launch this is sufficient; monitor backlog and increase capacity before substantial volume.
- Checkout creation uses a lease, unique order reference and recovery lookup. Stock is released only after verified provider expiry, or after recovery confirms an old order never acquired a checkout. A failed payment attempt alone does not release stock.
- Per-email hashed rate limits are included. Configure edge/gateway IP rate limiting and abuse protection before opening anonymous checkout publicly; email limits alone do not stop distributed stock-holding attacks.
- No automatic refunds, business payouts, advertising publication, OCR, Pandle bank transfer matching, or accounting entries for the non-cash exchange. These are explicit scope limits, not hidden automation.
- Back up the Supabase database and private storage, set retention rules for customer email and contracts, monitor delivery failures, and periodically reconcile SumUp/Pandle totals.

## API references used

- https://developer.sumup.com/api/checkouts
- https://developer.sumup.com/api/transactions
- https://developer.sumup.com/online-payments/webhooks
- https://my.pandle.com/api/docs/v1/swagger.json
- https://supabase.com/docs/guides/database/postgres/row-level-security

Customer launch is not complete until the above connections are installed and tested. No live payments have been enabled.
