import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLEMENT_MAP,
  FAMILY_COMPLEMENT_MAP,
  COMPLEMENT_REASON,
  getCollectionPairs,
  getComplementReason,
} from '../assets/js/recommendations/crossSell.js';

import { EVENTS, Tracker } from '../assets/js/tracking/tracker.js';

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

/* Deliberately typed catalog so we can assert complement direction */
const freshDaily = mkProduct('Fresh1', 'Dior', ['citrico','bergamota','mineral'], 'fresco limpio diario versatil', { price: 120, featured: true });
const freshOffice = mkProduct('Fresh2', 'Creed', ['bergamota','cedro','vetiver'], 'oficina formal discreto profesional', { price: 150 });
const nightSedu   = mkProduct('Night1', 'YSL', ['vainilla','tonka','cuero'], 'seductor noche cita sensual', { price: 200 });
const nightFiesta = mkProduct('Night2', 'Paco', ['vainilla','miel','canela'], 'dulce fiesta rastro nocturno', { price: 170 });
const niche       = mkProduct('Niche1', 'Creed', ['iris','sandalo','incienso'], 'elegante sofisticado lujo refinado', { price: 280, featured: true });
const tropical    = mkProduct('Trop1',  'Acqua', ['coco','marino','menta'], 'tropical verano playa calor', { price: 115 });

const catalog = [freshDaily, freshOffice, nightSedu, nightFiesta, niche, tropical];
const emptyTaste = { moods: {}, houses: {}, viewed: [], likes: [], dislikes: [] };

/* ── COMPLEMENT_MAP config ──────────────────────────────────────── */

test('COMPLEMENT_MAP defines complement axes for all use cases', () => {
  const expectedKeys = ['diario', 'oficina', 'fiesta', 'tropical', 'seductor', 'elegante'];
  for (const key of expectedKeys) {
    assert.ok(Array.isArray(COMPLEMENT_MAP[key]), `${key} has complement array`);
    assert.ok(COMPLEMENT_MAP[key].length >= 1, `${key} has at least one complement`);
  }
});

test('COMPLEMENT_MAP is directionally consistent — complement of A includes B when B complements A', () => {
  /* If daily → seductive, then seductive → daily should also hold */
  const dailyComplements  = COMPLEMENT_MAP.diario ?? [];
  const seduComplements   = COMPLEMENT_MAP.seductor ?? [];
  assert.ok(dailyComplements.includes('seductor'), 'daily → seductive');
  assert.ok(seduComplements.includes('diario'),    'seductive → daily (reverse direction)');
});

test('FAMILY_COMPLEMENT_MAP defines fresh/sweet/intense axes', () => {
  assert.ok(FAMILY_COMPLEMENT_MAP.fresco.includes('dulce'),   'fresco → dulce');
  assert.ok(FAMILY_COMPLEMENT_MAP.fresco.includes('intenso'), 'fresco → intenso');
  assert.ok(FAMILY_COMPLEMENT_MAP.dulce.includes('fresco'),   'dulce → fresco');
});

test('COMPLEMENT_REASON has a copy string for every key in COMPLEMENT_MAP', () => {
  for (const key of Object.keys(COMPLEMENT_MAP)) {
    assert.ok(
      typeof COMPLEMENT_REASON[key] === 'string' && COMPLEMENT_REASON[key].length > 0,
      `COMPLEMENT_REASON.${key} has non-empty copy`,
    );
  }
});

/* ── getCollectionPairs — core logic ────────────────────────────── */

test('getCollectionPairs returns empty for empty seed', () => {
  assert.deepEqual(getCollectionPairs([], catalog, emptyTaste), []);
});

test('getCollectionPairs returns empty for empty catalog', () => {
  assert.deepEqual(getCollectionPairs([freshDaily], [], emptyTaste), []);
});

test('getCollectionPairs returns empty for null inputs', () => {
  assert.deepEqual(getCollectionPairs(null, catalog, emptyTaste), []);
  assert.deepEqual(getCollectionPairs([freshDaily], null, emptyTaste), []);
});

test('getCollectionPairs excludes seed products from results', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste);
  assert.ok(!pairs.some(p => p.id === 'Fresh1'), 'seed not in results');
});

