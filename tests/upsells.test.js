import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRelatedProducts, getCartUpsells, getShippingCompletionUpsell } from '../assets/js/recommendations/upsells.js';

const variant = (size, price, stock) => ({
  size,
  price,
  stock,
  availability: stock,
  public_stock: stock,
  available: stock > 0,
  soldOut: stock <= 0,
  variant_id: 900 + size,
});

const product = (id, house, notes, stock = 20, extra = {}) => ({
  id,
  name: id,
  house,
  notes,
  desc: '',
  story: '',
  badge: 'Disponible',
  variants: [variant(5, 150, stock)],
  ...extra,
});

const productWithVariants = (id, house, notes, variants, extra = {}) => ({
  ...product(id, house, notes, 20, extra),
  variants,
});

const ids = (list) => list.map(p => p.id);

test('related: same-house + shared note outranks shared-note-only', () => {
  const seed = product('seed', 'Dior', ['vainilla', 'ambar']);
  const products = [
    seed,
    product('sameHouse', 'Dior', ['vainilla', 'cedro']),
    product('notesOnly', 'Chanel', ['vainilla', 'ambar']),
  ];
  const result = ids(getRelatedProducts(seed, products));
  assert.ok(result.indexOf('sameHouse') < result.indexOf('notesOnly'));
});

test('related: never returns the seed product itself', () => {
  const seed = product('seed', 'Dior', ['vainilla']);
  const result = ids(getRelatedProducts(seed, [seed, product('a', 'Dior', ['vainilla'])]));
  assert.ok(!result.includes('seed'));
});

test('related: excludes sold-out products', () => {
  const seed = product('seed', 'Dior', ['vainilla']);
  const products = [seed, product('out', 'Dior', ['vainilla'], 0)];
  assert.deepEqual(ids(getRelatedProducts(seed, products)), []);
});

test('related: excludes products with no orderable variant', () => {
  const seed = product('seed', 'Dior', ['vainilla']);
  const noVariant = { id: 'nv', name: 'nv', house: 'Dior', notes: ['vainilla'], variants: [] };
  assert.deepEqual(ids(getRelatedProducts(seed, [seed, noVariant])), []);
});

test('related: down-ranks nearly-gone stock vs healthy stock', () => {
  const seed = product('seed', 'Dior', ['vainilla', 'ambar']);
  const products = [
    seed,
    product('healthy', 'Dior', ['vainilla'], 20),
    product('almostGone', 'Dior', ['vainilla', 'ambar'], 1), // richer match but 1 unit
  ];
  const result = ids(getRelatedProducts(seed, products));
  assert.ok(result.indexOf('healthy') < result.indexOf('almostGone'));
});

test('related: featured product gets a subtle lift', () => {
  const seed = product('seed', 'Dior', ['vainilla']);
  const products = [
    seed,
    product('plain', 'Chanel', ['vainilla']),
    product('feat', 'Chanel', ['vainilla'], 20, { featured: true }),
  ];
  const result = ids(getRelatedProducts(seed, products));
  assert.ok(result.indexOf('feat') < result.indexOf('plain'));
});

test('related: respects the limit', () => {
  const seed = product('seed', 'Dior', ['vainilla']);
  const products = [seed];
  for (let i = 0; i < 10; i++) products.push(product(`d${i}`, 'Dior', ['vainilla']));
  assert.equal(getRelatedProducts(seed, products, { limit: 3 }).length, 3);
});

test('cart upsells: empty cart yields nothing', () => {
  const products = [product('a', 'Dior', ['vainilla'])];
  assert.deepEqual(getCartUpsells([], products), []);
});

test('cart upsells: never suggests an item already in the cart', () => {
  const products = [
    product('inCart', 'Dior', ['vainilla', 'ambar']),
    product('candidate', 'Dior', ['vainilla']),
  ];
  const result = ids(getCartUpsells([{ sourceId: 'inCart' }], products));
  assert.ok(!result.includes('inCart'));
  assert.ok(result.includes('candidate'));
});

