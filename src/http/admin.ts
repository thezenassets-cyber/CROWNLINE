import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { findServiceByCode, type ShipmentType } from '../config/services.ts';
import { estimate } from '../domain/pricing.ts';
import { formatMoney } from '../domain/money.ts';
import { can, canAssignRole, type Permission } from '../domain/permissions.ts';
import { AppError, ConflictError, ForbiddenError, ValidationError } from '../lib/errors.ts';
import type { SafeHtml } from '../lib/html.ts';
import { listAudit } from '../services/audit.ts';
import { createCharge, setChargeStatus } from '../services/charges.ts';
import { SESSION_ABSOLUTE_MS, changePassword, clearFlash, createUser, getSession, login, logout, setFlash, type Flash, type Session } from '../services/auth.ts';
import { dashboardMetrics } from '../services/dashboard.ts';
import { generateQuoteEstimate, generateShipmentSummary, type GeneratedDocument } from '../services/documents.ts';
import { loadMilestones } from '../services/milestones.ts';
import { getQuoteRequest, listContactMessages, listQuoteRequests, markContactHandled, updateQuoteStatus } from '../services/quotes.ts';
import {
  addStaffEvent, archiveShipment, cancelShipment, createShipment, getShipment, getShipmentDetail, listShipments, openException,
  resolveException, setDisplayProgress, setEstimatedDelivery, voidEvent, type ShipmentDetail, type ShipmentListFilters, type StaffActor,
} from '../services/shipments.ts';
import { issueTrackingCode, revokeTrackingCode } from '../services/tracking.ts';
import { changeUserRole, listUsers, resetUserPassword, setUserStatus } from '../services/users.ts';
import {
  AddEventSchema, ChargeSchema, ChargeStatusSchema, CreateShipmentSchema, CreateUserSchema, DisplayProgressSchema, EstimatedDeliverySchema, LoginSchema, OpenExceptionSchema, PasswordChangeSchema,
  QuoteStatusSchema, ReasonSchema, ResolveExceptionSchema, UpdateRoleSchema, fieldErrors, type FieldErrors,
} from '../validation/schemas.ts';
import type { Values } from '../views/components.ts';
import { adminBareLayout, adminLayout } from '../views/admin/layout.ts';
import {
  adminErrorPage, auditPage, codeIssuedPage, loginPage, messagesPage, newShipmentPage, overviewPage, passwordPage, quoteDetailPage,
  quotesListPage, settingsPage, shipmentDetailPage, shipmentsListPage, teamPage, temporaryPasswordPage, type DetailExtras,
} from '../views/admin/pages.ts';
import type { AppContext } from './context.ts';
import { newFormKey } from './public.ts';
import { clearCookie, clientIp, cookieName, parseCookies, safeAdminRedirect, setCookie } from './security.ts';

interface AuthedRequest extends Request {
  session: Session;
}

const PAGE_SIZE = 25;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bodyValues(req: Request): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries((req.body ?? {}) as Record<string, unknown>)) if (typeof v === 'string' && k !== '_csrf') out[k] = v;
  return out;
}

function pageParam(req: Request): number {
  const n = Number(req.query.page);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

function qs(req: Request, keys: string[]): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of keys) {
    const v = req.query[k];
    if (typeof v === 'string' && v) p.set(k, v);
  }
  return p;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function validationToFields(err: ValidationError): FieldErrors {
  const out: FieldErrors = {};
  for (const f of err.fieldErrors) out[f.field] ??= f.message;
  return out;
}

