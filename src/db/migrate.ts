import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Db } from './index.ts';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

/** Applies pending SQL migrations in filename order, each in its own transaction. */
export async function migrate(db: Db, log: (msg: string) => void = () => undefined): Promise<string[]> {
  await db.execScript(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // A multi-statement simple query runs as one implicit transaction, so a failing
    // migration leaves neither partial schema nor a schema_migrations row behind.
    await db.execScript(`${sql}\ninsert into schema_migrations (name) values ('${file}');`);
    ran.push(file);
    log(`Applied migration ${file}`);
  }
  return ran;
}