test('cart upsells: scores against the combined cart profile', () => {
  const products = [
    product('cartA', 'Dior', ['vainilla']),
    product('cartB', 'Creed', ['cuero']),
    product('matchA', 'Dior', ['vainilla']),   // matches cartA
    product('matchB', 'Creed', ['cuero']),      // matches cartB
    product('unrelated', 'Acqua', ['marino']),  // matches neither
  ];
  const result = ids(getCartUpsells([{ sourceId: 'cartA' }, { sourceId: 'cartB' }], products));
  assert.ok(result.includes('matchA'));
  assert.ok(result.includes('matchB'));
  assert.ok(!result.includes('unrelated'));
});

test('cart upsells: prioritizes low-friction small add-ons near the minimum', () => {
  const products = [
    product('cartFresh', 'JPG', ['bergamota', 'lavanda']),
    productWithVariants('smallFresh', 'YSL', ['bergamota', 'lavanda'], [
      variant(3, 90, 20),
      variant(5, 130, 20),
    ], { desc: 'fresco facil de usar diario' }),
    productWithVariants('largeFresh', 'YSL', ['bergamota', 'lavanda'], [
      variant(10, 260, 20),
    ]),
  ];

  const result = ids(getCartUpsells([{ sourceId: 'cartFresh' }], products, { targetRemaining: 40 }));
  assert.equal(result[0], 'smallFresh');
});

test('shipping completion: recommends the cheapest add-on that reaches the threshold', () => {
  const products = [
    productWithVariants('mandarin', 'Armaf', ['citrico'], [variant(3, 60, 20)]),
    productWithVariants('bleu', 'Chanel', ['amaderado'], [variant(10, 360, 20)]),
  ];
  const rec = getShippingCompletionUpsell([{ sourceId: 'cart1' }], products, 55);
  assert.equal(rec.product.id, 'mandarin');
  assert.equal(rec.variant.price, 60);
});

test('shipping completion: returns null once the threshold is already met', () => {
  const products = [productWithVariants('x', 'H', ['n'], [variant(3, 60, 20)])];
  assert.equal(getShippingCompletionUpsell([], products, 0), null);
});

test('shipping completion: skips products that cannot reach the threshold in one add', () => {
  const products = [productWithVariants('tooSmall', 'H', ['n'], [variant(3, 40, 20)])];
  assert.equal(getShippingCompletionUpsell([], products, 55), null);
});

test('shipping completion: never recommends an item already in the cart', () => {
  const products = [productWithVariants('inCart', 'H', ['n'], [variant(3, 60, 20)])];
  assert.equal(getShippingCompletionUpsell([{ sourceId: 'inCart' }], products, 55), null);
});

test('shipping completion: excludes sold-out products', () => {
  const products = [productWithVariants('out', 'H', ['n'], [variant(3, 60, 0)])];
  assert.equal(getShippingCompletionUpsell([], products, 55), null);
});

test('shipping completion: prefers the smallest qualifying presentation within a product', () => {
  const products = [
    productWithVariants('multi', 'H', ['n'], [variant(3, 90, 20), variant(5, 130, 20)]),
  ];
  const rec = getShippingCompletionUpsell([], products, 80);
  assert.equal(rec.variant.size, 3, 'the 3ml already reaches the threshold, so use it');
  assert.equal(rec.variant.price, 90);
});

test('cart upsells: same family can connect related houses without random products', () => {
  const products = [
    product('leBeau', 'JPG', ['coco', 'bergamota'], 20, { desc: 'tropical fresco verano' }),
    product('yslY', 'YSL', ['bergamota', 'manzana'], 20, { desc: 'fresco versatil diario' }),
    product('khamrah', 'Lattafa', ['vainilla', 'canela'], 20, { desc: 'dulce noche intenso' }),
  ];

  const result = ids(getCartUpsells([{ sourceId: 'leBeau' }], products, { targetRemaining: 60 }));
  assert.ok(result.includes('yslY'));
  assert.ok(!result.includes('khamrah'));
});
