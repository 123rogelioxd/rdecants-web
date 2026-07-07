import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/' },
};

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node-test' },
});

const { buildWhatsAppMessage, buildWebOrderPayload } = await import('../assets/js/cart/checkout.js');
const { CatalogProvider } = await import('../assets/js/providers/catalog.js?v=2026.06.04.2');

test('buildWhatsAppMessage creates a natural customer WhatsApp message', () => {
  const message = buildWhatsAppMessage(
    [
      { name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 },
      { name: 'ONE MILLION LUCKY', house: 'PACO RABANNE', size: 5, price: 200, qty: 1 },
      { name: 'LE BEAU LE PARFUM', house: 'JEAN PAUL GAULTIER', size: 5, price: 200, qty: 1 },
    ],
    570,
    { name: 'Roger' },
    'WEB-20260603-0002',
  );

  assert.equal(message, [
    'Hola 👋',
    '',
    'Me interesan estos decants:',
    '• Invictus Victory — 5ml — $170',
    '• One Million Lucky — 5ml — $200',
    '• Le Beau Le Parfum — 5ml — $200',
    '',
    'Total: $570 MXN',
    '',
    'Mi nombre es Roger.',
    '',
    'Quedo pendiente de disponibilidad y detalles de compra.',
  ].join('\n'));

  assert.doesNotMatch(message, /Folio|Casa|Presentaci[oó]n|Cantidad|Solo a|Producto:/);
});

test('buildWhatsAppMessage uses singular copy for one decant', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 }],
    170,
    { name: 'Roger' },
    'WEB-20260603-0002',
  );

  assert.match(message, /Me interesa este decant:/);
  assert.doesNotMatch(message, /Me interesan estos decants:/);
});

test('buildWhatsAppMessage shows subtotal / código / descuento / total when a discount is applied', () => {
  const message = buildWhatsAppMessage(
    [
      { name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 },
      { name: 'ONE MILLION LUCKY', house: 'PACO RABANNE', size: 5, price: 380, qty: 1 },
    ],
    550,
    { name: 'Roger' },
    '',
    { code: 'VIP8', amount: 44, total: 506 },
  );

  assert.match(message, /Subtotal: \$550 MXN/);
  assert.match(message, /Código: VIP8/);
  assert.match(message, /Descuento: -\$44 MXN/);
  assert.match(message, /Total: \$506 MXN/);
});

test('buildWhatsAppMessage omits discount rows when no discount is applied', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 }],
    170,
    { name: 'Roger' },
  );
  assert.doesNotMatch(message, /Subtotal:|Código:|Descuento:/);
  assert.match(message, /Total: \$170 MXN/);
});

test('buildWebOrderPayload forwards discount_code only — never the amount as truth', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1', product_id: 'p1', gender: 'male',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger' },
      { discountCode: 'VIP8' },
    );

    assert.equal(payload.discount_code, 'VIP8');
    assert.ok(!('discount_amount' in payload), 'discount_amount is never sent as truth');
    assert.ok(!('total' in payload), 'final total is never sent as truth');
  } finally {
    CatalogProvider.getProductById = originalGetProductById;
  }
});

test('buildWebOrderPayload keeps existing order payload shape when product has gender', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1',
    product_id: 'p1',
    gender: 'male',
    variants: [
      { size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' },
    ],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger', phone: '9511234567', notes: 'Entrega por la tarde' },
    );

    assert.deepEqual(Object.keys(payload).sort(), ['customer', 'items', 'metadata', 'notes'].sort());
    assert.deepEqual(Object.keys(payload.customer).sort(), ['name', 'phone'].sort());
    assert.deepEqual(Object.keys(payload.items[0]).sort(), ['ml', 'product_id', 'quantity', 'unit_price', 'variant_id'].sort());
    assert.equal(payload.customer.name, 'Roger');
    assert.equal(payload.items[0].unit_price, 170);
    assert.ok(!JSON.stringify(payload).includes('gender'), 'gender is not added to order payload');
  } finally {
    CatalogProvider.getProductById = originalGetProductById;
  }
});
