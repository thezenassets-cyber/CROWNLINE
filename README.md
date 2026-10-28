# Crownline Express

*One Partner. A World of Possibilities.*

A shipping coordination platform: a public website with a shipping calculator,
privacy-safe shipment tracking and business quote requests, and a role-based
operations console for staff who manage shipments, tracking events, exceptions,
tracking codes and documents.

This is a working first milestone, not a finished commercial product. See
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for exactly what
is implemented and tested, and what is not.

## What it is (and is not)

- **Tracking reflects staff-confirmed events.** No carrier integration is
  connected yet, so nothing is presented as live carrier tracking, and no map or
  vehicle position is shown.
- **Prices are demonstration figures unless an owner-approved rate card is
  configured.** Demo estimates are labelled as such on every page and PDF.
- **No payments, emails or SMS are sent.** The data model and architecture are
  prepared for them; the settings page reports them as "Not configured".
- **Legal pages are drafts** and must be reviewed by a qualified professional
  before the site is used commercially.

## Requirements

- Node.js 22.18 or newer (Node runs the TypeScript sources directly; there is no
  build step). Developed and tested on Node 24.
- PostgreSQL 15+ for production. Development and tests use an embedded
  [PGlite](https://pglite.dev) database with the same SQL migrations.

## Getting started

```bash
npm install
cp .env.example .env          # optional in development; defaults are safe for local use
npm run migrate               # applies db/migrations/*.sql
npm run user:create -- --email you@example.com --name "Your Name" --role owner
npm run dev                   # http://localhost:3000, admin at /admin
```

`user:create` prints a one-time temporary password. You must choose a new
password at first sign-in.

Optional fictional demo data (refuses to run in production):

```bash
npm run seed:demo             # prints three demo tracking codes
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` / `npm run dev` | Run the server (`dev` restarts on file changes) |
| `npm run migrate` | Apply pending database migrations |
| `npm run user:create` | Create a staff account (`--email`, `--name`, `--role`) |
| `npm run seed:demo` | Insert three fictional shipments (non-production only) |
| `npm run assets:optimize` | Regenerate WebP images and copy self-hosted fonts |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit, integration and HTTP tests (`node --test`) |
| `npm run check` | Typecheck and test |

## Configuration

All configuration comes from environment variables, validated at startup by
`src/config/env.ts`. See [`.env.example`](.env.example). In production the
server refuses to start without `TRACKING_CODE_SECRET`, `DATABASE_URL` (unless
`ALLOW_EMBEDDED_DB=true`) and an `https://` `SITE_URL`. Pricing defaults to
`disabled` in production.

## Project layout

```
db/migrations/      SQL migrations (shared by PostgreSQL and PGlite)
public/             Static assets: CSS, progressive-enhancement JS, fonts, images
src/config/         Environment validation and the service catalogue
src/domain/         Pure logic: units, pricing, progress, permissions, tracking codes
src/services/       Database-backed operations (auth, shipments, tracking, quotes, documents, audit)
src/http/           Express app, security middleware, public and admin routers
src/views/          Server-rendered HTML (auto-escaping templates)
src/scripts/        CLI scripts (migrate, create user, seed, optimise images)
tests/              unit/, integration/ and http/ test suites
docs/               Architecture, security, workflows, status and asset notes
legacy/             The previous LIVEXPRESS site, preserved for reference only
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Logistics workflows](docs/LOGISTICS_WORKFLOWS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Image assets](docs/ASSETS.md)

## The `legacy/` folder

The previous LIVEXPRESS static site and Express server were moved to `legacy/`
unchanged. They are **not served** by the new application and should not be
deployed: the old server exposed its own source and JSON data files over HTTP,
used a shared admin password with a non-expiring token, and stored shipments in
JSON files. Its data has not been migrated. See
[`docs/SECURITY.md`](docs/SECURITY.md#legacy-application).
