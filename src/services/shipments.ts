import { createHash } from 'node:crypto';
import type { Db, Queryable } from '../db/index.ts';
import { shipmentReference } from '../domain/codes.ts';
import { EXCEPTION_CATEGORIES, INFO_EVENT_TYPES, type ExceptionCategory, type EventSource } from '../domain/events.ts';
import { can, type Role } from '../domain/permissions.ts';
import { computeProgress, DELIVERED_MILESTONE } from '../domain/progress.ts';
import { toCm, toKg } from '../domain/units.ts';
import { toMinor } from '../domain/money.ts';
import { findServiceByCode } from '../config/services.ts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.ts';
import { zonedLocalToUtc } from '../lib/time.ts';
import type { CreateShipmentForm } from '../validation/schemas.ts';
import { recordAudit, type Actor } from './audit.ts';
import { loadMilestones } from './milestones.ts';

export interface StaffActor extends Actor {
  userId: string;
  role: Role;
}

export interface ShipmentRow {
  id: string;
  reference: string;
  service_code: string;
  shipment_type: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  origin_city: string;
  origin_region: string | null;
  origin_postal_code: string | null;
  origin_country: string;
  destination_city: string;
  destination_region: string | null;
  destination_postal_code: string | null;
  destination_country: string;
  contents_description: string | null;
  declared_value_minor: number | null;
  declared_value_currency: string | null;
  lifecycle_state: 'active' | 'cancelled' | 'archived';
  current_milestone: string | null;
  progress_percent: number;
  last_event_at: Date | null;
  delivered_at: Date | null;
  estimated_delivery_date: string | null;
  estimated_delivery_source: 'carrier' | 'staff_estimate' | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const SHIPMENT_COLUMNS = `
  s.id, s.reference, s.service_code, s.shipment_type, s.carrier_name, s.carrier_tracking_number,
  s.origin_city, s.origin_region, s.origin_postal_code, s.origin_country,
  s.destination_city, s.destination_region, s.destination_postal_code, s.destination_country,
  s.contents_description, s.declared_value_minor, s.declared_value_currency, s.lifecycle_state,
  s.current_milestone, s.progress_percent, s.last_event_at, s.delivered_at,
  s.estimated_delivery_date::text as estimated_delivery_date, s.estimated_delivery_source,
  s.cancelled_at, s.cancel_reason, s.archived_at, s.created_at, s.updated_at`;

function audit(actor: StaffActor): Actor {
  return { userId: actor.userId, label: actor.label, ip: actor.ip };
}

function requirePermission(actor: StaffActor, permission: Parameters<typeof can>[1]): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}

