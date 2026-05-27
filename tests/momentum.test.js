import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_ORDER_THRESHOLD,
  getCartMinimumState,
  getCartMomentum,
} from '../assets/js/cart/momentum.js';

test('empty cart shows no momentum message', () => {
  const m = getCartMomentum({ count: 0, hasValidName: false });
  assert.equal(m.key, 'empty');
  assert.equal(m.message, '');
});

test('defaults to empty when called with no state', () => {
  assert.equal(getCartMomentum().key, 'empty');
});

test('items without a valid name nudge toward completion', () => {
  const m = getCartMomentum({ count: 2, total: MIN_ORDER_THRESHOLD, hasValidName: false });
  assert.equal(m.key, 'needs_name');
  assert.match(m.message, /nombre/);
});

test('items with a valid name read as ready', () => {
  const m = getCartMomentum({ count: 1, total: MIN_ORDER_THRESHOLD, hasValidName: true });
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

test('cart below minimum gets a minimum-order message before name validation', () => {
  const m = getCartMomentum({ count: 1, total: 160, hasValidName: false });
  assert.equal(m.key, 'minimum');
  assert.equal(m.minimum.remaining, 40);
  assert.match(m.message, /\$40/);
});
