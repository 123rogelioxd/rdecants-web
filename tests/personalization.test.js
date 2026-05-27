import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* In-memory localStorage polyfill so the store can be exercised in Node. */
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

const {
  Personalization,
  scoreAffinity,
  personalizeProducts,
  personalizeRails,
  deriveProductMoods,
  applyView,
} = await import('../assets/js/recommendations/personalization.js');

const product = (id, house, notes, desc) => ({ id, name: id, house, notes, desc, story: desc, badge: 'Disponible' });

const freshOffice = product('FreshOffice', 'Dior', ['marino', 'citrico', 'vetiver'], 'fresco limpio oficina diario');
const sweetNight = product('SweetNight', 'YSL', ['vainilla', 'tonka', 'canela'], 'dulce nocturno fiesta');

beforeEach(() => _store.clear());

test('deriveProductMoods returns dominant use-cases', () => {
  const moods = deriveProductMoods(freshOffice);
  assert.ok(moods.length >= 1 && moods.length <= 2);
  assert.ok(moods.includes('oficina') || moods.includes('diario'));
});

test('scoreAffinity is zero without a taste signal', () => {
  assert.equal(scoreAffinity(freshOffice, { moods: {}, houses: {}, viewed: [] }), 0);
});

test('scoreAffinity rewards matching mood and house weights', () => {
  const taste = { moods: { oficina: 2 }, houses: { dior: 1 }, viewed: [] };
  assert.ok(scoreAffinity(freshOffice, taste) > 0);
  assert.ok(scoreAffinity(freshOffice, taste) > scoreAffinity(sweetNight, taste));
});

test('personalizeProducts is identity-stable with no taste', () => {
  const list = [freshOffice, sweetNight];
  const empty = { moods: {}, houses: {}, viewed: [] };
  assert.deepEqual(personalizeProducts(list, empty).map(p => p.id), ['FreshOffice', 'SweetNight']);
});

test('personalizeProducts floats the affine product up', () => {
  const taste = { moods: { fiesta: 3, seductor: 3 }, houses: { ysl: 2 }, viewed: [] };
  const out = personalizeProducts([freshOffice, sweetNight], taste).map(p => p.id);
  assert.equal(out[0], 'SweetNight');
});

test('personalizeRails reorders rails by aggregate affinity', () => {
  const rails = [
    { id: 'fresh', items: [freshOffice] },
    { id: 'sweet', items: [sweetNight] },
  ];
  const taste = { moods: { fiesta: 5, seductor: 5 }, houses: {}, viewed: [] };
  const out = personalizeRails(rails, taste).map(r => r.id);
  assert.equal(out[0], 'sweet');
});

test('applyView accumulates moods, houses and capped views', () => {
  let taste = applyView(undefined, freshOffice);
  taste = applyView(taste, freshOffice);
  assert.equal(taste.viewed.length, 1);            // deduped
  assert.ok(taste.houses.dior >= 2);               // counted twice
  assert.ok(Object.keys(taste.moods).length >= 1);
});

test('store round-trips through localStorage and resets', () => {
  assert.equal(Personalization.hasSignal(), false);
  Personalization.recordView(sweetNight);
  assert.equal(Personalization.hasSignal(), true);
  const taste = Personalization.getTaste();
  assert.ok(taste.viewed.includes('SweetNight'));
  assert.ok(taste.houses.ysl >= 1);
  Personalization.reset();
  assert.equal(Personalization.hasSignal(), false);
});

test('record/scoring are no-ops for null products', () => {
  Personalization.recordView(null);
  assert.equal(Personalization.hasSignal(), false);
  assert.equal(scoreAffinity(null, { moods: {} }), 0);
});
