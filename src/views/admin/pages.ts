import { html, type SafeHtml } from '../../lib/html.ts';
import type { AppConfig } from '../../config/env.ts';
import { SERVICES, findServiceByCode } from '../../config/services.ts';
import { countryName } from '../../domain/countries.ts';
import { EVENT_SOURCES, EXCEPTION_CATEGORIES, INFO_EVENT_TYPES, SYSTEM_EVENT_TYPES } from '../../domain/events.ts';
import { formatMoney } from '../../domain/money.ts';
import { can, ROLE_LABELS, STAFF_ROLES, canAssignRole, type Role } from '../../domain/permissions.ts';
import type { MilestoneDefinition } from '../../domain/progress.ts';
import { formatDate, formatDateTime } from '../../lib/time.ts';
import type { AuditRow } from '../../services/audit.ts';
import type { Session } from '../../services/auth.ts';
import type { DashboardMetrics } from '../../services/dashboard.ts';
import type { ContactRow, QuoteRequestRow } from '../../services/quotes.ts';
import type { ShipmentDetail, ShipmentListFilters, ShipmentListRow, ShipmentRow } from '../../services/shipments.ts';
import type { UserRow } from '../../services/users.ts';
import { QUOTE_STATUSES, type FieldErrors } from '../../validation/schemas.ts';
import {
  badge, checkboxField, countrySelect, errorSummary, hidden, notice, pagination, progressBar, selectField, textArea, textField, type Values,
} from '../components.ts';
import { icons } from '../icons.ts';
import { csrf } from './layout.ts';

type Milestones = readonly MilestoneDefinition[];

const serviceName = (code: string) => findServiceByCode(code)?.name ?? code;
const milestoneLabel = (defs: Milestones, code: string | null) => (code ? (defs.find((d) => d.code === code)?.label ?? code) : 'Not started');

function eventLabel(defs: Milestones, type: string): string {
  const m = defs.find((d) => d.code === type);
  if (m) return m.label;
  if (type in INFO_EVENT_TYPES) return INFO_EVENT_TYPES[type as keyof typeof INFO_EVENT_TYPES].label;
  if (type in SYSTEM_EVENT_TYPES) return SYSTEM_EVENT_TYPES[type as keyof typeof SYSTEM_EVENT_TYPES].label;
  return type;
}

function stateBadge(s: Pick<ShipmentRow, 'lifecycle_state' | 'delivered_at'>): SafeHtml {
  if (s.lifecycle_state === 'cancelled') return badge('Cancelled', 'danger');
  if (s.lifecycle_state === 'archived') return badge('Archived', 'neutral');
  if (s.delivered_at) return badge('Delivered', 'success');
  return badge('Active', 'info');
}

function pageTitle(title: string, actions?: SafeHtml, sub?: SafeHtml | string): SafeHtml {
  return html`<div class="admin-head"><div><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>${actions ? html`<div class="admin-actions">${actions}</div>` : ''}</div>`;
}

/** A destructive action behind a disclosure, requiring a written reason and an explicit confirmation tick. */
function confirmAction(o: { session: Session; action: string; label: string; warning: string; danger?: boolean; extra?: SafeHtml }): SafeHtml {
  const uid = o.action.replace(/[^a-zA-Z0-9]/g, '-');
  return html`<details class="confirm">
    <summary class="btn btn-sm ${o.danger ? 'btn-danger-ghost' : 'btn-ghost'}">${o.label}</summary>
    <form method="post" action="${o.action}" class="confirm-form">
      ${csrf(o.session)}
      ${o.extra ?? ''}
      <p class="small">${o.warning}</p>
      ${textArea({ name: 'reason', id: `reason${uid}`, label: 'Reason (recorded in the audit log)', required: true, rows: 2, maxlength: 500 })}
      ${checkboxField({ name: 'confirm', id: `confirm${uid}`, label: 'I understand and want to continue', required: true })}
      <button class="btn btn-sm ${o.danger ? 'btn-danger' : 'btn-primary'}" type="submit">${o.label}</button>
    </form>
  </details>`;
}

export function loginPage(o: { csrfToken: string; username: string; error?: string | undefined; next: string }): SafeHtml {
  return html`<div class="card login-card">
    <p class="eyebrow">Control</p>
    <h1 class="h3">Crownline control</h1>
    <p class="muted small">Staff only. This console is separate from the public site. Activity is logged.</p>
    ${o.error ? notice('error', o.error, '') : ''}
    <form method="post" action="/admin/login" novalidate>
      ${hidden('_csrf', o.csrfToken)}
      ${hidden('next', o.next)}
      ${textField({ name: 'username', label: 'Username', type: 'text', required: true, autocomplete: 'username', values: { username: o.username } })}
      ${textField({ name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' })}
      <button class="btn btn-primary btn-block" type="submit">Sign in</button>
    </form>
    <p class="small muted">Forgotten your password? Ask an owner to reset it. Accounts lock for 15 minutes after repeated failed attempts.</p>
  </div>`;
}

export function passwordPage(session: Session, errors?: FieldErrors): SafeHtml {
  return html`${pageTitle('Your account', undefined, `${session.user.email} · ${ROLE_LABELS[session.user.role]}`)}
  ${session.user.mustChangePassword ? notice('warning', 'Choose a new password', 'You signed in with a temporary password. Choose your own password to continue.') : ''}
  <form class="card narrow-form" method="post" action="/admin/account/password" novalidate>
    ${csrf(session)}
    ${errorSummary(errors)}
    ${textField({ name: 'currentPassword', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password', errors })}
    ${textField({ name: 'newPassword', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', errors, hint: 'At least 12 characters. Avoid common words and your email address. A passphrase of several words works well.' })}
    ${textField({ name: 'confirmPassword', label: 'Confirm new password', type: 'password', required: true, autocomplete: 'new-password', errors })}
    <p class="small muted">Changing your password signs out your other sessions.</p>
    <button class="btn btn-primary" type="submit">Change password</button>
  </form>`;
}

