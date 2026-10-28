import type { Db, Queryable } from '../db/index.ts';
import { formatMoney, toMinor } from '../domain/money.ts';
import { can, type Role } from '../domain/permissions.ts';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.ts';
import { recordAudit, type Actor } from './audit.ts';

export type ChargeStatus = 'draft' | 'published' | 'settled' | 'withdrawn';

export interface ChargeRow {
  id: string;
  description: string;
  amount_minor: number;
  currency: string;
  status: ChargeStatus;
  issued_on: string | null;
  public_note: string | null;
  created_at: Date;
}

export interface PublicCharge {
  description: string;
  amountLabel: string;
  status: 'published' | 'settled';
  issuedOn: string | null;
  note: string | null;
}

interface Staff {
  userId: string;
  role: Role;
  label: string;
  ip?: string | undefined;
}

const COLUMNS = `id, description, amount_minor, currency, status, issued_on::text as issued_on, public_note, created_at`;

function actorOf(actor: Staff): Actor {
  return { userId: actor.userId, label: actor.label, ip: actor.ip };
}

function requireCharges(actor: Staff): void {
  if (!can(actor.role, 'charges.manage')) throw new ForbiddenError();
}

export async function listCharges(q: Queryable, shipmentId: string, opts: { publicOnly?: boolean } = {}): Promise<ChargeRow[]> {
  const where = opts.publicOnly ? `and status in ('published', 'settled')` : '';
  const rows = await q.query<ChargeRow>(
    `select ${COLUMNS} from shipment_charges where shipment_id = $1 ${where} order by created_at`,
    [shipmentId],
  );
  return rows.rows;
}

export function toPublicCharges(rows: readonly ChargeRow[]): PublicCharge[] {
  return rows
    .filter((c): c is ChargeRow & { status: 'published' | 'settled' } => c.status === 'published' || c.status === 'settled')
    .map((c) => ({
      description: c.description,
      amountLabel: formatMoney(c.amount_minor, c.currency),
      status: c.status,
      issuedOn: c.issued_on,
      note: c.public_note,
    }));
}

export async function createCharge(
  db: Db,
  actor: Staff,
  shipmentId: string,
  input: { description: string; amount: string; currency: string; issuedOn?: string | undefined; publicNote?: string | undefined; visibility: 'draft' | 'published' },
): Promise<void> {
  requireCharges(actor);
  const amountMinor = toMinor(Number(input.amount));
  await db.transaction(async (tx) => {
    const shipment = (await tx.query<{ lifecycle_state: string }>(`select lifecycle_state from shipments where id = $1 for update`, [shipmentId])).rows[0];
    if (!shipment) throw new NotFoundError('Shipment not found.');
    if (shipment.lifecycle_state !== 'active') throw new ValidationError([{ field: 'description', message: 'Charges can only be added to an active shipment.' }]);
    const row = (
      await tx.query<{ id: string }>(
        `insert into shipment_charges (shipment_id, description, amount_minor, currency, status, issued_on, public_note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [shipmentId, input.description, amountMinor, input.currency, input.visibility, input.issuedOn ?? null, input.publicNote ?? null, actor.userId],
      )
    ).rows[0];
    await recordAudit(tx, actorOf(actor), {
      action: 'shipment.charge_created',
      entityType: 'shipment',
      entityId: shipmentId,
      details: { chargeId: row?.id, status: input.visibility, amountMinor, currency: input.currency },
    });
  });
}

export async function setChargeStatus(db: Db, actor: Staff, shipmentId: string, chargeId: string, status: ChargeStatus): Promise<void> {
  requireCharges(actor);
  if (!/^[0-9a-f-]{36}$/i.test(chargeId)) throw new NotFoundError('Charge not found.');
  await db.transaction(async (tx) => {
    const current = (await tx.query<{ status: ChargeStatus }>(`select status from shipment_charges where id = $1 and shipment_id = $2 for update`, [chargeId, shipmentId])).rows[0];
    if (!current) throw new NotFoundError('Charge not found.');
    if (current.status === status) return;
    await tx.query(`update shipment_charges set status = $3, updated_at = now() where id = $1 and shipment_id = $2`, [chargeId, shipmentId, status]);
    await recordAudit(tx, actorOf(actor), {
      action: 'shipment.charge_updated',
      entityType: 'shipment',
      entityId: shipmentId,
      details: { chargeId, from: current.status, to: status },
    });
  });
}
