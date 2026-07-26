/* =============================================================
   Gender: normalization, compatibility tiers, catalog filter, badge.

   This is the file that guards the root cause of the "Torino 21 shows up
   for Mujer" bug. R Supply OS sends a SEVEN-value taxonomy and two of the
   values — `lean_masculine` and `lean_feminine` — were missing from the
   alias table, so they normalized to 'unknown', and an unknown gender used
   to be eligible for every selection. Eight live products (Torino 21,
   Erba Pura, Erba Gold, Millesime Imperial, both Jean Lowes and two more)
   were therefore compatible with "Mujer".
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';
import { getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';
import {
  getGenderEligibility, matchesGender, normalizeGender,
  genderPriority, getGenderDisplay, isUnrecognizedGender, GENDER_VALUES,
} from '../assets/js/utils/gender.js';

const variant = (size = 5, price = 180, stock = 10) => ({
  size,
  price,
  stock,
  availability: stock,
  available: stock > 0,
  soldOut: stock <= 0,
  variant_id: `v-${size}-${price}`,
});

/* Enough metadata to clear the engine's confidence gate, so these fixtures
   test GENDER and not "does a bare product get recommended". */
const FRAGRANCE = {
  occasions: ['diario', 'oficina'],
  climates: ['calido', 'templado'],
  moods: ['limpio', 'moderno'],
  style_tags: ['fresco', 'limpio'],
  recommendation_tags: ['diario', 'facil_de_usar'],
  accords: ['citrico'],
  scent_family_normalized: 'citrico',
  scores: {
    versatility: 0.8, mass_appeal: 0.75, blind_buy_safe: 0.7, beginner_friendly: 0.8,
    office_safe: 0.8, intensity: 0.4, projection: 0.4, freshness: 0.8,
    summer: 0.8, cold_weather: 0.5, longevity: 0.6, night_out: 0.4,
    date_night: 0.5, compliment: 0.6, elegance: 0.6, luxury: 0.5,
    exclusivity: 0.4, sweetness: 0.3,
  },
};

const product = (id, gender, notes = ['bergamota'], desc = 'fresco diario') => ({
  id,
  name: id,
  house: 'House',
  gender,
  notes,
  desc,
  story: desc,
  badge: 'Disponible',
  variants: [variant()],
  fragrance: { ...FRAGRANCE },
});

const SAUVAGE = product('Sauvage', 'hombre', ['ambroxan', 'bergamota'], 'fresco masculino');
const BLEU = product('Bleu', 'masculine', ['cedro', 'citricos'], 'azul masculino');
const YARA = product('Yara', 'mujer', ['vainilla', 'frutas'], 'dulce femenino');
const COCO = product('Coco Mademoiselle', 'female', ['rosa', 'jazmin'], 'floral femenino');
const NAXOS = product('Naxos', 'unisex', ['miel', 'tabaco'], 'elegante unisex');
const UNKNOWN = product('Unknown', null, ['citricos'], 'sin genero');
const LEAN_M = product('Lean Masculine', 'lean_masculine', ['bergamota'], 'fresco');
const LEAN_F = product('Lean Feminine', 'lean_feminine', ['rosa'], 'floral');
const CATALOG = [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN];

/* ── A. Normalization ───────────────────────────────────────────── */

test('normalizes gender values in English and Spanish', () => {
  for (const value of ['masculine', 'male', 'hombre', 'masculino', 'pour homme']) {
    assert.equal(normalizeGender(value), 'masculine');
  }
  for (const value of ['feminine', 'female', 'mujer', 'femenino', 'dama', 'pour femme']) {
    assert.equal(normalizeGender(value), 'feminine');
  }
  assert.equal(normalizeGender('unisex'), 'unisex');
  assert.equal(normalizeGender('unisex inclinado masculino'), 'unisex_masculine');
  assert.equal(normalizeGender('unisex inclinado femenino'), 'unisex_feminine');
  assert.equal(normalizeGender('sin asignar'), 'unknown');
  assert.equal(normalizeGender(null), 'unknown');
});

/* THE root-cause regression. These two values are what R Supply OS actually
   sends for eight products in the live catalog. */
