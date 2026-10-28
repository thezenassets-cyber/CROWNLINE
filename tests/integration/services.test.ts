import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from '../../src/db/index.ts';
import {
  addStaffEvent, archiveShipment, cancelShipment, createShipment, getShipmentDetail, listShipments,
  openException, resolveException, voidEvent,
} from '../../src/services/shipments.ts';
import { issueTrackingCode, lookupTracking, revokeTrackingCode } from '../../src/services/tracking.ts';
import { dashboardMetrics } from '../../src/services/dashboard.ts';
import { getSession, login } from '../../src/services/auth.ts';
import { changeUserRole } from '../../src/services/users.ts';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/lib/errors.ts';
import { freshDb, key, makeStaff, shipmentForm, TEST_SECRET } from '../helpers.ts';

let db: Db;
before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});

const opts = { secret: TEST_SECRET, ttlDays: 0 };
const local = (iso: string) => iso.slice(0, 16);

test('shipment creation is permission-checked, idempotent and records booking', async () => {
  const ops = await makeStaff(db, 'operations_admin');
  const support = await makeStaff(db, 'customer_support');
  await assert.rejects(createShipment(db, support, shipmentForm()), ForbiddenError);

  const form = shipmentForm();
  const a = await createShipment(db, ops, form);
  const b = await createShipment(db, ops, form);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.id, b.id);
  assert.match(a.reference, /^CLS-/);

  const detail = await getShipmentDetail(db, a.id);
  assert.equal(detail.shipment.current_milestone, 'booking_confirmed');
  assert.equal(detail.shipment.progress_percent, 5);
  assert.equal(detail.parties.length, 2);
  assert.equal(detail.packages[0]!.weight_kg, '4.000');
  assert.equal(detail.shipment.declared_value_minor, 25000);

  await assert.rejects(createShipment(db, ops, shipmentForm({ serviceCode: 'domestic_parcel' })), ValidationError);

  const fulfilled = await createShipment(db, ops, shipmentForm({ serviceCode: 'fulfillment', coverIncluded: true }));
  assert.equal(fulfilled.created, true);
  const fulfilment = await getShipmentDetail(db, fulfilled.id);
  assert.equal(fulfilment.shipment.cover_included, true);
  assert.equal(fulfilment.shipment.distance_source, 'estimated');
  assert.ok(Number(fulfilment.shipment.distance_km) > 5000);

  const overridden = await createShipment(db, ops, shipmentForm({ distanceKm: 1200 }));
  const measured = await getShipmentDetail(db, overridden.id);
  assert.equal(Number(measured.shipment.distance_km), 1200);
  assert.equal(measured.shipment.distance_source, 'coordinator');
  assert.equal(measured.shipment.cover_included, false);
  await assert.rejects(
    createShipment(db, ops, shipmentForm({ coverIncluded: true, declaredValue: undefined })),
    ValidationError,
  );
});

