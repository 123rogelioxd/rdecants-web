import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHIPPING_THRESHOLD,
  getShippingState,
  getCartMomentum,
} from '../assets/js/cart/momentum.js';

test('the threshold is a $170 SHIPPING threshold, not a checkout minimum', () => {
  assert.equal(SHIPPING_THRESHOLD, 170);
});

test('empty cart shows no message', () => {
  const m = getCartMomentum({ count: 0 });
  assert.equal(m.key, 'empty');
  assert.equal(m.message, '');
});

test('defaults to empty when called with no state', () => {
  assert.equal(getCartMomentum().key, 'empty');
});

test('cart at or above the threshold qualifies for shipping', () => {
  const m = getCartMomentum({ count: 1, total: SHIPPING_THRESHOLD });
  assert.equal(m.key, 'shipping');
  assert.equal(m.shipping.isEligible, true);
  assert.match(m.message, /califica para envío/);
});

test('cart below the threshold is local-pickup — valid order, never blocked', () => {
  const m = getCartMomentum({ count: 1, total: 120 });
  assert.equal(m.key, 'local');
  assert.equal(m.shipping.isEligible, false);
  assert.equal(m.shipping.remaining, 50);
  assert.match(m.message, /local/);
  assert.doesNotMatch(m.message, /mínimo|faltan|🎁/, 'no checkout-minimum / blocking language');
});

test('shipping state computes remaining, capped progress and eligibility', () => {
  assert.deepEqual(getShippingState(120), {
    threshold: 170,
    total: 120,
    remaining: 50,
    progress: 71,
    isEligible: false,
  });

  assert.equal(getShippingState(200).remaining, 0);
  assert.equal(getShippingState(200).isEligible, true);
  assert.equal(getShippingState(200).progress, 100);

  /* A $0 order is valid — there is no order minimum. */
  assert.equal(getShippingState(0).isEligible, false);
  assert.equal(getShippingState(0).remaining, 170);
});