test('lean_masculine and lean_feminine are canonical, not unknown', () => {
  assert.equal(normalizeGender('lean_masculine'), 'lean_masculine');
  assert.equal(normalizeGender('lean_feminine'), 'lean_feminine');
  assert.equal(normalizeGender('LEAN-MASCULINE'), 'lean_masculine');
  assert.equal(normalizeGender('inclinado a femenino'), 'lean_feminine');
  assert.notEqual(normalizeGender('lean_masculine'), 'unknown');
});

test('normalizeGender is idempotent for every canonical value', () => {
  for (const value of GENDER_VALUES) {
    assert.equal(normalizeGender(value), value, value);
    assert.equal(normalizeGender(normalizeGender(value)), value, `${value} twice`);
  }
});

test('an unmappable value is reported, not silently treated as "no data"', () => {
  assert.equal(isUnrecognizedGender('androgino-premium'), true);
  assert.equal(normalizeGender('androgino-premium'), 'unknown');
  /* An empty field or an explicit "unassigned" is missing data, not a typo. */
  assert.equal(isUnrecognizedGender(''), false);
  assert.equal(isUnrecognizedGender(null), false);
  assert.equal(isUnrecognizedGender('sin asignar'), false);
  for (const value of GENDER_VALUES) assert.equal(isUnrecognizedGender(value), false, value);
});

/* ── B. Catalog filter ─────────────────────────────────────────── */

test('gender filter null returns all products', () => {
  assert.equal(filterProducts(CATALOG, { gender: null }).length, CATALOG.length);
});

test('gender filter Mujer returns mujer + unisex, not hombre or unknown', () => {
  const ids = filterProducts(CATALOG, { gender: 'mujer' }).map(p => p.id).sort();
  assert.deepEqual(ids, ['Coco Mademoiselle', 'Naxos', 'Yara']);
});

test('gender filter Hombre returns hombre + unisex, not mujer or unknown', () => {
  const ids = filterProducts(CATALOG, { gender: 'hombre' }).map(p => p.id).sort();
  assert.deepEqual(ids, ['Bleu', 'Naxos', 'Sauvage']);
});

/* This assertion used to claim "returns only unisex" while asserting the
   ENTIRE catalog, because masculine and feminine were both 'secondary' for a
   unisex selection and the filter accepted secondary. Selecting Unisex now
   means what it says. */
test('gender filter Unisex returns only unisex, never the whole catalog', () => {
  const ids = filterProducts(CATALOG, { gender: 'unisex' }).map(p => p.id).sort();
  assert.deepEqual(ids, ['Naxos']);

  const withLeaning = filterProducts([...CATALOG, LEAN_M, LEAN_F], { gender: 'unisex' })
    .map(p => p.id).sort();
  assert.deepEqual(withLeaning, ['Naxos'], 'a gendered-leaning profile is not a unisex product');
});

test('a leaning profile is filtered as its dominant side', () => {
  const catalog = [...CATALOG, LEAN_M, LEAN_F];
  assert.ok(filterProducts(catalog, { gender: 'hombre' }).map(p => p.id).includes('Lean Masculine'));
  assert.ok(!filterProducts(catalog, { gender: 'mujer' }).map(p => p.id).includes('Lean Masculine'));
  assert.ok(filterProducts(catalog, { gender: 'mujer' }).map(p => p.id).includes('Lean Feminine'));
  assert.ok(!filterProducts(catalog, { gender: 'hombre' }).map(p => p.id).includes('Lean Feminine'));
});

test('legacy selected values male/female still follow strict compatibility', () => {
  assert.equal(matchesGender(SAUVAGE, 'male'), true);
  assert.equal(matchesGender(YARA, 'male'), false);
  assert.equal(matchesGender(YARA, 'female'), true);
  assert.equal(matchesGender(SAUVAGE, 'female'), false);
});

test('products unknown do not appear when a strict gender filter is selected', () => {
  for (const gender of ['hombre', 'mujer', 'unisex']) {
    assert.equal(matchesGender(UNKNOWN, gender), false);
    assert.ok(!filterProducts([UNKNOWN], { gender }).length);
  }
});

test('gender filter combines with text search without letting unknown through', () => {
  const ids = filterProducts(CATALOG, { query: 'Unknown', gender: 'mujer' }).map(p => p.id);
  assert.deepEqual(ids, []);
});

