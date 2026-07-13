import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDemoFallbackAllowed } from '../assets/js/providers/catalog.js';

test('production never falls back to demo products', () => {
  assert.equal(isDemoFallbackAllowed({ hostname: 'rdecants.com', hideFlag: false }), false);
  assert.equal(isDemoFallbackAllowed({ hostname: 'www.rdecants.com', hideFlag: false }), false);
});

test('the DECANTS_HIDE_DEMO_PRODUCTS kill switch disables demo data everywhere', () => {
  assert.equal(isDemoFallbackAllowed({ hostname: 'localhost', hideFlag: true }), false);
  assert.equal(isDemoFallbackAllowed({ hostname: '127.0.0.1', hideFlag: 'true' }), false);
  assert.equal(isDemoFallbackAllowed({ hostname: 'rdecants.com', hideFlag: true }), false);
});

test('demo data is allowed only on localhost when the switch is off', () => {
  assert.equal(isDemoFallbackAllowed({ hostname: 'localhost', hideFlag: false }), true);
  assert.equal(isDemoFallbackAllowed({ hostname: '127.0.0.1', hideFlag: false }), true);
});

test('unknown/empty host is treated as production (safe default)', () => {
  assert.equal(isDemoFallbackAllowed({}), false);
  assert.equal(isDemoFallbackAllowed({ hostname: '', hideFlag: false }), false);
  assert.equal(isDemoFallbackAllowed({ hostname: 'staging.netlify.app' }), false);
});
