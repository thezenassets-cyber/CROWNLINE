import type { Queryable } from '../db/index.ts';

export interface Actor {
  userId: string | null;
  label: string;
  ip?: string | undefined;
}

export const SYSTEM_ACTOR: Actor = { userId: null, label: 'system' };

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  reason?: string | undefined;
  details?: Record<string, unknown>;
}

export async function recordAudit(q: Queryable, actor: Actor, entry: AuditEntry): Promise<void> {
  await q.query(
    `insert into audit_events (actor_user_id, actor_label, action, entity_type, entity_id, reason, details, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor.userId,
      actor.label,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.reason ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      actor.ip ?? null,
    ],
  );
}

export interface AuditRow {
  id: number;
  occurred_at: Date;
  actor_label: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

export async function listAudit(
  q: Queryable,
  opts: { entityType?: string; entityId?: string; action?: string; page: number; pageSize: number },
): Promise<{ rows: AuditRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (opts.entityId) {
    params.push(opts.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  if (opts.action) {
    params.push(`%${opts.action}%`);
    where.push(`action ilike $${params.length}`);
  }
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const total = (await q.query<{ n: number }>(`select count(*)::int as n from audit_events ${clause}`, params)).rows[0]!.n;
  params.push(opts.pageSize, (opts.page - 1) * opts.pageSize);
  const rows = (
    await q.query<AuditRow>(
      `select id::int as id, occurred_at, actor_label, action, entity_type, entity_id, reason, details, ip
       from audit_events ${clause} order by occurred_at desc, id desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )
  ).rows;
  return { rows, total };
}