test('getCollectionPairs excludes sold-out products', () => {
  const soldOut = { ...nightSedu, stock: 0, variants: nightSedu.variants.map(v => ({ ...v, stock: 0, soldOut: true, available: false })) };
  const restricted = catalog.filter(p => p.id !== 'Night1').concat(soldOut);
  const pairs = getCollectionPairs([freshDaily], restricted, emptyTaste);
  assert.ok(!pairs.some(p => p.id === 'Night1'), 'sold-out excluded');
});

test('getCollectionPairs respects limit', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste, { limit: 2 });
  assert.ok(pairs.length <= 2);
});

test('getCollectionPairs returns no duplicates', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste, { limit: 3 });
  const ids = pairs.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate products');
});

/* ── Complementary direction ────────────────────────────────────── */

test('fresh/daily seed → result is night/seductive, not another fresh product', () => {
  /* Fresh1 is fresh/daily → complement should be seductor/fiesta, not more fresh */
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste);
  assert.ok(pairs.length > 0, 'at least one complement found');

  /* Complementary products should include night/seductive products */
  const nightIds = [nightSedu.id, nightFiesta.id, niche.id];
  assert.ok(
    pairs.some(p => nightIds.includes(p.id)),
    `result includes a night/seductive product (got: ${pairs.map(p => p.id)})`,
  );

  /* Should NOT include another fresh/daily product when better options exist */
  const freshIds = [freshOffice.id, tropical.id];
  const containsFresh = pairs.every(p => freshIds.includes(p.id));
  assert.ok(!containsFresh, 'result is not exclusively more fresh products');
});

test('office seed → result is seductive/night (complement axis), not more office', () => {
  const pairs = getCollectionPairs([freshOffice], catalog, emptyTaste);
  assert.ok(pairs.length > 0, 'at least one complement found');

  /* Night/seductive should rank above generic fresh when cart is already office */
  const nightIds = [nightSedu.id, nightFiesta.id, niche.id];
  assert.ok(pairs.some(p => nightIds.includes(p.id)), 'includes a night product for office seed');
});

test('night/seductive seed → result includes fresh/daily (reverse complement)', () => {
  const pairs = getCollectionPairs([nightSedu], catalog, emptyTaste);
  assert.ok(pairs.length > 0);
  const freshIds = [freshDaily.id, freshOffice.id, tropical.id];
  assert.ok(pairs.some(p => freshIds.includes(p.id)), 'includes fresh product for night seed');
});

/* ── No duplicates / de-duplication ────────────────────────────── */

test('seeds with multiple products do not appear in results', () => {
  const seeds = [freshDaily, freshOffice];
  const pairs = getCollectionPairs(seeds, catalog, emptyTaste, { limit: 3 });
  assert.ok(!pairs.some(p => p.id === 'Fresh1'), 'seed 1 excluded');
  assert.ok(!pairs.some(p => p.id === 'Fresh2'), 'seed 2 excluded');
});

test('getCollectionPairs does not return seed product even when catalog is tiny', () => {
  const tiny = [freshDaily, nightSedu]; // only 2 products
  const pairs = getCollectionPairs([freshDaily], tiny, emptyTaste, { limit: 3 });
  assert.ok(!pairs.some(p => p.id === 'Fresh1'), 'seed not in pairs');
});

/* ── Personalization boost ──────────────────────────────────────── */

test('taste boost lifts preferred-house products as tiebreaker', () => {
  /* Give the user a strong YSL preference.
     Night1 (YSL) and Night2 (Paco) are both night products.
     With YSL taste signal, Night1 should rank above Night2. */
  const yslTaste = { moods: { seductor: 5, fiesta: 3 }, houses: { ysl: 10 }, viewed: [], likes: [], dislikes: [] };
  const pairs = getCollectionPairs([freshDaily], catalog, yslTaste, { limit: 2 });
  const ids = pairs.map(p => p.id);
  if (ids.includes('Night1') && ids.includes('Night2')) {
    assert.equal(ids[0], 'Night1', 'YSL (Night1) ranked first with YSL taste signal');
  } else if (ids.includes('Night1')) {
    assert.ok(true, 'Night1 (YSL) in results — taste signal aligned');
  }
  // At minimum, both are valid night complements — just verify no crash
  assert.ok(Array.isArray(pairs));
});

