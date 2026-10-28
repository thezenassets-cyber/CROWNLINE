import { html, raw, type SafeHtml } from '../lib/html.ts';
import type { AppConfig } from '../config/env.ts';
import { SERVICES } from '../config/services.ts';
import { crownlineMark, icons } from './icons.ts';

export const ASSET_VERSION = '0.4.0';

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  preloadImage?: string;
  bodyClass?: string;
}

const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/track', label: 'Track' },
  { href: '/services/business-shipping', label: 'Business' },
  { href: '/contact', label: 'Contact' },
];

function navLinks(path: string): SafeHtml {
  return html`${NAV.map((n) => {
    const current = path === n.href || (n.href !== '/services' && path.startsWith(`${n.href}/`));
    return html`<li><a href="${n.href}" ${current ? html`aria-current="page"` : ''}>${n.label}</a></li>`;
  })}`;
}

export function brand(): SafeHtml {
  return html`<a class="brand" href="/" aria-label="Crownline Express home">
    ${crownlineMark()}
    <span class="brand-text"><span class="brand-name">Crownline</span><span class="brand-sub">Express</span></span>
  </a>`;
}

function footer(config: AppConfig): SafeHtml {
  const c = config.company;
  const hasContact = c.email || c.phone || c.address;
  const year = new Date().getUTCFullYear();
  return html`<footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        ${brand()}
        <p class="footer-domain">crownlineexpress.org</p>
        <p class="footer-tagline">One Partner. A World of Possibilities.</p>
        <p class="small">Crownline Express coordinates shipping through suitable carriers and transport partners. Each request is reviewed by our team before booking.</p>
      </div>
      <nav aria-label="Services">
        <h2 class="footer-heading">Services</h2>
        <ul>${SERVICES.map((s) => html`<li><a href="/services/${s.slug}">${s.name}</a>${s.availability === 'planned' ? html` <span class="footer-note">(not offered)</span>` : ''}</li>`)}</ul>
      </nav>
      <nav aria-label="Customers">
        <h2 class="footer-heading">Customers</h2>
        <ul>
          <li><a href="/track">Track a shipment</a></li>
          <li><a href="/calculator">Shipping calculator</a></li>
          <li><a href="/quote">Request a quote</a></li>
          <li><a href="/claims">Claims &amp; shipment issues</a></li>
          <li><a href="/faq">Frequently asked questions</a></li>
        </ul>
      </nav>
      <nav aria-label="Company">
        <h2 class="footer-heading">Company</h2>
        <ul>
          <li><a href="/about">About Crownline</a></li>
          <li><a href="/how-it-works">How it works</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/legal/terms">Shipping terms</a></li>
          <li><a href="/legal/privacy">Privacy policy</a></li>
          <li><a href="/legal/cookies">Cookie policy</a></li>
        </ul>
      </nav>
      <div>
        <h2 class="footer-heading">Contact</h2>
        ${hasContact
          ? html`<ul class="footer-contact">
              ${c.email ? html`<li>${icons.mail()} <a href="mailto:${c.email}">${c.email}</a></li>` : ''}
              ${c.phone ? html`<li>${icons.info()} <a href="tel:${c.phone.replace(/[^+\d]/g, '')}">${c.phone}</a></li>` : ''}
              ${c.address ? html`<li>${icons.pin()} <span>${c.address}</span></li>` : ''}
            </ul>`
          : html`<p class="small">Send us a message through the <a href="/contact">contact form</a> and a coordinator will reply by email.</p>`}
      </div>
    </div>
    <div class="container footer-base">
      <p>© ${year} ${c.legalName ?? 'Crownline Express'}. All rights reserved.</p>
      <p>crownlineexpress.org</p>
    </div>
  </footer>`;
}

export function publicLayout(config: AppConfig, meta: PageMeta, body: SafeHtml): string {
  const canonical = `${config.siteUrl}${meta.path === '/' ? '/' : meta.path}`;
  const title = meta.path === '/' ? meta.title : `${meta.title} | Crownline Express`;
  const brandName = config.company.legalName ?? 'Crownline Express';
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: brandName, url: config.siteUrl, logo: `${config.siteUrl}/favicon.svg` },
      {
        '@type': 'WebSite',
        name: brandName,
        url: config.siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${config.siteUrl}/track?code={code}`,
          'query-input': 'required name=code',
        },
      },
    ],
  }).replace(/</g, '\\u003c');
  return `<!doctype html>${html`<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${meta.description}">
  <link rel="canonical" href="${canonical}">
  ${meta.noindex ? html`<meta name="robots" content="noindex, nofollow">` : ''}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Crownline Express">
  <meta property="og:image" content="${config.siteUrl}/images/hero-container-port-blue-hour.jpg">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${meta.description}">
  <meta name="twitter:image" content="${config.siteUrl}/images/hero-container-port-blue-hour.jpg">
  <meta name="application-name" content="Crownline Express">
  <meta name="theme-color" content="#0b1629">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  ${meta.preloadImage ? html`<link rel="preload" as="image" href="${meta.preloadImage}" fetchpriority="high">` : ''}
  <link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}">
  <script type="application/ld+json">${raw(ld)}</script>
  <script src="/js/site.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="${meta.bodyClass ?? ''}">
  <a class="skip-link" href="#main">Skip to main content</a>
  ${config.pricingMode === 'demo' ? html`<div class="demo-ribbon" role="note">A coordinator confirms every price in writing before booking. The calculator labels sample figures. Tracking shows confirmed milestones only.</div>` : ''}
  <header class="site-header">
    <div class="container header-inner">
      ${brand()}
      <nav class="nav-desktop" aria-label="Main"><ul>${navLinks(meta.path)}</ul></nav>
      <a class="btn btn-gold btn-sm header-cta" href="/quote">Request a quote</a>
      <details class="nav-mobile">
        <summary aria-label="Menu"><span class="burger" aria-hidden="true"></span><span class="nav-mobile-label">Menu</span></summary>
        <nav aria-label="Main (mobile)">
          <ul>${navLinks(meta.path)}<li><a href="/quote">Request a quote</a></li></ul>
        </nav>
      </details>
    </div>
  </header>
  <main id="main" tabindex="-1">
    ${body}
  </main>
  ${footer(config)}
</body>
</html>`}`;
}
