import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { relatedSiteOrigins } from '../../src/config/env.ts';

describe('relatedSiteOrigins', () => {
  test('allows the apex, www, and Render hostname for the live site', () => {
    const origins = relatedSiteOrigins('https://crownlineexpress.com', ['https://crownlineexpress.onrender.com']);
    assert.deepEqual(origins.sort(), [
      'https://crownlineexpress.com',
      'https://crownlineexpress.onrender.com',
      'https://www.crownlineexpress.com',
    ]);
  });

  test('adds the apex when the public URL is www', () => {
    const origins = relatedSiteOrigins('https://www.crownlineexpress.com');
    assert.ok(origins.includes('https://www.crownlineexpress.com'));
    assert.ok(origins.includes('https://crownlineexpress.com'));
  });

  test('does not invent www for localhost or the Render hostname', () => {
    assert.deepEqual(relatedSiteOrigins('http://localhost:3000'), ['http://localhost:3000']);
    assert.deepEqual(relatedSiteOrigins('https://crownlineexpress.onrender.com'), ['https://crownlineexpress.onrender.com']);
  });
});
