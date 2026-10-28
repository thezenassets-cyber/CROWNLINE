import { html, raw, type SafeHtml } from '../lib/html.ts';
import type { AppConfig } from '../config/env.ts';
import { SERVICES } from '../config/services.ts';
import { LANGS, LANG_LABEL, textDir, translate, type Lang, type Theme } from '../i18n/index.ts';
import { crownlineMark, icons } from './icons.ts';

export const ASSET_VERSION = '0.19.0';

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  preloadImage?: string;
  bodyClass?: string;
  lang?: Lang;
  theme?: Theme;
  nonce?: string;
}

const NAV = [
  { href: '/services', key: 'nav.services' },
  { href: '/#overview', key: 'nav.overview' },
  { href: '/how-it-works', key: 'nav.how' },
  { href: '/calculator', key: 'nav.calculator' },
  { href: '/#tracking', key: 'nav.tracking' },
  { href: '/#contact', key: 'nav.contact' },
];

function navLinks(path: string, lang: Lang): SafeHtml {
  return html`${NAV.map((n) => {
    const current = path === n.href || (n.href !== '/services' && path.startsWith(`${n.href}/`));
    return html`<li><a href="${n.href}" ${current ? html`aria-current="page"` : ''}>${translate(lang, n.key, n.key)}</a></li>`;
  })}`;
}

function preferences(path: string, lang: Lang, theme: Theme): SafeHtml {
  const next = encodeURIComponent(path || '/');
  return html`<div class="pref-bar">
    <div class="theme-switch" role="group" aria-label="${translate(lang, 'pref.appearance', 'Appearance')}">
      <button type="button" data-theme-set="light" aria-pressed="${theme === 'light' ? 'true' : 'false'}">${translate(lang, 'pref.light', 'Light')}</button>
      <button type="button" data-theme-set="dark" aria-pressed="${theme === 'dark' ? 'true' : 'false'}">${translate(lang, 'pref.dark', 'Dark')}</button>
    </div>
    <nav class="lang-switch" aria-label="${translate(lang, 'pref.language', 'Language')}">
      ${LANGS.map((code) => html`<a href="/preferences?lang=${code}&next=${next}" title="${LANG_LABEL[code]}" ${code === lang ? html`aria-current="true"` : ''}>${code.toUpperCase()}</a>`)}
    </nav>
  </div>`;
}

export function brand(lang: Lang = 'en'): SafeHtml {
  return html`<a class="brand" href="/" aria-label="${translate(lang, 'nav.home', 'Crownline Express home')}">
    ${crownlineMark()}
    <span class="brand-text"><span class="brand-name">Crownline</span><span class="brand-sub">Express</span></span>
  </a>`;
}

function footer(config: AppConfig, lang: Lang): SafeHtml {
  const c = config.company;
  const hasContact = c.email || c.phone || c.address;
  const year = new Date().getUTCFullYear();
  return html`<footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        ${brand(lang)}
        <p class="footer-domain">crownlineexpress.com</p>
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
      <p>crownlineexpress.com</p>
    </div>
  </footer>`;
}

const PUBLIC_IDENTITY = 'Crownline Express coordinates parcel and freight shipping. Customers receive a written quote before booking and a private tracking code after it.';

