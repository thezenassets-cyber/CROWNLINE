import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABET,
  generateTrackingCode,
  hashTrackingCode,
  luhnCheckChar,
  parseTrackingCode,
  shipmentReference,
} from '../../src/domain/codes.ts';
import { ROLES, PERMISSIONS, can, canAssignRole, isStaffRole } from '../../src/domain/permissions.ts';

test('tracking codes have the expected shape and parse back', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateTrackingCode();
    assert.match(code, /^CL-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const parsed = parseTrackingCode(code);
    assert.ok(parsed.ok);
  }
});

test('tracking code input is normalised for case, spacing and look-alike characters', () => {
  const code = generateTrackingCode();
  const body = code.replace(/^CL-/, '').replace(/-/g, '');
  const messy = ` cl ${body.toLowerCase().slice(0, 4)} ${body.toLowerCase().slice(4)} `;
  const parsed = parseTrackingCode(messy);
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(parsed.body, body);
  const withO = body.replace(/0/g, 'O');
  assert.ok(parseTrackingCode(withO).ok);
});

test('check character detects every single-character typo', () => {
  const body = generateTrackingCode().replace(/^CL-/, '').replace(/-/g, '');
  for (let i = 0; i < body.length; i++) {
    for (const c of ALPHABET) {
      if (c === body[i]) continue;
      const typo = body.slice(0, i) + c + body.slice(i + 1);
      const parsed = parseTrackingCode(typo);
      assert.equal(parsed.ok, false, `typo at ${i} -> ${c} not detected`);
    }
  }
  assert.deepEqual(parseTrackingCode('CL-123'), { ok: false, reason: 'format' });
  assert.throws(() => luhnCheckChar('U'));
});

test('codes are unique and hashes are keyed', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) seen.add(generateTrackingCode());
  assert.equal(seen.size, 20_000);
  const h1 = hashTrackingCode('ABC', 'secret-one-secret-one-secret-one!');
  assert.equal(h1, hashTrackingCode('ABC', 'secret-one-secret-one-secret-one!'));
  assert.notEqual(h1, hashTrackingCode('ABC', 'secret-two-secret-two-secret-two!'));
  assert.match(shipmentReference(), /^CLS-[0-9A-Z]{8}$/);
});

test('permission matrix enforces least privilege', () => {
  for (const p of PERMISSIONS) assert.ok(can('owner', p));
  for (const p of PERMISSIONS) assert.equal(can('business_customer', p), false);

  assert.ok(can('tracking_operator', 'events.create'));
  assert.equal(can('tracking_operator', 'events.confirm_delivery'), false);
  assert.equal(can('tracking_operator', 'tracking_codes.issue'), false);
  assert.equal(can('tracking_operator', 'finance.read'), false);

  assert.ok(can('finance', 'quotes.read'));
  assert.equal(can('finance', 'users.manage'), false);

  assert.ok(can('customer_support', 'shipments.read'));
  assert.equal(can('customer_support', 'settings.read'), false);
  assert.equal(can('customer_support', 'tracking_codes.revoke'), false);

  assert.equal(can('auditor', 'shipments.create'), false);
  assert.ok(can('auditor', 'audit.read'));

  assert.equal(can('operations_admin', 'users.manage'), false);
  assert.equal(isStaffRole('business_customer'), false);
  assert.equal(ROLES.length, 7);
});

test('role assignment rules', () => {
  assert.ok(canAssignRole('owner', 'a', 'b', 'owner'));
  assert.equal(canAssignRole('owner', 'a', 'a', 'finance'), false, 'cannot change own role');
  assert.equal(canAssignRole('finance', 'a', 'a', 'owner'), false, 'finance cannot self-escalate');
  assert.equal(canAssignRole('operations_admin', 'a', 'b', 'tracking_operator'), false);
});
