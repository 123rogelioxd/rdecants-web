/* =============================================================
   GENDER FILTER & PREFERENCE — unit tests
   Covers:
     · catalog filter (male / female / unisex / all / combined)
     · unisex-as-wildcard behaviour
     · assistant gender scoring (boost / penalty / neutral)
     · gender field normalisation helpers (via catalog.js internals
       tested through filterProducts behaviour)
   ============================================================= */

import { test } from 'node:test';
import assert  from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';
import { getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';

/* ── Shared product factory ──────────────────────────────────── */

/** Build a minimal catalog product with an explicit gender field. */
const catProduct = (id, gender, notes = [], desc = '') => ({
  id,
  name: id,
  house: 'House',
  gender,                               /* 'male' | 'female' | 'unisex' | null */
  notes,
  desc,
  story: desc,
  badge: 'Disponible',
  variants: [{
    size: 5, price: 180, stock: 10,
    availability: 10, available: true, soldOut: false,
    variant_id: `v-${id}`,
  }],
});

const MALE_P   = catProduct('masc',   'male',   ['cuero', 'ambar'],  'masculino intenso seductor');
const FEMALE_P = catProduct('fem',    'female', ['rosa',  'jazmin'], 'floral femenino elegante');
const UNISEX_P = catProduct('uni',    'unisex', ['cedro', 'menta'],  'fresco limpio diario');
const NULL_P   = catProduct('nogend', null,     ['citrico'],         'fresco verano ligero');
const CATALOG  = [MALE_P, FEMALE_P, UNISEX_P, NULL_P];

/* ── Catalog filter — gender ─────────────────────────────────── */

test('gender filter null (Todos) returns all products', () => {
  const ids = filterProducts(CATALOG, { gender: null }).map(p => p.id);
  assert.equal(ids.length, CATALOG.length);
  for (const p of CATALOG) assert.ok(ids.includes(p.id));
});

test('gender filter "male" includes male + unisex + untagged, excludes female', () => {
  const ids = filterProducts(CATALOG, { gender: 'male' }).map(p => p.id);
  assert.ok(ids.includes('masc'),   'male product included');
  assert.ok(ids.includes('uni'),    'unisex included (wildcard)');
  assert.ok(ids.includes('nogend'), 'untagged product included (permissive)');
  assert.ok(!ids.includes('fem'),   'female product excluded');
});

test('gender filter "female" includes female + unisex + untagged, excludes male', () => {
  const ids = filterProducts(CATALOG, { gender: 'female' }).map(p => p.id);
  assert.ok(ids.includes('fem'),    'female product included');
  assert.ok(ids.includes('uni'),    'unisex included (wildcard)');
  assert.ok(ids.includes('nogend'), 'untagged product included');
  assert.ok(!ids.includes('masc'),  'male product excluded');
});

test('gender filter "unisex" returns ONLY explicitly-unisex products', () => {
  const ids = filterProducts(CATALOG, { gender: 'unisex' }).map(p => p.id);
  assert.deepEqual(ids, ['uni']);
});

test('unisex products always pass male and female filters', () => {
  const uni = catProduct('u', 'unisex', ['bergamota'], 'fresco');
  for (const g of ['male', 'female']) {
    const ids = filterProducts([uni], { gender: g }).map(p => p.id);
    assert.ok(ids.includes('u'), `unisex passes ${g} filter`);
  }
});

test('products without gender data pass male and female filters', () => {
  const none = catProduct('n', null, ['citrico'], 'fresco');
  for (const g of ['male', 'female']) {
    const ids = filterProducts([none], { gender: g }).map(p => p.id);
    assert.ok(ids.includes('n'), `untagged passes ${g} filter`);
  }
});

test('products without gender data do NOT pass unisex filter', () => {
  const none = catProduct('n', null, ['citrico'], 'fresco');
  const ids = filterProducts([none], { gender: 'unisex' }).map(p => p.id);
  assert.ok(!ids.includes('n'), 'untagged product excluded from unisex filter');
});

test('gender filter combines correctly with text search', () => {
  /* Search "citrico": matches male (citrico note) and untagged (citrico note).
     Unisex has cedro/menta — no citrico → excluded by search.
     Female has rosa/jazmin — no citrico → excluded by search.
     Gender filter 'female' additionally excludes male.
     Net result: only untagged (citrico note, permissive gender) survives. */
  const res = filterProducts(CATALOG, { query: 'citrico', gender: 'female' }).map(p => p.id);
  assert.ok(!res.includes('masc'),  'male excluded by gender filter');
  assert.ok(!res.includes('fem'),   'female has no citrico note — excluded by search');
  assert.ok(!res.includes('uni'),   'unisex has no citrico note — excluded by search');
  assert.ok(res.includes('nogend'), 'untagged has citrico note and passes female gender filter');
});

test('gender filter combines correctly with mood filter', () => {
  /* Mood "elegante" should match feminine floral; but female filter excludes male. */
  const res = filterProducts(
    [MALE_P, FEMALE_P, UNISEX_P],
    { gender: 'female', mood: 'elegante' },
  ).map(p => p.id);
  assert.ok(!res.includes('masc'), 'male excluded by gender');
});

/* ── Assistant gender scoring ────────────────────────────────── */

const variant = (size, price, stock) => ({
  size, price, stock, availability: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: 900 + size,
});

const asstProduct = (id, gender, notes, desc) => ({
  id, name: id, house: 'House', gender, notes, desc, story: desc,
  badge: 'Disponible', featured: false,
  variants: [variant(5, 180, 20)],
});

const M = asstProduct('M', 'male',   ['marino', 'citrico', 'cedro'], 'fresco diario masculino');
const F = asstProduct('F', 'female', ['rosa', 'jazmin', 'bergamota'], 'floral diario femenino');
const U = asstProduct('U', 'unisex', ['cedro', 'bergamota', 'menta'], 'fresco diario unisex');
const N = asstProduct('N', null,     ['citrico', 'vetiver'], 'fresco diario versatil');
const G_CATALOG = [M, F, U, N];

test('assistant gender "any" does not alter existing ranking', () => {
  const withAny = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'any' },
    G_CATALOG,
  );
  const withoutGender = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any' },
    G_CATALOG,
  );
  /* Both should return the same set of products (order may vary by ε) */
  const idsAny     = withAny.map(r => r.product.id).sort();
  const idsNoGender = withoutGender.map(r => r.product.id).sort();
  assert.deepEqual(idsAny, idsNoGender);
});