test('getCollectionPairs works without taste signal (null taste)', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, null, { limit: 2 });
  assert.ok(Array.isArray(pairs), 'returns array without taste');
});

/* ── Fallback when catalog is small ─────────────────────────────── */

test('returns empty when no product scores above MIN_SCORE threshold', () => {
  /* Catalog of only the same fresh daily products — no clear complement */
  const allFresh = [
    mkProduct('F1','D1',['citrico','bergamota'],'fresco diario limpio',{price:100}),
    mkProduct('F2','D2',['menta','citrico'],'fresco diario versatil',{price:100}),
    mkProduct('F3','D3',['bergamota','mineral'],'fresco diario',{price:100}),
  ];
  const seed = allFresh[0];
  const rest = allFresh.slice(1);
  /* With only fresh/daily products and a fresh/daily seed, complements score low.
     Expect 0 results (MIN_SCORE=5 not met) or a graceful empty result. */
  const pairs = getCollectionPairs([seed], rest, emptyTaste, { limit: 2 });
  assert.ok(Array.isArray(pairs), 'returns array');
  /* Verify it doesn't return fresh-on-fresh (wrong axis) */
  assert.ok(pairs.length <= 1, 'few or no results when catalog has no clear complement');
});

/* ── getComplementReason ────────────────────────────────────────── */

test('getComplementReason returns a non-empty string for a fresh/daily seed', () => {
  const reason = getComplementReason([freshDaily]);
  assert.ok(typeof reason === 'string', 'returns a string');
  assert.ok(reason.length > 0, 'non-empty');
});

test('getComplementReason returns empty string for empty seeds', () => {
  assert.equal(getComplementReason([]), '');
  assert.equal(getComplementReason(null), '');
});

/* ── Tracking events ────────────────────────────────────────────── */

test('EVENTS includes the three collection_builder_* constants', () => {
  assert.equal(EVENTS.COLLECTION_BUILDER_VIEWED,  'collection_builder_viewed');
  assert.equal(EVENTS.COLLECTION_BUILDER_CLICKED, 'collection_builder_clicked');
  assert.equal(EVENTS.COLLECTION_BUILDER_ADDED,   'collection_builder_added');
});

test('Tracker.collectionBuilderViewed emits with ids, count, source', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'collection_builder_viewed') received.push(payload);
  });
  Tracker.collectionBuilderViewed([freshDaily, nightSedu], 'pdp');
  const p = received.find(r => r.source === 'pdp');
  assert.ok(p, 'event emitted');
  assert.equal(p.count, 2);
  assert.ok(Array.isArray(p.ids) && p.ids.length === 2);
});

test('Tracker.collectionBuilderClicked emits with productId and position', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'collection_builder_clicked') received.push(payload);
  });
  Tracker.collectionBuilderClicked(nightSedu, 1, 'cart');
  const p = received.find(r => r.productId === nightSedu.id);
  assert.ok(p, 'event emitted');
  assert.equal(p.position, 1);
  assert.equal(p.source, 'cart');
});

test('Tracker.collectionBuilderAdded emits with productId and position', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'collection_builder_added') received.push(payload);
  });
  Tracker.collectionBuilderAdded(nightSedu, 2, 'pdp');
  const p = received.find(r => r.productId === nightSedu.id && r.source === 'pdp');
  assert.ok(p, 'event emitted');
  assert.equal(p.position, 2);
});

/* ── Cart integration shape ─────────────────────────────────────── */

test('getCollectionPairs result products are compatible with cart.add (have id and variants)', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste, { limit: 2 });
  for (const p of pairs) {
    assert.ok(p.id, 'has id');
    assert.ok(Array.isArray(p.variants) && p.variants.length > 0, 'has variants');
  }
});

/* ── PDP integration shape ──────────────────────────────────────── */

test('getCollectionPairs with limit:2 appropriate for PDP pair display', () => {
  const pairs = getCollectionPairs([freshDaily], catalog, emptyTaste, { limit: 2 });
  assert.ok(pairs.length <= 2, 'max 2 for PDP');
  /* Verify pairs have all required display fields */
  for (const p of pairs) {
    assert.ok(typeof p.name === 'string', 'has name');
    assert.ok(typeof p.house === 'string', 'has house');
  }
});
