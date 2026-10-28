// Creates a staff account and prints a one-time temporary password.
// Usage: npm run user:create -- --email owner@example.com --name "Owner Name" --role owner
import { parseArgs } from 'node:util';
import { loadConfig } from '../config/env.ts';
import { createDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { STAFF_ROLES, isRole } from '../domain/permissions.ts';
import { SYSTEM_ACTOR } from '../services/audit.ts';
import { createUser } from '../services/auth.ts';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'owner' } },
});

if (!values.email || !values.name || !values.role || !isRole(values.role) || !STAFF_ROLES.includes(values.role)) {
  console.error(`Usage: npm run user:create -- --email <email> --name "<display name>" --role <${STAFF_ROLES.join('|')}>`);
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
  console.error('Enter a valid email address.');
  process.exit(1);
}

const config = loadConfig();
const db = await createDb(config.database);
try {
  await migrate(db, () => {});
  const actor = { ...SYSTEM_ACTOR, label: 'cli:user:create' };
  const role = values.role;
  const { temporaryPassword } = await db.transaction((tx) => createUser(tx, actor, { email: values.email!, displayName: values.name!, role }));
  console.log(`Created ${role} account for ${values.email}.`);
  console.log(`Temporary password (shown once; must be changed at first sign-in): ${temporaryPassword}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
