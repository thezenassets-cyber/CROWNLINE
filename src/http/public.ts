import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { SERVICES, findServiceByCode, findServiceBySlug } from '../config/services.ts';
import { estimate, type EstimateOutcome } from '../domain/pricing.ts';
import type { SafeHtml } from '../lib/html.ts';
import { createContactMessage, createQuoteRequest } from '../services/quotes.ts';
import { lookupTracking } from '../services/tracking.ts';
import { trackingFeed } from '../views/public/track.ts';
import { ContactSchema, EstimateFormSchema, QuoteRequestSchema, fieldErrors, type EstimateForm, type FieldErrors } from '../validation/schemas.ts';
import type { Values } from '../views/components.ts';
import { publicLayout, type PageMeta } from '../views/layout.ts';
import { CALCULATOR_FIELDS } from '../views/public/calculator.ts';
import { homePage } from '../views/public/home.ts';
import {
  aboutPage, calculatorPage, claimsPage, contactPage, cookiesPage, errorPage, faqPage, howItWorksPage, privacyPage,
  quotePage, quoteSubmittedPage, serviceDetailPage, servicesIndexPage, termsPage, trackPage,
} from '../views/public/pages.ts';
import { readPrefs, safeNext, isLang, type Lang, type Theme } from '../i18n/index.ts';
import type { AppContext } from './context.ts';
import { clientIp } from './security.ts';

const STATIC_PAGES: { path: string; meta: Omit<PageMeta, 'path'>; view: () => SafeHtml }[] = [
  { path: '/services', meta: { title: 'Shipping services', description: 'Domestic and international parcels, air, ocean and road freight, and business shipping coordinated by Crownline Express.', bodyClass: 'page-services' }, view: servicesIndexPage },
  { path: '/how-it-works', meta: { title: 'How it works', description: 'Each step of shipping with Crownline, from quote to confirmed delivery, explained in plain language.' }, view: howItWorksPage },
  { path: '/about', meta: { title: 'About', description: 'Crownline Express coordinates shipping across available carriers with one point of contact and one clear view.' }, view: aboutPage },
  { path: '/faq', meta: { title: 'Frequently asked questions', description: 'Answers about estimates, dimensional weight, tracking codes, customs and claims.' }, view: faqPage },
  { path: '/legal/terms', meta: { title: 'Shipping terms', description: 'Crownline Express shipping terms (draft).' }, view: termsPage },
  { path: '/legal/privacy', meta: { title: 'Privacy policy', description: 'How Crownline Express handles personal information.' }, view: privacyPage },
  { path: '/legal/cookies', meta: { title: 'Cookie policy', description: 'The cookies used by the Crownline Express website.' }, view: cookiesPage },
  { path: '/claims', meta: { title: 'Claims and shipment issues', description: 'How to report damage, loss or delay to Crownline Express.' }, view: claimsPage },
];

function queryValues(req: Request, fields: readonly string[]): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = req.query[f];
    if (typeof v === 'string' && v.length <= 200) out[f] = v;
  }
  return out;
}

function bodyValues(req: Request): Values {
  const out: Values = {};
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(body)) if (typeof v === 'string') out[k] = v;
  return out;
}

export function newFormKey(): string {
  return randomBytes(18).toString('base64url');
}

export function runEstimate(ctx: AppContext, form: EstimateForm): EstimateOutcome {
  const service = findServiceByCode(form.service);
  if (!service || service.availability !== 'quote_on_request' || !service.pricingServiceCode) {
    return { ok: false, errors: [{ field: 'service', message: 'Online estimates are not available for this service. Please request a quote.' }] };
  }
  return estimate(
    {
      pricingServiceCode: service.pricingServiceCode,
      shipmentType: form.shipmentType,
      originCountry: form.originCountry,
      destinationCountry: form.destinationCountry,
      weightUnit: form.weightUnit,
      lengthUnit: form.lengthUnit,
      packages: [{ quantity: form.quantity, weight: form.weight, length: form.length, width: form.width, height: form.height }],
      declaredValueMinor: null,
      insurance: false,
    },
    ctx.rateCard,
    ctx.config.pricingMode,
  );
}

const TRACK_MESSAGES = {
  invalid_format: 'That does not look like a Crownline tracking code. Codes start with CL and look like CL-7KQ2-M9XD-4TR8.',
  checksum_mismatch: 'That code looks mistyped. Please check each character and try again.',
  not_found: 'We could not find an active shipment for that code. Check the code, or contact us if you think this is a mistake.',
  limited: 'Too many tracking attempts from your connection. Please wait a few minutes and try again.',
} as const;