test('tracking lifecycle: issue, look up, add events, dedupe, revoke', async () => {
  const ops = await makeStaff(db, 'operations_admin');
  const operator = await makeStaff(db, 'tracking_operator');
  const { id } = await createShipment(db, ops, shipmentForm());

  await assert.rejects(issueTrackingCode(db, operator, id, key(), opts), ForbiddenError);
  const reqKey = key();
  const issued = await issueTrackingCode(db, ops, id, reqKey, opts);
  assert.equal(issued.status, 'issued');
  assert.deepEqual(await issueTrackingCode(db, ops, id, reqKey, opts), { status: 'already_issued' });
  if (issued.status !== 'issued') return;

  const stored = await db.query<{ code_hash: string }>(`select code_hash from tracking_credentials where shipment_id = $1`, [id]);
  assert.ok(!stored.rows.some((r) => r.code_hash.includes(issued.code.replace(/-/g, ''))), 'plain code is not stored');

  let res = await lookupTracking(db, issued.code.toLowerCase(), TEST_SECRET);
  assert.equal(res.status, 'found');
  if (res.status === 'found') {
    assert.equal(res.view.progressPercent, 5);
    assert.equal(res.view.origin, 'Rotterdam, Netherlands');
    const json = JSON.stringify(res.view);
    for (const secret of ['Private Street', 'Recipient Example', '+1 416', 'sender@example.test', '25000', 'Ceramic']) {
      assert.ok(!json.includes(secret), `public view leaks ${secret}`);
    }
  }

  const t1 = new Date(Date.now() - 5 * 3600_000).toISOString();
  const ev = { eventType: 'departed_origin', occurredAtLocal: local(t1), timeZone: 'UTC', locationLabel: 'Amsterdam' };
  assert.deepEqual(await addStaffEvent(db, operator, id, ev), { status: 'created' });
  assert.deepEqual(await addStaffEvent(db, operator, id, ev), { status: 'duplicate' });

  const earlier = new Date(Date.now() - 8 * 3600_000).toISOString();
  await addStaffEvent(db, operator, id, { eventType: 'collected', occurredAtLocal: local(earlier), timeZone: 'UTC' });
  res = await lookupTracking(db, issued.code, TEST_SECRET);
  assert.equal(res.status === 'found' && res.view.progressPercent, 45, 'late lower milestone does not regress progress');

  await assert.rejects(
    addStaffEvent(db, operator, id, { eventType: 'delivered', occurredAtLocal: local(t1), timeZone: 'UTC', evidenceReference: 'POD-1' }),
    ForbiddenError,
    'operators cannot confirm delivery',
  );
  await assert.rejects(addStaffEvent(db, ops, id, { eventType: 'delivered', occurredAtLocal: local(t1), timeZone: 'UTC' }), ValidationError);
  const future = new Date(Date.now() + 3 * 3600_000).toISOString();
  await assert.rejects(addStaffEvent(db, ops, id, { eventType: 'collected', occurredAtLocal: local(future), timeZone: 'UTC' }), ValidationError);

  const credId = (await getShipmentDetail(db, id)).credentials[0]!.id;
  await assert.rejects(revokeTrackingCode(db, operator, id, credId, 'customer request'), ForbiddenError);
  await revokeTrackingCode(db, ops, id, credId, 'Sent to the wrong recipient');
  assert.deepEqual(await lookupTracking(db, issued.code, TEST_SECRET), { status: 'not_found' });
  await assert.rejects(revokeTrackingCode(db, ops, id, credId, 'again please'));

  const audit = await db.query<{ action: string; reason: string | null }>(`select action, reason from audit_events where entity_id = $1 order by id`, [id]);
  const revoked = audit.rows.find((r) => r.action === 'tracking_code.revoked');
  assert.equal(revoked?.reason, 'Sent to the wrong recipient');
  const shipmentStill = await getShipmentDetail(db, id);
  assert.equal(shipmentStill.events.length >= 3, true, 'revocation keeps operational history');
});

test('lookup distinguishes typos from unknown codes without touching other shipments', async () => {
  assert.deepEqual(await lookupTracking(db, 'hello', TEST_SECRET), { status: 'invalid_format' });
  assert.deepEqual(await lookupTracking(db, 'CL-0000-0000-0001', TEST_SECRET), { status: 'checksum_mismatch' });
  assert.deepEqual(await lookupTracking(db, 'CL-0000-0000-0000', TEST_SECRET), { status: 'not_found' });
});

test('expired codes stop working', async () => {
  const ops = await makeStaff(db, 'operations_admin');
  const { id } = await createShipment(db, ops, shipmentForm());
  const issued = await issueTrackingCode(db, ops, id, key(), { secret: TEST_SECRET, ttlDays: 1 });
  assert.equal(issued.status, 'issued');
  if (issued.status !== 'issued') return;
  assert.equal((await lookupTracking(db, issued.code, TEST_SECRET)).status, 'found');
  assert.equal((await lookupTracking(db, issued.code, TEST_SECRET, new Date(Date.now() + 2 * 86_400_000))).status, 'not_found');
});

