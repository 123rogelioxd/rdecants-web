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
const { CatalogProvider } = await import('../assets/js/providers/catalog.js');

/* ══════════════════════════════════════════════════════════════════════
   The WhatsApp message is a REFERENCE to the order, not a copy of it.

   This file used to hold eleven tests asserting the opposite: that the
   message reprinted the item list, the subtotal, each coupon code and
   amount, the total, the delivery mode, the shipping cost and the grand
   total. Every one of those assertions was protecting a duplicate of a
   record R Supply OS already holds — a duplicate that could disagree with
   the real order (a one-use coupon redeemed a second earlier, a bottle
   repriced) and that a person then had to read back by hand.

   The order is created BEFORE the handoff, priced, reserved and routed. So
   the whole message is the folio, and these four tests cover what is left
   to get wrong: the folio is in it, nothing else is, and it survives a
   transport that is not UTF-8 aware.
   ══════════════════════════════════════════════════════════════════════ */

test('buildWhatsAppMessage is one sentence carrying the folio', () => {
  assert.equal(
    buildWhatsAppMessage('WEB-20260904-0001'),
    'Hola, quiero confirmar mi pedido WEB-20260904-0001.',
  );
});

/* Nothing the order already knows gets repeated at the customer. */
test('buildWhatsAppMessage reconstructs no part of the order', () => {
  const message = buildWhatsAppMessage('WEB-20260904-0001');

  for (const forbidden of [
    'Subtotal', 'Total', 'Descuento', 'Código',
    'Envío', 'Entrega local', 'Recoger',
    'Me interesa', 'Nombre', 'Mi nombre es',
    'Quedo pendiente',
  ]) {
    assert.ok(!message.includes(forbidden), `message must not contain "${forbidden}"`);
  }
});

/* The corruption customers actually saw: "Hola" followed by a replacement
   character, because one byte of a four-byte emoji survived a transport that
   decoded the text as Latin-1. Staying inside ASCII removes the class of bug
   rather than patching one instance of it. */
test('buildWhatsAppMessage is plain ASCII', () => {
  const message = buildWhatsAppMessage('WEB-20260904-0001');

  assert.ok(/^[ -~]+$/.test(message), `not ASCII: ${JSON.stringify(message)}`);
  assert.ok(!message.includes('�'));
});

/* Defence in depth only. _performCheckout returns before opening WhatsApp
   when the order could not be created, so this branch is unreachable in the
   real flow — but if it ever were reached, a message with a blank folio is
   better than one with the literal string "undefined" in it. */
test('buildWhatsAppMessage degrades to a folio-less sentence rather than printing undefined', () => {
  for (const input of [undefined, null, '', '   ']) {
    const message = buildWhatsAppMessage(input);

    assert.equal(message, 'Hola, quiero confirmar mi pedido.');
    assert.ok(!message.includes('undefined'));
    assert.ok(!message.includes('null'));
  }
});

test('buildWebOrderPayload forwards coupon_codes[] (canonical) + discount_code mirror', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1', product_id: 'p1',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger' },
      { couponCodes: ['TEN', 'F50'] },
    );

    assert.deepEqual(payload.coupon_codes, ['TEN', 'F50']);
    assert.equal(payload.discount_code, 'TEN'); // legacy mirror = first code
    assert.ok(!('discount_amount' in payload), 'amount is never sent as truth');
    assert.ok(!('total' in payload), 'final total is never sent as truth');
  } finally {
    CatalogProvider.getProductById = originalGetProductById;
  }
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

test('buildWebOrderPayload forwards campaign attribution (code + promo + slug + utm) but no amount', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1', product_id: 'p1', gender: 'male',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger' },
      {
        discountCode: 'VIP8',
        attribution: {
          discount_code: 'VIP8', promo: 'VIP8', campaign_slug: 'vip-julio',
          utm_campaign: 'vip-julio', utm_source: 'instagram', utm_medium: 'story',
        },
      },
    );

    assert.equal(payload.discount_code, 'VIP8');
    assert.equal(payload.promo, 'VIP8');
    assert.equal(payload.campaign_slug, 'vip-julio');
    assert.equal(payload.utm_campaign, 'vip-julio');
    assert.equal(payload.utm_source, 'instagram');
    assert.equal(payload.utm_medium, 'story');
    assert.ok(!('discount_amount' in payload), 'amount is never sent as truth');
    assert.ok(!('total' in payload), 'final total is never sent as truth');
  } finally {
    CatalogProvider.getProductById = originalGetProductById;
  }
});

test('buildWebOrderPayload: applied discount code overrides pending promo code', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1', product_id: 'p1',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger' },
      { discountCode: 'MANUAL', attribution: { discount_code: 'VIP8', promo: 'VIP8' } },
    );
    assert.equal(payload.discount_code, 'MANUAL');
    assert.equal(payload.promo, 'VIP8');
  } finally {
    CatalogProvider.getProductById = originalGetProductById;
  }
});

test('buildWebOrderPayload keeps the no-campaign payload shape unchanged (no empty strings)', async () => {
  const originalGetProductById = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1', product_id: 'p1',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    const payload = await buildWebOrderPayload(
      [{ key: 'p1-5', sourceId: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior', type: 'product', size: 5, price: 170, qty: 1, image: '/x.webp' }],
      { name: 'Roger' },
      {},
    );
    assert.deepEqual(Object.keys(payload).sort(), ['customer', 'items', 'metadata', 'notes'].sort());
    for (const key of ['discount_code', 'promo', 'campaign_slug', 'utm_campaign', 'utm_source', 'utm_medium']) {
      assert.ok(!(key in payload), `${key} not present without a campaign`);
    }
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
