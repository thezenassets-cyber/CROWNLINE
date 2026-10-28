# Deploying Crownline Express

The application is a Node.js server. A domain on Spaceship points visitors at it;
the domain by itself does not run the application.

## 1. GitHub

The source remote is `https://github.com/thezenassets-cyber/CROWNLINE.git`.
Push from a GitHub account that can write to that repository:

```bash
git push -u origin main
```

## 2. Host

Run Node 22 or newer with PostgreSQL. Set the variables in `.env.example`, including:

- `NODE_ENV=production`
- `SITE_URL=https://crownlineexpress.org`
- `DATABASE_URL` for the production database
- `TRACKING_CODE_SECRET` (32+ random characters)
- `PRICING_MODE=rate_card` and `RATE_CARD_PATH` when an owner-approved card exists. Until then the calculator keeps labelling sample figures. Do not present those figures as a quote.

Start with `npm run migrate` and then `npm start`. Put a TLS-terminating proxy in front and set `TRUST_PROXY` to the number of proxy hops.

## 3. Spaceship DNS

After the host gives you an address, add records for `crownlineexpress.org`:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | the host’s IPv4 address |
| A or CNAME | `www` | the host’s address, or `crownlineexpress.org` |

Use the host’s CNAME target instead of an A record when the host asks for one (common on Render, Fly and Railway). Wait for DNS to propagate, then confirm `https://crownlineexpress.org/healthz` returns 200.

Do not point the domain at GitHub Pages. This application is not a static site.
