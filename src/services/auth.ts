import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db, Queryable } from '../db/index.ts';
import { isUniqueViolation } from '../db/index.ts';
import { isRole, type Role } from '../domain/permissions.ts';
import { ConflictError } from '../lib/errors.ts';
import { recordAudit, type Actor } from './audit.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const COMMON_PASSWORDS = new Set([
  'password1234', 'passwordpassword', '123456789012', 'qwertyuiopas', 'letmein12345', 'welcome12345',
  'administrator', 'changemelocalonly', 'crownline123', 'crownlinelogistics',
]);

/** Returns a reason the password is unacceptable, or null if it is acceptable. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'Use 200 characters or fewer.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'That password is too common. Choose something less predictable.';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local)) return 'Do not include your email name in your password.';
  if (new Set(password).size < 5) return 'Use a greater variety of characters.';
  return null;
}

export function generateTemporaryPassword(): string {
  return randomBytes(15).toString('base64url');
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface Session {
  id: string;
  csrfToken: string;
  user: SessionUser;
  flash: Flash | null;
}

export interface Flash {
  kind: 'success' | 'error';
  message: string;
}

let dummyHash: Promise<string> | null = null;

export type LoginResult =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: 'invalid' | 'locked' };

/**
 * Verifies credentials. Unknown emails still pay the hashing cost so response
 * timing does not reveal which accounts exist. Every outcome is audited.
 */
export async function login(db: Db, email: string, password: string, ip: string, userAgent: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const row = (
    await db.query<{
      id: string; email: string; display_name: string; role: string; password_hash: string;
      must_change_password: boolean; status: string; failed_login_count: number; locked_until: Date | null;
    }>(
      `select id, email, display_name, role, password_hash, must_change_password, status, failed_login_count, locked_until
       from users where email_normalized = $1`,
      [normalized],
    )
  ).rows[0];

  if (!row) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verifyPassword(password, await dummyHash);
    await recordAudit(db, { userId: null, label: 'anonymous', ip }, { action: 'auth.login_failed', details: { reason: 'unknown_account' } });
    return { ok: false, reason: 'invalid' };
  }

  const actor: Actor = { userId: row.id, label: row.email, ip };
  if (row.locked_until && row.locked_until > new Date()) {
    await verifyPassword(password, row.password_hash);
    await recordAudit(db, actor, { action: 'auth.login_blocked', entityType: 'user', entityId: row.id, details: { reason: 'locked' } });
    return { ok: false, reason: 'locked' };
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid || row.status !== 'active' || !isRole(row.role) || row.role === 'business_customer') {
    const failures = valid ? row.failed_login_count : row.failed_login_count + 1;
    const lock = failures >= MAX_FAILED_LOGINS;
    await db.query(
      `update users set failed_login_count = $2, locked_until = $3, updated_at = now() where id = $1`,
      [row.id, lock ? 0 : failures, lock ? new Date(Date.now() + LOCKOUT_MS) : null],
    );
    await recordAudit(db, actor, {
      action: lock ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'user',
      entityId: row.id,
      details: { reason: valid ? 'not_permitted' : 'bad_password' },
    });
    return { ok: false, reason: 'invalid' };
  }

  const token = randomBytes(32).toString('base64url');
  await db.transaction(async (tx) => {
    await tx.query(`update users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1`, [row.id]);
    await tx.query(
      `insert into sessions (token_hash, user_id, csrf_token, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5, $6)`,
      [sha256(token), row.id, randomBytes(24).toString('base64url'), new Date(Date.now() + SESSION_ABSOLUTE_MS), ip, userAgent.slice(0, 300)],
    );
    await recordAudit(tx, actor, { action: 'auth.login_succeeded', entityType: 'user', entityId: row.id });
  });

  return {
    ok: true,
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role, mustChangePassword: row.must_change_password },
  };
}

