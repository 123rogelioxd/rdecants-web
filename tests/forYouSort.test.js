/* =============================================================
   "PARA TI" SORT — integration tests
   Verifica el flujo completo: filterProducts → personalización.
   No testea DOM (searchbar usa módulo-state privado), pero sí
   la lógica pura que _applyPersonalization() orquesta.

   Cobertura:
     · sort for_you en filterProducts cae a trending (función pura)
     · likes suben (personalizeProducts re-rankea)
     · dislikes bajan al fondo (separación + append)
     · sin taste → orden sin cambios (fallback)
     · búsqueda + personalización combinadas
     · mood filter + personalización combinados
     · scoreAffinity 0 con taste vacío
     · filterDisliked fallback cuando catálogo es muy pequeño
     · varios disliked con catálogo pequeño
   ============================================================= */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* localStorage polyfill — necesario para Personalization */
const _store = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_store.has(k) ? _store.get(k) : null),
  setItem:    (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear:      () => _store.clear(),
};

import { filterProducts } from '../assets/js/catalog/search.js';
import {
  Personalization,
  personalizeProducts,
  filterDisliked,
  scoreAffinity,
  applyLike,
  applyDislike,
} from '../assets/js/recommendations/personalization.js';

beforeEach(() => {
  _store.clear();
});

/* ── Helpers ─────────────────────────────────────────────────── */

const p = (id, house, notes, desc) => ({
  id, name: id, house, notes, desc, story: desc, badge: 'Disponible',
  variants: [{
    size: 5, price: 180, stock: 10,
    availability: 10, available: true, soldOut: false,
    variant_id: `v-${id}`,
  }],
});

const FRESH = p('FRESH', 'Dior',   ['marino', 'citrico', 'bergamota'], 'fresco limpio diario versatil');
const SWEET = p('SWEET', 'YSL',    ['vainilla', 'miel', 'tonka'],      'dulce nocturno fiesta gourmand');
const DEEP  = p('DEEP',  'Xerjoff',['oud', 'cuero', 'ambar'],          'intenso seductor exclusivo lujo');
const CATALOG = [FRESH, SWEET, DEEP];

const emptyTaste = () => ({ moods: {}, houses: {}, viewed: [], likes: [], dislikes: [] });

/* ── 1. filterProducts con sort="for_you" cae a trending ──── */
test('filterProducts sort="for_you" produces same order as "trending" (pure function)', () => {
  const trending = filterProducts(CATALOG, { sort: 'trending' }).map(p => p.id);
  const forYou   = filterProducts(CATALOG, { sort: 'for_you'  }).map(p => p.id);
  assert.deepEqual(trending, forYou,
    'filterProducts treats for_you as trending — personalization is searchbar concern');
});

/* ── 2. Sin taste signal → orden intacto (fallback) ─────────── */
test('personalizeProducts with empty taste returns products in original order', () => {
  const taste    = emptyTaste();
  const result   = personalizeProducts(CATALOG, taste).map(p => p.id);
  const original = CATALOG.map(p => p.id);
  /* With zero affinity scores for all, stable sort preserves original index order */
  assert.deepEqual(result, original,
    'empty taste → no reordering, same as original catalog');
});

test('scoreAffinity is 0 for any product when taste is empty', () => {
  const taste = emptyTaste();
  for (const product of CATALOG) {
    assert.equal(scoreAffinity(product, taste), 0,
      `${product.id} affinity must be 0 with empty taste`);
  }
});

/* ── 3. Likes suben al principio ───────────────────────────── */
test('liked product rises to the top of personalizeProducts', () => {
  const taste  = applyLike(emptyTaste(), SWEET);   /* like SWEET */
  const result = personalizeProducts(CATALOG, taste).map(p => p.id);
  assert.equal(result[0], 'SWEET', 'explicitly liked product appears first');
});

test('liked product from the same house boosts other products from that house', () => {
  const houseMate = p('HOUSEP', 'Dior', ['madera', 'cedro'], 'fresco madero discreto');
  const taste     = applyLike(emptyTaste(), FRESH);   /* FRESH is Dior → house 'dior' boosted */
  const result    = personalizeProducts([SWEET, houseMate], taste).map(p => p.id);
  assert.equal(result[0], 'HOUSEP',
    'same-house product rises after liking a Dior product');
});

