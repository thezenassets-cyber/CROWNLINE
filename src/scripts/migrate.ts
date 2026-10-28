// Applies pending database migrations. Usage: npm run migrate
import { loadConfig } from '../config/env.ts';
import { createDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';

const config = loadConfig();
const db = await createDb(config.database);
try {
  await migrate(db, (msg) => console.log(msg));
  console.log('Migrations are up to date.');
} finally {
  await db.close();
}
