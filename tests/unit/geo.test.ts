import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTRY_CODES, countryName } from '../../src/domain/countries.ts';
import { locateLabel } from '../../src/domain/geo.ts';

test('known freight cities are placed on the city, not the country centre', () => {
  for (const label of ['Rotterdam, Netherlands', 'Toronto, Canada', 'Leeds, United Kingdom', 'Bristol, United Kingdom', 'Singapore, Singapore', 'Frankfurt, Germany']) {
    const point = locateLabel(label);
    assert.equal(point?.precision, 'city', label);
  }
});

test('an unmapped city is placed at country level', () => {
  assert.equal(locateLabel('Smallville, Netherlands')?.precision, 'country');
});

test('every country can be placed', () => {
  for (const code of COUNTRY_CODES) {
    const point = locateLabel(`Somewhere, ${countryName(code)}`);
    assert.ok(point, countryName(code));
    assert.equal(point.precision, 'country');
    assert.ok(Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180, code);
  }
});
