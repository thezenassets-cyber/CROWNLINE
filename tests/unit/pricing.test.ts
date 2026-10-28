import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWeights, dimensionalWeightKg, estimate, type EstimateInput } from '../../src/domain/pricing.ts';
import { DEMO_RATE_CARD, RateCardSchema } from '../../src/domain/rateCard.ts';
import { KG_PER_LB, roundUpTo, toCm, toKg } from '../../src/domain/units.ts';

const base: EstimateInput = {
  pricingServiceCode: 'domestic_parcel',
  shipmentType: 'parcel',
  originCountry: 'US',
  destinationCountry: 'US',
  weightUnit: 'kg',
  lengthUnit: 'cm',
  packages: [{ quantity: 1, weight: 10, length: 50, width: 40, height: 30 }],
  declaredValueMinor: null,
  insurance: false,
};

test('unit conversions', () => {
  assert.equal(toKg(1, 'lb'), KG_PER_LB);
  assert.equal(toCm(1, 'in'), 2.54);
  assert.equal(roundUpTo(12.0, 0.5), 12);
  assert.equal(roundUpTo(12.01, 0.5), 12.5);
  assert.equal(roundUpTo(0.1 + 0.2, 0.1), 0.3);
});

test('dimensional weight with metric and imperial divisors', () => {
  assert.equal(dimensionalWeightKg(50, 40, 30, { divisor: 5000, unit: 'cm3_per_kg' }), 12);
  // 20 x 16 x 12 in = 3840 in³; ÷139 = 27.626 lb
  const kg = dimensionalWeightKg(20 * 2.54, 16 * 2.54, 12 * 2.54, { divisor: 139, unit: 'in3_per_lb' });
  assert.ok(Math.abs(kg / KG_PER_LB - 3840 / 139) < 1e-9);
});

test('billable weight is the greater of actual and dimensional, rounded per package', () => {
  const rate = DEMO_RATE_CARD.services.domestic_parcel!;
  const w1 = computeWeights(base, rate);
  assert.equal(w1.dimensionalKg, 12);
  assert.equal(w1.billableKg, 12);
  assert.equal(w1.basis, 'dimensional');

  const w2 = computeWeights({ ...base, packages: [{ quantity: 3, weight: 12.3, length: 50, width: 40, height: 30 }] }, rate);
  assert.equal(w2.packages[0]!.billableKgEach, 12.5);
  assert.equal(w2.billableKg, 37.5);
  assert.equal(w2.basis, 'actual');
});

test('documents ignore dimensional weight by default', () => {
  const rate = DEMO_RATE_CARD.services.domestic_parcel!;
  const w = computeWeights({ ...base, shipmentType: 'document', packages: [{ quantity: 1, weight: 0.3, length: 35, width: 25, height: 2 }] }, rate);
  assert.equal(w.dimensionalKg, null);
  assert.equal(w.billableKg, 0.5);
});

test('freight compares shipment totals and rounds once', () => {
  const rate = DEMO_RATE_CARD.services.air_freight!;
  const w = computeWeights(
    { ...base, pricingServiceCode: 'air_freight', shipmentType: 'pallet', packages: [{ quantity: 2, weight: 150, length: 120, width: 80, height: 100 }] },
    rate,
  );
  assert.equal(w.dimensionalKg, 320);
  assert.equal(w.actualKg, 300);
  assert.equal(w.billableKg, 320);
});

test('ocean LCL applies 1 CBM = 1000 kg and a minimum billable weight', () => {
  const rate = DEMO_RATE_CARD.services.ocean_freight_lcl!;
  const w = computeWeights(
    { ...base, pricingServiceCode: 'ocean_freight_lcl', shipmentType: 'pallet', packages: [{ quantity: 1, weight: 200, length: 100, width: 100, height: 50 }] },
    rate,
  );
  assert.equal(w.dimensionalKg, 500);
  assert.equal(w.billableKg, 1000);
  assert.equal(w.basis, 'minimum');
});

test('pound-based rounding rounds in pounds', () => {
  const rate = { ...DEMO_RATE_CARD.services.domestic_parcel!, rounding: { increment: 1, unit: 'lb' as const }, dimensional: null };
  const w = computeWeights({ ...base, weightUnit: 'lb', packages: [{ quantity: 1, weight: 2.2, length: 10, width: 10, height: 10 }] }, rate);
  assert.ok(Math.abs(w.billableKg - 3 * KG_PER_LB) < 0.001);
});

test('demo estimate itemises charges and totals them on the server', () => {
  const out = estimate(base, DEMO_RATE_CARD, 'demo');
  assert.ok(out.ok);
  const r = out.result;
  assert.equal(r.status, 'priced');
  assert.equal(r.isDemonstration, true);
  assert.equal(r.lines[0]!.amountMinor, 900 + 180 * 12);
  assert.equal(r.lines[1]!.amountMinor, Math.round(3060 * 0.08));
  assert.equal(r.totalMinor, r.lines.reduce((s, l) => s + l.amountMinor, 0));
  assert.equal(r.currency, 'USD');
});

test('minimum charge and oversize surcharges apply', () => {
  const small = estimate({ ...base, packages: [{ quantity: 1, weight: 0.5, length: 10, width: 10, height: 10 }] }, DEMO_RATE_CARD, 'demo');
  assert.ok(small.ok);
  assert.equal(small.result.lines[0]!.amountMinor, 1200);

  const big = estimate({ ...base, packages: [{ quantity: 2, weight: 5, length: 130, width: 20, height: 20 }] }, DEMO_RATE_CARD, 'demo');
  assert.ok(big.ok);
  const oversize = big.result.lines.find((l) => l.code === 'oversize');
  assert.equal(oversize?.amountMinor, 3000);
});

test('route and limit validation explains errors in plain language', () => {
  const wrongZone = estimate({ ...base, destinationCountry: 'CA' }, DEMO_RATE_CARD, 'demo');
  assert.equal(wrongZone.ok, false);
  if (!wrongZone.ok) assert.match(wrongZone.errors[0]!.message, /international service/);

  const heavy = estimate({ ...base, packages: [{ quantity: 1, weight: 80, length: 50, width: 40, height: 30 }] }, DEMO_RATE_CARD, 'demo');
  assert.equal(heavy.ok, false);

  const wrongType = estimate({ ...base, shipmentType: 'pallet' }, DEMO_RATE_CARD, 'demo');
  assert.equal(wrongType.ok, false);

  const unknown = estimate({ ...base, pricingServiceCode: 'teleport' }, DEMO_RATE_CARD, 'demo');
  assert.equal(unknown.ok, false);
});

test('optional cover requires a declared value', () => {
  const missing = estimate({ ...base, insurance: true }, DEMO_RATE_CARD, 'demo');
  assert.equal(missing.ok, false);
  const ok = estimate({ ...base, insurance: true, declaredValueMinor: 100_00 }, DEMO_RATE_CARD, 'demo');
  assert.ok(ok.ok);
  assert.equal(ok.result.lines.find((l) => l.code === 'cover')?.amountMinor, 500);
});

test('disabled pricing returns billable weight only, never a price', () => {
  const out = estimate(base, DEMO_RATE_CARD, 'disabled');
  assert.ok(out.ok);
  assert.equal(out.result.status, 'weight_only');
  assert.equal(out.result.totalMinor, null);
  assert.equal(out.result.lines.length, 0);
});

test('rate card schema rejects malformed cards', () => {
  assert.throws(() => RateCardSchema.parse({ version: 'x', label: 'x', currency: 'usd', isDemonstration: false, services: {} }));
});
