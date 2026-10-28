# Security

This document describes the threat model, the controls that are implemented,
and the known limitations. It is an engineering record, not a certification.
The platform has not been independently penetration-tested and should not be
described as "secure", "certified" or "unhackable".

Controls marked **(tested)** are covered by automated tests in `tests/`.

## Assets and threats

| Asset | Main threats |
| --- | --- |
| Shipment data (names, addresses, phone numbers, contents, values) | Enumeration through tracking lookups; staff over-access; leaks through logs, caches or referrers |
| Tracking codes | Guessing, brute force, leaked codes remaining valid |
| Staff accounts | Credential stuffing, password guessing, session theft, CSRF, privilege escalation |
| Operational integrity (events, progress, delivery status) | Fabricated or regressed status, unaudited edits, fake delivery claims |
| Prices and quotes | Client-side tampering with amounts |
| Audit trail | Tampering or deletion |
| Secrets (tracking HMAC key, database credentials) | Committed to source, exposed through static file serving |

## Public tracking

- **Code design.** Codes look like `CL-7KQ2-M9XD-4TR8`: 11 random Crockford
  base32 characters from `crypto.randomBytes` (55 bits) plus a check character.
  The check character catches every single-character typo before any database
  lookup **(tested)**.
- **Stored as a keyed hash.** Only `HMAC-SHA256(TRACKING_CODE_SECRET, code)` and
  a short hint are stored. The plain code is shown to staff once, at issue time,
  on a `no-store` page **(tested)**.
- **No status oracle.** Unknown, revoked, expired and archived codes go through
  the same query and return the same response and HTTP status (tested for
  unknown versus revoked over HTTP, and for expiry at the service level). A
  mistyped code (bad check character) gets a distinct "check the code" message,
  but that is decided without touching the database.
- **Revocation is immediate.** Lookups filter on `revoked_at is null` on every
  request; nothing is cached **(tested)**.
- **Read-only.** The lookup only runs `select` queries.
- **Minimal disclosure.** The public view shows the service, origin and
  destination city/country, milestones, public notes and estimated delivery.
  It never shows names, street addresses, phone numbers, emails, contents,
  declared value or internal notes **(tested)**.
- **No leakage.** Tracking responses send `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` **(tested)**.
  Tracking codes are redacted from request logs.
- **Rate limits.** 30 lookups per minute per IP, and an IP is blocked for the
  rest of the hour after 40 failed lookups.

## Staff authentication

- Passwords are hashed with scrypt (N=2^15, r=8, p=1, 16-byte salt) and compared
  in constant time. Minimum 12 characters; common passwords and passwords
  containing the email name are rejected.
- Accounts are created with a random temporary password shown once. The user
  must change it at first sign-in; nothing else in the console is reachable
  until they do **(tested)**.
- Sign-in failures show one message for unknown email, wrong password, disabled
  and locked accounts (tested over HTTP for unknown email and wrong password).
  Unknown emails still run a password hash so response timing is similar. Five
  consecutive failures lock the account for 15 minutes **(tested)**. Sign-in
  attempts are also limited to 10 per 15 minutes per IP.
- Sessions: 32 random bytes in an `HttpOnly; SameSite=Strict` cookie (`Secure`
  and `__Host-` prefix over HTTPS). Only a SHA-256 of the token is stored.
  2-hour idle timeout, 12-hour absolute lifetime. Sign-out deletes the session on
  the server, so a copied cookie stops working **(tested)**.
- Changing your password, a role change, disabling an account or a password
  reset revokes the user's other sessions **(tested for role changes)**.
- Post-login redirects only accept `/admin` paths **(tested)**.

## Authorisation

- Seven roles with a deny-by-default permission matrix (`src/domain/permissions.ts`)
  **(tested)**. Business customers have no staff permissions and cannot sign in
  to the console.
- Permissions are checked in the route and again in the service that performs
  the change **(tested via HTTP for operator and auditor roles)**.
- Nobody can change their own role; only an owner can grant the owner role or
  modify another owner **(tested)**.
- Roles come only from the database, never from the request.

## Request integrity

- **CSRF.** Every admin POST must include the session's CSRF token (constant-time
  comparison). The sign-in form uses a double-submit cookie. All cookies are
  `SameSite=Strict`. A global same-origin check rejects any non-GET request whose
  `Origin`/`Referer` is another site **(tested)**.
