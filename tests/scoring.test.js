import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSellable, getOperationalScore, getAovSignal } from '../assets/js/recommendations/scoring.js';

const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});
const product = (stock, extra = {}) => ({
  notes: ['vainilla'], badge: 'Disponible',
  variants: [variant(5, 180, stock)], ...extra,
});

test('isSellable is false for sold-out and true for healthy stock', () => {
  assert.equal(isSellable(product(0)), false);
  assert.equal(isSellable(product(20)), true);
});

test('isSellable is false when there are no orderable variants', () => {
  assert.equal(isSellable({ notes: [], variants: [] }), false);
});

test('operational score is -Infinity for sold-out', () => {
  assert.equal(getOperationalScore(product(0)), -Infinity);
});

test('operational score increases with healthier stock', () => {
  const last = getOperationalScore(product(2));    // last_units
  const low = getOperationalScore(product(5));     // low
  const ok = getOperationalScore(product(40));     // available
  assert.ok(ok > low && low > last);
});

test('featured and high-demand both lift the operational score', () => {
  const base = getOperationalScore(product(40));
  const feat = getOperationalScore(product(40, { featured: true }));
  const demand = getOperationalScore(product(40, { badge: 'Alta demanda' }));
  assert.ok(feat > base);
  assert.ok(demand > base);
});

test('aov signal reflects the display price (not margin)', () => {
  assert.equal(getAovSignal(product(20)), 180);
  assert.equal(getAovSignal({ variants: [] }), 0);
});