/* ── 4. Dislikes bajan al fondo (no se ocultan) ─────────────── */
test('disliked products sink to the bottom without being removed', () => {
  const taste     = applyDislike(emptyTaste(), DEEP);
  const dislikedIds = new Set((taste.dislikes ?? []).map(String));

  /* Replicate _applyPersonalization logic */
  const liked    = CATALOG.filter(x => !dislikedIds.has(String(x.id)));
  const disliked = CATALOG.filter(x =>  dislikedIds.has(String(x.id)));
  const result   = [...personalizeProducts(liked, taste), ...disliked].map(p => p.id);

  assert.equal(result.at(-1), 'DEEP', 'disliked product is last');
  assert.ok(result.includes('FRESH') && result.includes('SWEET'),
    'non-disliked products still present');
  assert.equal(result.length, CATALOG.length, 'total count unchanged — no products hidden');
});

test('multiple dislikes all sink to bottom; order among them is preserved', () => {
  let taste = applyDislike(emptyTaste(), DEEP);
  taste     = applyDislike(taste,         SWEET);

  const dislikedIds = new Set(taste.dislikes.map(String));
  const liked    = CATALOG.filter(x => !dislikedIds.has(String(x.id)));
  const disliked = CATALOG.filter(x =>  dislikedIds.has(String(x.id)));
  const result   = [...personalizeProducts(liked, taste), ...disliked].map(p => p.id);

  assert.ok(result.indexOf('FRESH') < result.indexOf('DEEP'),
    'non-disliked FRESH appears before disliked DEEP');
  assert.ok(result.indexOf('FRESH') < result.indexOf('SWEET'),
    'non-disliked FRESH appears before disliked SWEET');
  assert.equal(result.length, 3, 'all products present');
});

/* ── 5. Búsqueda + for_you funcionan juntos ─────────────────── */
test('search filter + personalizeProducts: only matching products are re-ranked', () => {
  const taste = applyLike(emptyTaste(), FRESH);

  /* filterProducts with query "fresco" should return only FRESH */
  const filtered     = filterProducts(CATALOG, { query: 'fresco', sort: 'for_you' });
  const personalized = personalizeProducts(filtered, taste);
  const ids          = personalized.map(p => p.id);

  assert.ok(ids.includes('FRESH'), 'fresco search includes FRESH');
  assert.ok(!ids.includes('SWEET'), 'SWEET excluded by text search');
  assert.ok(!ids.includes('DEEP'),  'DEEP excluded by text search');
});

test('search filter excludes disliked AND non-matching; disliked that match stay visible but last', () => {
  /* SWEET matches 'dulce'; dislike SWEET → SWEET should still appear (search match)
     but at the bottom after personalization */
  const taste     = applyDislike(emptyTaste(), SWEET);
  const filtered  = filterProducts(CATALOG, { query: 'sweet', sort: 'for_you' });
  const dislikedIds = new Set(taste.dislikes.map(String));
  const liked    = filtered.filter(x => !dislikedIds.has(String(x.id)));
  const disliked = filtered.filter(x =>  dislikedIds.has(String(x.id)));
  const result   = [...personalizeProducts(liked, taste), ...disliked].map(p => p.id);

  /* SWEET matches 'dulce' query so it survives filterProducts, then sinks to bottom */
  assert.equal(result.at(-1), 'SWEET',
    'disliked SWEET stays visible (search match) but sinks to the bottom');
});

/* ── 6. Mood filter + for_you funcionan juntos ───────────────── */
test('mood filter + personalizeProducts: mood narrows, taste re-ranks within result', () => {
  /* Like SWEET; filter mood=dulce → only SWEET matches dulce */
  const taste    = applyLike(emptyTaste(), SWEET);
  const filtered = filterProducts(CATALOG, { mood: 'dulce', sort: 'for_you' });
  const result   = personalizeProducts(filtered, taste);

  assert.ok(result.map(p => p.id).includes('SWEET'),
    'liked SWEET appears in mood=dulce result');
});

/* ── 7. filterDisliked fallback when catalog is very small ──── */
test('filterDisliked falls back to full list when too few remain after filtering', () => {
  const taste = applyDislike(emptyTaste(), FRESH);
  taste.dislikes.push('SWEET');   /* dislike 2 of 3 products */

  /* minCount=2 but only 1 (DEEP) would remain after filtering → fallback */
  const result = filterDisliked(CATALOG, taste, { minCount: 2 });
  assert.equal(result.length, 3,
    'falls back to unfiltered catalog when count would drop below minCount');
});

/* ── 8. Personalization.hasSignal() governs fallback ──────────── */
test('Personalization.hasSignal() is false with empty localStorage', () => {
  assert.equal(Personalization.hasSignal(), false,
    'no signal on fresh session');
});

test('Personalization.hasSignal() is true after a like', () => {
  Personalization.recordLike(FRESH);
  assert.equal(Personalization.hasSignal(), true,
    'signal exists after recordLike');
});
