import { test } from 'node:test';
import assert from 'node:assert/strict';
import { straightLineKm } from '../../src/domain/distance.ts';

test('straight-line distance uses country midpoints and skips a same-country pair', () => {
  const km = straightLineKm('NL', 'CA');
  assert.ok(km !== null && km > 5500 && km < 7000);
  assert.equal(straightLineKm('NL', 'NL'), null);
  assert.equal(straightLineKm('ZZ', 'CA'), null);
});
