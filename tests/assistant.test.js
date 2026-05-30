import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_QUESTIONS, getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';

const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});
const product = (id, notes, desc, { stock = 20, price = 180, badge = 'Disponible', featured = false, variants = null } = {}) => ({
  id, name: id, house: 'House', notes, desc, story: desc, badge, featured,
  variants: variants ?? [variant(5, price, stock)],
});

const freshOffice = product('FreshOffice', ['marino', 'citrico', 'vetiver'], 'fresco limpio para oficina y verano', { price: 160 });
const sweetNight = product('SweetNight', ['vainilla', 'tonka', 'canela'], 'dulce nocturno para fiesta deja rastro', { price: 220, badge: 'Alta demanda', featured: true });
const intenseOud = product('IntenseOud', ['oud', 'cuero', 'ambar'], 'intenso oriental potente seductor', { price: 300 });
const soldOut = product('SoldOut', ['marino', 'citrico'], 'fresco verano oficina', { stock: 0, price: 150 });
const catalog = [freshOffice, sweetNight, intenseOud, soldOut];

const ids = (list) => list.map(r => r.product.id);

test('exposes three guided questions', () => {
  assert.equal(ASSISTANT_QUESTIONS.length, 3);
  for (const q of ASSISTANT_QUESTIONS) {
    assert.ok(q.id && q.label && Array.isArray(q.options) && q.options.length >= 2);
  }
});

test('returns nothing for an empty catalog', () => {
  assert.deepEqual(getAssistantRecommendations({ family: 'fresco' }, []), []);
});

test('ranks the strongest match first', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'any' },
    catalog,
  );
  assert.equal(res[0].product.id, 'FreshOffice');
  assert.equal(res[0].matchTier.key, 'high');
});

test('never recommends a sold-out product', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'any' },
    catalog,
  );
  assert.ok(!ids(res).includes('SoldOut'));
});

test('caps results at four', () => {
  const big = [];
  for (let i = 0; i < 10; i++) big.push(product(`p${i}`, ['marino', 'citrico'], 'fresco oficina verano'));
  const res = getAssistantRecommendations({ family: 'fresco', occasion: 'oficina', climate: 'calido' }, big);
  assert.ok(res.length <= 4);
});

test('budget filtering excludes out-of-band prices', () => {
  // low band is [0,150]; every sellable product here is priced > 150
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'low' },
    catalog,
  );
  assert.deepEqual(res, []);
});

test('budget filtering uses the exact displayed purchasable variant', () => {
  const splitPrice = product(
    'SplitPrice',
    ['marino', 'citrico', 'vetiver'],
    'fresco limpio para oficina y verano',
    {
      variants: [
        variant(3, 180, 10),
        variant(5, 300, 10),
      ],
    },
  );

  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'mid' },
    [splitPrice],
  );

  assert.equal(res.length, 1);
  assert.equal(res[0].product.id, 'SplitPrice');
  assert.equal(res[0].variant.size, 3);
  assert.ok(res[0].variant.price >= 150 && res[0].variant.price <= 250);
});

test('budget boundaries are strict and inclusive for displayed variants', () => {
  const lowEdge = product('LowEdge', ['marino', 'citrico'], 'fresco oficina verano', { price: 150 });
  const midEdge = product('MidEdge', ['marino', 'citrico'], 'fresco oficina verano', { price: 250 });
  const overMid = product('OverMid', ['marino', 'citrico'], 'fresco oficina verano', { price: 251 });

  const low = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'low' },
    [lowEdge, midEdge, overMid],
  );
  assert.deepEqual(ids(low), ['LowEdge']);

  const mid = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'mid' },
    [lowEdge, midEdge, overMid],
  );
  assert.deepEqual(ids(mid).sort(), ['LowEdge', 'MidEdge']);
});

test('each result carries a tier and reasons', () => {
  const res = getAssistantRecommendations(
    { family: 'intenso', occasion: 'noche', climate: 'frio', level: 'enthusiast', budget: 'any' },
    catalog,
  );
  assert.ok(res.length >= 1);
  for (const r of res) {
    assert.ok(r.matchTier && r.matchTier.label);
    assert.ok(Array.isArray(r.reasons));
    assert.ok(typeof r.useCase === 'string');
  }
});

test('among equal matches, healthier/featured stock ranks higher', () => {
  const plain = product('Plain', ['marino', 'citrico'], 'fresco oficina verano', { stock: 30 });
  const featured = product('Featured', ['marino', 'citrico'], 'fresco oficina verano', { stock: 30, featured: true });
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'any' },
    [plain, featured],
  );
  assert.equal(res[0].product.id, 'Featured');
});