export async function createShipment(db: Db, actor: StaffActor, form: CreateShipmentForm): Promise<{ id: string; reference: string; created: boolean }> {
  requirePermission(actor, 'shipments.create');
  const service = findServiceByCode(form.serviceCode);
  if (!service || service.availability === 'planned') {
    throw new ValidationError([{ field: 'serviceCode', message: 'Choose a service that Crownline currently offers.' }]);
  }
  if (!service.shipmentTypes.includes(form.shipmentType)) {
    throw new ValidationError([{ field: 'shipmentType', message: `${service.name} does not handle ${form.shipmentType} shipments.` }]);
  }
  const isInternational = form.originCountry !== form.destinationCountry;
  if (service.scope === 'domestic' && isInternational) {
    throw new ValidationError([{ field: 'destinationCountry', message: `${service.name} must start and end in the same country.` }]);
  }
  if (service.scope === 'international' && !isInternational) {
    throw new ValidationError([{ field: 'destinationCountry', message: `${service.name} must cross a border.` }]);
  }
  if (form.declaredValue !== undefined && !form.declaredValueCurrency) {
    throw new ValidationError([{ field: 'declaredValueCurrency', message: 'Enter the currency of the declared value.' }]);
  }

  return db.transaction(async (tx) => {
    const existing = (
      await tx.query<{ id: string; reference: string }>(`select id, reference from shipments where create_request_key = $1`, [form.idempotencyKey])
    ).rows[0];
    if (existing) return { ...existing, created: false };

    let row: { id: string; reference: string } | undefined;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      row = (
        await tx.query<{ id: string; reference: string }>(
          `insert into shipments (
             reference, service_code, shipment_type, carrier_name, carrier_tracking_number,
             origin_city, origin_region, origin_postal_code, origin_country,
             destination_city, destination_region, destination_postal_code, destination_country,
             contents_description, declared_value_minor, declared_value_currency,
             estimated_delivery_date, estimated_delivery_source, create_request_key, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           on conflict (reference) do nothing
           returning id, reference`,
          [
            shipmentReference(), form.serviceCode, form.shipmentType, form.carrierName ?? null, form.carrierTrackingNumber ?? null,
            form.originCity, form.originRegion ?? null, form.originPostalCode ?? null, form.originCountry,
            form.destinationCity, form.destinationRegion ?? null, form.destinationPostalCode ?? null, form.destinationCountry,
            form.contentsDescription ?? null,
            form.declaredValue !== undefined ? toMinor(form.declaredValue) : null,
            form.declaredValue !== undefined ? form.declaredValueCurrency : null,
            form.estimatedDeliveryDate ?? null, form.estimatedDeliveryDate ? 'staff_estimate' : null,
            form.idempotencyKey, actor.userId,
          ],
        )
      ).rows[0];
    }
    if (!row) throw new Error('Could not allocate a unique shipment reference');

    const parties: [string, string, string | undefined, string | undefined, string | undefined, string | undefined, string | undefined, string, string | undefined, string | undefined, string][] = [
      ['sender', form.senderName, form.senderCompany, form.senderEmail, form.senderPhone, form.senderAddress1, form.senderAddress2, form.originCity, form.originRegion, form.senderPostalCode ?? form.originPostalCode, form.originCountry],
      ['recipient', form.recipientName, form.recipientCompany, form.recipientEmail, form.recipientPhone, form.recipientAddress1, form.recipientAddress2, form.destinationCity, form.destinationRegion, form.recipientPostalCode ?? form.destinationPostalCode, form.destinationCountry],
    ];
    for (const p of parties) {
      await tx.query(
        `insert into shipment_parties (shipment_id, party_role, name, company, email, phone, address_line1, address_line2, city, region, postal_code, country)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [row.id, ...p.map((v) => v ?? null)],
      );
    }
    await tx.query(
      `insert into shipment_packages (shipment_id, package_index, quantity, weight_kg, length_cm, width_cm, height_cm, description)
       values ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [
        row.id, form.quantity,
        toKg(form.weight, form.weightUnit).toFixed(3),
        toCm(form.length, form.lengthUnit).toFixed(2),
        toCm(form.width, form.lengthUnit).toFixed(2),
        toCm(form.height, form.lengthUnit).toFixed(2),
        form.packageDescription ?? null,
      ],
    );
    await recordAudit(tx, audit(actor), {
      action: 'shipment.created',
      entityType: 'shipment',
      entityId: row.id,
      details: { reference: row.reference, service: form.serviceCode, route: `${form.originCountry}->${form.destinationCountry}` },
    });

    if (form.recordBooking) {
      await insertEvent(tx, actor, row.id, {
        eventType: 'booking_confirmed',
        category: 'milestone',
        milestoneCode: 'booking_confirmed',
        occurredAt: new Date(),
        timeZone: 'UTC',
        source: 'staff_manual',
      });
      await recomputeShipmentState(tx, row.id);
    }
    return { ...row, created: true };
  });
}

export interface ShipmentListFilters {
  q?: string | undefined;
  state?: 'active' | 'cancelled' | 'archived' | 'all' | undefined;
  milestone?: string | undefined;
  exceptions?: boolean | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: 'created_at' | 'reference' | 'progress_percent' | 'last_event_at' | undefined;
  dir?: 'asc' | 'desc' | undefined;
  page: number;
  pageSize: number;
}

export interface ShipmentListRow extends ShipmentRow {
  open_exceptions: number;
}

export async function listShipments(q: Queryable, f: ShipmentListFilters): Promise<{ rows: ShipmentListRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(`(s.reference ilike ${p} or s.origin_city ilike ${p} or s.destination_city ilike ${p} or s.carrier_tracking_number ilike ${p})`);
  }
  if (f.state && f.state !== 'all') add('s.lifecycle_state = ?', f.state);
  if (f.milestone === 'none') where.push('s.current_milestone is null');
  else if (f.milestone) add('s.current_milestone = ?', f.milestone);
  if (f.exceptions) where.push('exists (select 1 from shipment_exceptions e where e.shipment_id = s.id and e.resolved_at is null)');
  if (f.from) add('s.created_at >= ?::date', f.from);
  if (f.to) add(`s.created_at < (?::date + interval '1 day')`, f.to);
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const sort = f.sort ?? 'created_at';
  const dir = f.dir === 'asc' ? 'asc' : 'desc';
  const total = (await q.query<{ n: number }>(`select count(*)::int as n from shipments s ${clause}`, params)).rows[0]!.n;
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const rows = (
    await q.query<ShipmentListRow>(
      `select ${SHIPMENT_COLUMNS},
         (select count(*)::int from shipment_exceptions e where e.shipment_id = s.id and e.resolved_at is null) as open_exceptions
       from shipments s ${clause}
       order by s.${sort} ${dir} nulls last, s.id
       limit $${params.length - 1} offset $${params.length}`,
      params,
    )
  ).rows;
  return { rows, total };
}

