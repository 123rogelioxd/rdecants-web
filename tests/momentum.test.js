import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_ORDER_THRESHOLD,
  getCartMinimumState,
  getCartMomentum,
} from '../assets/js/cart/momentum.js';

test('empty cart shows no momentum message', () => {
  const m = getCartMomentum({ count: 0 });
  assert.equal(m.key, 'empty');
  assert.equal(m.message, '');
});

test('defaults to empty when called with no state', () => {
  assert.equal(getCartMomentum().key, 'empty');
});

test('a cart at or above the recommended amount reads as ready — name never required', () => {
  const m = getCartMomentum({ count: 1, total: MIN_ORDER_THRESHOLD, hasValidName: false });
  assert.equal(m.key, 'ready');
  assert.match(m.message, /WhatsApp/);
});

test('a valid name with an empty cart is still empty (count wins)', () => {
  const m = getCartMomentum({ count: 0, hasValidName: true });
  assert.equal(m.key, 'empty');
  assert.equal(m.message, '');
});

test('minimum state calculates remaining and capped progress', () => {
  assert.deepEqual(getCartMinimumState(160), {
    threshold: 200,
    total: 160,
    remaining: 40,
    progress: 80,
    isComplete: false,
  });

  assert.equal(getCartMinimumState(240).progress, 100);
  assert.equal(getCartMinimumState(240).remaining, 0);
});

test('cart below the recommended amount shows a soft, non-blocking nudge (no gate)', () => {
  const m = getCartMomentum({ count: 1, total: 160 });
  assert.equal(m.key, 'nudge');
  assert.equal(m.minimum.remaining, 40);
  assert.match(m.message, /200/, 'mentions the recommended amount');
  assert.match(m.message, /opcional/, 'framed as optional, never required');
  assert.doesNotMatch(m.message, /mínimo|faltan|🎁/, 'no blocking / gift language');
});
