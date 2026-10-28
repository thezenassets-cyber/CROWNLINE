import { html, type SafeHtml } from '../../lib/html.ts';
import type { AppConfig } from '../../config/env.ts';
import { can, ROLE_LABELS, type Permission } from '../../domain/permissions.ts';
import type { Flash, Session } from '../../services/auth.ts';
import { crownlineMark, icons } from '../icons.ts';
import { ASSET_VERSION } from '../layout.ts';

export function csrf(session: Session): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${session.csrfToken}">`;
}

const NAV: { href: string; label: string; permission: Permission | null; icon: () => SafeHtml }[] = [
  { href: '/admin', label: 'Overview', permission: null, icon: icons.route },
  { href: '/admin/shipments', label: 'Shipments', permission: 'shipments.read', icon: icons.parcel },
  { href: '/admin/quotes', label: 'Quote requests', permission: 'quotes.read', icon: icons.calculator },
  { href: '/admin/messages', label: 'Messages', permission: 'contact.read', icon: icons.mail },
  { href: '/admin/team', label: 'Team', permission: 'users.manage', icon: icons.handshake },
  { href: '/admin/audit', label: 'Audit log', permission: 'audit.read', icon: icons.shield },
  { href: '/admin/settings', label: 'Settings', permission: 'settings.read', icon: icons.building },
];

function head(title: string): SafeHtml {
  return html`<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} | Crownline Admin</title>
  <link rel="icon" href="/favicon.svg?v=${ASSET_VERSION}" type="image/svg+xml">
  <link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}">
  <script src="/js/site.js?v=${ASSET_VERSION}" defer></script>
</head>`;
}

function flashView(flash: Flash | null): SafeHtml {
  if (!flash) return html``;
  return html`<div class="alert alert-${flash.kind}" role="${flash.kind === 'error' ? 'alert' : 'status'}">
    <div class="alert-icon">${flash.kind === 'success' ? icons.check() : icons.alert()}</div>
    <div><p class="alert-title">${flash.message}</p></div>
  </div>`;
}

export function adminLayout(
  config: AppConfig,
  opts: { title: string; session: Session; path: string; flash?: Flash | null },
  body: SafeHtml,
): string {
  const { session } = opts;
  const role = session.user.role;
  const items = NAV.filter((n) => n.permission === null || can(role, n.permission));
  const current = (href: string) => (href === '/admin' ? opts.path === '/admin' : opts.path === href || opts.path.startsWith(`${href}/`));
  return `<!doctype html>${html`<html lang="en">
${head(opts.title)}
<body class="admin">
  <a class="skip-link" href="#main">Skip to main content</a>
  <div class="admin-shell">
    <aside class="admin-side">
      <a class="brand brand-inverse" href="/admin">${crownlineMark(30)}<span class="brand-text"><span class="brand-name">Crownline</span><span class="brand-sub">Control</span></span></a>
      <nav aria-label="Admin">
        <ul>${items.map((n) => html`<li><a href="${n.href}" ${current(n.href) ? html`aria-current="page"` : ''}>${n.icon()} ${n.label}</a></li>`)}</ul>
      </nav>
      <p class="admin-env">${config.env}${config.pricingMode === 'demo' ? ' · demo pricing' : ''}</p>
    </aside>
    <div class="admin-main">
      <header class="admin-top">
        <div class="admin-user">
          <strong>${session.user.displayName}</strong>
          <span class="muted small">${ROLE_LABELS[role]}</span>
        </div>
        <a class="btn btn-ghost btn-sm" href="/admin/account">Account</a>
        <form method="post" action="/admin/logout">${csrf(session)}<button class="btn btn-ghost btn-sm" type="submit">Sign out</button></form>
      </header>
      <main id="main" tabindex="-1" class="admin-content">
        ${flashView(opts.flash ?? null)}
        ${body}
      </main>
    </div>
  </div>
</body>
</html>`}`;
}

export function adminBareLayout(title: string, body: SafeHtml): string {
  return `<!doctype html>${html`<html lang="en">
${head(title)}
<body class="admin admin-bare">
  <main id="main" class="admin-bare-main">
    <a class="brand" href="/admin/login">${crownlineMark(34)}<span class="brand-text"><span class="brand-name">Crownline</span><span class="brand-sub">Control</span></span></a>
    ${body}
  </main>
</body>
</html>`}`;
}
