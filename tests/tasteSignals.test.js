import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* localStorage polyfill */
const _store = new Map();
globalThis.localStorage = {
  getItem:    k     => (_store.has(k) ? _store.get(k) : null),
  setItem:    (k,v) => _store.set(k, String(v)),
  removeItem: k     => _store.delete(k),
  clear:      ()    => _store.clear(),
};

import {
  filterDisliked,
  applyLike,
  applyDislike,
  scoreAffinity,
  personalizeProducts,
  Personalization,
} from '../assets/js/recommendations/personalization.js';

import {
  getRelatedProducts,
  getCartUpsells,
} from '../assets/js/recommendations/upsells.js';

import {
  resolveDiscoverySets,
} from '../assets/js/ui/discoverySets.js';

import {
  buildTasteQueue,
} from '../assets/js/ui/tasteBuilder.js';

/* ── Fixtures ─────────────────────────────────────────────────── */

const mkVariant = (size, price, stock = 20) => ({
  size, ml_size: size, price, retail_price: price,
  availability: stock, stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: String(900 + size),
});

const mkProduct = (id, house, notes = [], desc = '', opts = {}) => ({
  id, slug: id, name: id, house, notes,
  desc, story: desc, badge: 'Disponible',
  featured: opts.featured ?? false,
  stock: opts.stock ?? 20,
  image: '',
  variants: [mkVariant(3, opts.price ?? 120), mkVariant(5, (opts.price ?? 120) + 40)],
});

const emptyTaste = { moods: {}, houses: {}, viewed: [], likes: [], dislikes: [] };

const catalog = [
  mkProduct('Fresh1', 'Dior',    ['citrico','bergamota','mineral'], 'fresco limpio diario',    { price: 120, featured: true }),
  mkProduct('Fresh2', 'Creed',   ['menta','citrico','marino'],      'fresco tropical diario',  { price: 130 }),
  mkProduct('Fresh3', 'BDC',     ['bergamota','cedro','lavanda'],   'fresco diario oficina',   { price: 110 }),
  mkProduct('Sedu1',  'YSL',     ['vainilla','tonka','cuero'],      'seductor cita noche',     { price: 200 }),
  mkProduct('Sedu2',  'Lattafa', ['oud','ambar','especias'],        'intenso oriental noche',  { price: 180 }),
  mkProduct('Fiesta1','Paco',    ['vainilla','miel','caramelo'],    'dulce fiesta nocturno',   { price: 170 }),
  mkProduct('Trop1',  'Acqua',   ['coco','pina','marino'],          'tropical verano playa',   { price: 115 }),
];

beforeEach(() => _store.clear());

/* ── filterDisliked — pure unit tests ───────────────────────────── */

test('filterDisliked returns all products when taste has no dislikes', () => {
  const result = filterDisliked(catalog, emptyTaste);
  assert.equal(result.length, catalog.length);
});

test('filterDisliked returns all products for null/undefined taste', () => {
  assert.equal(filterDisliked(catalog, null).length,      catalog.length);
  assert.equal(filterDisliked(catalog, undefined).length, catalog.length);
});

test('filterDisliked excludes products whose ids are in taste.dislikes', () => {
  const taste = { ...emptyTaste, dislikes: ['Fresh1', 'Sedu1'] };
  const result = filterDisliked(catalog, taste);
  assert.ok(!result.some(p => p.id === 'Fresh1'), 'Fresh1 excluded');
  assert.ok(!result.some(p => p.id === 'Sedu1'),  'Sedu1 excluded');
  assert.equal(result.length, catalog.length - 2);
});

test('filterDisliked falls back to full catalog when filtering leaves fewer than minCount', () => {
  const taste = { ...emptyTaste, dislikes: catalog.map(p => p.id) }; // all disliked
  const result = filterDisliked(catalog, taste, { minCount: 2 });
  assert.equal(result.length, catalog.length, 'fell back to full catalog');
});

