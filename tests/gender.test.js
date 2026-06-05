import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';
import { getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';
import { getGenderEligibility, matchesGender, normalizeGender } from '../assets/js/utils/gender.js';

const variant = (size = 5, price = 180, stock = 10) => ({
  size,
  price,
  stock,
  availability: stock,
  available: stock > 0,
  soldOut: stock <= 0,
  variant_id: `v-${size}-${price}`,
});

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
});

const SAUVAGE = product('Sauvage', 'hombre', ['ambroxan', 'bergamota'], 'fresco masculino');
const BLEU = product('Bleu', 'masculine', ['cedro', 'citricos'], 'azul masculino');
const YARA = product('Yara', 'mujer', ['vainilla', 'frutas'], 'dulce femenino');
const COCO = product('Coco Mademoiselle', 'female', ['rosa', 'jazmin'], 'floral femenino');
const NAXOS = product('Naxos', 'unisex', ['miel', 'tabaco'], 'elegante unisex');
const UNKNOWN = product('Unknown', null, ['citricos'], 'sin genero');
const CATALOG = [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN];

test('normalizes gender values in English and Spanish', () => {
  for (const value of ['masculine', 'male', 'hombre', 'masculino']) {
    assert.equal(normalizeGender(value), 'masculine');
  }
  for (const value of ['feminine', 'female', 'mujer', 'femenino', 'dama']) {
    assert.equal(normalizeGender(value), 'feminine');
  }
  assert.equal(normalizeGender('unisex'), 'unisex');
  assert.equal(normalizeGender('unisex inclinado masculino'), 'unisex_masculine');
  assert.equal(normalizeGender('unisex inclinado femenino'), 'unisex_feminine');
  assert.equal(normalizeGender('sin asignar'), 'unknown');
  assert.equal(normalizeGender(null), 'unknown');
});

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

test('gender filter Unisex returns only unisex', () => {
  const ids = filterProducts(CATALOG, { gender: 'unisex' }).map(p => p.id).sort();
  assert.deepEqual(ids, ['Bleu', 'Coco Mademoiselle', 'Naxos', 'Sauvage', 'Yara']);
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

test('assistant with selectedGender = mujer does not recommend hombre products', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'mujer' },
    [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN],
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Sauvage'));
  assert.ok(!ids.includes('Bleu'));
  assert.ok(ids.every(id => ['Yara', 'Coco Mademoiselle', 'Naxos', 'Unknown'].includes(id)));
  if (ids.includes('Unknown')) {
    assert.ok(ids.indexOf('Unknown') > ids.indexOf('Naxos'));
  }
});

test('assistant with selectedGender = hombre does not recommend mujer products', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'hombre' },
    [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN],
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Yara'));
  assert.ok(!ids.includes('Coco Mademoiselle'));
  assert.ok(ids.every(id => ['Sauvage', 'Bleu', 'Naxos', 'Unknown'].includes(id)));
  if (ids.includes('Unknown')) {
    assert.ok(ids.indexOf('Unknown') > ids.indexOf('Naxos'));
  }
});

test('Mujer eligibility excludes Masculino and allows female/unisex primary variants', () => {
  assert.deepEqual(getGenderEligibility(product('M', 'Masculino'), 'Mujer'), {
    eligible: false,
    priority: 'rejected',
    penalty: Infinity,
  });
  for (const gender of ['Femenino', 'Unisex', 'Unisex inclinado femenino']) {
    const eligibility = getGenderEligibility(product(gender, gender), 'Mujer');
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.priority, 'primary');
    assert.equal(eligibility.penalty, 0);
  }
});

test('Mujer allows Unisex inclinado masculino only as lower-priority secondary', () => {
  const eligibility = getGenderEligibility(product('leanM', 'Unisex inclinado masculino'), 'Mujer');
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.priority, 'secondary');
  assert.equal(eligibility.penalty, 15);
});

test('Hombre eligibility excludes Femenino and allows male/unisex primary variants', () => {
  assert.deepEqual(getGenderEligibility(product('F', 'Femenino'), 'Hombre'), {
    eligible: false,
    priority: 'rejected',
    penalty: Infinity,
  });
  for (const gender of ['Masculino', 'Unisex', 'Unisex inclinado masculino']) {
    const eligibility = getGenderEligibility(product(gender, gender), 'Hombre');
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.priority, 'primary');
    assert.equal(eligibility.penalty, 0);
  }
});

test('Hombre allows Unisex inclinado femenino only as lower-priority secondary', () => {
  const eligibility = getGenderEligibility(product('leanF', 'Unisex inclinado femenino'), 'Hombre');
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.priority, 'secondary');
  assert.equal(eligibility.penalty, 15);
});

test('Unisex prioritizes all unisex variants and keeps binary genders secondary', () => {
  for (const gender of ['Unisex', 'Unisex inclinado masculino', 'Unisex inclinado femenino']) {
    assert.equal(getGenderEligibility(product(gender, gender), 'Unisex').priority, 'primary');
  }
  assert.equal(getGenderEligibility(product('M', 'Masculino'), 'Unisex').priority, 'secondary');
  assert.equal(getGenderEligibility(product('F', 'Femenino'), 'Unisex').priority, 'secondary');
});

test('Me da igual applies no gender filter', () => {
  for (const gender of ['Masculino', 'Femenino', 'Unisex', 'Unisex inclinado masculino', null]) {
    assert.equal(getGenderEligibility(product(String(gender), gender), 'any').eligible, true);
  }
});

test('assistant ranks unknown gender last as fallback behind known eligible products', () => {
  const known = product('Known Feminine', 'Femenino', ['bergamota', 'citrico'], 'fresco diario limpio');
  const unknown = product('Unknown Strong', null, ['bergamota', 'citrico', 'manzana'], 'fresco diario limpio azul versatil');
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'mujer' },
    [unknown, known],
    { limit: 2 },
  );
  assert.deepEqual(res.map(r => r.product.id), ['Known Feminine', 'Unknown Strong']);
});

test('assistant ranks secondary unisex lean after primary Mujer matches', () => {
  const primary = product('Primary Feminine', 'Femenino', ['bergamota'], 'fresco diario');
  const secondary = product('Secondary Lean Masculine', 'Unisex inclinado masculino', ['bergamota', 'citrico', 'manzana'], 'fresco diario limpio azul versatil');
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'mujer' },
    [secondary, primary],
    { limit: 2 },
  );
  assert.deepEqual(res.map(r => r.product.id), ['Primary Feminine', 'Secondary Lean Masculine']);
});

test('high score Masculino cannot leak into Mujer recommendations', () => {
  const torino = product('Xerjoff Torino 21', 'Masculino', ['bergamota', 'citrico', 'menta', 'lavanda', 'manzana'], 'fresco diario limpio azul versatil oficina');
  const creed = product('Creed Millesime Imperial', 'Masculino', ['bergamota', 'citrico', 'marino'], 'fresco acuatico diario limpio');
  const feminine = product('Allowed Feminine', 'Femenino', ['bergamota'], 'fresco diario');
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'mujer' },
    [torino, creed, feminine],
    { limit: 4 },
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Xerjoff Torino 21'));
  assert.ok(!ids.includes('Creed Millesime Imperial'));
  assert.deepEqual(ids, ['Allowed Feminine']);
});
