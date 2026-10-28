# Architecture

## Overview

Crownline is a single server-rendered Node.js application. One Express process
serves the public website, the public tracking lookup and the staff operations
console from the same origin, backed by PostgreSQL.

```
Browser ──HTTPS──▶ reverse proxy (TLS) ──▶ Express app ──▶ PostgreSQL
                                             │
                                             ├─ public router   (/, /calculator, /track, /quote, …)
                                             ├─ admin router    (/admin/…, session + CSRF + RBAC)
                                             └─ static files    (public/: CSS, JS, fonts, images)
```

### Why this shape

| Decision | Reason |
| --- | --- |
| Server-rendered HTML, no client framework | Every page works without JavaScript, the CSP can forbid inline scripts entirely, and there is no client bundle to secure or build. `public/js/site.js` only adds conveniences. |
| Node runs TypeScript directly | No build step to drift from the source. The code uses only erasable TypeScript syntax; `tsc --noEmit` checks types. |
| PostgreSQL, with PGlite for development and tests | Real constraints, transactions, triggers and row locks. PGlite runs the same migrations in-process, so tests exercise the real SQL without a database server. |
| Plain SQL (`pg`), no ORM | Queries are short and explicit; all values are parameterised. |
| Single process, same origin for public and admin | Simple to deploy and reason about. Admin is isolated by authentication, CSRF and permissions rather than by host. Splitting admin onto its own host later only needs a router change. |

## Layers

```
src/config/    env.ts (validated configuration), services.ts (service catalogue content)
src/domain/    pure functions, no I/O — fully unit-tested
src/services/  database operations; each enforces permissions and writes audit entries
src/http/      Express wiring, security middleware, routers (thin: parse → service → render)
src/views/     HTML templates using an auto-escaping tagged template (src/lib/html.ts)
```

Rules the layers follow:

- **Permissions are enforced in services**, not only in routes. Every mutating
  service function calls `requirePermission(actor, …)` first, so a new route
  cannot accidentally bypass authorisation. Routes check permissions too, to
  hide UI and return 403 early. The one exception is `createUser`, which is
  also used by the `user:create` CLI (trusted shell access); its admin route
  checks `users.manage` and the role-assignment rules before calling it.
  Read-only queries are permission-checked in the routes.
- **Every state change is a transaction** that also writes an `audit_events`
  row. Shipment mutations take a row lock (`select … for update`) on the shipment.
- **Derived state is recomputed, never patched.** `recomputeShipmentState`
  rebuilds `current_milestone`, `progress_percent`, `last_event_at` and
  `delivered_at` from the full event history after every event change.
- **Inputs are validated with zod** (`src/validation/schemas.ts`) at the HTTP
  boundary; services re-check business rules.
- **Views never concatenate untrusted strings.** The `html` template escapes all
  interpolations; `raw()` is only used for trusted, static markup (icons).

## Domain modules

| Module | Responsibility |
| --- | --- |
| `units.ts` | kg/lb and cm/in conversion |
| `pricing.ts` | Dimensional weight, billable weight, rounding, surcharges, totals (integer minor units) |
| `rateCard.ts` | Rate card schema (zod) and the clearly labelled demonstration rate card |
| `progress.ts` | Milestone-based progress engine (see [Logistics workflows](LOGISTICS_WORKFLOWS.md)) |
| `events.ts` | Informational/system event types, exception categories, event sources |
| `permissions.ts` | Roles, permissions and the deny-by-default role matrix |
| `codes.ts` | Tracking code generation, normalisation, check character, HMAC hashing, references |
| `countries.ts` | ISO country list and names |

## Data model

Defined in `db/migrations/`. Migrations are applied in filename order and
recorded in a `schema_migrations` table.

**Operational (001_core.sql)** — `users`, `sessions`, `organizations`,
`organization_memberships`, `milestone_definitions` (configurable weights),
`shipments`, `shipment_parties`, `shipment_packages`, `shipment_events`,
`shipment_exceptions`, `tracking_credentials`, `quote_requests`,
`contact_messages`, `audit_events`.