test('filterDisliked returns empty when all disliked and minCount is 0', () => {
  const taste = { ...emptyTaste, dislikes: catalog.map(p => p.id) };
  const result = filterDisliked(catalog, taste); // no minCount
  assert.equal(result.length, 0);
});

test('filterDisliked handles empty product array', () => {
  const taste = { ...emptyTaste, dislikes: ['Fresh1'] };
  assert.deepEqual(filterDisliked([], taste), []);
});

test('filterDisliked handles null product array gracefully', () => {
  const taste = { ...emptyTaste, dislikes: ['Fresh1'] };
  assert.deepEqual(filterDisliked(null, taste), []);
});

/* ── Likes boost recommendation affinity ────────────────────────── */

test('liking a product boosts its house and moods in taste', () => {
  const fresh1 = catalog[0]; // Dior, fresco
  const after = applyLike(emptyTaste, fresh1);
  assert.ok(after.houses.dior > 0, 'Dior house gets positive weight');
  const moodSum = Object.values(after.moods).reduce((s, v) => s + v, 0);
  assert.ok(moodSum > 0, 'mood profiles boosted');
});

test('liking a product increases scoreAffinity for similar products', () => {
  const fresh1 = catalog[0]; // Dior, fresco
  const fresh3 = catalog[2]; // BDC, fresco/office — similar
  const sedu1  = catalog[3]; // YSL, seductor — different

  const taste = applyLike(emptyTaste, fresh1);
  const affinityFresh3 = scoreAffinity(fresh3, taste);
  const affinitySedu1  = scoreAffinity(sedu1,  taste);

  // Fresh3 shares family/profiles with Fresh1 → higher affinity after liking Fresh1
  assert.ok(affinityFresh3 >= 0, 'affinity is non-negative');
  // The liked house (Dior) does not match BDC or YSL directly,
  // but matched moods should lift Fresh3 over Sedu1
  assert.ok(affinityFresh3 >= affinitySedu1, 'fresh product ranks higher than seductor after liking fresh');
});

test('personalizeProducts floats liked-profile products to the top', () => {
  const fresh1 = catalog[0]; // Dior, fresco — liked
  const taste = applyLike(emptyTaste, fresh1);

  const ordered = personalizeProducts(catalog, taste).map(p => p.id);
  // The first product should be from the fresh/diario family now
  const freshIds = ['Fresh1', 'Fresh2', 'Fresh3', 'Trop1'];
  assert.ok(freshIds.includes(ordered[0]), `top product "${ordered[0]}" is from the liked profile`);
});

/* ── Dislikes suppress recommendations ──────────────────────────── */

test('disliked products do not appear in getRelatedProducts when avoidable', () => {
  const seed  = catalog[0]; // Fresh1 / Dior
  const taste = { ...emptyTaste, dislikes: ['Fresh2', 'Fresh3', 'Trop1'] };
  const eligible = filterDisliked(catalog, taste, { minCount: 2 });

  const related = getRelatedProducts(seed, eligible, { limit: 4 });
  assert.ok(!related.some(p => p.id === 'Fresh2'),  'disliked Fresh2 excluded');
  assert.ok(!related.some(p => p.id === 'Fresh3'),  'disliked Fresh3 excluded');
  assert.ok(!related.some(p => p.id === 'Trop1'),   'disliked Trop1 excluded');
});

test('getRelatedProducts falls back gracefully when catalog is very small after filtering', () => {
  const seed  = catalog[0];
  // dislike everything except the seed
  const taste = { ...emptyTaste, dislikes: catalog.slice(1).map(p => p.id) };
  // minCount=2 → will fall back to unfiltered because only seed remains
  const eligible = filterDisliked(catalog, taste, { minCount: 2 });
  const related = getRelatedProducts(seed, eligible, { limit: 4 });
  // Should not crash and should return something or nothing without throwing
  assert.ok(Array.isArray(related));
});

