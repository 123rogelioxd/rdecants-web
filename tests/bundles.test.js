import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBundles, BUNDLE_TEMPLATES } from '../assets/js/recommendations/bundles.js';

const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});
const product = (id, house, notes, desc, { stock = 20, price = 180, featured = false } = {}) => ({
  id, name: id, house, notes, desc, story: desc, badge: 'Disponible', featured,
  variants: [variant(5, price, stock)],
});

const catalog = [
  product('Marino', 'Dior', ['marino', 'citrico'], 'fresco verano tropical playa', { price: 150 }),
  product('Citrus', 'Creed', ['citrico', 'bergamota', 'menta'], 'fresco limpio oficina diario', { price: 170 }),
  product('Aqua', 'Acqua', ['marino', 'mineral'], 'fresco acuatico verano', { price: 140 }),
  product('Vanilla', 'YSL', ['vainilla', 'tonka', 'canela'], 'dulce nocturno fiesta rastro', { price: 200, featured: true }),
  product('Honey', 'Initio', ['miel', 'caramelo', 'azucar'], 'dulce goloso noche seductor', { price: 260 }),
  product('Oud', 'Lattafa', ['oud', 'cuero', 'ambar', 'incienso'], 'intenso oriental potente arabe', { price: 220 }),
  product('Amber', 'Armaf', ['ambar', 'especias', 'tabaco'], 'intenso calido envolvente noche', { price: 180 }),
];

test('empty catalog yields no bundles', () => {
  assert.deepEqual(generateBundles([]), []);
});

test('generates bundles from templates', () => {
  const bundles = generateBundles(catalog);
  assert.ok(bundles.length >= 1);
  assert.ok(bundles.length <= BUNDLE_TEMPLATES.length);
});

test('each bundle has the required shape and >= 2 items', () => {
  for (const b of generateBundles(catalog)) {
    assert.ok(b.title && b.description && b.why);
    assert.ok(Array.isArray(b.items) && b.items.length >= 2);
    assert.equal(typeof b.total, 'number');
    assert.ok(b.total > 0);
  }
});

test('bundles expose meaningful real kit savings', () => {
  for (const b of generateBundles(catalog)) {
    assert.equal(typeof b.originalTotal, 'number');
    assert.equal(typeof b.savings, 'number');
    assert.ok(b.savings >= 45);
    assert.equal(b.total, b.originalTotal - b.savings);
  }
});

test('original total equals the sum of the items default-variant prices', () => {
  const bundle = generateBundles(catalog).find(b => b.id === 'calor-tropical');
  assert.ok(bundle);
  const expected = bundle.items.reduce((sum, p) => sum + p.variants[0].price, 0);
  assert.equal(bundle.originalTotal, expected);
});

test('excludes sold-out products from bundles', () => {
  const withSoldOut = [
    ...catalog,
    product('DeadOud', 'X', ['oud', 'cuero', 'ambar', 'incienso'], 'intenso arabe potente', { stock: 0 }),
  ];
  for (const b of generateBundles(withSoldOut)) {
    assert.ok(!b.items.some(p => p.id === 'DeadOud'));
  }
});

test('the arabic intensity bundle leans intense', () => {
  const bundle = generateBundles(catalog).find(b => b.id === 'arabic-intensity');
  assert.ok(bundle);
  // Oud / Amber (intense profiles) should be present
  const ids = bundle.items.map(p => p.id);
  assert.ok(ids.includes('Oud') || ids.includes('Amber'));
});