Integrity rules enforced by the database, not just the application:

- A `delivered` milestone event must carry an `evidence_reference`.
- `delivered_at` can only be set when `progress_percent = 100`.
- `(shipment_id, dedupe_key)` is unique, so a repeated event is ignored.
- Voiding an event requires a reason; revoking a code requires a reason.
- `audit_events` rejects `UPDATE` and `DELETE` through a trigger.
- Tracking credentials store only an HMAC of the code (`code_hash`) plus a
  short hint, never the code itself.

**Commercial and integrations (002_commercial_integrations.sql)** —
`documents` (written by the PDF service) plus schema-only tables for
`carrier_connections`, `carrier_tracking_identifiers`, `pricing_rules`,
`quotes`, `quote_line_items`, `invoices`, `payments`, `webhook_events`,
`notifications`, `notification_attempts` and `system_settings`. These are not
yet written by application code; they document the intended shape.

## Request pipeline

`src/http/app.ts`, in order:

1. `x-powered-by` disabled, `trust proxy` set from `TRUST_PROXY`, simple query parser.
2. Request logging with tracking codes and other sensitive query values redacted.
3. Security headers (CSP, frame, referrer, permissions, COOP/CORP, HSTS over HTTPS).
4. Static files from `public/` only (dotfiles denied).
5. Same-origin check on every non-GET request.
6. URL-encoded body parsing (32 KB, 200 fields maximum). No JSON or multipart parsing is enabled.
7. `/healthz`, the admin router, the public router, a branded 404 and an error handler
   that never leaks stack traces.

Admin router (`src/http/admin.ts`): `no-store` + `noindex` → load session →
sign-in routes → require session → CSRF token check on POST → forced password
change gate → feature routes. Successful POSTs redirect (POST/redirect/GET)
with a one-time flash message stored on the session.

## Pricing

`PRICING_MODE` selects one of:

- `demo` — `DEMO_RATE_CARD`, labelled "demonstration" on every surface.
- `rate_card` — an owner-supplied JSON file validated against `RateCardSchema`
  at startup; the server refuses to start if it is invalid.
- `disabled` — the calculator shows billable weight only.

Prices are always calculated on the server. The quote form re-runs the estimate
from the submitted shipment details and ignores any client-supplied amount.
Money is handled as integer minor units throughout.

## Documents (PDF)

`src/services/documents.ts` builds PDFs with pdfkit from data loaded on the
server for an authorised staff member. Each generation is recorded in
`documents` with its SHA-256 and size, and audited. Documents are streamed with
`no-store` and are not written to disk. Every PDF states that it is not a
carrier label, customs document, invoice or proof of delivery.

## Integration architecture (designed, not implemented)

**Carrier adapters.** A carrier integration will implement a small interface
(`createShipment`, `getTracking`, `verifyWebhook`, `normaliseEvent`) and write
events through the same `insertEvent` → `recomputeShipmentState` path with
`source = 'carrier_api' | 'carrier_webhook'`. Credentials stay in environment or
secret storage; `carrier_connections` holds only status. Webhooks are stored in
`webhook_events` with a unique `(provider, provider_event_id)` for idempotency,
and only `signature_verified` events are processed. Until a carrier is
connected the settings page shows it as "Not configured".

**Payments.** A hosted payment page (for example Stripe Checkout) so card data
never touches this server. An invoice may move to `paid` only from a verified
webhook recorded in `payments`, never from a client request.

**Notifications.** Event changes enqueue `notifications` rows with an
idempotency key; a worker delivers them through the configured provider and
records `notification_attempts`.

## Deployment notes

- Run behind a TLS-terminating reverse proxy; set `TRUST_PROXY` to the number of
  proxy hops and `SITE_URL` to the public `https://` URL.
- Use a managed PostgreSQL with TLS (`DATABASE_SSL=require`) and a least-privilege
  database role. Run `npm run migrate` before starting a new version.
- The rate limiter is in-memory: run a single instance, or replace it with a
  shared store before scaling horizontally (see [Security](SECURITY.md)).
- `GET /healthz` returns 200 when the process is up.