test('gender filter combines with mood without inferring gender from mood text', () => {
  const masculineMoodText = product('Floral Homme Text', 'mujer', ['rosa'], 'femenino elegante masculino');
  const ids = filterProducts([SAUVAGE, masculineMoodText], { gender: 'mujer', mood: 'elegante' }).map(p => p.id);
  assert.deepEqual(ids, ['Floral Homme Text']);
});

/* ── C. Compatibility tiers ────────────────────────────────────── */

test('Mujer: feminine and lean_feminine are the primary answers', () => {
  for (const gender of ['Femenino', 'lean_feminine'] ) {
    const eligibility = getGenderEligibility(product(gender, gender), 'Mujer');
    assert.equal(eligibility.priority, 'primary', gender);
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.penalty, 0);
    assert.equal(eligibility.weight, 1);
  }
});

test('Mujer: unisex and unisex_feminine are compatible, not the direct answer', () => {
  for (const gender of ['Unisex', 'Unisex inclinado femenino']) {
    const eligibility = getGenderEligibility(product(gender, gender), 'Mujer');
    assert.equal(eligibility.priority, 'secondary', gender);
    assert.equal(eligibility.eligible, true);
    assert.ok(eligibility.weight < 1 && eligibility.weight > 0.5, gender);
  }
});

test('Mujer: unisex_masculine is wearable but weakest', () => {
  const eligibility = getGenderEligibility(product('leanM', 'Unisex inclinado masculino'), 'Mujer');
  assert.equal(eligibility.priority, 'weak');
  assert.equal(eligibility.eligible, true);
  assert.ok(eligibility.weight <= 0.5);
});

test('Mujer: masculine AND lean_masculine are rejected outright', () => {
  for (const gender of ['Masculino', 'lean_masculine']) {
    assert.deepEqual(
      { ...getGenderEligibility(product('x', gender), 'Mujer'), productGender: undefined },
      { eligible: false, priority: 'rejected', penalty: Infinity, weight: 0, productGender: undefined },
      gender,
    );
  }
});

test('Hombre applies the mirror-image rule', () => {
  for (const gender of ['Masculino', 'lean_masculine']) {
    assert.equal(getGenderEligibility(product('x', gender), 'Hombre').priority, 'primary', gender);
  }
  for (const gender of ['Unisex', 'Unisex inclinado masculino']) {
    assert.equal(getGenderEligibility(product('x', gender), 'Hombre').priority, 'secondary', gender);
  }
  assert.equal(getGenderEligibility(product('x', 'Unisex inclinado femenino'), 'Hombre').priority, 'weak');
  for (const gender of ['Femenino', 'lean_feminine']) {
    assert.equal(getGenderEligibility(product('x', gender), 'Hombre').eligible, false, gender);
  }
});

test('Unisex does not make the whole catalog compatible', () => {
  assert.equal(genderPriority('unisex', 'unisex'), 'primary');
  assert.equal(genderPriority('unisex', 'unisex_masculine'), 'secondary');
  assert.equal(genderPriority('unisex', 'unisex_feminine'), 'secondary');
  /* A gendered-leaning profile is the closest compatible thing, not a match. */
  assert.equal(genderPriority('unisex', 'lean_masculine'), 'weak');
  assert.equal(genderPriority('unisex', 'lean_feminine'), 'weak');
  /* And a plainly gendered product is not a unisex product. */
  assert.equal(genderPriority('unisex', 'masculine'), 'rejected');
  assert.equal(genderPriority('unisex', 'feminine'), 'rejected');
});

test('an unknown product gender is never a match for an answered question', () => {
  for (const selected of ['hombre', 'mujer', 'unisex']) {
    const eligibility = getGenderEligibility(UNKNOWN, selected);
    assert.equal(eligibility.priority, 'unknown', selected);
    assert.equal(eligibility.eligible, false, `${selected}: missing data is not compatibility`);
  }
});

test('no selection applies no gender rule at all', () => {
  for (const gender of ['Masculino', 'Femenino', 'Unisex', 'lean_masculine', null]) {
    assert.equal(getGenderEligibility(product(String(gender), gender), 'any').eligible, true);
    assert.equal(getGenderEligibility(product(String(gender), gender), null).eligible, true);
  }
});

/* ── D. Display ────────────────────────────────────────────────── */