export function publicRouter(ctx: AppContext): Router {
  const r = Router();
  const { config, db, logger, limiters } = ctx;

  const send = (res: Response, meta: PageMeta, body: SafeHtml, status = 200) => {
    const prefs = readPrefs(res.req);
    const nonce = typeof res.locals.cspNonce === 'string' ? res.locals.cspNonce : undefined;
    res.status(status).type('html').send(publicLayout(config, { ...meta, lang: prefs.lang, theme: prefs.theme, nonce }, body));
  };

  const setPrefCookie = (res: Response, name: string, value: string) => {
    res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  };

  r.get('/preferences', (req, res) => {
    let fallback = '/';
    const ref = req.get('referer');
    if (ref) {
      try { fallback = safeNext(new URL(ref).pathname); } catch { fallback = '/'; }
    }
    const next = safeNext(req.query.next, fallback);
    if (isLang(typeof req.query.lang === 'string' ? req.query.lang : undefined)) setPrefCookie(res, 'lang', req.query.lang as Lang);
    if (req.query.theme === 'light' || req.query.theme === 'dark') setPrefCookie(res, 'theme', req.query.theme as Theme);
    res.redirect(303, next);
  });
  const tooMany = (res: Response, path: string, retryAfter: number) => {
    res.setHeader('Retry-After', String(retryAfter));
    send(res, { title: 'Please slow down', description: '', path, noindex: true }, errorPage(429, 'Please slow down', 'We received a lot of requests from your connection. Please wait a few minutes and try again.'), 429);
  };

  r.get('/', (req, res) => {
    send(res, {
      title: 'Crownline Express | Your Shipments. One Clear View.',
      description: 'One coordinator, a written quote before booking, and a private tracking code after it.',
      path: '/',
      preloadImage: '/images/hero-container-port-blue-hour.webp',
      bodyClass: 'page-home',
    }, homePage(config, queryValues(req, CALCULATOR_FIELDS), readPrefs(req).lang));
  });

  r.get('/calculator', (req, res) => {
    const values = queryValues(req, CALCULATOR_FIELDS);
    const meta: PageMeta = { title: 'Shipping calculator', description: 'Work out the billable weight of your shipment and see an indicative estimate.', path: '/calculator' };
    const lang = readPrefs(req).lang;
    if (values.weight === undefined) return send(res, meta, calculatorPage(config, values, undefined, null, lang));
    const limit = limiters.estimate.hit(clientIp(req));
    if (!limit.allowed) return tooMany(res, '/calculator', limit.retryAfterSeconds);
    meta.noindex = true;
    const parsed = EstimateFormSchema.safeParse(values);
    if (!parsed.success) return send(res, meta, calculatorPage(config, values, fieldErrors(parsed.error), null, lang), 400);
    const outcome = runEstimate(ctx, parsed.data);
    if (!outcome.ok) {
      const errors: FieldErrors = {};
      for (const e of outcome.errors) errors[e.field] ??= e.message;
      return send(res, meta, calculatorPage(config, values, errors, null, lang), 422);
    }
    send(res, meta, calculatorPage(config, values, undefined, outcome.result, lang));
  });

  r.get('/track/feed', async (req, res, next) => {
    try {
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const raw = typeof req.query.code === 'string' ? req.query.code.slice(0, 64) : '';
      const ip = clientIp(req);
      if (!raw.trim() || limiters.trackFailures.isBlocked(ip) || !limiters.trackLookup.hit(ip).allowed) {
        return res.status(429).json({ error: 'limited' });
      }
      const result = await lookupTracking(db, raw, config.trackingCodeSecret);
      if (result.status !== 'found') return res.status(404).json({ error: 'not_found' });
      res.json(trackingFeed(result.view, readPrefs(req).lang));
    } catch (err) {
      next(err);
    }
  });

  r.get('/track', async (req, res, next) => {
    try {
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      const lang = readPrefs(req).lang;
      const meta: PageMeta = { title: 'Track a shipment', description: 'Follow your Crownline shipment with your private tracking code.', path: '/track' };
      const raw = typeof req.query.code === 'string' ? req.query.code.slice(0, 64) : '';
      if (!raw.trim()) return send(res, meta, trackPage('', {}, lang));
      meta.noindex = true;
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const ip = clientIp(req);
      if (limiters.trackFailures.isBlocked(ip) || !limiters.trackLookup.hit(ip).allowed) {
        logger.warn('tracking.rate_limited', { ip });
        return send(res, meta, trackPage(raw, { error: TRACK_MESSAGES.limited }, lang), 429);
      }
      const result = await lookupTracking(db, raw, config.trackingCodeSecret);
      if (result.status === 'found') return send(res, meta, trackPage(raw, { view: result.view }, lang));
      if (result.status !== 'invalid_format') {
        const f = limiters.trackFailures.hit(ip);
        if (!f.allowed) logger.warn('tracking.failure_threshold', { ip });
      }
      send(res, meta, trackPage(raw, { error: TRACK_MESSAGES[result.status] }, readPrefs(req).lang), 404);
    } catch (err) {
      next(err);
    }
  });

  r.get('/services/:slug', (req, res, next) => {
    const s = findServiceBySlug(req.params.slug);
    if (!s) return next();
    send(res, { title: s.name, description: s.shortDescription, path: `/services/${s.slug}`, preloadImage: s.image.src.replace(/\.jpg$/, '.webp') }, serviceDetailPage(s, readPrefs(req).lang));
  });

  for (const p of STATIC_PAGES) r.get(p.path, (_req, res) => send(res, { ...p.meta, path: p.path }, p.view()));

  r.get('/quote', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    send(res, { title: 'Request a quote', description: 'Send your shipment details and a Crownline coordinator will reply with a confirmed price.', path: '/quote' },
      quotePage(config, queryValues(req, CALCULATOR_FIELDS), undefined, newFormKey(), readPrefs(req).lang));
  });

  r.post('/quote', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const meta: PageMeta = { title: 'Request a quote', description: '', path: '/quote', noindex: true };
      const ip = clientIp(req);
      const values = bodyValues(req);
      const lang = readPrefs(req).lang;
      const limit = limiters.publicForms.hit(ip);
      if (!limit.allowed) return tooMany(res, '/quote', limit.retryAfterSeconds);
      const parsed = QuoteRequestSchema.safeParse(values);
      const key = /^[A-Za-z0-9_-]{16,64}$/.test(values.idempotencyKey ?? '') ? values.idempotencyKey! : newFormKey();
      if (!parsed.success) return send(res, meta, quotePage(config, values, fieldErrors(parsed.error), key, lang), 400);
      const service = findServiceByCode(parsed.data.service);
      if (!service || service.availability !== 'quote_on_request') {
        return send(res, meta, quotePage(config, values, { service: 'Choose one of the available services.' }, key, lang), 400);
      }
      let est = null;
      if (service.pricingServiceCode) {
        const outcome = runEstimate(ctx, parsed.data);
        if (outcome.ok) est = outcome.result;
      }
      const { reference, created } = await createQuoteRequest(db, parsed.data, est, config.pricingMode, ip);
      if (created) logger.info('quote_request.created', { reference });
      send(res, { ...meta, title: 'Quote request received' }, quoteSubmittedPage(reference, est));
    } catch (err) {
      next(err);
    }
  });

  r.get('/contact', (req, res) => {
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
    send(res, { title: 'Contact', description: 'Contact a Crownline Express coordinator.', path: '/contact' }, contactPage(config, { topic }, undefined, false));
  });

  r.post('/contact', async (req, res, next) => {
    try {
      const meta: PageMeta = { title: 'Contact', description: '', path: '/contact', noindex: true };
      const ip = clientIp(req);
      const values = bodyValues(req);
      const limit = limiters.publicForms.hit(ip);
      if (!limit.allowed) return tooMany(res, '/contact', limit.retryAfterSeconds);
      if (values.website) {
        logger.warn('contact.honeypot', { ip });
        return send(res, meta, contactPage(config, {}, undefined, true));
      }
      const parsed = ContactSchema.safeParse(values);
      if (!parsed.success) return send(res, meta, contactPage(config, values, fieldErrors(parsed.error), false), 400);
      await createContactMessage(db, parsed.data, ip);
      send(res, meta, contactPage(config, {}, undefined, true));
    } catch (err) {
      next(err);
    }
  });

  r.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /track?\nDisallow: /calculator?\nDisallow: /quote?\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });

  r.get('/sitemap.xml', (_req, res) => {
    const paths = ['/', '/calculator', '/track', '/quote', '/contact', ...STATIC_PAGES.map((p) => p.path), ...SERVICES.map((s) => `/services/${s.slug}`)];
    const urls = paths.map((p) => `<url><loc>${config.siteUrl}${p}</loc></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });

  return r;
}