/** Loads a session by its cookie token, enforcing absolute and idle expiry and account status. */
export async function getSession(db: Db, token: string): Promise<Session | null> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const row = (
    await db.query<{
      id: string; csrf_token: string; flash: Flash | null; last_seen_at: Date; expires_at: Date;
      user_id: string; email: string; display_name: string; role: string; must_change_password: boolean; status: string;
    }>(
      `select s.id, s.csrf_token, s.flash, s.last_seen_at, s.expires_at,
              u.id as user_id, u.email, u.display_name, u.role, u.must_change_password, u.status
       from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null`,
      [sha256(token)],
    )
  ).rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at.getTime() <= now || now - row.last_seen_at.getTime() > SESSION_IDLE_MS || row.status !== 'active' || !isRole(row.role) || row.role === 'business_customer') {
    await db.query(`update sessions set revoked_at = now() where id = $1 and revoked_at is null`, [row.id]);
    return null;
  }
  if (now - row.last_seen_at.getTime() > 60_000) {
    await db.query(`update sessions set last_seen_at = now() where id = $1`, [row.id]);
  }
  return {
    id: row.id,
    csrfToken: row.csrf_token,
    flash: row.flash,
    user: { id: row.user_id, email: row.email, displayName: row.display_name, role: row.role, mustChangePassword: row.must_change_password },
  };
}

export async function logout(db: Db, session: Session, ip: string): Promise<void> {
  await db.query(`update sessions set revoked_at = now() where id = $1`, [session.id]);
  await recordAudit(db, { userId: session.user.id, label: session.user.email, ip }, { action: 'auth.logout', entityType: 'user', entityId: session.user.id });
}

export async function revokeUserSessions(q: Queryable, userId: string, exceptSessionId?: string): Promise<void> {
  await q.query(
    `update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2::uuid)`,
    [userId, exceptSessionId ?? null],
  );
}

export async function setFlash(db: Db, sessionId: string, flash: Flash): Promise<void> {
  await db.query(`update sessions set flash = $2 where id = $1`, [sessionId, JSON.stringify(flash)]);
}

export async function clearFlash(db: Db, sessionId: string): Promise<void> {
  await db.query(`update sessions set flash = null where id = $1`, [sessionId]);
}

export async function changePassword(
  db: Db,
  session: Session,
  currentPassword: string,
  newPassword: string,
  ip: string,
): Promise<{ ok: true } | { ok: false; field: string; message: string }> {
  const row = (await db.query<{ password_hash: string }>(`select password_hash from users where id = $1`, [session.user.id])).rows[0];
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { ok: false, field: 'currentPassword', message: 'Your current password is not correct.' };
  }
  const problem = passwordProblem(newPassword, session.user.email);
  if (problem) return { ok: false, field: 'newPassword', message: problem };
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.query(
      `update users set password_hash = $2, must_change_password = false, password_changed_at = now(), updated_at = now() where id = $1`,
      [session.user.id, hash],
    );
    await revokeUserSessions(tx, session.user.id, session.id);
    await recordAudit(tx, { userId: session.user.id, label: session.user.email, ip }, { action: 'auth.password_changed', entityType: 'user', entityId: session.user.id });
  });
  return { ok: true };
}

/** Creates a staff user with a one-time temporary password that must be changed at first sign-in. */
export async function createUser(
  q: Queryable,
  actor: Actor,
  input: { email: string; displayName: string; role: Role },
): Promise<{ id: string; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  try {
    const id = (
      await q.query<{ id: string }>(
        `insert into users (email, email_normalized, display_name, role, password_hash, must_change_password, created_by)
         values ($1, $2, $3, $4, $5, true, $6) returning id`,
        [input.email.trim(), input.email.trim().toLowerCase(), input.displayName, input.role, hash, actor.userId],
      )
    ).rows[0]!.id;
    await recordAudit(q, actor, { action: 'user.created', entityType: 'user', entityId: id, details: { role: input.role } });
    return { id, temporaryPassword };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A user with that email address already exists.');
    throw err;
  }
}