export function overviewPage(session: Session, m: DashboardMetrics, period: { from: string; to: string }, recent: ShipmentListRow[], defs: Milestones): SafeHtml {
  const role = session.user.role;
  const tile = (label: string, value: number, href: string | null, tone = '') =>
    html`<div class="metric ${tone}">${href ? html`<a href="${href}"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></a>` : html`<div class="metric-inner"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`}</div>`;
  const ship = can(role, 'shipments.read');
  return html`${pageTitle('Overview', can(role, 'shipments.create') ? html`<a class="btn btn-gold btn-sm" href="/admin/shipments/new">New shipment</a>` : undefined, 'Live counts from the database.')}
  ${ship
    ? html`<section aria-labelledby="now"><h2 id="now" class="h4">Right now</h2>
      <div class="metrics">
        ${tile('Active shipments', m.active, '/admin/shipments?state=active')}
        ${tile('Awaiting collection', m.awaitingCollection, '/admin/shipments?state=active&milestone=booking_confirmed')}
        ${tile('In transit', m.inTransit, null)}
        ${tile('Out for delivery', m.outForDelivery, '/admin/shipments?state=active&milestone=out_for_delivery')}
        ${tile('With open issues', m.withOpenExceptions, '/admin/shipments?exceptions=1', m.withOpenExceptions ? 'metric-alert' : '')}
        ${can(role, 'quotes.read') ? tile('Quote requests to handle', m.quotesAwaitingAction, '/admin/quotes?status=new') : ''}
        ${can(role, 'contact.read') ? tile('New messages', m.unreadContactMessages, '/admin/messages') : ''}
      </div></section>
      <section aria-labelledby="period" class="admin-section">
        <div class="admin-head"><h2 id="period" class="h4">Selected period</h2>
          <form class="inline-form" method="get" action="/admin">
            <label>From <input type="date" name="from" value="${period.from}"></label>
            <label>To <input type="date" name="to" value="${period.to}"></label>
            <button class="btn btn-ghost btn-sm" type="submit">Apply</button>
          </form>
        </div>
        <div class="metrics">${tile('Shipments created', m.createdInPeriod, null)}${tile('Deliveries confirmed', m.deliveredInPeriod, null)}</div>
      </section>
      <section class="admin-section"><h2 class="h4">Recently created</h2>${shipmentTable(recent, defs)}</section>`
    : notice('info', 'Limited access', 'Your role does not include shipment data. Use the navigation to reach the areas you can access.')}`;
}

