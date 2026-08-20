import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-test' } });

const { mapApiProduct, CatalogProvider } = await import('../assets/js/providers/catalog.js');
const { filterBottleProducts, bottleConditionGroup, bottleEntryPrice, bottleOfferTypes } = await import('../assets/js/pages/perfumes.js');
const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
const { buildWebOrderPayload, buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');
const { buildPreviewPayload } = await import('../assets/js/cart/discount.js');
const { requestedMlForProduct } = await import('../assets/js/cart/availability.js');

const raw = {
  id: 'sauvage', product_id: 91, slug: 'sauvage-elixir-dior', name: 'Sauvage Elixir', house: 'Dior',
  image: '/sauvage.webp', available_ml: 50,
  variants: [{ id: 501, ml: 5, price: 300, available: true, stock: 10 }],
  bottles: [
    { offer_key: 'linea_nuevo|60|60|2600', ml: 60, bottle_ml: 60, remaining_percent: 100, condition: 'linea_nuevo', condition_label: 'Nuevo sellado', sealed: true, price: 2600, stock: 2, label: '60 ml · Nuevo sellado' },
    { offer_key: 'tester_nuevo|60|60|2200', ml: 60, bottle_ml: 60, remaining_percent: 100, condition: 'tester_nuevo', condition_label: 'Tester nuevo', sealed: true, price: 2200, stock: 1, label: '60 ml · Tester nuevo' },
    { offer_key: 'tester_parcial|60|54|1900', ml: 54, bottle_ml: 60, remaining_percent: 90, condition: 'tester_parcial', condition_label: 'Tester', sealed: false, price: 1900, stock: 1, label: '54 ml de 60 ml · Tester · 90%' },
  ],
  offer_kinds: { decants: true, bottles: true, both: true, primary: 'decants' },
};

test('sealed + tester + partial remain one mapped fragrance with three offers', () => {
  const product = mapApiProduct(raw);
  assert.equal(product.product_id, 91);
  assert.equal(product.bottles.length, 3);
  assert.deepEqual(bottleOfferTypes(product), ['Nuevo sellado', 'Tester nuevo', 'Tester']);
  assert.equal(bottleEntryPrice(product), 1900);
  assert.equal(filterBottleProducts([product], 'tester').length, 1, 'a filter never duplicates the card');
});

test('partial offers stay separate and the condition filters are exact', () => {
  const secondPartial = { ...raw.bottles[2], offer_key: 'tester_parcial|60|43|1500', ml: 43, price: 1500 };
  const product = mapApiProduct({ ...raw, bottles: [...raw.bottles, secondPartial] });
  assert.equal(product.bottles.filter(offer => bottleConditionGroup(offer) === 'partial').length, 2);
  assert.equal(filterBottleProducts([product], 'sealed').length, 1);
  assert.equal(filterBottleProducts([product], 'partial').length, 1);
});

test('the canonical PDP renders bottle offers and both cross-sell directions', () => {
  const html = buildProductPageHtml(mapApiProduct(raw));
  assert.match(html, /¿Quieres la botella\?/);
  assert.match(html, /¿Quieres probarlo primero\?/);
  assert.match(html, /60 ml · Nuevo sellado/);
  assert.match(html, /54 ml de 60 ml · Tester · 90%/);
  assert.match(html, /data-bottle-offer="tester_parcial\|60\|54\|1900"/);
  assert.match(html, /3|5|10/);
});

test('bottles do not masquerade as decant millilitres in client availability', () => {
  const items = [
    { type: 'product', product_id: 91, size: 5, qty: 1 },
    { type: 'bottle', product_id: 91, size: 54, qty: 1 },
  ];
  assert.equal(requestedMlForProduct(items, '91'), 5);
});

test('mixed bottle + decant checkout sends one cart through the canonical contracts', async () => {
  const product = mapApiProduct(raw);
  const original = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => product;
  try {
    const payload = await buildWebOrderPayload([
      { type: 'product', sourceId: product.id, product_id: 91, size: 5, qty: 1, price: 300, key: 'decant', name: product.name },
      { type: 'bottle', sourceId: product.id, product_id: 91, offer_key: product.bottles[1].offer_key, qty: 1, price: 2200, key: 'bottle', name: product.name },
    ], { name: 'Ana' });
    assert.deepEqual(payload.items[0], { product_id: 91, variant_id: 501, ml: 5, quantity: 1, unit_price: 300 });
    assert.deepEqual(payload.items[1], { product_id: 91, offer_key: 'tester_nuevo|60|60|2200', quantity: 1 });
    assert.equal('unit_price' in payload.items[1], false, 'the browser does not state bottle money');
  } finally {
    CatalogProvider.getProductById = original;
  }
});

test('discount preview sends the same opaque bottle identity as checkout', () => {
  const payload = buildPreviewPayload(['VIP8'], [{
    type: 'bottle',
    product_id: 91,
    sourceId: 'sauvage',
    offer_key: 'tester_nuevo|60|60|2200',
    qty: 1,
  }]);

  assert.deepEqual(payload.items, [{
    product_id: 91,
    offer_key: 'tester_nuevo|60|60|2200',
    quantity: 1,
  }]);
  assert.equal('variant_id' in payload.items[0], false);
});

test('WhatsApp distinguishes a mixed bottle and decant cart', () => {
  const message = buildWhatsAppMessage([
    { type: 'product', name: 'Sauvage Elixir', house: 'Dior', size: 5, price: 300, qty: 1 },
    { type: 'bottle', name: 'Le Beau', house: 'JPG', offer_label: '125 ml · Tester nuevo', price: 2200, qty: 1 },
  ], 2500, {});
  assert.match(message, /Me interesan estos perfumes/);
  assert.match(message, /Sauvage Elixir — 5ml/);
  assert.match(message, /Le Beau — Botella 125 ml · Tester nuevo/);
});

test('Perfumes is a first-class nav page; conditions are filters, not top-level pages', () => {
  const html = readFileSync(new URL('../perfumes.html', import.meta.url), 'utf8');
  assert.match(html, />Catálogo</);
  assert.match(html, />Perfumes</);
  assert.match(html, />Cotiza tu perfume</);
  assert.match(html, />Ayúdame a elegir</);
  assert.doesNotMatch(html, /href="\/(sellados|testers|parciales)/i);
});
