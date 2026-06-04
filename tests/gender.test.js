import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';
import { getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';
import { matchesGender, normalizeGender } from '../assets/js/utils/gender.js';

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
    assert.equal(normalizeGender(value), 'hombre');
  }
  for (const value of ['feminine', 'female', 'mujer', 'femenino']) {
    assert.equal(normalizeGender(value), 'mujer');
  }
  assert.equal(normalizeGender('unisex'), 'unisex');
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
  const ids = filterProducts(CATALOG, { gender: 'unisex' }).map(p => p.id);
  assert.deepEqual(ids, ['Naxos']);
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
  assert.ok(!ids.includes('Unknown'));
  assert.ok(ids.every(id => ['Yara', 'Coco Mademoiselle', 'Naxos'].includes(id)));
});

test('assistant with selectedGender = hombre does not recommend mujer products', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'dia', budget: 'any', gender: 'hombre' },
    [SAUVAGE, BLEU, YARA, COCO, NAXOS, UNKNOWN],
  );
  const ids = res.map(r => r.product.id);
  assert.ok(!ids.includes('Yara'));
  assert.ok(!ids.includes('Coco Mademoiselle'));
  assert.ok(!ids.includes('Unknown'));
  assert.ok(ids.every(id => ['Sauvage', 'Bleu', 'Naxos'].includes(id)));
});
