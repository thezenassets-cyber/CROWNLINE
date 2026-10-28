import type { Db, Queryable } from '../db/index.ts';
import { quoteReference } from '../domain/codes.ts';
import { can } from '../domain/permissions.ts';
import { toMinor } from '../domain/money.ts';
import type { EstimateResult, PricingMode } from '../domain/pricing.ts';
import { ForbiddenError, NotFoundError } from '../lib/errors.ts';
import type { QuoteRequestForm } from '../validation/schemas.ts';
import { recordAudit, type Actor } from './audit.ts';
import type { StaffActor } from './shipments.ts';

export async function createQuoteRequest(
  db: Db,
  form: QuoteRequestForm,
  estimate: EstimateResult | null,
  pricingMode: PricingMode,
  ip: string,
): Promise<{ reference: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const existing = (await tx.query<{ reference: string }>(`select reference from quote_requests where idempotency_key = $1`, [form.idempotencyKey])).rows[0];
    if (existing) return { reference: existing.reference, created: false };
    const packages = [
      { quantity: form.quantity, weight: form.weight, weightUnit: form.weightUnit, length: form.length, width: form.width, height: form.height, lengthUnit: form.lengthUnit },
    ];
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = (
        await tx.query<{ id: string; reference: string }>(
          `insert into quote_requests (reference, contact_name, contact_email, contact_phone, company, service_code, shipment_type,
             origin_country, origin_city, origin_postal_code, destination_country, destination_city, destination_postal_code,
             packages, declared_value_minor, currency, notes, pricing_mode, estimate, idempotency_key)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           on conflict (reference) do nothing returning id, reference`,
          [
            quoteReference(), form.contactName, form.contactEmail, form.contactPhone ?? null, form.company ?? null, form.service, form.shipmentType,
            form.originCountry, form.originCity ?? null, form.originPostalCode ?? null,
            form.destinationCountry, form.destinationCity ?? null, form.destinationPostalCode ?? null,
            JSON.stringify(packages), form.declaredValue !== undefined ? toMinor(form.declaredValue) : null,
            estimate?.currency ?? null, form.notes ?? null, pricingMode, estimate ? JSON.stringify(estimate) : null, form.idempotencyKey,
          ],
        )
      ).rows[0];
      if (row) {
        const actor: Actor = { userId: null, label: 'public', ip };
        await recordAudit(tx, actor, { action: 'quote_request.submitted', entityType: 'quote_request', entityId: row.id, details: { reference: row.reference, service: form.service } });
        return { reference: row.reference, created: true };
      }
    }
    throw new Error('Could not allocate a unique quote reference');
  });
}

export interface QuoteRequestRow {
  id: string;
  reference: string;
  status: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company: string | null;
  service_code: string;
  shipment_type: string;
  origin_country: string;
  origin_city: string | null;
  origin_postal_code: string | null;
  destination_country: string;
  destination_city: string | null;
  destination_postal_code: string | null;
  packages: { quantity: number; weight: number; weightUnit: string; length: number; width: number; height: number; lengthUnit: string }[];
  declared_value_minor: number | null;
  currency: string | null;
  notes: string | null;
  pricing_mode: string;
  estimate: EstimateResult | null;
  created_at: Date;
  updated_at: Date;
}

export async function listQuoteRequests(
  q: Queryable,
  opts: { status?: string | undefined; page: number; pageSize: number },
): Promise<{ rows: QuoteRequestRow[]; total: number }> {
  const params: unknown[] = [];
  let clause = '';
  if (opts.status) {
    params.push(opts.status);
    clause = 'where status = $1';
  }
  const total = (await q.query<{ n: number }>(`select count(*)::int as n from quote_requests ${clause}`, params)).rows[0]!.n;
  params.push(opts.pageSize, (opts.page - 1) * opts.pageSize);
  const rows = (
    await q.query<QuoteRequestRow>(
      `select * from quote_requests ${clause} order by created_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )
  ).rows;
  return { rows, total };
}

export async function getQuoteRequest(q: Queryable, id: string): Promise<QuoteRequestRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('Quote request not found.');
  const row = (await q.query<QuoteRequestRow>(`select * from quote_requests where id = $1`, [id])).rows[0];
  if (!row) throw new NotFoundError('Quote request not found.');
  return row;
}

export async function updateQuoteStatus(db: Db, actor: StaffActor, id: string, status: string): Promise<void> {
  if (!can(actor.role, 'quotes.manage')) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    const res = await tx.query<{ status: string }>(
      `update quote_requests q set status = $2, handled_by = $3, updated_at = now()
       from (select status as old_status from quote_requests where id = $1) prev
       where q.id = $1 returning prev.old_status as status`,
      [id, status, actor.userId],
    );
    if (!res.rows[0]) throw new NotFoundError('Quote request not found.');
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
      action: 'quote_request.status_changed',
      entityType: 'quote_request',
      entityId: id,
      details: { from: res.rows[0].status, to: status },
    });
  });
}

export async function createContactMessage(
  db: Db,
  input: { name: string; email: string; topic: string; message: string },
  ip: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const id = (
      await tx.query<{ id: string }>(`insert into contact_messages (name, email, topic, message) values ($1,$2,$3,$4) returning id`, [
        input.name, input.email, input.topic, input.message,
      ])
    ).rows[0]!.id;
    await recordAudit(tx, { userId: null, label: 'public', ip }, { action: 'contact.submitted', entityType: 'contact_message', entityId: id, details: { topic: input.topic } });
  });
}

export interface ContactRow {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: string;
  created_at: Date;
}

export async function markContactHandled(db: Db, actor: StaffActor, id: string): Promise<void> {
  if (!can(actor.role, 'contact.read')) throw new ForbiddenError();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('Message not found.');
  await db.transaction(async (tx) => {
    const res = await tx.query(`update contact_messages set status = 'handled' where id = $1 and status = 'new' returning id`, [id]);
    if (!res.rows[0]) throw new NotFoundError('Message not found or already handled.');
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, { action: 'contact.handled', entityType: 'contact_message', entityId: id });
  });
}

export async function listContactMessages(q: Queryable, page: number, pageSize: number): Promise<{ rows: ContactRow[]; total: number }> {
  const total = (await q.query<{ n: number }>(`select count(*)::int as n from contact_messages`)).rows[0]!.n;
  const rows = (await q.query<ContactRow>(`select * from contact_messages order by created_at desc limit $1 offset $2`, [pageSize, (page - 1) * pageSize])).rows;
  return { rows, total };
}