test('voiding, exceptions, delivery, cancellation and archival follow explicit rules', async () => {
  const ops = await makeStaff(db, 'operations_admin');
  const { id } = await createShipment(db, ops, shipmentForm({ serviceCode: 'domestic_parcel', destinationCountry: 'NL', destinationCity: 'Utrecht' }));
  const t = (h: number) => local(new Date(Date.now() - h * 3600_000).toISOString());

  await assert.rejects(addStaffEvent(db, ops, id, { eventType: 'customs_released', occurredAtLocal: t(3), timeZone: 'UTC' }), ValidationError);
  await addStaffEvent(db, ops, id, { eventType: 'out_for_delivery', occurredAtLocal: t(2), timeZone: 'Europe/Amsterdam' });
  let d = await getShipmentDetail(db, id);
  assert.equal(d.shipment.progress_percent, 95);
  const ofd = d.events.find((e) => e.event_type === 'out_for_delivery')!;
  await voidEvent(db, ops, id, ofd.id, 'Recorded against the wrong shipment');
  d = await getShipmentDetail(db, id);
  assert.equal(d.shipment.progress_percent, 5);

  await openException(db, ops, id, { category: 'address_issue' });
  d = await getShipmentDetail(db, id);
  assert.equal(d.shipment.progress_percent, 5, 'exceptions do not inflate progress');
  assert.equal(d.exceptions.length, 1);
  await resolveException(db, ops, id, d.exceptions[0]!.id, 'Recipient confirmed the address by phone');

  await assert.rejects(archiveShipment(db, ops, id, 'tidy up'), ConflictError);
  await addStaffEvent(db, ops, id, { eventType: 'delivered', occurredAtLocal: t(1), timeZone: 'UTC', evidenceReference: 'Signed by J. Doe' });
  d = await getShipmentDetail(db, id);
  assert.equal(d.shipment.progress_percent, 100);
  assert.ok(d.shipment.delivered_at);
  await assert.rejects(cancelShipment(db, ops, id, 'Customer changed mind'), ConflictError);

  const metrics = await dashboardMetrics(db, '2000-01-01', '2100-01-01');
  assert.ok(metrics.deliveredInPeriod >= 1);

  await archiveShipment(db, ops, id, 'Delivered and complete');
  await assert.rejects(addStaffEvent(db, ops, id, { eventType: 'transit_update', occurredAtLocal: t(1), timeZone: 'UTC' }), ConflictError);

  const other = await createShipment(db, ops, shipmentForm());
  await cancelShipment(db, ops, other.id, 'Customer withdrew the booking');
  const listed = await listShipments(db, { state: 'cancelled', page: 1, pageSize: 50 });
  assert.ok(listed.rows.some((r) => r.id === other.id));
});

test('audit trail is append-only at the database level', async () => {
  await assert.rejects(db.query(`update audit_events set action = 'tampered'`), /append-only/);
  await assert.rejects(db.query(`delete from audit_events`), /append-only/);
});

test('authentication: lockout, generic failures and session handling', async () => {
  const user = await makeStaff(db, 'finance');
  assert.deepEqual(await login(db, 'nobody@example.test', 'x', '1.1.1.1', 'ua'), { ok: false, reason: 'invalid' });
  const good = await login(db, user.email, user.password, '1.1.1.1', 'ua');
  assert.equal(good.ok, true);
  if (good.ok) {
    const session = await getSession(db, good.token);
    assert.equal(session?.user.role, 'finance');
    assert.equal(session?.user.mustChangePassword, true);
    assert.equal(await getSession(db, good.token + 'x'), null);
  }
  for (let i = 0; i < 5; i++) await login(db, user.email, 'wrong-password', '1.1.1.1', 'ua');
  assert.deepEqual(await login(db, user.email, user.password, '1.1.1.1', 'ua'), { ok: false, reason: 'locked' });

  const customer = await makeStaff(db, 'business_customer');
  assert.deepEqual(await login(db, customer.email, customer.password, '1.1.1.1', 'ua'), { ok: false, reason: 'invalid' });
});

test('role changes: no self-escalation and sessions are revoked', async () => {
  const owner = await makeStaff(db, 'owner');
  const fin = await makeStaff(db, 'finance');
  await assert.rejects(changeUserRole(db, fin, fin.userId, 'owner'), ForbiddenError);
  await assert.rejects(changeUserRole(db, owner, owner.userId, 'finance'), ForbiddenError);
  const s = await login(db, fin.email, fin.password, '1.1.1.1', 'ua');
  await changeUserRole(db, owner, fin.userId, 'auditor');
  if (s.ok) assert.equal(await getSession(db, s.token), null, 'role change signs the user out');
});