- **Idempotency.** Shipment creation, tracking code issue and quote requests
  carry a one-time form key with a unique database constraint, so a double
  submission does not create duplicates **(tested)**. Events are de-duplicated by
  `(shipment_id, dedupe_key)` **(tested)**.
- **Server-side pricing.** Quote estimates are recalculated on the server from
  the shipment details; client-supplied amounts are ignored **(tested)**.
- **Validation.** All input goes through zod schemas with length limits. Bodies
  are limited to 32 KB and 200 fields; JSON and file uploads are not accepted.
- **Destructive actions** (cancel, archive, revoke a code, void an event,
  disable a user) require a written reason and a confirmation checkbox, and are
  audited **(tested for revoke)**.

## Operational integrity

- Progress is derived from the event history and never regresses because of
  out-of-order events; only an audited void can lower it **(tested)**.
- 100% / Delivered requires a delivery event with an evidence reference,
  enforced in the service and by a database `check` constraint **(tested)**.
- Events in the future are rejected **(tested)**. Cancelled and archived
  shipments cannot be edited (tested for archived; cancelled uses the same check).
- The audit log is append-only: a database trigger rejects `UPDATE` and
  `DELETE` on `audit_events` **(tested)**.

## Browser and transport hardening

- Content Security Policy: `default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self';
  frame-ancestors 'none'; base-uri 'none'; object-src 'none'` (plus
  `upgrade-insecure-requests` in production). There are no inline scripts or
  styles and no third-party resources; fonts are self-hosted **(tested)**.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy: same-origin`. HSTS when served over HTTPS.
- The admin console sends `no-store` and `noindex` on every response.
- All HTML output is escaped by default by the `html` template tag.
- Only the `public/` directory is served statically, with dotfiles denied.
  Source files, `.env`, `package.json` and the `legacy/` folder return 404
  **(tested)**.
- Error responses never include stack traces; server errors are logged with
  sensitive keys redacted.

## Secrets and configuration

- Secrets come only from environment variables. `.env` files are git-ignored;
  `.env.example` contains placeholders only.
- Production refuses to start without `TRACKING_CODE_SECRET` (32+ characters),
  `DATABASE_URL` and an `https://` `SITE_URL`.
- Rotating `TRACKING_CODE_SECRET` invalidates every issued tracking code;
  re-issue codes afterwards.
- No payment card data is ever handled or stored. Future payments are designed
  around a hosted payment page and verified webhooks
  (see [Architecture](ARCHITECTURE.md#integration-architecture-designed-not-implemented)).

## Known limitations

These are accepted for the current milestone and should be addressed before
handling real customer data at scale:

1. **Rate limiting is in-memory and per process.** It resets on restart and
   does not work across multiple instances. Use a shared store (Redis or
   PostgreSQL) or an edge rate limiter before scaling horizontally.
2. **No multi-factor authentication** for staff accounts yet.
3. **No database row-level security.** Isolation is enforced in the application.
   The organisation/business-customer portal is not built; when it is, queries
   must be scoped by organisation and RLS should be considered.
4. **The embedded PGlite database is single-process** and intended for
   development, tests and single-instance demos only.
5. **No email delivery**, so password resets are performed by an administrator
   who shares a temporary password out of band.
6. **No automated dependency or container scanning** is configured. Run
   `npm audit` regularly.
7. **No malware scanning or file uploads.** Document upload is not implemented;
   it will need size/type validation, scanning and private storage.
8. **Personal data retention** is not yet automated. Define retention periods
   with legal advice and add a purge job for old quote requests, contact
   messages and archived shipments.
9. **Legal pages are drafts** and have not been reviewed by a lawyer.

## Legacy application

The previous LIVEXPRESS site is preserved unchanged in `legacy/` for reference.
It is not served by the new application and must not be deployed. Issues found
during review:

- The old server served its own project directory statically, which exposed
  `server.js`, configuration and the `data/*.json` files (including shipment and
  visitor records) over HTTP.
- Admin access used a single shared password with an insecure default
  (`ChangeMeLocalOnly`) when unset. The bearer token was either the plaintext
  password or its unsalted SHA-256, and it never expired.
- CORS reflected request origins, and data was stored in JSON files with
  failed writes silently ignored.
- Much of the admin UI built HTML with `innerHTML`.

Legacy data has not been migrated. If any of it is real, treat the old
admin password as compromised and rotate any credentials the old `.env` used.

## Reporting a vulnerability

No security contact has been configured yet. Before launch, publish a security
contact (for example `security.txt`) using a real, monitored address.
