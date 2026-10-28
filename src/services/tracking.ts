import type { Db, Queryable } from '../db/index.ts';
import { generateTrackingCode, hashTrackingCode, parseTrackingCode } from '../domain/codes.ts';
import { countryName } from '../domain/countries.ts';
import { locateLabel, type GeoPoint } from '../domain/geo.ts';
import { EXCEPTION_CATEGORIES, EVENT_SOURCES, INFO_EVENT_TYPES, SYSTEM_EVENT_TYPES, type ExceptionCategory, type EventSource } from '../domain/events.ts';
import { can } from '../domain/permissions.ts';
import { customerProgress, milestoneSteps, type MilestoneDefinition, type MilestoneStep } from '../domain/progress.ts';
import { findServiceByCode } from '../config/services.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.ts';
import { hoursSince } from '../lib/time.ts';
import { recordAudit } from './audit.ts';
import { listCharges, toPublicCharges, type PublicCharge } from './charges.ts';
import { loadMilestones } from './milestones.ts';
import type { StaffActor } from './shipments.ts';

export type IssueResult =
  | { status: 'issued'; code: string; expiresAt: Date | null }
  | { status: 'already_issued' };

export async function issueTrackingCode(
  db: Db,
  actor: StaffActor,
  shipmentId: string,
  requestKey: string,
  opts: { secret: string; ttlDays: number },
): Promise<IssueResult> {
  if (!can(actor.role, 'tracking_codes.issue')) throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const s = (await tx.query<{ lifecycle_state: string }>(`select lifecycle_state from shipments where id = $1 for update`, [shipmentId])).rows[0];
    if (!s) throw new NotFoundError('Shipment not found.');
    if (s.lifecycle_state !== 'active') throw new ConflictError('Tracking codes can only be issued for active shipments.');
    const seen = (await tx.query(`select 1 from tracking_credentials where issue_request_key = $1`, [requestKey])).rows[0];
    if (seen) return { status: 'already_issued' as const };

    const expiresAt = opts.ttlDays > 0 ? new Date(Date.now() + opts.ttlDays * 86_400_000) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateTrackingCode();
      const parsed = parseTrackingCode(code);
      if (!parsed.ok) continue;
      const row = (
        await tx.query<{ id: string }>(
          `insert into tracking_credentials (shipment_id, code_hash, code_hint, issue_request_key, issued_by, expires_at)
           values ($1, $2, $3, $4, $5, $6) on conflict (code_hash) do nothing returning id`,
          [shipmentId, hashTrackingCode(parsed.body, opts.secret), parsed.body.slice(-4), requestKey, actor.userId, expiresAt],
        )
      ).rows[0];
      if (!row) continue;
      await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
        action: 'tracking_code.issued',
        entityType: 'shipment',
        entityId: shipmentId,
        details: { credentialId: row.id, hint: parsed.body.slice(-4), expiresAt: expiresAt?.toISOString() ?? null },
      });
      return { status: 'issued' as const, code, expiresAt };
    }
    throw new Error('Could not generate a unique tracking code');
  });
}

export async function revokeTrackingCode(db: Db, actor: StaffActor, shipmentId: string, credentialId: string, reason: string): Promise<void> {
  if (!can(actor.role, 'tracking_codes.revoke')) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    const res = await tx.query<{ code_hint: string }>(
      `update tracking_credentials set revoked_at = now(), revoked_by = $3, revoke_reason = $4
       where id = $1 and shipment_id = $2 and revoked_at is null returning code_hint`,
      [credentialId, shipmentId, actor.userId, reason],
    );
    if (!res.rows[0]) throw new NotFoundError('That tracking code was not found or is already revoked.');
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
      action: 'tracking_code.revoked',
      entityType: 'shipment',
      entityId: shipmentId,
      reason,
      details: { credentialId, hint: res.rows[0].code_hint },
    });
  });
}

export interface PublicTimelineEntry {
  label: string;
  kind: 'milestone' | 'exception' | 'info';
  occurredAt: Date;
  timeZone: string;
  location: string | null;
  note: string | null;
  sourceLabel: string;
}

export interface PublicTrackingView {
  codeHint: string;
  serviceName: string;
  shipmentType: string;
  origin: string;
  destination: string;
  isInternational: boolean;
  lifecycleState: 'active' | 'cancelled';
  status: { label: string; explanation: string; customerAction: string | null };
  progressPercent: number;
  progressSource: 'milestone' | 'coordinator';
  statusCode: string;
  revision: string;
  charges: PublicCharge[];
  steps: MilestoneStep[];
  timeline: PublicTimelineEntry[];
  latestEvent: PublicTimelineEntry | null;
  openExceptions: { label: string; message: string; since: Date }[];
  estimatedDelivery: { date: string; source: 'carrier' | 'staff_estimate' } | null;
  coverIncluded: boolean;
  deliveredAt: Date | null;
  lastEventAt: Date | null;
  isStale: boolean;
  dataNotes: string[];
  places: {
    origin: (GeoPoint & { label: string }) | null;
    destination: (GeoPoint & { label: string }) | null;
    current: (GeoPoint & { label: string }) | null;
  };
}