function structuredData(config: AppConfig, meta: PageMeta, canonical: string, title: string): string {
  const orgId = `${config.siteUrl}/#organization`;
  const siteId = `${config.siteUrl}/#website`;
  const organization: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': orgId,
    name: 'Crownline Express',
    legalName: config.company.legalName ?? 'Crownline Express',
    url: config.siteUrl,
    logo: { '@type': 'ImageObject', url: `${config.siteUrl}/favicon.svg` },
    description: PUBLIC_IDENTITY,
    brand: { '@type': 'Brand', name: 'Crownline Express' },
    knowsAbout: ['parcel shipping', 'freight coordination', 'shipment tracking'],
  };
  if (config.company.email) organization.email = config.company.email;
  if (config.company.phone) organization.telephone = config.company.phone;
  if (config.company.address) organization.address = config.company.address;
  const graph: Record<string, unknown>[] = [
    organization,
    {
      '@type': 'WebSite',
      '@id': siteId,
      name: 'Crownline Express',
      url: config.siteUrl,
      inLanguage: ['en', 'fr', 'es', 'ar', 'zh'],
      publisher: { '@id': orgId },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${config.siteUrl}/track?code={code}`,
        'query-input': 'required name=code',
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description: meta.description,
      isPartOf: { '@id': siteId },
      about: { '@id': orgId },
      inLanguage: meta.lang ?? 'en',
    },
    {
      '@type': 'ItemList',
      name: 'Crownline Express shipping services',
      itemListElement: SERVICES.filter((service) => service.availability === 'quote_on_request').map((service, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Service',
          name: service.name,
          description: service.shortDescription,
          url: `${config.siteUrl}/services/${service.slug}`,
          provider: { '@id': orgId },
        },
      })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function publicLayout(config: AppConfig, meta: PageMeta, body: SafeHtml): string {
  const canonical = `${config.siteUrl}${meta.path === '/' ? '/' : meta.path}`;
  const title = meta.path === '/' ? meta.title : `${meta.title} | Crownline Express`;
  const preview = `${config.siteUrl}/images/ops/hero-poster.jpg`;
  const ld = structuredData(config, meta, canonical, title);
  const lang = meta.lang ?? 'en';
  const theme = meta.theme ?? 'light';
  const quote = translate(lang, 'nav.quote', 'Request a quote');
  const menu = translate(lang, 'nav.menu', 'Menu');
  return `<!doctype html>${html`<html lang="${lang}" dir="${textDir(lang)}" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${meta.description}">
  <link rel="canonical" href="${canonical}">
  ${meta.noindex
    ? html`<meta name="robots" content="noindex, nofollow">`
    : html`<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Crownline Express">
  <meta property="og:image" content="${preview}">
  <meta property="og:image:alt" content="A commercial port, used as the Crownline Express preview image">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${meta.description}">
  <meta name="twitter:image" content="${preview}">
  <meta name="twitter:image:alt" content="A commercial port, used as the Crownline Express preview image">
  <meta name="application-name" content="Crownline Express">
  <meta name="apple-mobile-web-app-title" content="Crownline Express">
  <meta name="theme-color" content="${theme === 'dark' ? '#101820' : '#fbfaf6'}">
  <link rel="icon" href="/favicon.svg?v=${ASSET_VERSION}" type="image/svg+xml">
  <link rel="manifest" href="/manifest.json">
  <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  ${meta.preloadImage ? html`<link rel="preload" as="image" href="${meta.preloadImage}" fetchpriority="high">` : ''}
  <link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}">
  ${meta.bodyClass?.includes('page-home') || meta.bodyClass?.includes('page-services') ? html`<link rel="stylesheet" href="/css/home.css?v=${ASSET_VERSION}">` : ''}
  <script type="application/ld+json">${raw(ld)}</script>
  ${meta.nonce ? html`<script nonce="${meta.nonce}">try{var n=performance.getEntriesByType('navigation')[0];if(n&&n.type==='reload')document.documentElement.classList.add('boot-on');}catch(e){}</script>` : ''}
  <script src="/js/site.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="${meta.bodyClass ?? ''}">
  <div class="boot" aria-hidden="true">${crownlineMark(72)}</div>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site-header">
    <div class="container header-inner">
      ${brand(lang)}
      <nav class="nav-desktop" aria-label="Main"><ul>${navLinks(meta.path, lang)}</ul></nav>
      ${preferences(meta.path, lang, theme)}
      <a class="btn btn-gold btn-sm header-cta" href="/quote">${quote}</a>
      <details class="nav-mobile">
        <summary aria-label="${menu}"><span class="burger" aria-hidden="true"></span><span class="nav-mobile-label">${menu}</span></summary>
        <nav aria-label="Main (mobile)">
          ${preferences(meta.path, lang, theme)}
          <ul>${navLinks(meta.path, lang)}<li><a href="/quote">${quote}</a></li></ul>
        </nav>
      </details>
    </div>
  </header>
  <main id="main" tabindex="-1">
    ${body}
  </main>
  ${footer(config, lang)}
</body>
</html>`}`;
}
