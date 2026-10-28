import type { Db, Queryable } from '../db/index.ts';
import { canAssignRole, can, type Role } from '../domain/permissions.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.ts';
import { recordAudit } from './audit.ts';
import { generateTemporaryPassword, hashPassword, revokeUserSessions } from './auth.ts';
import type { StaffActor } from './shipments.ts';

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  status: 'active' | 'disabled';
  must_change_password: boolean;
  last_login_at: Date | null;
  locked_until: Date | null;
  created_at: Date;
}

export async function listUsers(q: Queryable): Promise<UserRow[]> {
  return (
    await q.query<UserRow>(
      `select id, email, display_name, role, status, must_change_password, last_login_at, locked_until, created_at from users order by created_at`,
    )
  ).rows;
}

async function getUser(q: Queryable, id: string): Promise<UserRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('User not found.');
  const row = (await q.query<UserRow>(`select id, email, display_name, role, status, must_change_password, last_login_at, locked_until, created_at from users where id = $1 for update`, [id])).rows[0];
  if (!row) throw new NotFoundError('User not found.');
  return row;
}

async function ownerCount(q: Queryable): Promise<number> {
  return (await q.query<{ n: number }>(`select count(*)::int as n from users where role = 'owner' and status = 'active'`)).rows[0]!.n;
}

export async function changeUserRole(db: Db, actor: StaffActor, targetId: string, role: Role): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await getUser(tx, targetId);
    if (!canAssignRole(actor.role, actor.userId, targetId, role)) throw new ForbiddenError('You cannot assign that role.');
    if (target.role === 'owner' && actor.role !== 'owner') throw new ForbiddenError('Only an owner can change another owner.');
    if (target.role === 'owner' && role !== 'owner' && (await ownerCount(tx)) <= 1) {
      throw new ConflictError('There must always be at least one active owner.');
    }
    await tx.query(`update users set role = $2, updated_at = now() where id = $1`, [targetId, role]);
    await revokeUserSessions(tx, targetId);
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
      action: 'user.role_changed',
      entityType: 'user',
      entityId: targetId,
      details: { from: target.role, to: role },
    });
  });
}

export async function setUserStatus(db: Db, actor: StaffActor, targetId: string, status: 'active' | 'disabled', reason: string): Promise<void> {
  if (!can(actor.role, 'users.manage')) throw new ForbiddenError();
  if (targetId === actor.userId) throw new ConflictError('You cannot disable your own account.');
  await db.transaction(async (tx) => {
    const target = await getUser(tx, targetId);
    if (target.role === 'owner' && actor.role !== 'owner') throw new ForbiddenError();
    if (status === 'disabled' && target.role === 'owner' && (await ownerCount(tx)) <= 1) {
      throw new ConflictError('There must always be at least one active owner.');
    }
    await tx.query(`update users set status = $2, updated_at = now() where id = $1`, [targetId, status]);
    if (status === 'disabled') await revokeUserSessions(tx, targetId);
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
      action: status === 'disabled' ? 'user.disabled' : 'user.enabled',
      entityType: 'user',
      entityId: targetId,
      reason,
    });
  });
}

/** Issues a new temporary password (shown once) and signs the user out everywhere. */
export async function resetUserPassword(db: Db, actor: StaffActor, targetId: string, reason?: string): Promise<string> {
  if (!can(actor.role, 'users.manage')) throw new ForbiddenError();
  if (targetId === actor.userId) throw new ConflictError('Use "Change password" to change your own password.');
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  await db.transaction(async (tx) => {
    const target = await getUser(tx, targetId);
    if (target.role === 'owner' && actor.role !== 'owner') throw new ForbiddenError();
    await tx.query(
      `update users set password_hash = $2, must_change_password = true, failed_login_count = 0, locked_until = null, updated_at = now() where id = $1`,
      [targetId, hash],
    );
    await revokeUserSessions(tx, targetId);
    await recordAudit(tx, { userId: actor.userId, label: actor.label, ip: actor.ip }, { action: 'user.password_reset', entityType: 'user', entityId: targetId, reason });
  });
  return temporaryPassword;
}