function shipmentTable(rows: ShipmentListRow[], defs: Milestones): SafeHtml {
  if (rows.length === 0) return html`<p class="muted">No shipments match.</p>`;
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Reference</th><th scope="col">Service</th><th scope="col">Route</th><th scope="col">Milestone</th><th scope="col" class="num">Progress</th><th scope="col">Last update</th><th scope="col">State</th></tr></thead>
    <tbody>${rows.map(
      (s) => html`<tr>
        <td><a href="/admin/shipments/${s.id}"><strong>${s.reference}</strong></a>${s.open_exceptions ? html` ${badge(`${s.open_exceptions} issue${s.open_exceptions > 1 ? 's' : ''}`, 'warning')}` : ''}</td>
        <td>${serviceName(s.service_code)}</td>
        <td>${s.origin_city}, ${s.origin_country} → ${s.destination_city}, ${s.destination_country}</td>
        <td>${milestoneLabel(defs, s.current_milestone)}</td>
        <td class="num">${s.progress_percent}%</td>
        <td>${formatDateTime(s.last_event_at)}</td>
        <td>${stateBadge(s)}</td>
      </tr>`,
    )}</tbody></table></div>`;
}

export function shipmentsListPage(session: Session, f: ShipmentListFilters, params: URLSearchParams, result: { rows: ShipmentListRow[]; total: number }, defs: Milestones): SafeHtml {
  const v: Values = {
    q: f.q, state: f.state ?? 'active', milestone: f.milestone, exceptions: f.exceptions ? '1' : '', from: f.from, to: f.to, sort: f.sort ?? 'created_at', dir: f.dir ?? 'desc',
  };
  return html`${pageTitle('Shipments', can(session.user.role, 'shipments.create') ? html`<a class="btn btn-gold btn-sm" href="/admin/shipments/new">New shipment</a>` : undefined)}
  <form class="card filter-bar" method="get" action="/admin/shipments">
    ${textField({ name: 'q', label: 'Search', values: v, placeholder: 'Reference, city or carrier number', hideOptional: true })}
    ${selectField({ name: 'state', label: 'State', values: v, hideOptional: true, options: [{ value: 'active', label: 'Active' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' }] })}
    ${selectField({ name: 'milestone', label: 'Milestone', values: v, hideOptional: true, placeholderOption: 'Any', options: [{ value: 'none', label: 'Not started' }, ...defs.map((d) => ({ value: d.code, label: d.label }))] })}
    ${selectField({ name: 'exceptions', label: 'Issues', values: v, hideOptional: true, options: [{ value: '', label: 'Any' }, { value: '1', label: 'Open issues only' }] })}
    ${textField({ name: 'from', label: 'Created from', type: 'date', values: v, hideOptional: true })}
    ${textField({ name: 'to', label: 'Created to', type: 'date', values: v, hideOptional: true })}
    ${selectField({ name: 'sort', label: 'Sort by', values: v, hideOptional: true, options: [{ value: 'created_at', label: 'Created' }, { value: 'last_event_at', label: 'Last update' }, { value: 'reference', label: 'Reference' }, { value: 'progress_percent', label: 'Progress' }] })}
    ${selectField({ name: 'dir', label: 'Order', values: v, hideOptional: true, options: [{ value: 'desc', label: 'Newest / highest first' }, { value: 'asc', label: 'Oldest / lowest first' }] })}
    <div class="filter-actions"><button class="btn btn-primary btn-sm" type="submit">Apply</button><a class="btn btn-ghost btn-sm" href="/admin/shipments">Reset</a></div>
  </form>
  ${shipmentTable(result.rows, defs)}
  ${pagination('/admin/shipments', params, f.page, f.pageSize, result.total)}`;
}

export function newShipmentPage(session: Session, values: Values, errors: FieldErrors | undefined, key: string): SafeHtml {
  const v: Values = { shipmentType: 'parcel', quantity: '1', weightUnit: 'kg', lengthUnit: 'cm', recordBooking: 'on', ...values };
  const services = SERVICES.filter((s) => s.availability === 'quote_on_request').map((s) => ({ value: s.code, label: s.name }));
  const party = (p: 'sender' | 'recipient', title: string) => html`<fieldset class="fieldset"><legend>${title}</legend><div class="grid-2">
    ${textField({ name: `${p}Name`, label: 'Name', values: v, errors, required: true, maxlength: 160 })}
    ${textField({ name: `${p}Company`, label: 'Company', values: v, errors, maxlength: 160 })}
    ${textField({ name: `${p}Email`, label: 'Email', type: 'email', values: v, errors, maxlength: 254 })}
    ${textField({ name: `${p}Phone`, label: 'Phone', type: 'tel', values: v, errors, maxlength: 40 })}
    ${textField({ name: `${p}Address1`, label: 'Address line 1', values: v, errors, maxlength: 200 })}
    ${textField({ name: `${p}Address2`, label: 'Address line 2', values: v, errors, maxlength: 200 })}
    ${textField({ name: `${p}PostalCode`, label: 'Postal code', values: v, errors, maxlength: 20 })}
  </div></fieldset>`;
  return html`${pageTitle('New shipment', html`<a class="btn btn-ghost btn-sm" href="/admin/shipments">Cancel</a>`)}
  <form class="card" method="post" action="/admin/shipments" novalidate>
    ${csrf(session)}${hidden('idempotencyKey', key)}
    ${errorSummary(errors)}
    <fieldset class="fieldset"><legend>Service</legend><div class="grid-2">
      ${selectField({ name: 'serviceCode', label: 'Service', values: v, errors, required: true, options: services, placeholderOption: 'Choose a service' })}
      ${selectField({ name: 'shipmentType', label: 'Shipment type', values: v, errors, required: true, options: [{ value: 'parcel', label: 'Parcel' }, { value: 'document', label: 'Document' }, { value: 'pallet', label: 'Pallet' }, { value: 'freight', label: 'Freight' }] })}
      ${textField({ name: 'carrierName', label: 'Carrier or transport partner', values: v, errors, maxlength: 100, hint: 'Only enter a carrier once the booking with them is confirmed.' })}
      ${textField({ name: 'carrierTrackingNumber', label: 'Carrier tracking number', values: v, errors, maxlength: 100 })}
    </div></fieldset>
    <fieldset class="fieldset"><legend>Route</legend><div class="grid-2">
      ${countrySelect({ name: 'originCountry', label: 'Origin country', values: v, errors, required: true })}
      ${countrySelect({ name: 'destinationCountry', label: 'Destination country', values: v, errors, required: true })}
      ${textField({ name: 'originCity', label: 'Origin city', values: v, errors, required: true, maxlength: 100 })}
      ${textField({ name: 'destinationCity', label: 'Destination city', values: v, errors, required: true, maxlength: 100 })}
      ${textField({ name: 'originRegion', label: 'Origin region / state', values: v, errors, maxlength: 100 })}
      ${textField({ name: 'destinationRegion', label: 'Destination region / state', values: v, errors, maxlength: 100 })}
      ${textField({ name: 'originPostalCode', label: 'Origin postal code', values: v, errors, maxlength: 20 })}
      ${textField({ name: 'destinationPostalCode', label: 'Destination postal code', values: v, errors, maxlength: 20 })}
    </div></fieldset>
    ${party('sender', 'Sender')}
    ${party('recipient', 'Recipient')}
    <fieldset class="fieldset"><legend>Measurement</legend>
      <p class="small muted">Weight and size are stored with the shipment. Leave distance blank to use the estimated straight-line kilometres between country midpoints. That figure is not the carrier route. Declared value and cover are set here, not by the visitor.</p>
      <div class="grid-4">
        ${textField({ name: 'quantity', label: 'Quantity', type: 'number', values: v, errors, required: true, min: '1', step: '1' })}
        ${textField({ name: 'weight', label: 'Weight each', type: 'number', values: v, errors, required: true, step: 'any' })}
        ${selectField({ name: 'weightUnit', label: 'Weight unit', values: v, errors, required: true, options: [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }] })}
        ${selectField({ name: 'lengthUnit', label: 'Size unit', values: v, errors, required: true, options: [{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }] })}
      </div>
      <div class="grid-3">
        ${textField({ name: 'length', label: 'Length', type: 'number', values: v, errors, required: true, step: 'any' })}
        ${textField({ name: 'width', label: 'Width', type: 'number', values: v, errors, required: true, step: 'any' })}
        ${textField({ name: 'height', label: 'Height', type: 'number', values: v, errors, required: true, step: 'any' })}
      </div>
      <div class="grid-2">
        ${textField({ name: 'packageDescription', label: 'Package description', values: v, errors, maxlength: 200 })}
        ${textField({ name: 'contentsDescription', label: 'Contents (internal)', values: v, errors, maxlength: 500 })}
        ${textField({ name: 'declaredValue', label: 'Declared value', type: 'number', values: v, errors, step: 'any', hint: 'Required if cover is included. The customer tracking page does not show this amount.' })}
        ${textField({ name: 'declaredValueCurrency', label: 'Currency', values: v, errors, maxlength: 3, placeholder: 'USD' })}
        ${textField({ name: 'distanceKm', label: 'Distance (km)', type: 'number', values: v, errors, min: '0', step: 'any', hint: 'Optional. A blank field uses the straight-line estimate.' })}
        ${checkboxField({ name: 'coverIncluded', label: 'Include shipment cover', hint: 'Cover is added to the staff estimate only when this is selected and a declared value is entered.', checked: v.coverIncluded === 'on' || v.coverIncluded === 'true', errors })}
      </div>
    </fieldset>
    <fieldset class="fieldset"><legend>Status</legend>
      ${textField({ name: 'estimatedDeliveryDate', label: 'Estimated delivery date', type: 'date', values: v, errors, hint: 'Only if a carrier or coordinator has a reliable estimate. Shown to customers as a Crownline estimate.' })}
      ${checkboxField({ name: 'recordBooking', label: 'Record “Booking confirmed” now', checked: v.recordBooking === 'on', errors })}
    </fieldset>
    <button class="btn btn-gold" type="submit">Create shipment</button>
  </form>`;
}

const COMMON_TIME_ZONES = ['UTC', 'Europe/London', 'Europe/Amsterdam', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Africa/Lagos', 'Africa/Johannesburg'];

export interface DetailExtras {
  eventErrors?: FieldErrors | undefined;
  eventValues?: Values | undefined;
  exceptionErrors?: FieldErrors | undefined;
  chargeErrors?: FieldErrors | undefined;
  chargeValues?: Values | undefined;
  issueKey: string;
  coverNote?: string | undefined;
}

export function shipmentDetailPage(session: Session, d: ShipmentDetail, defs: Milestones, x: DetailExtras): SafeHtml {
  const s = d.shipment;
  const role = session.user.role;
  const active = s.lifecycle_state === 'active';
  const intl = s.origin_country !== s.destination_country;
  const openExceptions = d.exceptions.filter((e) => !e.resolved_at);
  const liveCodes = d.credentials.filter((c) => !c.revoked_at && (!c.expires_at || c.expires_at > new Date()));
  const base = `/admin/shipments/${s.id}`;
  const ev: Values = { timeZone: 'UTC', ...x.eventValues };

  const eventOptions = [
    ...defs.filter((m) => intl || !m.internationalOnly).map((m) => ({ value: m.code, label: `Milestone · ${m.label} (${m.progressPercent}%)`, disabled: m.code === 'delivered' && !can(role, 'events.confirm_delivery') })),
    ...Object.entries(INFO_EVENT_TYPES).map(([k, t]) => ({ value: k, label: `Update · ${t.label}` })),
  ];

  return html`${pageTitle(s.reference, html`<a class="btn btn-ghost btn-sm" href="/admin/shipments">All shipments</a>${can(role, 'audit.read') ? html`<a class="btn btn-ghost btn-sm" href="/admin/audit?entityId=${s.id}">Audit trail</a>` : ''}`,
    html`${serviceName(s.service_code)} · ${s.origin_city}, ${countryName(s.origin_country)} → ${s.destination_city}, ${countryName(s.destination_country)}`)}

  <div class="detail-grid">
    <section class="card">
      <div class="status-row">${stateBadge(s)} ${openExceptions.length ? badge(`${openExceptions.length} open issue${openExceptions.length > 1 ? 's' : ''}`, 'warning') : ''}</div>
      ${progressBar(s.display_progress ?? s.progress_percent, s.display_progress === null ? milestoneLabel(defs, s.current_milestone) : 'Coordinator figure')}
      ${s.display_progress !== null ? html`<p class="small muted">Milestone calculation is ${s.progress_percent}%. The customer page shows ${s.display_progress}% until you clear it. Delivery still shows 100%.</p>` : ''}
      <dl class="dl dl-cols">
        <div><dt>Last confirmed update</dt><dd>${formatDateTime(s.last_event_at)}</dd></div>
        <div><dt>Delivered</dt><dd>${s.delivered_at ? formatDateTime(s.delivered_at) : '—'}</dd></div>
        <div><dt>Estimated delivery</dt><dd>${s.estimated_delivery_date ? html`${formatDate(s.estimated_delivery_date)} <span class="muted small">(${s.estimated_delivery_source === 'carrier' ? 'carrier' : 'staff estimate'})</span>` : 'Not set'}</dd></div>
        <div><dt>Carrier</dt><dd>${s.carrier_name ?? 'Not assigned'}${s.carrier_tracking_number ? html` · ${s.carrier_tracking_number}` : ''}</dd></div>
        <div><dt>Contents</dt><dd>${s.contents_description ?? '—'}</dd></div>
        <div><dt>Declared value</dt><dd>${s.declared_value_minor !== null ? formatMoney(s.declared_value_minor, s.declared_value_currency ?? 'USD') : '—'}</dd></div>
        <div><dt>Distance</dt><dd>${s.distance_km == null ? 'Not estimated' : html`${Number(s.distance_km).toLocaleString('en-US')} km <span class="muted small">(${s.distance_source === 'coordinator' ? 'entered by a coordinator' : 'estimated straight-line, not the carrier route'})</span>`}</dd></div>
        <div><dt>Cover</dt><dd>${x.coverNote ?? (s.cover_included ? 'Included' : 'Not included')}</dd></div>
        <div><dt>Created</dt><dd>${formatDateTime(s.created_at)}</dd></div>
        ${s.cancelled_at ? html`<div><dt>Cancelled</dt><dd>${formatDateTime(s.cancelled_at)} · ${s.cancel_reason}</dd></div>` : ''}
        ${s.archived_at ? html`<div><dt>Archived</dt><dd>${formatDateTime(s.archived_at)}</dd></div>` : ''}
      </dl>
      ${active && can(role, 'events.create')
        ? html`<form class="inline-form" method="post" action="${base}/estimated-delivery">${csrf(session)}
            <label>Estimated delivery <input type="date" name="estimatedDeliveryDate" value="${s.estimated_delivery_date ?? ''}"></label>
            <button class="btn btn-ghost btn-sm" type="submit">Save estimate</button>
            <span class="small muted">Leave empty to clear.</span></form>`
        : ''}
    </section>

    <section class="card">
      <h2 class="h4">Parties</h2>
      <div class="grid-2">${d.parties.map(
        (p) => html`<div><h3 class="h5">${p.party_role === 'sender' ? 'Sender' : 'Recipient'}</h3>
          <p>${p.name}${p.company ? html`<br>${p.company}` : ''}<br>
          ${[p.address_line1, p.address_line2].filter(Boolean).join(', ')}${p.address_line1 ? html`<br>` : ''}
          ${[p.postal_code, p.city].filter(Boolean).join(' ')}${p.country ? `, ${countryName(p.country)}` : ''}</p>
          <p class="small">${p.email ?? ''}${p.email && p.phone ? ' · ' : ''}${p.phone ?? ''}</p></div>`,
      )}</div>
      <h2 class="h4">Packages</h2>
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th scope="col">#</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Weight each</th><th scope="col">Dimensions</th><th scope="col">Description</th></tr></thead>
        <tbody>${d.packages.map((p) => html`<tr><td>${p.package_index}</td><td class="num">${p.quantity}</td><td class="num">${Number(p.weight_kg).toFixed(2)} kg</td><td>${Number(p.length_cm).toFixed(1)} × ${Number(p.width_cm).toFixed(1)} × ${Number(p.height_cm).toFixed(1)} cm</td><td>${p.description ?? '—'}</td></tr>`)}</tbody></table></div>
    </section>
  </div>

  ${active && can(role, 'events.create')
    ? html`<section class="card admin-section" id="progress">
        <h2 class="h4">Progress the customer sees</h2>
        <p class="small muted">Leave this empty to follow the milestone percentage (${s.progress_percent}%). A number here is what an open tracking page shows. It is not a vehicle position. 100% appears only after delivery is confirmed with evidence.</p>
        <form class="inline-form" method="post" action="${base}/progress#progress">${csrf(session)}
          <label>Percentage <input name="displayProgress" type="number" min="0" max="99" step="1" value="${s.display_progress ?? ''}" inputmode="numeric"></label>
          <button class="btn btn-primary btn-sm" type="submit">Save percentage</button>
          <button class="btn btn-ghost btn-sm" type="submit" name="clear" value="1">Use milestone percentage</button>
        </form>
      </section>`
    : ''}

  ${can(role, 'charges.manage')
    ? html`<section class="card admin-section" id="charges">
        <h2 class="h4">Charges for the customer page</h2>
        <p class="small muted">Drafts stay in this console. Published and settled charges appear on the tracking page for anyone with the code. Settled means you recorded that it was paid elsewhere. This console does not take card payments.</p>
        ${d.charges.length === 0 ? html`<p class="muted small">No charges yet.</p>` : html`<div class="table-wrap"><table class="table table-compact">
          <thead><tr><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">On the tracking page</th></tr></thead>
          <tbody>${d.charges.map((c) => html`<tr>
            <td>${c.description}${c.public_note ? html`<span class="cell-note">${c.public_note}</span>` : ''}</td>
            <td>${formatMoney(c.amount_minor, c.currency)}</td>
            <td>${c.status}</td>
            <td>${active ? html`<form class="inline-form" method="post" action="${base}/charges/${c.id}#charges">${csrf(session)}
              <button class="btn btn-ghost btn-sm" name="status" value="published" type="submit">Publish</button>
              <button class="btn btn-ghost btn-sm" name="status" value="settled" type="submit">Record settled</button>
              <button class="btn btn-ghost btn-sm" name="status" value="draft" type="submit">Draft</button>
              <button class="btn btn-ghost btn-sm" name="status" value="withdrawn" type="submit">Withdraw</button>
            </form>` : c.status}</td>
          </tr>`)}</tbody>
        </table></div>`}
        ${active ? html`<form method="post" action="${base}/charges#charges" novalidate>${csrf(session)}
          ${errorSummary(x.chargeErrors)}
          <div class="grid-3">
            ${textField({ name: 'description', label: 'Description', values: x.chargeValues, errors: x.chargeErrors, required: true, maxlength: 160 })}
            ${textField({ name: 'amount', label: 'Amount', values: x.chargeValues, errors: x.chargeErrors, required: true, inputmode: 'decimal' })}
            ${textField({ name: 'currency', label: 'Currency', values: x.chargeValues, errors: x.chargeErrors, required: true, maxlength: 3, placeholder: 'USD' })}
            ${textField({ name: 'issuedOn', label: 'Issue date', type: 'date', values: x.chargeValues, errors: x.chargeErrors })}
          </div>
          ${textArea({ name: 'publicNote', label: 'Note for the customer', values: x.chargeValues, errors: x.chargeErrors, rows: 2, maxlength: 300 })}
          <div class="inline-form">
            <button class="btn btn-ghost" name="visibility" value="draft" type="submit">Save draft</button>
            <button class="btn btn-primary" name="visibility" value="published" type="submit">Publish to tracking</button>
          </div>
        </form>` : ''}
      </section>`
    : ''}

  ${active && can(role, 'events.create')
    ? html`<section class="card admin-section" id="record-event">
        <h2 class="h4">Record a confirmed event</h2>
        <p class="small muted">Record only events confirmed by the carrier, a scan or our own handling. The time can be earlier than today: use the date and time it actually happened. Customers see the event type, time, location and the public note. An open tracking page picks this up without a new search. Milestone progress never goes backwards because of an out-of-order event.</p>
        <form method="post" action="${base}/events#record-event" novalidate>
          ${csrf(session)}
          ${errorSummary(x.eventErrors)}
          <div class="grid-3">
            ${selectField({ name: 'eventType', label: 'Event', values: ev, errors: x.eventErrors, required: true, options: eventOptions, placeholderOption: 'Choose an event' })}
            ${textField({ name: 'occurredAtLocal', label: 'Happened at (local time)', type: 'datetime-local', values: ev, errors: x.eventErrors, required: true })}
            <div class="field ${x.eventErrors?.timeZone ? 'has-error' : ''}">
              <label for="f-timeZone">Time zone of that location</label>
              ${x.eventErrors?.timeZone ? html`<p class="field-error">${x.eventErrors.timeZone}</p>` : ''}
              <input id="f-timeZone" name="timeZone" list="tz-list" value="${ev.timeZone ?? 'UTC'}" required>
              <datalist id="tz-list">${COMMON_TIME_ZONES.map((t) => html`<option value="${t}"></option>`)}</datalist>
            </div>
            ${textField({ name: 'locationLabel', label: 'Location (city or facility)', values: ev, errors: x.eventErrors, maxlength: 120 })}
            ${countrySelect({ name: 'locationCountry', label: 'Location country', values: ev, errors: x.eventErrors })}
            ${textField({ name: 'evidenceReference', label: 'Evidence reference', values: ev, errors: x.eventErrors, maxlength: 200, hint: 'Required for delivery, e.g. carrier POD reference or signatory name.' })}
          </div>
          <div class="grid-2">
            ${textArea({ name: 'publicNote', label: 'Note for the customer', values: ev, errors: x.eventErrors, rows: 2, maxlength: 500, hint: 'Visible on the public tracking page.' })}
            ${textArea({ name: 'internalNote', label: 'Internal note', values: ev, errors: x.eventErrors, rows: 2, maxlength: 1000, hint: 'Staff only.' })}
          </div>
          <button class="btn btn-primary" type="submit">Record event</button>
        </form>
      </section>`
    : ''}

  <section class="card admin-section">
    <h2 class="h4">Event history</h2>
    ${d.events.length === 0
      ? html`<p class="muted">No events recorded yet.</p>`
      : html`<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Location</th><th scope="col">Notes</th><th scope="col">Source</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${d.events.map(
          (e) => html`<tr class="${e.voided_at ? 'row-voided' : ''}">
            <td>${formatDateTime(e.occurred_at, e.occurred_timezone ?? 'UTC')}<span class="cell-note">recorded ${formatDateTime(e.created_at)}</span></td>
            <td>${eventLabel(defs, e.event_type)} ${e.category === 'exception' ? badge('Issue', 'warning') : ''}${e.voided_at ? html` ${badge('Voided', 'danger')}<span class="cell-note">${e.void_reason}</span>` : ''}</td>
            <td>${e.location_label ?? '—'}${e.location_country ? `, ${e.location_country}` : ''}</td>
            <td>${e.public_note ? html`<span>${e.public_note}</span>` : ''}${e.internal_note ? html`<span class="cell-note">Internal: ${e.internal_note}</span>` : ''}${e.evidence_reference ? html`<span class="cell-note">Evidence: ${e.evidence_reference}</span>` : ''}</td>
            <td>${EVENT_SOURCES[e.source]}${e.recorded_by_name ? html`<span class="cell-note">${e.recorded_by_name}</span>` : ''}</td>
            <td>${active && !e.voided_at && can(role, 'events.void') && e.category !== 'exception' && e.event_type !== 'exception_resolved'
              ? confirmAction({ session, action: `${base}/events/${e.id}/void`, label: 'Void', warning: 'Voiding removes this event from tracking and recalculates progress. The original stays in the history.', danger: true })
              : ''}</td>
          </tr>`,
        )}</tbody></table></div>`}
  </section>

  <div class="detail-grid admin-section">
    <section class="card" id="issues">
      <h2 class="h4">Issues</h2>
      ${d.exceptions.length === 0 ? html`<p class="muted small">No issues reported.</p>` : html`<ul class="issue-list">${d.exceptions.map(
        (e) => html`<li class="${e.resolved_at ? 'resolved' : ''}">
          <p><strong>${EXCEPTION_CATEGORIES[e.category].label}</strong> ${e.resolved_at ? badge('Resolved', 'success') : badge('Open', 'warning')}</p>
          <p class="small">${e.customer_message}</p>
          ${e.internal_note ? html`<p class="small muted">Internal: ${e.internal_note}</p>` : ''}
          <p class="small muted">Opened ${formatDateTime(e.opened_at)}${e.opened_by_name ? ` by ${e.opened_by_name}` : ''}${e.resolved_at ? html` · resolved ${formatDateTime(e.resolved_at)}: ${e.resolution_note}` : ''}</p>
          ${!e.resolved_at && active && can(role, 'exceptions.manage')
            ? html`<form class="inline-form" method="post" action="${base}/exceptions/${e.id}/resolve">${csrf(session)}
                <label class="grow">Resolution <input name="resolutionNote" required maxlength="500"></label>
                <button class="btn btn-ghost btn-sm" type="submit">Mark resolved</button></form>`
            : ''}
        </li>`,
      )}</ul>`}
      ${active && can(role, 'exceptions.manage')
        ? html`<details class="subform"><summary class="btn btn-ghost btn-sm">Report an issue</summary>
            <form method="post" action="${base}/exceptions#issues" novalidate>${csrf(session)}
              ${errorSummary(x.exceptionErrors, undefined, 'x-')}
              ${selectField({ name: 'category', id: 'x-category', label: 'Category', required: true, errors: x.exceptionErrors, options: Object.entries(EXCEPTION_CATEGORIES).map(([k, c]) => ({ value: k, label: c.label })) })}
              ${textArea({ name: 'customerMessage', id: 'x-customerMessage', label: 'Message for the customer', rows: 2, maxlength: 500, errors: x.exceptionErrors, hint: 'Leave empty to use the standard wording for the category.' })}
              ${textArea({ name: 'internalNote', id: 'x-internalNote', label: 'Internal note', rows: 2, maxlength: 1000, errors: x.exceptionErrors })}
              <button class="btn btn-primary btn-sm" type="submit">Report issue</button>
            </form></details>`
        : ''}
    </section>

    <section class="card" id="codes">
      <h2 class="h4">Tracking codes</h2>
      <p class="small muted">Codes are stored as one-way hashes. A code is shown once when issued; if it is lost, revoke it and issue a new one.</p>
      ${d.credentials.length === 0 ? html`<p class="muted small">No codes issued.</p>` : html`<ul class="issue-list">${d.credentials.map((c) => {
        const expired = c.expires_at && c.expires_at <= new Date();
        return html`<li>
          <p><strong>…${c.code_hint}</strong> ${c.revoked_at ? badge('Revoked', 'danger') : expired ? badge('Expired', 'neutral') : badge('Active', 'success')}</p>
          <p class="small muted">Issued ${formatDateTime(c.issued_at)}${c.issued_by_name ? ` by ${c.issued_by_name}` : ''}${c.expires_at ? ` · expires ${formatDateTime(c.expires_at)}` : ''}</p>
          ${c.revoked_at ? html`<p class="small muted">Revoked ${formatDateTime(c.revoked_at)}: ${c.revoke_reason}</p>` : ''}
          ${!c.revoked_at && can(role, 'tracking_codes.revoke')
            ? confirmAction({ session, action: `${base}/codes/${c.id}/revoke`, label: 'Revoke', warning: 'The code stops working immediately for everyone who has it. Revoked codes are never reused.', danger: true })
            : ''}
        </li>`;
      })}</ul>`}
      ${active && can(role, 'tracking_codes.issue')
        ? html`<form method="post" action="${base}/codes">${csrf(session)}${hidden('requestKey', x.issueKey)}
            <button class="btn btn-gold btn-sm" type="submit">${liveCodes.length ? 'Issue an additional code' : 'Issue tracking code'}</button></form>`
        : ''}
    </section>
  </div>

  <div class="detail-grid admin-section">
    ${can(role, 'documents.generate')
      ? html`<section class="card"><h2 class="h4">Documents</h2>
          <p class="small muted">Crownline shipment summaries are generated from the current record. They are not carrier labels, customs documents or proof of delivery.</p>
          <form method="post" action="${base}/documents/summary">${csrf(session)}<button class="btn btn-ghost btn-sm" type="submit">${icons.document()} Download shipment summary (PDF)</button></form>
          ${d.documents.length ? html`<ul class="list-tight small">${d.documents.map((doc) => html`<li>${doc.reference} · ${formatDateTime(doc.generated_at)}${doc.generated_by_name ? ` · ${doc.generated_by_name}` : ''}</li>`)}</ul>` : ''}
        </section>`
      : ''}
    <section class="card"><h2 class="h4">Lifecycle</h2>
      ${active && !s.delivered_at && can(role, 'shipments.cancel')
        ? confirmAction({ session, action: `${base}/cancel`, label: 'Cancel shipment', warning: 'Cancelling stops further updates. Customers with a tracking code will see that the shipment was cancelled.', danger: true })
        : ''}
      ${s.lifecycle_state !== 'archived' && (s.lifecycle_state === 'cancelled' || s.delivered_at) && can(role, 'shipments.archive')
        ? confirmAction({ session, action: `${base}/archive`, label: 'Archive shipment', warning: 'Archived shipments are read-only and no longer visible on public tracking. Records are kept, not deleted.' })
        : ''}
      ${!active ? html`<p class="small muted">This shipment is ${s.lifecycle_state} and read-only.</p>` : ''}
      ${active && s.delivered_at ? html`<p class="small muted">Delivered shipments can be archived once no further updates are expected.</p>` : ''}
    </section>
  </div>`;
}

export function codeIssuedPage(siteUrl: string, shipment: ShipmentRow, code: string, expiresAt: Date | null): SafeHtml {
  const customerUrl = `${siteUrl}/track?code=${encodeURIComponent(code)}`;
  const staffUrl = `${siteUrl}/admin/shipments/${shipment.id}`;
  return html`${pageTitle('Tracking code issued', undefined, shipment.reference)}
  <div class="card narrow-form" tabindex="-1" data-autofocus>
    ${notice('warning', 'Copy this code now', 'For security it is stored only as a one-way hash and cannot be shown again. If it is lost, revoke it and issue a new one.')}
    <p class="code-display">${code}</p>
    <p class="small">${expiresAt ? `Valid until ${formatDateTime(expiresAt)}.` : 'Valid until revoked or the shipment is archived.'} Share the customer link only with the sender or recipient.</p>
    <div class="field"><label for="customer-link">Customer tracking link</label><input id="customer-link" readonly value="${customerUrl}"></div>
    <p class="small"><a href="${customerUrl}">Open the customer tracking page</a></p>
    <div class="field"><label for="staff-link">Staff shipment link</label><input id="staff-link" readonly value="${staffUrl}"></div>
    <p class="small">The staff link still requires a staff sign-in. Customers do not receive an admin password.</p>
    <a class="btn btn-primary" href="/admin/shipments/${shipment.id}#codes">Back to the shipment</a>
  </div>`;
}

export function quotesListPage(status: string | undefined, params: URLSearchParams, page: number, pageSize: number, result: { rows: QuoteRequestRow[]; total: number }): SafeHtml {
  return html`${pageTitle('Quote requests')}
  <form class="inline-form card" method="get" action="/admin/quotes">
    ${selectField({ name: 'status', label: 'Status', values: { status }, hideOptional: true, placeholderOption: 'All', options: QUOTE_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) })}
    <button class="btn btn-ghost btn-sm" type="submit">Filter</button>
  </form>
  ${result.rows.length === 0 ? html`<p class="muted">No quote requests.</p>` : html`<div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Reference</th><th scope="col">Received</th><th scope="col">Contact</th><th scope="col">Service</th><th scope="col">Route</th><th scope="col">Status</th></tr></thead>
    <tbody>${result.rows.map((q) => html`<tr>
      <td><a href="/admin/quotes/${q.id}"><strong>${q.reference}</strong></a></td>
      <td>${formatDateTime(q.created_at)}</td>
      <td>${q.contact_name}${q.company ? html`<span class="cell-note">${q.company}</span>` : ''}</td>
      <td>${serviceName(q.service_code)}</td>
      <td>${q.origin_country} → ${q.destination_country}</td>
      <td>${badge(q.status.replace('_', ' '), q.status === 'new' ? 'gold' : 'neutral')}</td>
    </tr>`)}</tbody></table></div>`}
  ${pagination('/admin/quotes', params, page, pageSize, result.total)}`;
}

export function quoteDetailPage(session: Session, q: QuoteRequestRow): SafeHtml {
  const est = q.estimate;
  return html`${pageTitle(q.reference, html`<a class="btn btn-ghost btn-sm" href="/admin/quotes">All quote requests</a>`, `Received ${formatDateTime(q.created_at)}`)}
  <div class="detail-grid">
    <section class="card"><h2 class="h4">Request</h2>
      <dl class="dl dl-cols">
        <div><dt>Contact</dt><dd>${q.contact_name}</dd></div>
        <div><dt>Email</dt><dd><a href="mailto:${q.contact_email}">${q.contact_email}</a></dd></div>
        <div><dt>Phone</dt><dd>${q.contact_phone ?? '—'}</dd></div>
        <div><dt>Company</dt><dd>${q.company ?? '—'}</dd></div>
        <div><dt>Service</dt><dd>${serviceName(q.service_code)} · ${q.shipment_type}</dd></div>
        <div><dt>From</dt><dd>${[q.origin_city, q.origin_postal_code].filter(Boolean).join(' ')} ${countryName(q.origin_country)}</dd></div>
        <div><dt>To</dt><dd>${[q.destination_city, q.destination_postal_code].filter(Boolean).join(' ')} ${countryName(q.destination_country)}</dd></div>
        <div><dt>Declared value</dt><dd>${q.declared_value_minor !== null ? formatMoney(q.declared_value_minor, q.currency ?? 'USD') : '—'}</dd></div>
      </dl>
      <h3 class="h5">Packages</h3>
      <ul class="list-tight">${q.packages.map((p) => html`<li>${p.quantity} × ${p.weight} ${p.weightUnit}, ${p.length} × ${p.width} × ${p.height} ${p.lengthUnit}</li>`)}</ul>
      ${q.notes ? html`<h3 class="h5">Notes</h3><p class="prewrap">${q.notes}</p>` : ''}
    </section>
    <section class="card"><h2 class="h4">Estimate at submission</h2>
      ${est
        ? html`<p>${est.isDemonstration ? badge('Demonstration figures', 'warning') : badge(est.pricingMode, 'neutral')}</p>
          <dl class="dl"><div><dt>Billable weight</dt><dd>${est.weights.billableKg.toFixed(2)} kg (${est.weights.basis})</dd></div>
          ${est.totalMinor !== null ? html`<div><dt>Total</dt><dd><strong>${formatMoney(est.totalMinor, est.currency)}</strong></dd></div>` : ''}
          <div><dt>Rate card</dt><dd>${est.rateCardLabel} (${est.rateCardVersion})</dd></div></dl>
          <p class="small muted">Recalculated on the server at submission. Confirm the price before replying to the customer.</p>`
        : html`<p class="muted">No online estimate was available for this request.</p>`}
      ${can(session.user.role, 'quotes.manage')
        ? html`<form class="inline-form" method="post" action="/admin/quotes/${q.id}/status">${csrf(session)}
            ${selectField({ name: 'status', label: 'Status', values: { status: q.status }, required: true, options: QUOTE_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) })}
            <button class="btn btn-primary btn-sm" type="submit">Update status</button></form>`
        : html`<p>Status: ${badge(q.status, 'neutral')}</p>`}
      ${can(session.user.role, 'documents.generate')
        ? html`<form method="post" action="/admin/quotes/${q.id}/documents/estimate">${csrf(session)}<button class="btn btn-ghost btn-sm" type="submit" ${est ? '' : 'disabled'}>${icons.document()} Download estimate (PDF)</button></form>`
        : ''}
    </section>
  </div>`;
}

export function messagesPage(session: Session, params: URLSearchParams, page: number, pageSize: number, result: { rows: ContactRow[]; total: number }): SafeHtml {
  return html`${pageTitle('Messages', undefined, 'Messages sent through the public contact form. Reply by email from your own mailbox.')}
  ${result.rows.length === 0 ? html`<p class="muted">No messages.</p>` : html`<ul class="message-list">${result.rows.map((m) => html`<li class="card ${m.status === 'handled' ? 'resolved' : ''}">
    <p><strong>${m.name}</strong> · <a href="mailto:${m.email}">${m.email}</a> · ${badge(m.topic, 'neutral')} ${m.status === 'new' ? badge('New', 'gold') : badge('Handled', 'success')} <span class="muted small">${formatDateTime(m.created_at)}</span></p>
    <p class="prewrap">${m.message}</p>
    ${m.status === 'new' ? html`<form method="post" action="/admin/messages/${m.id}/handled">${csrf(session)}<button class="btn btn-ghost btn-sm" type="submit">Mark as handled</button></form>` : ''}</li>`)}</ul>`}
  ${pagination('/admin/messages', params, page, pageSize, result.total)}`;
}

export function teamPage(session: Session, users: UserRow[], errors?: FieldErrors, values?: Values): SafeHtml {
  const actorRole = session.user.role;
  const assignable = (targetId: string | null) => STAFF_ROLES.filter((r) => canAssignRole(actorRole, session.user.id, targetId, r));
  return html`${pageTitle('Team', undefined, 'Staff accounts and roles. Permissions are enforced on the server for every action.')}
  <div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
    <tbody>${users.map((u) => {
      const self = u.id === session.user.id;
      const roles = assignable(u.id);
      return html`<tr>
        <td><strong>${u.display_name}</strong><span class="cell-note">${u.email}</span></td>
        <td>${self || roles.length === 0 ? ROLE_LABELS[u.role] : html`<form class="inline-form" method="post" action="/admin/team/${u.id}/role">${csrf(session)}
            <label class="visually-hidden" for="role-${u.id}">Role for ${u.display_name}</label>
            <select id="role-${u.id}" name="role">${roles.map((r) => html`<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`)}</select>
            <button class="btn btn-ghost btn-sm" type="submit">Save</button></form>`}</td>
        <td>${u.status === 'active' ? badge('Active', 'success') : badge('Disabled', 'danger')}${u.must_change_password ? html` ${badge('Temporary password', 'warning')}` : ''}${u.locked_until && u.locked_until > new Date() ? html` ${badge('Locked', 'warning')}` : ''}</td>
        <td>${formatDateTime(u.last_login_at)}</td>
        <td class="actions-cell">${self ? html`<span class="muted small">You</span>` : html`
          ${confirmAction({ session, action: `/admin/team/${u.id}/status`, label: u.status === 'active' ? 'Disable' : 'Re-enable', warning: u.status === 'active' ? 'Disabling signs the person out everywhere and blocks sign-in.' : 'The person will be able to sign in again.', danger: u.status === 'active', extra: hidden('status', u.status === 'active' ? 'disabled' : 'active') })}
          ${confirmAction({ session, action: `/admin/team/${u.id}/reset`, label: 'Reset password', warning: 'A new temporary password is shown once. The person is signed out and must choose a new password at next sign-in.' })}`}</td>
      </tr>`;
    })}</tbody></table></div>
  <section class="card admin-section narrow-form"><h2 class="h4">Add a team member</h2>
    <form method="post" action="/admin/team" novalidate>${csrf(session)}
      ${errorSummary(errors)}
      ${textField({ name: 'displayName', label: 'Name', values, errors, required: true, maxlength: 120 })}
      ${textField({ name: 'email', label: 'Email', type: 'email', values, errors, required: true, maxlength: 254 })}
      ${selectField({ name: 'role', label: 'Role', values, errors, required: true, options: assignable(null).map((r) => ({ value: r, label: ROLE_LABELS[r] })) })}
      <p class="small muted">A temporary password is shown once after creation. Share it through a trusted channel; the person must change it at first sign-in.</p>
      <button class="btn btn-primary" type="submit">Create account</button>
    </form>
  </section>`;
}

export function temporaryPasswordPage(email: string, password: string, created: boolean): SafeHtml {
  return html`${pageTitle(created ? 'Account created' : 'Password reset', undefined, email)}
  <div class="card narrow-form" tabindex="-1" data-autofocus>
    ${notice('warning', 'Copy this temporary password now', 'It is shown only once. The person must change it when they first sign in.')}
    <p class="code-display">${password}</p>
    <a class="btn btn-primary" href="/admin/team">Back to the team</a>
  </div>`;
}

export function auditPage(params: URLSearchParams, filters: { action?: string | undefined; entityId?: string | undefined }, page: number, pageSize: number, result: { rows: AuditRow[]; total: number }): SafeHtml {
  return html`${pageTitle('Audit log', undefined, 'Append-only record of security and operational actions. Entries cannot be edited or deleted.')}
  <form class="inline-form card" method="get" action="/admin/audit">
    <label>Action contains <input name="action" value="${filters.action ?? ''}" maxlength="60"></label>
    <label>Record ID <input name="entityId" value="${filters.entityId ?? ''}" maxlength="40"></label>
    <button class="btn btn-ghost btn-sm" type="submit">Filter</button>
  </form>
  <div class="table-wrap"><table class="table table-compact">
    <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Record</th><th scope="col">Reason / details</th><th scope="col">IP</th></tr></thead>
    <tbody>${result.rows.map((a) => html`<tr>
      <td>${formatDateTime(a.occurred_at)}</td><td>${a.actor_label}</td><td><code>${a.action}</code></td>
      <td>${a.entity_type ?? ''}${a.entity_id ? html`<span class="cell-note">${a.entity_type === 'shipment' ? html`<a href="/admin/shipments/${a.entity_id}">${a.entity_id.slice(0, 8)}</a>` : a.entity_id.slice(0, 8)}</span>` : ''}</td>
      <td>${a.reason ?? ''}${a.details ? html`<span class="cell-note">${JSON.stringify(a.details)}</span>` : ''}</td>
      <td>${a.ip ?? ''}</td></tr>`)}</tbody></table></div>
  ${pagination('/admin/audit', params, page, pageSize, result.total)}`;
}

export function settingsPage(config: AppConfig, dbKind: string, role: Role): SafeHtml {
  const status = (ok: boolean, yes: string, no: string) => (ok ? badge(yes, 'success') : badge(no, 'neutral'));
  return html`${pageTitle('Settings', undefined, 'Read-only view of how this deployment is configured. Secrets are never displayed.')}
  <div class="detail-grid">
    <section class="card"><h2 class="h4">Platform</h2><dl class="dl">
      <div><dt>Environment</dt><dd>${config.env}</dd></div>
      <div><dt>Site URL</dt><dd>${config.siteUrl}</dd></div>
      <div><dt>Database</dt><dd>${dbKind === 'postgres' ? 'PostgreSQL' : 'Embedded PGlite (development / single instance only)'}</dd></div>
      <div><dt>Secure cookies</dt><dd>${status(config.secureCookies, 'On (HTTPS)', 'Off (HTTP development)')}</dd></div>
      <div><dt>Tracking code expiry</dt><dd>${config.trackingCodeTtlDays ? `${config.trackingCodeTtlDays} days` : 'No automatic expiry'}</dd></div>
      <div><dt>Pricing mode</dt><dd>${config.pricingMode === 'demo' ? badge('Demonstration rates', 'warning') : config.pricingMode === 'rate_card' ? badge('Owner rate card', 'success') : badge('Disabled (weight only)', 'neutral')}</dd></div>
    </dl></section>
    <section class="card"><h2 class="h4">Integrations</h2><dl class="dl">
      <div><dt>Carrier APIs</dt><dd>${badge('Not configured', 'neutral')}<span class="cell-note">No carrier credentials are connected. All tracking events are recorded by staff.</span></dd></div>
      <div><dt>Maps</dt><dd>${status(!!config.integrations.mapboxPublicToken, 'Token present', 'Not configured')}<span class="cell-note">Tracking shows the last confirmed location as text. No live map is displayed.</span></dd></div>
      <div><dt>Email notifications</dt><dd>${badge('Not configured', 'neutral')}<span class="cell-note">Notification schema exists; no messages are sent.</span></dd></div>
      <div><dt>Online payments</dt><dd>${badge('Not configured', 'neutral')}<span class="cell-note">Staff can publish a charge onto a tracking page. No payment provider is connected and this console does not take card payments.</span></dd></div>
    </dl></section>
  </div>
  ${config.warnings.length && can(role, 'settings.read') ? html`<section class="card admin-section"><h2 class="h4">Startup warnings</h2><ul class="list-tight">${config.warnings.map((w) => html`<li>${w}</li>`)}</ul></section>` : ''}`;
}

export function adminErrorPage(status: number, message: string): SafeHtml {
  return html`${pageTitle(status === 403 ? 'Not permitted' : status === 404 ? 'Not found' : 'Something went wrong')}
  ${notice(status >= 500 ? 'error' : 'warning', message, '')}
  <a class="btn btn-primary" href="/admin">Back to overview</a>`;
}