test('disliked products do not appear in cart upsells when avoidable', () => {
  const cartItems = [{ sourceId: 'Fresh1', id: 'Fresh1', size: 3 }];
  const taste = { ...emptyTaste, dislikes: ['Sedu1', 'Sedu2'] };
  const eligible = filterDisliked(catalog, taste, { minCount: 3 });

  const upsells = getCartUpsells(cartItems, eligible, { limit: 3 });
  assert.ok(!upsells.some(p => p.id === 'Sedu1'), 'Sedu1 disliked — excluded from upsells');
  assert.ok(!upsells.some(p => p.id === 'Sedu2'), 'Sedu2 disliked — excluded from upsells');
});

test('disliked products do not appear in discovery sets when avoidable', () => {
  const taste = { ...emptyTaste, dislikes: ['Fresh1', 'Fresh2'] };
  const eligible = filterDisliked(catalog, taste, { minCount: 3 });
  const sets = resolveDiscoverySets(eligible);

  const allSetProducts = sets.flatMap(s => s.products.map(p => p.id));
  assert.ok(!allSetProducts.includes('Fresh1'), 'Fresh1 disliked — not in any set');
  assert.ok(!allSetProducts.includes('Fresh2'), 'Fresh2 disliked — not in any set');
});

test('Taste Builder queue excludes disliked products', () => {
  const taste = { ...emptyTaste, dislikes: ['Sedu1', 'Trop1'] };
  const queue = buildTasteQueue(catalog, taste);
  assert.ok(!queue.some(p => p.id === 'Sedu1'), 'Sedu1 disliked — not in queue');
  assert.ok(!queue.some(p => p.id === 'Trop1'), 'Trop1 disliked — not in queue');
});

/* ── Reset clears all signals ───────────────────────────────────── */

test('Personalization.reset clears likes, dislikes, views and moods', () => {
  Personalization.recordLike(catalog[0]);
  Personalization.recordDislike(catalog[1]);

  assert.ok(Personalization.hasSignal(), 'signal present before reset');
  Personalization.reset();

  const t = Personalization.getTaste();
  assert.deepEqual(t.likes,    [], 'likes cleared');
  assert.deepEqual(t.dislikes, [], 'dislikes cleared');
  assert.deepEqual(t.viewed,   [], 'viewed cleared');
  assert.deepEqual(t.moods,    {}, 'moods cleared');
  assert.deepEqual(t.houses,   {}, 'houses cleared');
  assert.ok(!Personalization.hasSignal(), 'no signal after reset');
});

test('hasSignal returns true when only dislikes exist (no views)', () => {
  Personalization.recordDislike(catalog[0]);
  // recordDislike does NOT add to viewed
  const t = Personalization.getTaste();
  assert.equal(t.viewed.length, 0);
  assert.equal(t.dislikes.length, 1);
  assert.ok(Personalization.hasSignal(), 'hasSignal true when only dislikes');
});

test('hasSignal returns true when only likes exist', () => {
  Personalization.recordLike(catalog[0]);
  assert.ok(Personalization.hasSignal());
});

/* ── Aliases never exposed ──────────────────────────────────────── */

test('filterDisliked does not expose or modify fragrance aliases', () => {
  const withAliases = {
    ...catalog[0],
    fragrance: { aliases: ['jhony', 'roger'], scent_family_normalized: 'aromatic' },
  };
  const taste = { ...emptyTaste, dislikes: [] };
  const result = filterDisliked([withAliases, ...catalog.slice(1)], taste);
  // Aliases are in fragrance.aliases — filterDisliked does not touch them
  const product = result.find(p => p.id === 'Fresh1');
  assert.ok(product, 'product returned');
  assert.deepEqual(product.fragrance?.aliases, ['jhony', 'roger'], 'aliases untouched by filter');
  // But the aliases should never appear in product names or other visible fields
  assert.ok(!product.name.includes('jhony') && !product.name.includes('roger'),
    'aliases not in product name');
});
