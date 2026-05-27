import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getScarcityState,
  getScarcityDisplay,
  hasHighDemand,
} from '../assets/js/utils/scarcity.js';

/* Helpers to build minimal product shapes the way CatalogProvider maps them. */
const variant = (size, price, stock, available = true) => ({
  size,
  price,
  stock,
  availability: stock,
  public_stock: stock,
  available,
  soldOut: !available || stock <= 0,
  variant_id: 1000 + size,
});

const product = (variants, badge = 'Disponible') => ({ variants, badge });

test('sold_out when no variant has available stock', () => {
  assert.equal(getScarcityState(product([variant(5, 100, 0)])), 'sold_out');
  assert.equal(getScarcityState(product([variant(5, 100, 10, false)])), 'sold_out');
});

test('last_units at 1-2 available units', () => {
  assert.equal(getScarcityState(product([variant(5, 100, 1)])), 'last_units');
  assert.equal(getScarcityState(product([variant(5, 100, 2)])), 'last_units');
});

test('low tier at 3-5 available units', () => {
  assert.equal(getScarcityState(product([variant(5, 100, 3)])), 'low');
  assert.equal(getScarcityState(product([variant(5, 100, 5)])), 'low');
});

test('available above the low threshold', () => {
  assert.equal(getScarcityState(product([variant(5, 100, 6)])), 'available');
  assert.equal(getScarcityState(product([variant(5, 100, 99)])), 'available');
});

test('state uses the highest available variant stock', () => {
  // one variant nearly out, another healthy -> overall healthy
  const p = product([variant(3, 80, 1), variant(5, 120, 40)]);
  assert.equal(getScarcityState(p), 'available');
});

test('falls back to product.stock when no variants', () => {
  assert.equal(getScarcityState({ stock: 0 }), 'sold_out');
  assert.equal(getScarcityState({ stock: 2 }), 'last_units');
  assert.equal(getScarcityState({ stock: 4 }), 'low');
  assert.equal(getScarcityState({ stock: 50 }), 'available');
});

test('hasHighDemand only fires on real operational badges', () => {
  assert.equal(hasHighDemand({ badge: 'Alta demanda' }), true);
  assert.equal(hasHighDemand({ badge: 'Mas pedido' }), true);
  assert.equal(hasHighDemand({ badge: 'Best Seller' }), true);
  assert.equal(hasHighDemand({ badge: 'Disponible' }), false);
  assert.equal(hasHighDemand({ badge: '' }), false);
  assert.equal(hasHighDemand({}), false);
});

test('demand matching is accent and case insensitive', () => {
  assert.equal(hasHighDemand({ badge: 'Alta Rotación' }), true);
  assert.equal(hasHighDemand({ badge: 'TRENDING' }), true);
});

test('display: sold_out is a hard danger state, never showing demand', () => {
  const d = getScarcityDisplay(product([variant(5, 100, 0)], 'Alta demanda'));
  assert.equal(d.state, 'sold_out');
  assert.equal(d.label, 'Agotado');
  assert.equal(d.badgeClass, 'danger');
  assert.equal(d.demand, false);
});

test('display: last_units copy + danger styling', () => {
  const d = getScarcityDisplay(product([variant(5, 100, 1)]));
  assert.equal(d.key, 'low');
  assert.equal(d.label, 'Ultimas unidades');
  assert.equal(d.badgeClass, 'danger');
});

test('display: low tier uses the subtle "pocas unidades" copy', () => {
  const d = getScarcityDisplay(product([variant(5, 100, 4)]));
  assert.equal(d.key, 'few');
  assert.equal(d.label, 'Pocas unidades disponibles');
  assert.equal(d.badgeClass, 'trend');
});

test('display: healthy stock + demand badge keeps demand internal', () => {
  const d = getScarcityDisplay(product([variant(5, 100, 30)], 'Alta demanda'));
  assert.equal(d.state, 'available');
  assert.equal(d.key, 'ok');
  assert.equal(d.label, 'Disponible');
  assert.equal(d.demand, true);
});

test('public scarcity copy never exposes high-rotation wording', () => {
  const labels = [
    getScarcityDisplay(product([variant(5, 100, 30)], 'Alta rotacion')).label,
    getScarcityDisplay(product([variant(5, 100, 1)], 'Alta rotacion')).label,
    getScarcityDisplay(product([variant(5, 100, 0)], 'Alta rotacion')).label,
  ];

  for (const label of labels) {
    assert.doesNotMatch(label.toLowerCase(), /alta rotaci[oó]n|alta rotacion/);
  }
});

test('display: healthy stock without demand is the calm default', () => {
  const d = getScarcityDisplay(product([variant(5, 100, 30)]));
  assert.equal(d.key, 'ok');
  assert.equal(d.label, 'Disponible');
  assert.equal(d.badgeClass, '');
});