export function adminRouter(ctx: AppContext): Router {
  const r = Router();
  const { config, db, logger, limiters } = ctx;
  const SESSION_COOKIE = cookieName(config, 'cl_session');
  const LOGIN_CSRF_COOKIE = cookieName(config, 'cl_login_csrf');

  const actorOf = (req: Request): StaffActor => {
    const s = (req as AuthedRequest).session;
    return { userId: s.user.id, role: s.user.role, label: s.user.email, ip: clientIp(req) };
  };

  const page = async (req: Request, res: Response, title: string, body: SafeHtml, status = 200) => {
    const session = (req as AuthedRequest).session;
    const flash = session.flash;
    if (flash) await clearFlash(db, session.id);
    res.status(status).type('html').send(adminLayout(config, { title, session, path: req.path === '/' ? '/admin' : `/admin${req.path}`, flash }, body));
  };

  const redirect = async (req: Request, res: Response, url: string, flash?: Flash) => {
    if (flash) await setFlash(db, (req as AuthedRequest).session.id, flash);
    res.redirect(303, url);
  };

  const requirePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
    if (!can((req as AuthedRequest).session.user.role, permission)) return next(new ForbiddenError());
    next();
  };

  const sendPdf = (res: Response, d: GeneratedDocument) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('Content-Length', String(d.bytes.length));
    res.end(d.bytes);
  };

  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Session loading (does not require one yet).
  r.use(async (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const session = await getSession(db, token);
      if (session) (req as AuthedRequest).session = session;
    }
    next();
  });

  // ---- Sign in ----
  const showLogin = (res: Response, o: { username?: string; error?: string; next?: unknown; status?: number }) => {
    const token = randomBytes(24).toString('base64url');
    setCookie(res, config, LOGIN_CSRF_COOKIE, token, 3600);
    res.status(o.status ?? 200).type('html').send(adminBareLayout('Control', loginPage({ csrfToken: token, username: o.username ?? '', error: o.error, next: safeAdminRedirect(o.next) })));
  };

  r.get('/login', (req, res) => {
    if ((req as AuthedRequest).session) return res.redirect(303, '/admin');
    showLogin(res, { next: req.query.next });
  });

  r.post('/login', async (req, res) => {
    const ip = clientIp(req);
    const body = bodyValues(req);
    const cookieToken = parseCookies(req.headers.cookie)[LOGIN_CSRF_COOKIE];
    const formToken = typeof req.body?._csrf === 'string' ? (req.body._csrf as string) : '';
    const username = body.username || body.email;
    if (!cookieToken || !formToken || !safeEqual(cookieToken, formToken)) {
      return showLogin(res, { username, error: 'Your sign-in form expired. Please try again.', next: body.next, status: 403 });
    }
    const limit = limiters.login.hit(ip);
    if (!limit.allowed) {
      logger.warn('auth.login_rate_limited', { ip });
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      return showLogin(res, { username, error: 'Too many sign-in attempts. Please wait a few minutes.', next: body.next, status: 429 });
    }
    const parsed = LoginSchema.safeParse({ username, password: body.password });
    if (!parsed.success) return showLogin(res, { username, error: 'Enter your username and password.', next: body.next, status: 400 });
    const result = await login(db, parsed.data.username, parsed.data.password, ip, req.get('user-agent') ?? '');
    if (!result.ok) {
      return showLogin(res, {
        username: parsed.data.username,
        error: 'The username or password is not correct. After repeated failed attempts, sign-in is paused for 15 minutes.',
        next: body.next,
        status: 401,
      });
    }
    clearCookie(res, config, LOGIN_CSRF_COOKIE);
    setCookie(res, config, SESSION_COOKIE, result.token, Math.floor(SESSION_ABSOLUTE_MS / 1000));
    res.redirect(303, result.user.mustChangePassword ? '/admin/account' : safeAdminRedirect(body.next));
  });

  // ---- Everything below requires a valid staff session ----
  r.use((req, res, next) => {
    if ((req as AuthedRequest).session) return next();
    if (req.method === 'GET') return res.redirect(303, `/admin/login?next=${encodeURIComponent(safeAdminRedirect(req.originalUrl))}`);
    res.status(401).type('text/plain').send('Your session has ended. Please sign in again.');
  });

  r.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const token = typeof req.body?._csrf === 'string' ? (req.body._csrf as string) : '';
    if (!token || !safeEqual(token, (req as AuthedRequest).session.csrfToken)) {
      logger.warn('security.csrf_rejected', { ip: clientIp(req), path: req.path });
      return res.status(403).type('text/plain').send('This form has expired. Go back, reload the page and try again.');
    }
    next();
  });

  r.use((req, res, next) => {
    const s = (req as AuthedRequest).session;
    if (s.user.mustChangePassword && !['/account', '/account/password', '/logout'].includes(req.path)) return res.redirect(303, '/admin/account');
    next();
  });

  r.post('/logout', async (req, res) => {
    await logout(db, (req as AuthedRequest).session, clientIp(req));
    clearCookie(res, config, SESSION_COOKIE);
    res.redirect(303, '/admin/login');
  });

  r.get('/account', (req, res) => page(req, res, 'Your account', passwordPage((req as AuthedRequest).session)));

  r.post('/account/password', async (req, res) => {
    const session = (req as AuthedRequest).session;
    const parsed = PasswordChangeSchema.safeParse(bodyValues(req));
    if (!parsed.success) return page(req, res, 'Your account', passwordPage(session, fieldErrors(parsed.error)), 400);
    const result = await changePassword(db, session, parsed.data.currentPassword, parsed.data.newPassword, clientIp(req));
    if (!result.ok) return page(req, res, 'Your account', passwordPage(session, { [result.field]: result.message }), 400);
    await redirect(req, res, '/admin', { kind: 'success', message: 'Your password has been changed. Other sessions were signed out.' });
  });

  // ---- Overview ----
  r.get('/', async (req, res) => {
    const session = (req as AuthedRequest).session;
    const today = new Date();
    const valid = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
    const period = { from: valid(req.query.from) ?? isoDate(new Date(today.getTime() - 29 * 86_400_000)), to: valid(req.query.to) ?? isoDate(today) };
    const [metrics, defs, recent] = await Promise.all([
      dashboardMetrics(db, period.from, period.to),
      loadMilestones(db),
      can(session.user.role, 'shipments.read') ? listShipments(db, { state: 'all', page: 1, pageSize: 8 }) : Promise.resolve({ rows: [], total: 0 }),
    ]);
    await page(req, res, 'Overview', overviewPage(session, metrics, period, recent.rows, defs));
  });

  // ---- Shipments ----
  r.get('/shipments', requirePermission('shipments.read'), async (req, res) => {
    const str = (k: string, re: RegExp) => (typeof req.query[k] === 'string' && re.test(req.query[k] as string) ? (req.query[k] as string) : undefined);
    const f: ShipmentListFilters = {
      q: typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) || undefined : undefined,
      state: (str('state', /^(active|cancelled|archived|all)$/) as ShipmentListFilters['state']) ?? 'active',
      milestone: str('milestone', /^[a-z_]{1,40}$/),
      exceptions: req.query.exceptions === '1',
      from: str('from', /^\d{4}-\d{2}-\d{2}$/),
      to: str('to', /^\d{4}-\d{2}-\d{2}$/),
      sort: str('sort', /^(created_at|reference|progress_percent|last_event_at)$/) as ShipmentListFilters['sort'],
      dir: str('dir', /^(asc|desc)$/) as ShipmentListFilters['dir'],
      page: pageParam(req),
      pageSize: PAGE_SIZE,
    };
    const [result, defs] = await Promise.all([listShipments(db, f), loadMilestones(db)]);
    await page(req, res, 'Shipments', shipmentsListPage((req as AuthedRequest).session, f, qs(req, ['q', 'state', 'milestone', 'exceptions', 'from', 'to', 'sort', 'dir']), result, defs));
  });

  r.get('/shipments/new', requirePermission('shipments.create'), (req, res) =>
    page(req, res, 'New shipment', newShipmentPage((req as AuthedRequest).session, {}, undefined, newFormKey())),
  );

  r.post('/shipments', requirePermission('shipments.create'), async (req, res) => {
    const session = (req as AuthedRequest).session;
    const values = bodyValues(req);
    const key = /^[A-Za-z0-9_-]{16,64}$/.test(values.idempotencyKey ?? '') ? values.idempotencyKey! : newFormKey();
    const parsed = CreateShipmentSchema.safeParse(values);
    if (!parsed.success) return page(req, res, 'New shipment', newShipmentPage(session, values, fieldErrors(parsed.error), key), 400);
    try {
      const created = await createShipment(db, actorOf(req), parsed.data);
      await redirect(req, res, `/admin/shipments/${created.id}`, {
        kind: 'success',
        message: created.created ? `Shipment ${created.reference} created. Issue a tracking code when you are ready to share it.` : `Shipment ${created.reference} was already created from this form.`,
      });
    } catch (err) {
      if (err instanceof ValidationError) return page(req, res, 'New shipment', newShipmentPage(session, values, validationToFields(err), key), 400);
      throw err;
    }
  });

  const coverNoteFor = (detail: ShipmentDetail): string => {
    const s = detail.shipment;
    if (!s.cover_included) return 'Not included';
    const service = findServiceByCode(s.service_code);
    const pack = detail.packages[0];
    if (!service?.pricingServiceCode || !pack || s.declared_value_minor == null) return 'Included';
    const types: readonly ShipmentType[] = ['parcel', 'document', 'pallet', 'freight'];
    const shipmentType = types.find((t) => t === s.shipment_type) ?? 'parcel';
    const km = s.distance_km == null ? null : Number(s.distance_km);
    const out = estimate(
      {
        pricingServiceCode: service.pricingServiceCode,
        shipmentType,
        originCountry: s.origin_country,
        destinationCountry: s.destination_country,
        weightUnit: 'kg',
        lengthUnit: 'cm',
        packages: [{
          quantity: Number(pack.quantity),
          weight: Number(pack.weight_kg),
          length: Number(pack.length_cm),
          width: Number(pack.width_cm),
          height: Number(pack.height_cm),
        }],
        declaredValueMinor: Number(s.declared_value_minor),
        insurance: true,
        distanceKm: Number.isFinite(km) ? km : null,
      },
      ctx.rateCard,
      config.pricingMode,
    );
    if (!out.ok) return 'Included';
    const line = out.result.lines.find((item) => item.code === 'cover');
    if (!line) return 'Included';
    const money = formatMoney(line.amountMinor, out.result.currency);
    return config.pricingMode === 'demo' ? `Included · sample ${money} (not a quote)` : `Included · ${money}`;
  };

  const renderDetail = async (req: Request, res: Response, id: string, extras: Partial<DetailExtras> = {}, status = 200) => {
    const [detail, defs] = await Promise.all([getShipmentDetail(db, id), loadMilestones(db)]);
    await page(req, res, detail.shipment.reference, shipmentDetailPage((req as AuthedRequest).session, detail, defs, { issueKey: newFormKey(), coverNote: coverNoteFor(detail), ...extras }), status);
  };

  r.get('/shipments/:id', requirePermission('shipments.read'), (req, res) => renderDetail(req, res, req.params.id as string));

  r.post('/shipments/:id/events', requirePermission('events.create'), async (req, res) => {
    const id = req.params.id as string;
    const values = bodyValues(req);
    const parsed = AddEventSchema.safeParse(values);
    if (!parsed.success) return renderDetail(req, res, id, { eventErrors: fieldErrors(parsed.error), eventValues: values }, 400);
    try {
      const result = await addStaffEvent(db, actorOf(req), id, parsed.data);
      await redirect(req, res, `/admin/shipments/${id}`, result.status === 'created'
        ? { kind: 'success', message: 'Event recorded. Progress and public tracking have been updated.' }
        : { kind: 'error', message: 'This event was already recorded (same type, time and location), so it was not added again.' });
    } catch (err) {
      if (err instanceof ValidationError) return renderDetail(req, res, id, { eventErrors: validationToFields(err), eventValues: values }, 400);
      throw err;
    }
  });

  r.post('/shipments/:id/events/:eventId/void', requirePermission('events.void'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = ReasonSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}`, { kind: 'error', message: Object.values(fieldErrors(parsed.error)).join(' ') });
    await voidEvent(db, actorOf(req), id, req.params.eventId as string, parsed.data.reason);
    await redirect(req, res, `/admin/shipments/${id}`, { kind: 'success', message: 'Event voided and progress recalculated.' });
  });

  r.post('/shipments/:id/exceptions', requirePermission('exceptions.manage'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = OpenExceptionSchema.safeParse(bodyValues(req));
    if (!parsed.success) return renderDetail(req, res, id, { exceptionErrors: fieldErrors(parsed.error) }, 400);
    await openException(db, actorOf(req), id, parsed.data);
    await redirect(req, res, `/admin/shipments/${id}#issues`, { kind: 'success', message: 'Issue reported. Customers with a tracking code can now see it.' });
  });

  r.post('/shipments/:id/exceptions/:exceptionId/resolve', requirePermission('exceptions.manage'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = ResolveExceptionSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}#issues`, { kind: 'error', message: Object.values(fieldErrors(parsed.error)).join(' ') });
    await resolveException(db, actorOf(req), id, req.params.exceptionId as string, parsed.data.resolutionNote);
    await redirect(req, res, `/admin/shipments/${id}#issues`, { kind: 'success', message: 'Issue marked as resolved.' });
  });

  r.post('/shipments/:id/progress', requirePermission('events.create'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = DisplayProgressSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}#progress`, { kind: 'error', message: 'Enter a whole number from 0 to 99, or clear the figure.' });
    try {
      await setDisplayProgress(db, actorOf(req), id, parsed.data.displayProgress, parsed.data.clear === '1');
      await redirect(req, res, `/admin/shipments/${id}#progress`, { kind: 'success', message: parsed.data.clear === '1' ? 'The customer page now follows the milestone percentage.' : 'The percentage on the customer tracking page has been updated.' });
    } catch (err) {
      if (err instanceof ValidationError) return redirect(req, res, `/admin/shipments/${id}#progress`, { kind: 'error', message: err.fieldErrors.map((f) => f.message).join(' ') });
      throw err;
    }
  });

  r.post('/shipments/:id/charges', requirePermission('charges.manage'), async (req, res) => {
    const id = req.params.id as string;
    const values = bodyValues(req);
    const parsed = ChargeSchema.safeParse(values);
    if (!parsed.success) return renderDetail(req, res, id, { chargeErrors: fieldErrors(parsed.error), chargeValues: values }, 400);
    try {
      await createCharge(db, actorOf(req), id, parsed.data);
      await redirect(req, res, `/admin/shipments/${id}#charges`, { kind: 'success', message: parsed.data.visibility === 'published' ? 'Charge published to the customer tracking page.' : 'Charge saved as a draft. Publish it when the customer should see it.' });
    } catch (err) {
      if (err instanceof ValidationError) return renderDetail(req, res, id, { chargeErrors: validationToFields(err), chargeValues: values }, 400);
      throw err;
    }
  });

  r.post('/shipments/:id/charges/:chargeId', requirePermission('charges.manage'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = ChargeStatusSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}#charges`, { kind: 'error', message: 'Choose a valid charge status.' });
    await setChargeStatus(db, actorOf(req), id, req.params.chargeId as string, parsed.data.status);
    const label = parsed.data.status === 'published' ? 'Charge published to the customer page.' : parsed.data.status === 'settled' ? 'Charge recorded as settled. No card payment was taken here.' : parsed.data.status === 'withdrawn' ? 'Charge withdrawn from the customer page.' : 'Charge returned to draft.';
    await redirect(req, res, `/admin/shipments/${id}#charges`, { kind: 'success', message: label });
  });

  r.post('/shipments/:id/estimated-delivery', requirePermission('events.create'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = EstimatedDeliverySchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}`, { kind: 'error', message: 'Use a valid date for the estimated delivery.' });
    await setEstimatedDelivery(db, actorOf(req), id, parsed.data.estimatedDeliveryDate);
    await redirect(req, res, `/admin/shipments/${id}`, { kind: 'success', message: parsed.data.estimatedDeliveryDate ? 'Estimated delivery saved.' : 'Estimated delivery cleared.' });
  });

  r.post('/shipments/:id/codes', requirePermission('tracking_codes.issue'), async (req, res) => {
    const id = req.params.id as string;
    const key = typeof req.body?.requestKey === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(req.body.requestKey) ? (req.body.requestKey as string) : null;
    if (!key) return redirect(req, res, `/admin/shipments/${id}#codes`, { kind: 'error', message: 'The form expired. Please try again.' });
    const result = await issueTrackingCode(db, actorOf(req), id, key, { secret: config.trackingCodeSecret, ttlDays: config.trackingCodeTtlDays });
    if (result.status === 'already_issued') {
      return redirect(req, res, `/admin/shipments/${id}#codes`, { kind: 'error', message: 'A code was already issued from this form. Codes are shown only once; if it was not copied, revoke it and issue a new one.' });
    }
    const shipment = await getShipment(db, id);
    await page(req, res, 'Tracking code issued', codeIssuedPage(config.siteUrl, shipment, result.code, result.expiresAt));
  });

  r.post('/shipments/:id/codes/:credentialId/revoke', requirePermission('tracking_codes.revoke'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = ReasonSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}#codes`, { kind: 'error', message: Object.values(fieldErrors(parsed.error)).join(' ') });
    await revokeTrackingCode(db, actorOf(req), id, req.params.credentialId as string, parsed.data.reason);
    await redirect(req, res, `/admin/shipments/${id}#codes`, { kind: 'success', message: 'Tracking code revoked. It no longer works on the public tracking page.' });
  });

  for (const [action, perm, fn, message] of [
    ['cancel', 'shipments.cancel', cancelShipment, 'Shipment cancelled.'],
    ['archive', 'shipments.archive', archiveShipment, 'Shipment archived.'],
  ] as const) {
    r.post(`/shipments/:id/${action}`, requirePermission(perm), async (req, res) => {
      const id = req.params.id as string;
      const parsed = ReasonSchema.safeParse(bodyValues(req));
      if (!parsed.success) return redirect(req, res, `/admin/shipments/${id}`, { kind: 'error', message: Object.values(fieldErrors(parsed.error)).join(' ') });
      await fn(db, actorOf(req), id, parsed.data.reason);
      await redirect(req, res, `/admin/shipments/${id}`, { kind: 'success', message });
    });
  }

  r.post('/shipments/:id/documents/summary', requirePermission('documents.generate'), async (req, res) => {
    sendPdf(res, await generateShipmentSummary(db, actorOf(req), req.params.id as string));
  });

  // ---- Quotes and messages ----
  r.get('/quotes', requirePermission('quotes.read'), async (req, res) => {
    const status = typeof req.query.status === 'string' && /^[a-z_]{1,20}$/.test(req.query.status) ? req.query.status : undefined;
    const p = pageParam(req);
    const result = await listQuoteRequests(db, { status, page: p, pageSize: PAGE_SIZE });
    await page(req, res, 'Quote requests', quotesListPage(status, qs(req, ['status']), p, PAGE_SIZE, result));
  });

  r.get('/quotes/:id', requirePermission('quotes.read'), async (req, res) => {
    const q = await getQuoteRequest(db, req.params.id as string);
    await page(req, res, q.reference, quoteDetailPage((req as AuthedRequest).session, q));
  });

  r.post('/quotes/:id/status', requirePermission('quotes.manage'), async (req, res) => {
    const id = req.params.id as string;
    const parsed = QuoteStatusSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, `/admin/quotes/${id}`, { kind: 'error', message: 'Choose a valid status.' });
    await updateQuoteStatus(db, actorOf(req), id, parsed.data.status);
    await redirect(req, res, `/admin/quotes/${id}`, { kind: 'success', message: 'Status updated.' });
  });

  r.post('/quotes/:id/documents/estimate', requirePermission('documents.generate'), async (req, res) => {
    sendPdf(res, await generateQuoteEstimate(db, actorOf(req), req.params.id as string));
  });

  r.get('/messages', requirePermission('contact.read'), async (req, res) => {
    const p = pageParam(req);
    const result = await listContactMessages(db, p, PAGE_SIZE);
    await page(req, res, 'Messages', messagesPage((req as AuthedRequest).session, new URLSearchParams(), p, PAGE_SIZE, result));
  });

  r.post('/messages/:id/handled', requirePermission('contact.read'), async (req, res) => {
    await markContactHandled(db, actorOf(req), req.params.id as string);
    await redirect(req, res, '/admin/messages', { kind: 'success', message: 'Message marked as handled.' });
  });

  // ---- Team ----
  r.get('/team', requirePermission('users.manage'), async (req, res) => {
    await page(req, res, 'Team', teamPage((req as AuthedRequest).session, await listUsers(db)));
  });

  r.post('/team', requirePermission('users.manage'), async (req, res) => {
    const session = (req as AuthedRequest).session;
    const values = bodyValues(req);
    const parsed = CreateUserSchema.safeParse(values);
    if (!parsed.success) return page(req, res, 'Team', teamPage(session, await listUsers(db), fieldErrors(parsed.error), values), 400);
    if (parsed.data.role === 'business_customer' || !canAssignRole(session.user.role, session.user.id, null, parsed.data.role)) throw new ForbiddenError('You cannot assign that role.');
    try {
      const actor = actorOf(req);
      const created = await db.transaction((tx) => createUser(tx, actor, parsed.data));
      await page(req, res, 'Account created', temporaryPasswordPage(parsed.data.email, created.temporaryPassword, true));
    } catch (err) {
      if (err instanceof ConflictError) return page(req, res, 'Team', teamPage(session, await listUsers(db), { email: err.publicMessage }, values), 409);
      throw err;
    }
  });

  r.post('/team/:id/role', requirePermission('users.manage'), async (req, res) => {
    const parsed = UpdateRoleSchema.safeParse(bodyValues(req));
    if (!parsed.success || parsed.data.role === 'business_customer') return redirect(req, res, '/admin/team', { kind: 'error', message: 'Choose a valid role.' });
    await changeUserRole(db, actorOf(req), req.params.id as string, parsed.data.role);
    await redirect(req, res, '/admin/team', { kind: 'success', message: 'Role updated. The person has been signed out so the new permissions apply immediately.' });
  });

  r.post('/team/:id/status', requirePermission('users.manage'), async (req, res) => {
    const values = bodyValues(req);
    const parsed = ReasonSchema.safeParse(values);
    const status = values.status === 'disabled' ? 'disabled' : values.status === 'active' ? 'active' : null;
    if (!parsed.success || !status) return redirect(req, res, '/admin/team', { kind: 'error', message: parsed.success ? 'Choose a valid status.' : Object.values(fieldErrors(parsed.error)).join(' ') });
    await setUserStatus(db, actorOf(req), req.params.id as string, status, parsed.data.reason);
    await redirect(req, res, '/admin/team', { kind: 'success', message: status === 'disabled' ? 'Account disabled.' : 'Account re-enabled.' });
  });

  r.post('/team/:id/reset', requirePermission('users.manage'), async (req, res) => {
    const parsed = ReasonSchema.safeParse(bodyValues(req));
    if (!parsed.success) return redirect(req, res, '/admin/team', { kind: 'error', message: Object.values(fieldErrors(parsed.error)).join(' ') });
    const id = req.params.id as string;
    const temp = await resetUserPassword(db, actorOf(req), id, parsed.data.reason);
    const user = (await listUsers(db)).find((u) => u.id === id);
    await page(req, res, 'Password reset', temporaryPasswordPage(user?.email ?? '', temp, false));
  });

  // ---- Audit and settings ----
  r.get('/audit', requirePermission('audit.read'), async (req, res) => {
    const action = typeof req.query.action === 'string' ? req.query.action.trim().slice(0, 60) || undefined : undefined;
    const entityId = typeof req.query.entityId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.entityId) ? req.query.entityId : undefined;
    const p = pageParam(req);
    const result = await listAudit(db, { action, entityId, page: p, pageSize: 50 });
    await page(req, res, 'Audit log', auditPage(qs(req, ['action', 'entityId']), { action, entityId }, p, 50, result));
  });

  r.get('/settings', requirePermission('settings.read'), (req, res) =>
    page(req, res, 'Settings', settingsPage(config, db.kind, (req as AuthedRequest).session.user.role)),
  );

  r.use(async (req, res) => {
    await page(req, res, 'Not found', adminErrorPage(404, 'That page does not exist.'), 404);
  });

  r.use(async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof AppError ? err.status : 500;
    const message = err instanceof AppError ? err.publicMessage : 'Something went wrong. The error has been logged.';
    if (status >= 500) logger.error('admin.error', { path: req.path, error: err instanceof Error ? err.stack : String(err) });
    else if (status === 403) logger.warn('security.forbidden', { path: req.path, user: (req as AuthedRequest).session?.user.id });
    if (res.headersSent) return;
    if (!(req as AuthedRequest).session) {
      res.status(status).type('text/plain').send(message);
      return;
    }
    if (req.method === 'POST' && status < 500 && status !== 403) {
      const detail = /^\/admin\/(shipments|quotes)\/([0-9a-f-]{36})/i.exec(req.originalUrl);
      const list = /^\/admin\/(team|messages)/.exec(req.originalUrl);
      const back = detail ? `/admin/${detail[1]}/${detail[2]}` : list ? `/admin/${list[1]}` : '/admin';
      return redirect(req, res, back, { kind: 'error', message });
    }
    await page(req, res, 'Error', adminErrorPage(status, message), status);
  });

  return r;
}
