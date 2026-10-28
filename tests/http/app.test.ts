import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { loadConfig } from '../../src/config/env.ts';
import type { Db } from '../../src/db/index.ts';
import { generateTrackingCode } from '../../src/domain/codes.ts';
import { DEMO_RATE_CARD } from '../../src/domain/rateCard.ts';
import { createApp } from '../../src/http/app.ts';
import { silentLogger } from '../../src/lib/logger.ts';
import { TEST_SECRET, freshDb, makeStaff } from '../helpers.ts';

interface Res {
  status: number;
  headers: Headers;
  text: string;
  bytes: Buffer;
}

class Client {
  cookies = new Map<string, string>();
  base: string;
  constructor(base: string) {
    this.base = base;
  }
  async req(method: string, path: string, body?: Record<string, string>, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload: string | undefined;
    if (body) {
      h['content-type'] = 'application/x-www-form-urlencoded';
      h.origin ??= this.base;
      payload = new URLSearchParams(body).toString();
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0]!;
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      if (/Max-Age=0\b/.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, pair.slice(i + 1));
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, text: bytes.toString('utf8'), bytes };
  }
  get(path: string) {
    return this.req('GET', path);
  }
  post(path: string, body: Record<string, string>, headers?: Record<string, string>) {
    return this.req('POST', path, body, headers);
  }
}

const csrfOf = (html: string) => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
const fieldOf = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1] ?? '';

let db: Db;
let server: Server;
let base: string;

async function signIn(email: string, password: string, newPassword = 'tidal compass morning 2026'): Promise<Client> {
  const c = new Client(base);
  const form = await c.get('/admin/login');
  const res = await c.post('/admin/login', { _csrf: csrfOf(form.text), email, password, next: '/admin' });
  assert.equal(res.status, 303, 'login should redirect');
  if (res.headers.get('location') === '/admin/account') {
    const page = await c.get('/admin/account');
    const changed = await c.post('/admin/account/password', { _csrf: csrfOf(page.text), currentPassword: password, newPassword, confirmPassword: newPassword });
    assert.equal(changed.status, 303);
  }
  return c;
}

