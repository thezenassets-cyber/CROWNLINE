import { randomBytes } from 'node:crypto';
import { createDb, type Db } from '../src/db/index.ts';
import { migrate } from '../src/db/migrate.ts';
import { createUser } from '../src/services/auth.ts';
import { SYSTEM_ACTOR } from '../src/services/audit.ts';
import type { StaffActor } from '../src/services/shipments.ts';
import type { Role } from '../src/domain/permissions.ts';
import type { CreateShipmentForm } from '../src/validation/schemas.ts';

export const TEST_SECRET = 'test-tracking-secret-0123456789abcdef';

export async function freshDb(): Promise<Db> {
  const db = createDb({ kind: 'embedded', dir: null });
  await migrate(db);
  return db;
}

export async function makeStaff(db: Db, role: Role, email = `${role}-${randomBytes(3).toString('hex')}@example.test`): Promise<StaffActor & { email: string; password: string }> {
  const { id, temporaryPassword } = await createUser(db, SYSTEM_ACTOR, { email, displayName: role, role });
  return { userId: id, role, label: email, ip: '127.0.0.1', email, password: temporaryPassword };
}

export const key = () => randomBytes(12).toString('hex');

export function shipmentForm(overrides: Partial<CreateShipmentForm> = {}): CreateShipmentForm {
  return {
    serviceCode: 'international_parcel',
    shipmentType: 'parcel',
    carrierName: undefined,
    carrierTrackingNumber: undefined,
    originCity: 'Rotterdam',
    originRegion: undefined,
    originPostalCode: '3011',
    originCountry: 'NL',
    destinationCity: 'Toronto',
    destinationRegion: 'ON',
    destinationPostalCode: 'M5V',
    destinationCountry: 'CA',
    senderName: 'Sender Example',
    senderCompany: undefined,
    senderEmail: 'sender@example.test',
    senderPhone: '+31 10 000 0000',
    senderAddress1: '1 Example Quay',
    senderAddress2: undefined,
    senderPostalCode: undefined,
    recipientName: 'Recipient Example',
    recipientCompany: undefined,
    recipientEmail: undefined,
    recipientPhone: '+1 416 000 0000',
    recipientAddress1: '99 Private Street',
    recipientAddress2: undefined,
    recipientPostalCode: undefined,
    quantity: 1,
    weight: 4,
    weightUnit: 'kg',
    length: 40,
    width: 30,
    height: 20,
    lengthUnit: 'cm',
    packageDescription: undefined,
    contentsDescription: 'Ceramic samples',
    declaredValue: 250,
    declaredValueCurrency: 'EUR',
    estimatedDeliveryDate: undefined,
    recordBooking: true,
    idempotencyKey: key(),
    ...overrides,
  };
}
