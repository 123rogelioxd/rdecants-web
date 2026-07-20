import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canConsumeSharedMl,
  clampToSharedAvailability,
  findSharedAvailabilityViolation,
  requestedMlForProduct,
  sharedAvailableMl,
} from '../assets/js/cart/availability.js';

const item = (key, size, qty, availableMl = 10, productId = 77) => ({
  key,
  type: 'product',
  product_id: productId,
  size,
  qty,
  available_ml: availableMl,
});

test('mixed presentations consume one canonical milliliter pool', () => {
  const cart = [item('afnan-10', 10, 1)];

  assert.equal(requestedMlForProduct(cart, '77'), 10);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 5), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), false);
});

test('two 5ml units also exhaust the pool and block every other presentation', () => {
  const cart = [item('afnan-5', 5, 2)];

  assert.equal(canConsumeSharedMl(cart, '77', 10, 10), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), false);
});

test('mixed presentations are allowed when their aggregate is within the pool', () => {
  const cart = [item('afnan-5', 5, 1), item('afnan-3', 3, 1)];

  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), true);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
});

test('availability is grouped by physical product and never across products', () => {
  const cart = [item('afnan-10', 10, 1, 10, 77)];

  assert.equal(canConsumeSharedMl(cart, '88', 10, 10), true);
});

test('legacy oversold persisted cart is clamped to shared availability', () => {
  const cart = [item('afnan-10', 10, 1), item('afnan-5', 5, 2)];
  const violation = findSharedAvailabilityViolation(cart);

  assert.deepEqual(
    { requestedMl: violation.requestedMl, availableMl: violation.availableMl },
    { requestedMl: 20, availableMl: 10 },
  );

  const repaired = clampToSharedAvailability(cart);
  assert.deepEqual(repaired.items.map(({ key, qty }) => ({ key, qty })), [
    { key: 'afnan-10', qty: 1 },
  ]);
  assert.deepEqual(repaired.removed.map(entry => entry.key), ['afnan-5']);
});

test('older catalog fallback derives one conservative pool instead of summing variants', () => {
  const product = {
    variants: [
      { ml: 10, stock: 1 },
      { ml: 5, stock: 2 },
      { ml: 3, stock: 3 },
      { ml: 2, stock: 5 },
    ],
  };

  assert.equal(sharedAvailableMl(product), 10);
});

test('explicit canonical available_ml wins over presentation-derived fallback', () => {
  const product = {
    available_ml: 11,
    variants: [{ ml: 10, stock: 1 }, { ml: 5, stock: 2 }],
  };

  assert.equal(sharedAvailableMl(product), 11);
});