export type LookupResult =
  | { status: 'found'; view: PublicTrackingView }
  | { status: 'invalid_format' }
  | { status: 'checksum_mismatch' }
  | { status: 'not_found' };

const STALE_AFTER_HOURS = 72;

function place(city: string, country: string): string {
  return `${city}, ${countryName(country)}`;
}

/**
 * Read-only public lookup. Unknown, revoked, expired and archived codes all return
 * the same 'not_found' result so responses cannot be used to probe code status.
 */
export async function lookupTracking(q: Queryable, input: string, secret: string, now = new Date()): Promise<LookupResult> {
  const parsed = parseTrackingCode(input);
  if (!parsed.ok) return { status: parsed.reason === 'checksum' ? 'checksum_mismatch' : 'invalid_format' };

  const s = (
    await q.query<{
      id: string; service_code: string; shipment_type: string; origin_city: string; origin_country: string;
      destination_city: string; destination_country: string; lifecycle_state: 'active' | 'cancelled';
      current_milestone: string | null; progress_percent: number; display_progress: number | null; last_event_at: Date | null; delivered_at: Date | null;
      estimated_delivery_date: string | null; estimated_delivery_source: 'carrier' | 'staff_estimate' | null; cover_included: boolean; code_hint: string; updated_at: Date;
    }>(
      `select s.id, s.service_code, s.shipment_type, s.origin_city, s.origin_country, s.destination_city, s.destination_country,
              s.lifecycle_state, s.current_milestone, s.progress_percent, s.display_progress, s.last_event_at, s.delivered_at, s.updated_at,
              s.estimated_delivery_date::text as estimated_delivery_date, s.estimated_delivery_source, s.cover_included, c.code_hint
       from tracking_credentials c join shipments s on s.id = c.shipment_id
       where c.code_hash = $1 and c.revoked_at is null and (c.expires_at is null or c.expires_at > $2)
         and s.lifecycle_state in ('active', 'cancelled')`,
      [hashTrackingCode(parsed.body, secret), now],
    )
  ).rows[0];
  if (!s) return { status: 'not_found' };

  const [defs, events, exceptions, charges] = await Promise.all([
    loadMilestones(q),
    q.query<{
      event_type: string; category: 'milestone' | 'exception' | 'info'; milestone_code: string | null; occurred_at: Date;
      occurred_timezone: string | null; location_label: string | null; location_country: string | null; public_note: string | null; source: EventSource;
    }>(
      `select event_type, category, milestone_code, occurred_at, occurred_timezone, location_label, location_country, public_note, source
       from shipment_events where shipment_id = $1 and voided_at is null order by occurred_at desc, created_at desc`,
      [s.id],
    ),
    q.query<{ category: ExceptionCategory; customer_message: string; opened_at: Date }>(
      `select category, customer_message, opened_at from shipment_exceptions where shipment_id = $1 and resolved_at is null order by opened_at`,
      [s.id],
    ),
    listCharges(q, s.id, { publicOnly: true }),
  ]);

  return { status: 'found', view: buildView(s, defs, events.rows, exceptions.rows, toPublicCharges(charges), now) };
}