test('the badge collapses seven canonical values into three honest buckets', () => {
  assert.deepEqual(getGenderDisplay('masculine'), { key: 'masculine', label: 'Hombre' });
  assert.deepEqual(getGenderDisplay('lean_masculine'), { key: 'masculine', label: 'Hombre' });
  assert.deepEqual(getGenderDisplay('feminine'), { key: 'feminine', label: 'Mujer' });
  assert.deepEqual(getGenderDisplay('lean_feminine'), { key: 'feminine', label: 'Mujer' });
  assert.deepEqual(getGenderDisplay('unisex'), { key: 'unisex', label: 'Unisex' });
  assert.deepEqual(getGenderDisplay('unisex_masculine'), { key: 'unisex', label: 'Unisex' });
  assert.equal(getGenderDisplay('unknown'), null, 'no metadata → no badge, never a default');
  assert.equal(getGenderDisplay(UNKNOWN), null);
});

/* ── E. End to end through the recommender ─────────────────────── */

test('Mujer never recommends a masculine product', () => {
  const res = getAssistantRecommendations(
    { gender: 'mujer', occasion: 'dia', goal: 'versatil' },
    [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN, LEAN_M],
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Sauvage'));
  assert.ok(!ids.includes('Bleu'));
  assert.ok(!ids.includes('Lean Masculine'), 'lean_masculine is masculine for this purpose');
  assert.ok(!ids.includes('Unknown'), 'unknown gender is not a match either');
  assert.ok(ids.every(id => ['Yara', 'Coco Mademoiselle', 'Naxos'].includes(id)), ids.join(','));
});

test('Hombre never recommends a feminine product', () => {
  const res = getAssistantRecommendations(
    { gender: 'hombre', occasion: 'dia', goal: 'versatil' },
    [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN, LEAN_F],
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Yara'));
  assert.ok(!ids.includes('Coco Mademoiselle'));
  assert.ok(!ids.includes('Lean Feminine'));
  assert.ok(!ids.includes('Unknown'));
  assert.ok(ids.every(id => ['Sauvage', 'Bleu', 'Naxos'].includes(id)), ids.join(','));
});

test('primary gender matches rank above merely compatible ones', () => {
  const primary = product('Primary Feminine', 'Femenino');
  const compatible = product('Compatible Unisex', 'Unisex');
  const res = getAssistantRecommendations(
    { gender: 'mujer', occasion: 'dia', goal: 'versatil' },
    [compatible, primary],
    { limit: 2 },
  );
  assert.deepEqual(res.map(r => r.product.id), ['Primary Feminine', 'Compatible Unisex']);
});

/* The named regression from the brief, as a unit test: a high-scoring
   masculine product cannot appear for Mujer no matter how good its metadata
   is on every other dimension. */
test('a high-scoring masculine product cannot leak into Mujer recommendations', () => {
  const excellent = {
    ...product('Xerjoff Torino 21', 'lean_masculine'),
    featured: true,
    fragrance: {
      ...FRAGRANCE,
      occasions: ['diario', 'oficina', 'cita', 'noche'],
      scores: { ...FRAGRANCE.scores, projection: 0.95, longevity: 0.95, night_out: 0.95, compliment: 0.95 },
    },
  };
  /* Genuinely suitable for the question, just less spectacular than the
     masculine one — so the only reason it wins is the gender rule. */
  const plainlyWorse = {
    ...product('Allowed Feminine', 'Femenino'),
    fragrance: {
      ...FRAGRANCE,
      occasions: ['noche', 'cita'],
      scores: { ...FRAGRANCE.scores, projection: 0.7, longevity: 0.7, night_out: 0.75, intensity: 0.68, compliment: 0.7 },
    },
  };

  const res = getAssistantRecommendations(
    { gender: 'mujer', occasion: 'noche', goal: 'destacar' },
    [excellent, plainlyWorse],
    { limit: 4 },
  );
  /* Sanity: the masculine one really does score higher on everything else. */
  const both = getAssistantRecommendations(
    { occasion: 'noche', goal: 'destacar' },
    [excellent, plainlyWorse],
    { limit: 4 },
  );
  assert.equal(both[0].product.id, 'Xerjoff Torino 21',
    'without a gender answer the masculine product genuinely ranks first');
  assert.ok(!res.map(r => r.product.id).includes('Xerjoff Torino 21'));
  assert.deepEqual(res.map(r => r.product.id), ['Allowed Feminine']);
});