test('assistant "male" preference ranks male and unisex above female', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'male' },
    [M, F, U],
  );
  const ids = res.map(r => r.product.id);
  /* M and U both get GENDER_BOOST; F gets GENDER_PENALTY.
     M and U must appear before F if all are in results. */
  if (ids.includes('M') && ids.includes('F')) {
    assert.ok(ids.indexOf('M') < ids.indexOf('F'), 'male ranks before female with male preference');
  }
  if (ids.includes('U') && ids.includes('F')) {
    assert.ok(ids.indexOf('U') < ids.indexOf('F'), 'unisex ranks before female with male preference');
  }
});

test('assistant "female" preference ranks female and unisex above male when content is equal', () => {
  /* Use identical content so gender preference is the ONLY tiebreaker. */
  const sameNotes = ['marino', 'citrico', 'cedro', 'bergamota', 'menta'];
  const sameDesc  = 'fresco limpio diario versatil';
  const EM = asstProduct('EM', 'male',   sameNotes, sameDesc);
  const EF = asstProduct('EF', 'female', sameNotes, sameDesc);
  const EU = asstProduct('EU', 'unisex', sameNotes, sameDesc);

  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'female' },
    [EM, EF, EU],
  );
  const ids = res.map(r => r.product.id);

  if (ids.includes('EF') && ids.includes('EM')) {
    assert.ok(ids.indexOf('EF') <= ids.indexOf('EM'),
      'female ranks at or before male when content is equal and female preference is set');
  }
  if (ids.includes('EU') && ids.includes('EM')) {
    assert.ok(ids.indexOf('EU') <= ids.indexOf('EM'),
      'unisex ranks at or before male when content is equal and female preference is set');
  }
});

test('unisex products appear regardless of gender preference', () => {
  for (const gender of ['male', 'female', 'any', 'unisex']) {
    const res = getAssistantRecommendations(
      { family: 'fresco', occasion: 'dia', budget: 'any', gender },
      [U, ...G_CATALOG],
    );
    const ids = res.map(r => r.product.id);
    assert.ok(ids.includes('U'), `unisex appears with gender='${gender}'`);
  }
});

test('assistant gender preference does not hard-exclude mismatched products', () => {
  /* Even with male preference, female product can still appear if score > 0
     (other signals may keep it in the top-N). Not a hard wall. */
  const femaleDominant = asstProduct('FD', 'female', ['marino', 'citrico', 'bergamota', 'vetiver', 'cedro'],
    'fresco limpio diario versatil oficina elegante');
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'male' },
    [femaleDominant], /* only candidate */
  );
  /* Should still return a result — not hard-excluded */
  assert.ok(res.length >= 1, 'mismatched gender product still returned when no better alternative');
});

test('products without gender metadata are neutral (no boost, no penalty)', () => {
  /* N has no gender. With male preference, N should score same as if gender="any". */
  const resWithGender = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'male' },
    [N],
  );
  const resAny = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'any' },
    [N],
  );
  assert.equal(resWithGender.length, resAny.length, 'untagged product: same result count');
  if (resWithGender.length) {
    assert.equal(resWithGender[0].matchScore, resAny[0].matchScore,
      'untagged product: identical match score regardless of gender preference');
  }
});