function buildView(
  s: {
    service_code: string; shipment_type: string; origin_city: string; origin_country: string; destination_city: string; destination_country: string;
    lifecycle_state: 'active' | 'cancelled'; current_milestone: string | null; progress_percent: number; display_progress: number | null; last_event_at: Date | null; updated_at: Date;
    delivered_at: Date | null; estimated_delivery_date: string | null; estimated_delivery_source: 'carrier' | 'staff_estimate' | null; cover_included: boolean; code_hint: string;
  },
  defs: MilestoneDefinition[],
  events: {
    event_type: string; category: 'milestone' | 'exception' | 'info'; milestone_code: string | null; occurred_at: Date;
    occurred_timezone: string | null; location_label: string | null; location_country: string | null; public_note: string | null; source: EventSource;
  }[],
  exceptions: { category: ExceptionCategory; customer_message: string; opened_at: Date }[],
  charges: PublicCharge[],
  now: Date,
): PublicTrackingView {
  const isInternational = s.origin_country !== s.destination_country;
  const defByCode = new Map(defs.map((d) => [d.code, d]));
  const timeline: PublicTimelineEntry[] = events.map((e) => {
    const label =
      (e.milestone_code && defByCode.get(e.milestone_code)?.label) ||
      (INFO_EVENT_TYPES as Record<string, { label: string }>)[e.event_type]?.label ||
      (SYSTEM_EVENT_TYPES as Record<string, { label: string }>)[e.event_type]?.label ||
      'Shipment update';
    const location = e.location_label
      ? e.location_country && !e.location_label.toLowerCase().includes(countryName(e.location_country).toLowerCase())
        ? `${e.location_label}, ${countryName(e.location_country)}`
        : e.location_label
      : e.location_country
        ? countryName(e.location_country)
        : null;
    return {
      label,
      kind: e.category,
      occurredAt: new Date(e.occurred_at),
      timeZone: e.occurred_timezone ?? 'UTC',
      location,
      note: e.public_note,
      sourceLabel: EVENT_SOURCES[e.source],
    };
  });

  const milestonePercent = Number(s.progress_percent);
  const displayRaw = s.display_progress == null ? null : Number(s.display_progress);
  const shown = customerProgress(
    Number.isFinite(milestonePercent) ? milestonePercent : 0,
    displayRaw !== null && Number.isFinite(displayRaw) ? displayRaw : null,
    s.delivered_at !== null,
  );
  const current = s.current_milestone ? defByCode.get(s.current_milestone) : undefined;
  const status =
    s.lifecycle_state === 'cancelled'
      ? { label: 'Cancelled', explanation: 'This shipment has been cancelled and will not be delivered.', customerAction: 'Contact Crownline if you have questions about this cancellation.' }
      : current
        ? { label: current.label, explanation: current.explanation, customerAction: current.customerAction }
        : { label: 'Awaiting first update', explanation: 'The shipment is registered, but no milestone has been confirmed yet.', customerAction: null };

  const dataNotes: string[] = [];
  const lastEventAt = s.last_event_at ? new Date(s.last_event_at) : null;
  const isStale = !s.delivered_at && s.lifecycle_state === 'active' && lastEventAt !== null && hoursSince(lastEventAt, now) > STALE_AFTER_HOURS;
  if (isStale) dataNotes.push(`There has been no confirmed update for more than ${STALE_AFTER_HOURS / 24} days. This does not necessarily mean there is a problem, but you can contact us if you are concerned.`);
  const steps = milestoneSteps(defs, events.map((e) => ({ category: e.category, milestoneCode: e.milestone_code, occurredAt: new Date(e.occurred_at), voided: false })), isInternational, s.current_milestone);
  if (steps.some((st) => st.state === 'passed_unconfirmed')) {
    dataNotes.push('Some earlier steps were not reported separately by the carrier or our team. They are shown as "not separately confirmed".');
  }

  const originLabel = place(s.origin_city, s.origin_country);
  const destinationLabel = place(s.destination_city, s.destination_country);
  const currentLabel = timeline.find((e) => e.location)?.location ?? null;
  const placed = (label: string | null) => {
    if (!label) return null;
    const point = locateLabel(label);
    return point ? { label, ...point } : null;
  };

  return {
    codeHint: s.code_hint,
    serviceName: findServiceByCode(s.service_code)?.name ?? 'Shipment',
    shipmentType: s.shipment_type,
    origin: originLabel,
    destination: destinationLabel,
    isInternational,
    lifecycleState: s.lifecycle_state,
    status,
    progressPercent: shown.percent,
    progressSource: shown.source,
    statusCode: s.lifecycle_state === 'cancelled' ? 'cancelled' : (s.current_milestone ?? 'awaiting'),
    revision: [new Date(s.updated_at).toISOString(), String(shown.percent), s.cover_included ? 'cover' : 'nocover', timeline[0]?.occurredAt.toISOString() ?? '', charges.map((c) => `${c.description}:${c.amountLabel}:${c.status}`).join('|')].join('~'),
    charges,
    steps,
    timeline,
    latestEvent: timeline[0] ?? null,
    openExceptions: exceptions.map((x) => ({ label: EXCEPTION_CATEGORIES[x.category].label, message: x.customer_message, since: new Date(x.opened_at) })),
    estimatedDelivery:
      s.estimated_delivery_date && s.estimated_delivery_source && !s.delivered_at && s.lifecycle_state === 'active'
        ? { date: s.estimated_delivery_date, source: s.estimated_delivery_source }
        : null,
    coverIncluded: s.cover_included === true,
    deliveredAt: s.delivered_at ? new Date(s.delivered_at) : null,
    lastEventAt,
    isStale,
    dataNotes,
    places: { origin: placed(originLabel), destination: placed(destinationLabel), current: placed(currentLabel) },
  };
}