export interface PartyRow {
  party_role: 'sender' | 'recipient';
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface PackageRow {
  package_index: number;
  quantity: number;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  description: string | null;
}

export interface EventRow {
  id: string;
  event_type: string;
  category: 'milestone' | 'exception' | 'info';
  milestone_code: string | null;
  occurred_at: Date;
  occurred_timezone: string | null;
  location_label: string | null;
  location_country: string | null;
  public_note: string | null;
  internal_note: string | null;
  source: EventSource;
  source_reference: string | null;
  evidence_reference: string | null;
  recorded_by_name: string | null;
  voided_at: Date | null;
  void_reason: string | null;
  created_at: Date;
}

export interface ExceptionRow {
  id: string;
  category: ExceptionCategory;
  customer_message: string;
  internal_note: string | null;
  opened_at: Date;
  opened_by_name: string | null;
  resolved_at: Date | null;
  resolution_note: string | null;
}

export interface CredentialRow {
  id: string;
  code_hint: string;
  issued_at: Date;
  issued_by_name: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

export interface DocumentRow {
  id: string;
  reference: string;
  document_type: string;
  generated_at: Date;
  generated_by_name: string | null;
  byte_size: number;
}

export interface ShipmentDetail {
  shipment: ShipmentRow;
  parties: PartyRow[];
  packages: PackageRow[];
  events: EventRow[];
  exceptions: ExceptionRow[];
  credentials: CredentialRow[];
  documents: DocumentRow[];
}

export async function getShipment(q: Queryable, id: string): Promise<ShipmentRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('Shipment not found.');
  const row = (await q.query<ShipmentRow>(`select ${SHIPMENT_COLUMNS} from shipments s where s.id = $1`, [id])).rows[0];
  if (!row) throw new NotFoundError('Shipment not found.');
  return row;
}

export async function getShipmentDetail(q: Queryable, id: string): Promise<ShipmentDetail> {
  const shipment = await getShipment(q, id);
  const [parties, packages, events, exceptions, credentials, documents] = await Promise.all([
    q.query<PartyRow>(`select party_role, name, company, email, phone, address_line1, address_line2, city, region, postal_code, country from shipment_parties where shipment_id = $1 order by party_role desc`, [id]),
    q.query<PackageRow>(`select package_index, quantity, weight_kg::text, length_cm::text, width_cm::text, height_cm::text, description from shipment_packages where shipment_id = $1 order by package_index`, [id]),
    q.query<EventRow>(
      `select e.id, e.event_type, e.category, e.milestone_code, e.occurred_at, e.occurred_timezone, e.location_label, e.location_country,
              e.public_note, e.internal_note, e.source, e.source_reference, e.evidence_reference, u.display_name as recorded_by_name,
              e.voided_at, e.void_reason, e.created_at
       from shipment_events e left join users u on u.id = e.recorded_by
       where e.shipment_id = $1 order by e.occurred_at desc, e.created_at desc`,
      [id],
    ),
    q.query<ExceptionRow>(
      `select x.id, x.category, x.customer_message, x.internal_note, x.opened_at, u.display_name as opened_by_name, x.resolved_at, x.resolution_note
       from shipment_exceptions x left join users u on u.id = x.opened_by
       where x.shipment_id = $1 order by x.opened_at desc`,
      [id],
    ),
    q.query<CredentialRow>(
      `select c.id, c.code_hint, c.issued_at, u.display_name as issued_by_name, c.expires_at, c.revoked_at, c.revoke_reason
       from tracking_credentials c left join users u on u.id = c.issued_by
       where c.shipment_id = $1 order by c.issued_at desc`,
      [id],
    ),
    q.query<DocumentRow>(
      `select d.id, d.reference, d.document_type, d.generated_at, u.display_name as generated_by_name, d.byte_size
       from documents d left join users u on u.id = d.generated_by
       where d.shipment_id = $1 order by d.generated_at desc limit 20`,
      [id],
    ),
  ]);
  return {
    shipment,
    parties: parties.rows,
    packages: packages.rows,
    events: events.rows,
    exceptions: exceptions.rows,
    credentials: credentials.rows,
    documents: documents.rows,
  };
}

interface NewEvent {
  eventType: string;
  category: 'milestone' | 'exception' | 'info';
  milestoneCode?: string | null;
  occurredAt: Date;
  timeZone: string;
  locationLabel?: string | undefined;
  locationCountry?: string | undefined;
  publicNote?: string | undefined;
  internalNote?: string | undefined;
  evidenceReference?: string | undefined;
  source: EventSource;
  sourceReference?: string | undefined;
  dedupeKey?: string;
}

function dedupeKeyFor(e: NewEvent): string {
  if (e.dedupeKey) return e.dedupeKey;
  if (e.source !== 'staff_manual' && e.sourceReference) return `${e.source}:${e.sourceReference}`;
  const minute = new Date(Math.floor(e.occurredAt.getTime() / 60_000) * 60_000).toISOString();
  const basis = [e.eventType, minute, (e.locationLabel ?? '').trim().toLowerCase()].join('|');
  return `h:${createHash('sha256').update(basis).digest('hex').slice(0, 40)}`;
}

async function insertEvent(tx: Queryable, actor: Actor, shipmentId: string, e: NewEvent): Promise<string | null> {
  const row = (
    await tx.query<{ id: string }>(
      `insert into shipment_events (shipment_id, event_type, category, milestone_code, occurred_at, occurred_timezone,
         location_label, location_country, public_note, internal_note, source, source_reference, evidence_reference, recorded_by, dedupe_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (shipment_id, dedupe_key) do nothing
       returning id`,
      [
        shipmentId, e.eventType, e.category, e.milestoneCode ?? null, e.occurredAt, e.timeZone,
        e.locationLabel ?? null, e.locationCountry ?? null, e.publicNote ?? null, e.internalNote ?? null,
        e.source, e.sourceReference ?? null, e.evidenceReference ?? null, actor.userId, dedupeKeyFor(e),
      ],
    )
  ).rows[0];
  return row?.id ?? null;
}

/** Re-derives the stored current state from the full event history (reconcilable by design). */
export async function recomputeShipmentState(tx: Queryable, shipmentId: string): Promise<void> {
  const defs = await loadMilestones(tx);
  const events = (
    await tx.query<{ category: 'milestone' | 'exception' | 'info'; milestone_code: string | null; occurred_at: Date; voided: boolean }>(
      `select category, milestone_code, occurred_at, voided_at is not null as voided from shipment_events where shipment_id = $1`,
      [shipmentId],
    )
  ).rows;
  const state = computeProgress(
    defs,
    events.map((e) => ({ category: e.category, milestoneCode: e.milestone_code, occurredAt: new Date(e.occurred_at), voided: e.voided })),
  );
  await tx.query(
    `update shipments set current_milestone = $2, progress_percent = $3, last_event_at = $4, delivered_at = $5, updated_at = now() where id = $1`,
    [shipmentId, state.currentMilestone, state.progressPercent, state.lastEventAt, state.deliveredAt],
  );
}

async function lockActiveShipment(tx: Queryable, shipmentId: string): Promise<ShipmentRow> {
  const row = (await tx.query<ShipmentRow>(`select ${SHIPMENT_COLUMNS} from shipments s where s.id = $1 for update`, [shipmentId])).rows[0];
  if (!row) throw new NotFoundError('Shipment not found.');
  if (row.lifecycle_state !== 'active') {
    throw new ConflictError(`This shipment is ${row.lifecycle_state}. Its history can be viewed but not changed.`);
  }
  return row;
}

export interface AddEventInput {
  eventType: string;
  occurredAtLocal: string;
  timeZone: string;
  locationLabel?: string | undefined;
  locationCountry?: string | undefined;
  publicNote?: string | undefined;
  internalNote?: string | undefined;
  evidenceReference?: string | undefined;
}

export async function addStaffEvent(
  db: Db,
  actor: StaffActor,
  shipmentId: string,
  input: AddEventInput,
  now = new Date(),
): Promise<{ status: 'created' | 'duplicate' }> {
  requirePermission(actor, 'events.create');
  const defs = await loadMilestones(db);
  const milestone = defs.find((d) => d.code === input.eventType);
  const isInfo = input.eventType in INFO_EVENT_TYPES;
  if (!milestone && !isInfo) throw new ValidationError([{ field: 'eventType', message: 'Choose a valid event type.' }]);

  if (milestone?.code === DELIVERED_MILESTONE) {
    requirePermission(actor, 'events.confirm_delivery');
    if (!input.evidenceReference) {
      throw new ValidationError([
        { field: 'evidenceReference', message: 'Delivery can only be confirmed with evidence, such as the carrier proof-of-delivery reference or the name of the person who signed.' },
      ]);
    }
  }
  if (input.eventType === 'customer_update' && !input.publicNote) {
    throw new ValidationError([{ field: 'publicNote', message: 'Write the message the customer should see.' }]);
  }
  const occurredAt = zonedLocalToUtc(input.occurredAtLocal, input.timeZone);
  if (!occurredAt) throw new ValidationError([{ field: 'occurredAtLocal', message: 'Enter a valid date and time.' }]);
  if (occurredAt.getTime() > now.getTime() + 10 * 60_000) {
    throw new ValidationError([{ field: 'occurredAtLocal', message: 'Events must have already happened. Check the date, time and time zone.' }]);
  }

  return db.transaction(async (tx) => {
    const shipment = await lockActiveShipment(tx, shipmentId);
    if (milestone?.internationalOnly && shipment.origin_country === shipment.destination_country) {
      throw new ValidationError([{ field: 'eventType', message: 'That milestone only applies to international shipments.' }]);
    }
    const id = await insertEvent(tx, actor, shipmentId, {
      eventType: input.eventType,
      category: milestone ? 'milestone' : 'info',
      milestoneCode: milestone?.code ?? null,
      occurredAt,
      timeZone: input.timeZone,
      locationLabel: input.locationLabel,
      locationCountry: input.locationCountry,
      publicNote: input.publicNote,
      internalNote: input.internalNote,
      evidenceReference: input.evidenceReference,
      source: 'staff_manual',
    });
    if (!id) return { status: 'duplicate' as const };
    await recomputeShipmentState(tx, shipmentId);
    await recordAudit(tx, audit(actor), {
      action: milestone?.code === DELIVERED_MILESTONE ? 'shipment.delivery_confirmed' : 'shipment.event_recorded',
      entityType: 'shipment',
      entityId: shipmentId,
      details: { eventId: id, eventType: input.eventType, occurredAt: occurredAt.toISOString() },
    });
    return { status: 'created' as const };
  });
}

export async function voidEvent(db: Db, actor: StaffActor, shipmentId: string, eventId: string, reason: string): Promise<void> {
  requirePermission(actor, 'events.void');
  await db.transaction(async (tx) => {
    await lockActiveShipment(tx, shipmentId);
    const res = await tx.query<{ event_type: string }>(
      `update shipment_events set voided_at = now(), voided_by = $3, void_reason = $4
       where id = $1 and shipment_id = $2 and voided_at is null returning event_type`,
      [eventId, shipmentId, actor.userId, reason],
    );
    const ev = res.rows[0];
    if (!ev) throw new NotFoundError('That event was not found or has already been corrected.');
    await recomputeShipmentState(tx, shipmentId);
    await recordAudit(tx, audit(actor), {
      action: 'shipment.event_voided',
      entityType: 'shipment',
      entityId: shipmentId,
      reason,
      details: { eventId, eventType: ev.event_type },
    });
  });
}

export async function openException(
  db: Db,
  actor: StaffActor,
  shipmentId: string,
  input: { category: ExceptionCategory; customerMessage?: string | undefined; internalNote?: string | undefined },
): Promise<void> {
  requirePermission(actor, 'exceptions.manage');
  const message = input.customerMessage ?? EXCEPTION_CATEGORIES[input.category].defaultMessage;
  await db.transaction(async (tx) => {
    await lockActiveShipment(tx, shipmentId);
    const id = (
      await tx.query<{ id: string }>(
        `insert into shipment_exceptions (shipment_id, category, customer_message, internal_note, opened_by) values ($1,$2,$3,$4,$5) returning id`,
        [shipmentId, input.category, message, input.internalNote ?? null, actor.userId],
      )
    ).rows[0]!.id;
    await insertEvent(tx, actor, shipmentId, {
      eventType: 'exception_reported',
      category: 'exception',
      occurredAt: new Date(),
      timeZone: 'UTC',
      publicNote: message,
      internalNote: input.internalNote,
      source: 'staff_manual',
      dedupeKey: `exception-open:${id}`,
    });
    await recomputeShipmentState(tx, shipmentId);
    await recordAudit(tx, audit(actor), {
      action: 'shipment.exception_opened',
      entityType: 'shipment',
      entityId: shipmentId,
      details: { exceptionId: id, category: input.category },
    });
  });
}

export async function resolveException(db: Db, actor: StaffActor, shipmentId: string, exceptionId: string, resolutionNote: string): Promise<void> {
  requirePermission(actor, 'exceptions.manage');
  await db.transaction(async (tx) => {
    await lockActiveShipment(tx, shipmentId);
    const res = await tx.query<{ category: string }>(
      `update shipment_exceptions set resolved_at = now(), resolved_by = $3, resolution_note = $4
       where id = $1 and shipment_id = $2 and resolved_at is null returning category`,
      [exceptionId, shipmentId, actor.userId, resolutionNote],
    );
    if (!res.rows[0]) throw new NotFoundError('That issue was not found or is already resolved.');
    await insertEvent(tx, actor, shipmentId, {
      eventType: 'exception_resolved',
      category: 'info',
      occurredAt: new Date(),
      timeZone: 'UTC',
      publicNote: 'The reported issue has been resolved.',
      internalNote: resolutionNote,
      source: 'staff_manual',
      dedupeKey: `exception-resolve:${exceptionId}`,
    });
    await recomputeShipmentState(tx, shipmentId);
    await recordAudit(tx, audit(actor), {
      action: 'shipment.exception_resolved',
      entityType: 'shipment',
      entityId: shipmentId,
      reason: resolutionNote,
      details: { exceptionId },
    });
  });
}

export async function cancelShipment(db: Db, actor: StaffActor, shipmentId: string, reason: string): Promise<void> {
  requirePermission(actor, 'shipments.cancel');
  await db.transaction(async (tx) => {
    const s = await lockActiveShipment(tx, shipmentId);
    if (s.delivered_at) throw new ConflictError('A delivered shipment cannot be cancelled. Archive it instead.');
    await tx.query(`update shipments set lifecycle_state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now() where id = $1`, [shipmentId, reason]);
    await insertEvent(tx, actor, shipmentId, {
      eventType: 'shipment_cancelled',
      category: 'info',
      occurredAt: new Date(),
      timeZone: 'UTC',
      publicNote: 'This shipment has been cancelled. Contact Crownline if you have questions.',
      internalNote: reason,
      source: 'staff_manual',
      dedupeKey: 'shipment-cancelled',
    });
    await recomputeShipmentState(tx, shipmentId);
    await recordAudit(tx, audit(actor), { action: 'shipment.cancelled', entityType: 'shipment', entityId: shipmentId, reason });
  });
}

export async function archiveShipment(db: Db, actor: StaffActor, shipmentId: string, reason: string): Promise<void> {
  requirePermission(actor, 'shipments.archive');
  await db.transaction(async (tx) => {
    const s = (await tx.query<ShipmentRow>(`select ${SHIPMENT_COLUMNS} from shipments s where s.id = $1 for update`, [shipmentId])).rows[0];
    if (!s) throw new NotFoundError('Shipment not found.');
    if (s.lifecycle_state === 'archived') throw new ConflictError('This shipment is already archived.');
    if (s.lifecycle_state === 'active' && !s.delivered_at) {
      throw new ConflictError('Only delivered or cancelled shipments can be archived.');
    }
    await tx.query(`update shipments set lifecycle_state = 'archived', archived_at = now(), updated_at = now() where id = $1`, [shipmentId]);
    await recordAudit(tx, audit(actor), { action: 'shipment.archived', entityType: 'shipment', entityId: shipmentId, reason });
  });
}

export async function setEstimatedDelivery(db: Db, actor: StaffActor, shipmentId: string, date: string | undefined): Promise<void> {
  requirePermission(actor, 'events.create');
  await db.transaction(async (tx) => {
    await lockActiveShipment(tx, shipmentId);
    await tx.query(
      `update shipments set estimated_delivery_date = $2, estimated_delivery_source = $3, updated_at = now() where id = $1`,
      [shipmentId, date ?? null, date ? 'staff_estimate' : null],
    );
    await recordAudit(tx, audit(actor), {
      action: 'shipment.estimated_delivery_set',
      entityType: 'shipment',
      entityId: shipmentId,
      details: { estimatedDeliveryDate: date ?? null, source: 'staff_estimate' },
    });
  });
}
