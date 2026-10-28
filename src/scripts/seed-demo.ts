// Seeds clearly labelled FICTIONAL demo shipments for local development. Refuses to run in production.
// Usage: npm run seed:demo
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config/env.ts';
import { createDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { hashPassword } from '../services/auth.ts';
import { addStaffEvent, createShipment, openException, type StaffActor } from '../services/shipments.ts';
import { issueTrackingCode } from '../services/tracking.ts';
import { CreateShipmentSchema } from '../validation/schemas.ts';

const config = loadConfig();
if (config.isProduction) {
  console.error('seed:demo refuses to run in production.');
  process.exit(1);
}

const db = await createDb(config.database);
await migrate(db, () => {});

const DEMO_EMAIL = 'demo-seed@crownline.invalid';
let userId = (await db.query<{ id: string }>(`select id from users where email_normalized = $1`, [DEMO_EMAIL])).rows[0]?.id;
if (!userId) {
  userId = (
    await db.query<{ id: string }>(
      `insert into users (email, email_normalized, display_name, role, password_hash, must_change_password, status)
       values ($1, $1, 'Demo data (fictional)', 'operations_admin', $2, true, 'disabled') returning id`,
      [DEMO_EMAIL, await hashPassword(randomBytes(32).toString('hex'))],
    )
  ).rows[0]!.id;
}
const actor: StaffActor = { userId, role: 'operations_admin', label: 'seed:demo' };

const local = (daysAgo: number, hour: number) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:15`;
};

const base = {
  shipmentType: 'parcel', quantity: '1', weightUnit: 'kg', lengthUnit: 'cm',
  contentsDescription: 'DEMO – fictional shipment for testing', senderName: 'Demo Sender (fictional)', recipientName: 'Demo Recipient (fictional)',
};

const demos = [
  {
    form: { ...base, serviceCode: 'international_parcel', originCity: 'Rotterdam', originCountry: 'NL', destinationCity: 'Toronto', destinationCountry: 'CA', weight: '3.2', length: '40', width: '30', height: '20' },
    events: [
      { eventType: 'booking_confirmed', occurredAtLocal: local(6, 9), timeZone: 'UTC' },
      { eventType: 'collected', occurredAtLocal: local(4, 10), timeZone: 'Europe/Amsterdam', locationLabel: 'Rotterdam', locationCountry: 'NL' },
      { eventType: 'received_origin_facility', occurredAtLocal: local(4, 17), timeZone: 'Europe/Amsterdam', locationLabel: 'Amsterdam hub', locationCountry: 'NL' },
      { eventType: 'export_processing', occurredAtLocal: local(3, 9), timeZone: 'Europe/Amsterdam', locationLabel: 'Amsterdam hub', locationCountry: 'NL' },
      { eventType: 'departed_origin', occurredAtLocal: local(3, 20), timeZone: 'Europe/Amsterdam', locationLabel: 'Amsterdam', locationCountry: 'NL' },
      { eventType: 'international_transit', occurredAtLocal: local(2, 8), timeZone: 'UTC' },
    ],
    exception: null,
  },
  {
    form: { ...base, serviceCode: 'domestic_parcel', originCity: 'Leeds', originCountry: 'GB', destinationCity: 'Bristol', destinationCountry: 'GB', weight: '1.1', length: '25', width: '20', height: '10' },
    events: [
      { eventType: 'booking_confirmed', occurredAtLocal: local(6, 9), timeZone: 'UTC' },
      { eventType: 'collected', occurredAtLocal: local(3, 11), timeZone: 'Europe/London', locationLabel: 'Leeds', locationCountry: 'GB' },
      { eventType: 'received_origin_facility', occurredAtLocal: local(3, 18), timeZone: 'Europe/London', locationLabel: 'Leeds depot', locationCountry: 'GB' },
      { eventType: 'out_for_delivery', occurredAtLocal: local(2, 7), timeZone: 'Europe/London', locationLabel: 'Bristol', locationCountry: 'GB' },
      { eventType: 'delivered', occurredAtLocal: local(2, 13), timeZone: 'Europe/London', locationLabel: 'Bristol', locationCountry: 'GB', evidenceReference: 'DEMO-POD-0001 (fictional)' },
    ],
    exception: null,
  },
  {
    form: { ...base, serviceCode: 'air_freight', shipmentType: 'freight', originCity: 'Singapore', originCountry: 'SG', destinationCity: 'Frankfurt', destinationCountry: 'DE', weight: '48', length: '80', width: '60', height: '60' },
    events: [
      { eventType: 'booking_confirmed', occurredAtLocal: local(6, 9), timeZone: 'UTC' },
      { eventType: 'collected', occurredAtLocal: local(2, 9), timeZone: 'Asia/Singapore', locationLabel: 'Singapore', locationCountry: 'SG' },
      { eventType: 'export_processing', occurredAtLocal: local(1, 15), timeZone: 'Asia/Singapore', locationLabel: 'Singapore', locationCountry: 'SG' },
    ],
    exception: { category: 'documentation' as const, internalNote: 'DEMO: commercial invoice missing HS codes.' },
  },
];

console.log('Seeding FICTIONAL demo shipments (development only):\n');
for (const d of demos) {
  const form = CreateShipmentSchema.parse({ ...d.form, idempotencyKey: randomBytes(18).toString('base64url') });
  const s = await createShipment(db, actor, form);
  for (const e of d.events) await addStaffEvent(db, actor, s.id, e);
  if (d.exception) await openException(db, actor, s.id, d.exception);
  const code = await issueTrackingCode(db, actor, s.id, randomBytes(18).toString('base64url'), { secret: config.trackingCodeSecret, ttlDays: config.trackingCodeTtlDays });
  console.log(`${s.reference}  ${d.form.originCity} -> ${d.form.destinationCity}  tracking code: ${code.status === 'issued' ? code.code : '(already issued)'}`);
}
console.log('\nOpen /track and enter one of the codes above. These shipments are fictional and labelled as demo data.');
await db.close();