before(async () => {
  db = await freshDb();
  const config = loadConfig({ NODE_ENV: 'test', TRACKING_CODE_SECRET: TEST_SECRET, SITE_URL: 'http://127.0.0.1' } as NodeJS.ProcessEnv);
  const app = createApp({ config, db, logger: silentLogger, rateCard: DEMO_RATE_CARD });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

describe('public site', () => {
  test('pages render with strict security headers and no inline scripts or styles', async () => {
    const c = new Client(base);
    for (const path of ['/', '/calculator', '/track', '/services', '/services/air-freight', '/quote', '/contact', '/how-it-works', '/about', '/faq', '/legal/privacy', '/claims']) {
      const res = await c.get(path);
      assert.equal(res.status, 200, path);
      const csp = res.headers.get('content-security-policy') ?? '';
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.doesNotMatch(csp, /unsafe-inline/);
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      assert.ok(nonce, `${path} CSP nonce`);
      assert.ok(res.text.includes(`<script nonce="${nonce}">`), `${path} boot script nonce`);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-powered-by'), null);
      assert.doesNotMatch(res.text, /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)(?![^>]*\bnonce=)[^>]*>/, `${path} has an inline script`);
      assert.doesNotMatch(res.text, /\sstyle="/, `${path} has an inline style`);
      assert.doesNotMatch(res.text, /\sonclick=|javascript:/i, `${path} has inline handlers`);
      assert.equal(res.headers.get('set-cookie'), null, `${path} should not set cookies`);
    }
  });

  test('legacy server files, data and environment files are never served', async () => {
    const c = new Client(base);
    for (const path of ['/server.js', '/server-enhanced.js', '/data/shipments.json', '/.env', '/legacy/server.js', '/package.json', '/src/server.ts', '/admin.html']) {
      assert.equal((await c.get(path)).status, 404, path);
    }
  });

  test('unknown pages get a branded 404', async () => {
    const res = await new Client(base).get('/no-such-page');
    assert.equal(res.status, 404);
    assert.match(res.text, /We could not find that page/);
  });

  test('calculator shows a labelled demonstration estimate and validates input', async () => {
    const c = new Client(base);
    const ok = await c.get('/calculator?service=international_parcel&shipmentType=parcel&originCountry=NL&destinationCountry=CA&quantity=2&weight=3&weightUnit=kg&length=40&width=30&height=20&lengthUnit=cm');
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Demonstration estimate/);
    assert.match(ok.text, /These are sample figures/);
    assert.match(ok.text, /10\.00 kg/, 'billable weight is 2 × 5 kg dimensional');
    const bad = await c.get('/calculator?service=international_parcel&shipmentType=parcel&originCountry=NL&destinationCountry=CA&quantity=1&weight=-2&weightUnit=kg&length=40&width=30&height=20&lengthUnit=cm');
    assert.equal(bad.status, 400);
    assert.match(bad.text, /must be more than zero/);
  });

  test('quote requests are validated, idempotent and priced on the server', async () => {
    const c = new Client(base);
    const form = await c.get('/quote?service=air_freight&originCountry=SG&destinationCountry=DE');
    assert.equal(form.headers.get('cache-control'), 'no-store');
    const idempotencyKey = fieldOf(form.text, 'idempotencyKey');
    assert.ok(idempotencyKey.length >= 16);
    const body = {
      idempotencyKey, contactName: 'Ada Example', contactEmail: 'ada@example.test', service: 'air_freight', shipmentType: 'freight',
      originCountry: 'SG', destinationCountry: 'DE', quantity: '1', weight: '120', weightUnit: 'kg', length: '120', width: '80', height: '100', lengthUnit: 'cm',
      consent: 'on', totalMinor: '1',
    };
    const missingConsent = await c.post('/quote', { ...body, consent: '' });
    assert.equal(missingConsent.status, 400);
    assert.match(missingConsent.text, /confirm we may contact you/);

    const first = await c.post('/quote', body);
    assert.equal(first.status, 200);
    const ref = /CLQ-[0-9A-Z]{8}/.exec(first.text)?.[0];
    assert.ok(ref, 'shows a quote reference');
    const second = await c.post('/quote', body);
    assert.equal(/CLQ-[0-9A-Z]{8}/.exec(second.text)?.[0], ref, 'resubmission returns the same request');
    const rows = (await db.query<{ n: number; total: number | null }>(`select count(*)::int as n, max((estimate->>'totalMinor')::int) as total from quote_requests where reference = $1`, [ref])).rows[0]!;
    assert.equal(rows.n, 1);
    assert.ok(rows.total !== null && rows.total > 1, 'stored estimate is the server calculation, not the client value');
  });

  test('cross-site form posts are rejected', async () => {
    const c = new Client(base);
    const res = await c.post('/contact', { name: 'X', email: 'x@example.test', topic: 'other', message: 'Hello there, cross site.' }, { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
  });

  test('contact form stores valid messages and silently drops honeypot submissions', async () => {
    const c = new Client(base);
    const before = (await db.query<{ n: number }>(`select count(*)::int as n from contact_messages`)).rows[0]!.n;
    const ok = await c.post('/contact', { name: 'Grace', email: 'grace@example.test', topic: 'tracking', message: 'Where is my parcel, please?' });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Message sent/);
    const bot = await c.post('/contact', { name: 'Bot', email: 'bot@example.test', topic: 'other', message: 'Buy things now please', website: 'http://spam' });
    assert.match(bot.text, /Message sent/);
    const afterCount = (await db.query<{ n: number }>(`select count(*)::int as n from contact_messages`)).rows[0]!.n;
    assert.equal(afterCount, before + 1);
  });
});

describe('admin console and tracking lifecycle', () => {
  test('requires sign-in, CSRF-protected login and generic failures', async () => {
    const c = new Client(base);
    const res = await c.get('/admin/shipments');
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /^\/admin\/login\?next=/);
    assert.equal((await c.post('/admin/login', { email: 'a@b.c', password: 'x' })).status, 403, 'login without CSRF token');

    const owner = await makeStaff(db, 'owner');
    const form = await c.get('/admin/login');
    const wrong = await c.post('/admin/login', { _csrf: csrfOf(form.text), email: owner.email, password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    assert.match(wrong.text, /email or password is not correct/);
    const unknown = await c.post('/admin/login', { _csrf: csrfOf(wrong.text), email: 'nobody@example.test', password: 'wrong-password' });
    assert.equal(unknown.status, 401);
    assert.match(unknown.text, /email or password is not correct/);
  });

  test('login never redirects off-site', async () => {
    const owner = await makeStaff(db, 'owner');
    const c = new Client(base);
    const form = await c.get('/admin/login');
    const res = await c.post('/admin/login', { _csrf: csrfOf(form.text), email: owner.email, password: owner.password, next: 'https://evil.example/' });
    assert.equal(res.status, 303);
    assert.ok((res.headers.get('location') ?? '').startsWith('/admin'));
  });

  test('full lifecycle: create, issue code, public track, record event, revoke', async () => {
    const owner = await makeStaff(db, 'owner');
    const c = await signIn(owner.email, owner.password);

    const newForm = await c.get('/admin/shipments/new');
    assert.equal(newForm.status, 200);
    const shipment = {
      _csrf: csrfOf(newForm.text), idempotencyKey: fieldOf(newForm.text, 'idempotencyKey'), serviceCode: 'international_parcel', shipmentType: 'parcel',
      originCity: 'Rotterdam', originCountry: 'NL', destinationCity: 'Toronto', destinationCountry: 'CA',
      senderName: 'Private Sender', senderPhone: '+31 10 555 0101', recipientName: 'Private Recipient', recipientAddress1: '99 Private Street', recipientEmail: 'recipient@example.test',
      quantity: '1', weight: '4', weightUnit: 'kg', length: '40', width: '30', height: '20', lengthUnit: 'cm',
      contentsDescription: 'Ceramic samples', declaredValue: '250', declaredValueCurrency: 'EUR', recordBooking: 'on',
    };
    assert.equal((await c.post('/admin/shipments', { ...shipment, _csrf: '' })).status, 403, 'missing CSRF token');
    const created = await c.post('/admin/shipments', shipment);
    assert.equal(created.status, 303);
    const detailPath = created.headers.get('location') ?? '';
    assert.match(detailPath, /^\/admin\/shipments\/[0-9a-f-]{36}$/);
    let detail = await c.get(detailPath);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Shipment CLS-[0-9A-Z]{8} created/);
    const again = await c.post('/admin/shipments', shipment);
    assert.equal(again.headers.get('location'), detailPath, 'double submission does not create a second shipment');
    detail = await c.get(detailPath);
    assert.match(detail.text, /was already created from this form/);
    const issued = await c.post(`${detailPath}/codes`, { _csrf: csrfOf(detail.text), requestKey: fieldOf(detail.text, 'requestKey') });
    assert.equal(issued.status, 200);
    assert.equal(issued.headers.get('cache-control'), 'no-store');
    const code = /class="code-display">(CL-[0-9A-Z-]+)</.exec(issued.text)?.[1];
    assert.ok(code, 'code is shown once');
    assert.match(issued.text, new RegExp(`/track\\?code=${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(issued.text, /Staff shipment link/);
    assert.match(issued.text, new RegExp(detailPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const stored = (await db.query<{ n: number }>(`select count(*)::int as n from tracking_credentials where code_hash = $1 or code_hint = $1`, [code])).rows[0]!.n;
    assert.equal(stored, 0, 'the plaintext code is not stored');

    const visitor = new Client(base);
    let track = await visitor.get(`/track?code=${encodeURIComponent(code.toLowerCase().replace(/-/g, ' '))}`);
    assert.equal(track.status, 200);
    assert.equal(track.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(track.headers.get('cache-control'), 'no-store');
    assert.match(track.text, /Rotterdam, Netherlands/);
    assert.match(track.text, /Booking confirmed/);
    for (const secret of ['Private Sender', 'Private Recipient', '99 Private Street', 'recipient@example.test', '+31 10 555 0101', 'Ceramic samples', '250']) {
      assert.ok(!track.text.includes(secret), `public tracking must not reveal "${secret}"`);
    }

    detail = await c.get(detailPath);
    const event = await c.post(`${detailPath}/events`, {
      _csrf: csrfOf(detail.text), eventType: 'collected', occurredAtLocal: '2026-01-05T10:30', timeZone: 'Europe/Amsterdam',
      locationLabel: 'Rotterdam depot', locationCountry: 'NL', internalNote: 'Driver 42 internal remark',
    });
    assert.equal(event.status, 303);
    track = await visitor.get(`/track?code=${code}`);
    assert.match(track.text, /Rotterdam depot/);
    assert.match(track.text, /15%/);
    assert.ok(!track.text.includes('Driver 42 internal remark'), 'internal notes stay private');

    detail = await c.get(detailPath);
    const refused = await c.post(`${detailPath}/progress`, { _csrf: csrfOf(detail.text), displayProgress: '100' });
    assert.equal(refused.status, 303);
    assert.match((await c.get(detailPath)).text, /100% is shown only after delivery is confirmed with evidence/);
    detail = await c.get(detailPath);
    const shown = await c.post(`${detailPath}/progress`, { _csrf: csrfOf(detail.text), displayProgress: '40' });
    assert.equal(shown.status, 303);
    track = await visitor.get(`/track?code=${code}`);
    assert.match(track.text, /40%/);
    assert.match(track.text, /coordinator/);
    const feed = await visitor.get(`/track/feed?code=${encodeURIComponent(code!)}`);
    assert.equal(feed.status, 200);
    const live = JSON.parse(feed.text) as { progress: number; charges: unknown[] };
    assert.equal(live.progress, 40);
    assert.deepEqual(live.charges, []);
    const milestone = (await db.query<{ progress_percent: number; display_progress: number }>(`select progress_percent, display_progress from shipments where id = $1`, [detailPath.split('/').pop()])).rows[0]!;
    assert.equal(Number(milestone.progress_percent), 15);
    assert.equal(Number(milestone.display_progress), 40);

    detail = await c.get(detailPath);
    const drafted = await c.post(`${detailPath}/charges`, {
      _csrf: csrfOf(detail.text), description: 'Origin handling', amount: '18.50', currency: 'eur', visibility: 'draft',
    });
    assert.equal(drafted.status, 303);
    assert.ok(!(await visitor.get(`/track?code=${code}`)).text.includes('Origin handling'), 'a draft charge stays off the customer page');
    detail = await c.get(detailPath);
    const chargeId = /\/charges\/([0-9a-f-]{36})/.exec(detail.text)?.[1];
    assert.ok(chargeId);
    const published = await c.post(`${detailPath}/charges/${chargeId}`, { _csrf: csrfOf(detail.text), status: 'published' });
    assert.equal(published.status, 303);
    track = await visitor.get(`/track?code=${code}`);
    assert.match(track.text, /Origin handling/);
    assert.match(track.text, /18\.50/);
    assert.match(track.text, /does not take card payments/);
    const publishedFeed = JSON.parse((await visitor.get(`/track/feed?code=${encodeURIComponent(code!)}`)).text) as { charges: { description: string }[] };
    assert.equal(publishedFeed.charges[0]?.description, 'Origin handling');

    detail = await c.get(detailPath);
    const badDelivery = await c.post(`${detailPath}/events`, { _csrf: csrfOf(detail.text), eventType: 'delivered', occurredAtLocal: '2026-01-06T10:30', timeZone: 'UTC' });
    assert.equal(badDelivery.status, 400);
    assert.match(badDelivery.text, /Delivery can only be confirmed with evidence/);

    const pdf = await c.post(`${detailPath}/documents/summary`, { _csrf: csrfOf(detail.text) });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');

    detail = await c.get(detailPath);
    const credentialId = /\/codes\/([0-9a-f-]{36})\/revoke/.exec(detail.text)?.[1];
    assert.ok(credentialId);
    const noConfirm = await c.post(`${detailPath}/codes/${credentialId}/revoke`, { _csrf: csrfOf(detail.text), reason: 'Customer reported the code was shared' });
    assert.equal(noConfirm.status, 303);
    assert.equal((await visitor.get(`/track?code=${code}`)).status, 200, 'revocation without confirmation does nothing');
    const revoked = await c.post(`${detailPath}/codes/${credentialId}/revoke`, { _csrf: csrfOf(detail.text), reason: 'Customer reported the code was shared', confirm: 'on' });
    assert.equal(revoked.status, 303);

    const after = await visitor.get(`/track?code=${code}`);
    const unknown = await visitor.get(`/track?code=${generateTrackingCode()}`);
    assert.equal(after.status, 404);
    assert.equal(unknown.status, 404);
    assert.ok(!after.text.includes('Rotterdam'), 'revoked code reveals nothing');
    const message = (t: string) => /<p class="field-error"[^>]*>([^<]+)</.exec(t)?.[1];
    assert.match(message(after.text) ?? '', /We could not find an active shipment/);
    assert.equal(message(after.text), message(unknown.text), 'revoked and never-issued codes get the same response');

    const audit = (await db.query<{ action: string }>(`select action from audit_events where action like 'tracking_code.%' order by id`)).rows.map((r) => r.action);
    assert.deepEqual(audit.slice(-2), ['tracking_code.issued', 'tracking_code.revoked']);
  });

  test('roles are enforced on the server', async () => {
    const owner = await makeStaff(db, 'owner');
    const ownerClient = await signIn(owner.email, owner.password);
    const newForm = await ownerClient.get('/admin/shipments/new');
    const created = await ownerClient.post('/admin/shipments', {
      _csrf: csrfOf(newForm.text), idempotencyKey: fieldOf(newForm.text, 'idempotencyKey'), serviceCode: 'domestic_parcel', shipmentType: 'parcel',
      originCity: 'Leeds', originCountry: 'GB', destinationCity: 'Bristol', destinationCountry: 'GB', senderName: 'S', recipientName: 'R',
      quantity: '1', weight: '1', weightUnit: 'kg', length: '10', width: '10', height: '10', lengthUnit: 'cm',
    });
    const detailPath = created.headers.get('location')!;

    const operator = await makeStaff(db, 'tracking_operator');
    const op = await signIn(operator.email, operator.password);
    assert.equal((await op.get('/admin/team')).status, 403);
    assert.equal((await op.get('/admin/audit')).status, 403);
    assert.equal((await op.get('/admin/shipments/new')).status, 403);
    const detail = await op.get(detailPath);
    assert.equal(detail.status, 200);
    assert.ok(!detail.text.includes('Issue tracking code'), 'operator is not offered code issuance');
    assert.equal((await op.post(`${detailPath}/codes`, { _csrf: csrfOf(detail.text), requestKey: 'abcdefghijklmnop1234' })).status, 403);
    assert.equal((await op.post(`${detailPath}/cancel`, { _csrf: csrfOf(detail.text), reason: 'not allowed to', confirm: 'on' })).status, 403);
    assert.equal((await op.post(`${detailPath}/charges`, { _csrf: csrfOf(detail.text), description: 'Not permitted', amount: '1.00', currency: 'USD', visibility: 'published' })).status, 403);

    const auditor = await makeStaff(db, 'auditor');
    const au = await signIn(auditor.email, auditor.password);
    assert.equal((await au.get('/admin/audit')).status, 200);
    const auDetail = await au.get(detailPath);
    assert.equal((await au.post(`${detailPath}/events`, { _csrf: csrfOf(auDetail.text), eventType: 'collected', occurredAtLocal: '2026-01-05T10:30', timeZone: 'UTC' })).status, 403);
    assert.equal((await au.post(`${detailPath}/charges`, { _csrf: csrfOf(auDetail.text), description: 'Not permitted', amount: '1.00', currency: 'USD', visibility: 'draft' })).status, 403);
    assert.equal((await au.post(`${detailPath}/progress`, { _csrf: csrfOf(auDetail.text), displayProgress: '40' })).status, 403);
    const state = (await db.query<{ progress_percent: number }>(`select progress_percent from shipments where id = $1`, [detailPath.split('/').pop()])).rows[0]!;
    assert.equal(state.progress_percent, 0);
  });

  test('signing out ends the session', async () => {
    const owner = await makeStaff(db, 'owner');
    const c = await signIn(owner.email, owner.password);
    const page = await c.get('/admin');
    assert.equal(page.status, 200);
    const cookie = [...c.cookies.entries()].find(([k]) => k.includes('cl_session'));
    assert.ok(cookie);
    assert.equal((await c.post('/admin/logout', { _csrf: csrfOf(page.text) })).status, 303);
    c.cookies.set(cookie[0], cookie[1]);
    const res = await c.get('/admin');
    assert.equal(res.status, 303, 'a replayed session cookie no longer works');
  });
});
