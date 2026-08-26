/* =============================================================
   SCOPED DISCOUNT CODES — the storefront side.

   The rule this file defends: when a code only applies to SOME of the cart,
   the storefront still computes nothing. It sends identity and quantity, shows
   the amount R Supply OS returned, and repeats the backend's own words when a
   code stops applying.

   There is deliberately no scope logic to test here — no sealed-bottle rule, no
   category rule, no season rule. If any of that ever appears in this repo, these
   tests are the wrong ones and the architecture is the problem.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/' },
};

const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node-test' },
});

const { ApiClient } = await import('../assets/js/api/client.js');
const { Discount, buildPreviewPayload, STALE_CODE_MSG } =
  await import('../assets/js/cart/discount.js');
const { buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');

const NO_ELIGIBLE_MSG = 'Este código no aplica a los productos de tu carrito.';

/* One backend reply, verbatim. Every test states the response R Supply OS would
   send and asserts what the storefront does with it — never how it was derived. */
function stubReply(data) {
  ApiClient.previewDiscount = async () => ({ ok: true, status: 200, data });
}

/* Capture what actually leaves the browser. */
function captureRequest(data) {
  const seen = [];
  ApiClient.previewDiscount = async (payload) => {
    seen.push(payload);
    return { ok: true, status: 200, data };
  };
  return seen;
}

function applied(coupons, subtotal) {
  const total_discount = coupons.reduce((s, c) => s + c.discount_amount, 0);
  return {
    ok: true,
    valid: coupons.length > 0,
    subtotal,
    coupons,
    rejected: [],
    coupon_codes: coupons.map(c => c.code),
    total_discount,
    total: Math.max(0, subtotal - total_discount),
  };
}

function rejectedOnly(code, message, subtotal) {
  return {
    ok: true,
    valid: false,
    subtotal,
    coupons: [],
    rejected: [{ code, message }],
    coupon_codes: [],
    total_discount: 0,
    total: subtotal,
  };
}

const bottleItem = { type: 'bottle', product_id: 12, offer_key: 'linea_nuevo|100|100|1500', qty: 1, price: 1500 };
const decantItem = { type: 'product', product_id: 30, variant_id: 77, qty: 1, price: 350 };

function reset() { Discount.clear(); }

// ══════════════════════════════════════════════════════════════════
//  The amount on screen is the backend's amount
// ══════════════════════════════════════════════════════════════════

test('a scoped amount is shown as returned, never recomputed from the percentage', async () => {
  reset();
  /* PRIMERO5 is 5%, but only on the $1,500 sealed bottle. 5% of the $1,850 cart
     would be $92.50 — the storefront must never be able to reach that number. */
  stubReply(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));

  const result = await Discount.apply('primero5', [bottleItem, decantItem], 1850);

  assert.equal(result.status, 'valid');
  assert.equal(Discount.amount(), 75);
  assert.equal(Discount.totalFor(1850), 1775);
});

test('two scoped codes each show their own amount and the total is their sum', async () => {
  reset();
  /* Backend: 10% on the sealed bottle (100), then 5% on what that line still
     owes (45). The storefront adds them up; it does not derive either. */
  stubReply(applied([
    { code: 'SEAL10', discount_amount: 100, sequence: 1 },
    { code: 'PREM5', discount_amount: 45, sequence: 2 },
  ], 1500));

  await Discount.apply('seal10', [bottleItem], 1500);
  await Discount.apply('prem5', [bottleItem], 1500);

  assert.deepEqual(Discount.codes(), ['SEAL10', 'PREM5']);
  assert.deepEqual(Discount.applied.map(a => a.amount), [100, 45]);
  assert.equal(Discount.amount(), 145);
  assert.equal(Discount.totalFor(1500), 1355);
});

test('an unrestricted code behaves exactly as before', async () => {
  reset();
  stubReply(applied([{ code: 'VIP8', discount_amount: 44, sequence: 1 }], 550));

  const result = await Discount.apply('vip8', [decantItem], 550);

  assert.equal(result.status, 'valid');
  assert.equal(Discount.amount(), 44);
  assert.equal(Discount.totalFor(550), 506);
});

// ══════════════════════════════════════════════════════════════════
//  "Doesn't apply here" is its own message
// ══════════════════════════════════════════════════════════════════

test('a code that matches nothing surfaces the backend sentence, not a generic one', async () => {
  reset();
  stubReply(rejectedOnly('PRIMERO5', NO_ELIGIBLE_MSG, 350));

  const result = await Discount.apply('primero5', [decantItem], 350);

  assert.equal(result.status, 'invalid');
  assert.equal(result.message, NO_ELIGIBLE_MSG);
  assert.equal(Discount.isApplied(), false, 'nothing may be stored for a code that did not apply');
});

test('removing the eligible line revalidates and reports why the code stopped applying', async () => {
  reset();
  stubReply(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));
  await Discount.apply('primero5', [bottleItem, decantItem], 1850);
  assert.equal(Discount.amount(), 75);

  /* The customer removes the sealed bottle. Only the decant is left. */
  stubReply(rejectedOnly('PRIMERO5', NO_ELIGIBLE_MSG, 350));
  const result = await Discount.revalidate([decantItem], 350);

  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.dropped, ['PRIMERO5']);
  assert.equal(result.message, NO_ELIGIBLE_MSG);
  /* No stale "$75 off" left on screen. */
  assert.equal(Discount.isApplied(), false);
  assert.equal(Discount.amount(), 0);
  assert.equal(Discount.totalFor(350), 350);
});

test('revalidation falls back to a safe sentence when the backend gives no reason', async () => {
  reset();
  stubReply(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));
  await Discount.apply('primero5', [bottleItem, decantItem], 1850);

  stubReply({
    ok: true, valid: false, subtotal: 350, coupons: [], rejected: [],
    coupon_codes: [], total_discount: 0, total: 350,
  });
  const result = await Discount.revalidate([decantItem], 350);

  assert.equal(result.status, 'invalid');
  assert.equal(result.message, STALE_CODE_MSG);
});

test('revalidation that still applies refreshes the amount and reports valid', async () => {
  reset();
  stubReply(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));
  await Discount.apply('primero5', [bottleItem, decantItem], 1850);

  /* A second sealed bottle went in: the eligible slice grew, so the amount did. */
  stubReply(applied([{ code: 'PRIMERO5', discount_amount: 150, sequence: 1 }], 3350));
  const result = await Discount.revalidate([bottleItem, bottleItem, decantItem], 3350);

  assert.equal(result.status, 'valid');
  assert.equal(Discount.amount(), 150);
});

// ══════════════════════════════════════════════════════════════════
//  What the browser is allowed to say
// ══════════════════════════════════════════════════════════════════

test('a bottle line sends identity and quantity only — never an eligibility fact', () => {
  const payload = buildPreviewPayload(['primero5'], [
    { ...bottleItem, bottle_condition: 'linea_nuevo', is_sealed: true, discountable: true },
  ]);

  assert.deepEqual(payload.items, [{ product_id: 12, offer_key: 'linea_nuevo|100|100|1500', quantity: 1 }]);

  const sent = JSON.stringify(payload);
  for (const forbidden of [
    'bottle_condition', 'is_sealed', 'discountable', 'price_level', 'season',
    'category', 'eligible_subtotal', 'discount_amount', 'final_total', 'unit_price',
  ]) {
    assert.equal(sent.includes(forbidden), false, `the storefront must not send ${forbidden}`);
  }
});

test('only coupon codes travel as promotion intent', async () => {
  reset();
  const seen = captureRequest(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));

  await Discount.apply('primero5', [bottleItem, decantItem], 1850);

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].coupon_codes, ['PRIMERO5']);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['channel', 'coupon_codes', 'items']);
});

test('a mixed bottle + decant cart is sent as one cart, both lines included', async () => {
  reset();
  const seen = captureRequest(applied([{ code: 'PRIMERO5', discount_amount: 75, sequence: 1 }], 1850));

  await Discount.apply('primero5', [bottleItem, decantItem], 1850);

  assert.equal(seen[0].items.length, 2);
  assert.equal(seen[0].items[0].offer_key, 'linea_nuevo|100|100|1500');
  assert.equal(seen[0].items[1].variant_id, 77);
  /* The bottle line carries no variant and the decant line carries no offer. */
  assert.equal('variant_id' in seen[0].items[0], false);
  assert.equal('offer_key' in seen[0].items[1], false);
});

// ══════════════════════════════════════════════════════════════════
//  localStorage stays backward compatible
// ══════════════════════════════════════════════════════════════════

test('a discount saved by an older build is still read as one applied code', async () => {
  reset();
  /* The pre-array single-object shape. It must keep loading, because a customer
     mid-session when the site updates would otherwise lose their code. */
  _store.set('rdecants_discount', JSON.stringify({ code: 'VIP8', amount: 44 }));

  const { Discount: Reloaded } = await import('../assets/js/cart/discount.js?legacy=1');

  assert.deepEqual(Reloaded.codes(), ['VIP8']);
  assert.equal(Reloaded.amount(), 44);
  _store.delete('rdecants_discount');
});

// ══════════════════════════════════════════════════════════════════
//  The WhatsApp message quotes the backend
// ══════════════════════════════════════════════════════════════════

test('with a created order the message uses the order totals, not the preview', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'SAUVAGE ELIXIR', house: 'DIOR', size: 100, price: 1500, qty: 1, type: 'bottle', label: '100ml' }],
    1850,                                        // the preview subtotal
    { name: 'Roger' },
    '',
    [{ code: 'PRIMERO5', amount: 92, total: 1758 }],   // a STALE preview
    { subtotal: 1850, discount: 75, total: 1775, coupons: [{ code: 'PRIMERO5', discount_amount: 75 }] },
  );

  assert.ok(message.includes('Subtotal: $1,850 MXN'));
  assert.ok(message.includes('Código: PRIMERO5'));
  assert.ok(message.includes('Descuento: -$75 MXN'), 'the order amount wins over the preview');
  assert.ok(message.includes('Total: $1,775 MXN'));
  assert.equal(message.includes('$92'), false, 'a superseded preview amount must not reach the customer');
  assert.equal(message.includes('$1,758'), false);
});

test('without a created order the message still quotes the last valid preview', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 }],
    570,
    { name: 'Roger' },
    '',
    [{ code: 'VIP8', amount: 44, total: 526 }],
  );

  assert.ok(message.includes('Subtotal: $570 MXN'));
  assert.ok(message.includes('Descuento: -$44 MXN'));
  assert.ok(message.includes('Total: $526 MXN'));
});

test('an order whose coupon was refused after all quotes no discount at all', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'SAUVAGE ELIXIR', house: 'DIOR', size: 100, price: 1500, qty: 1, type: 'bottle', label: '100ml' }],
    1500,
    { name: 'Roger' },
    '',
    [{ code: 'PRIMERO5', amount: 75, total: 1425 }],
    /* Someone else took the single redemption between preview and order. */
    { subtotal: 1500, discount: 0, total: 1500, coupons: [] },
  );

  assert.ok(message.includes('Total: $1,500 MXN'));
  assert.equal(message.includes('PRIMERO5'), false);
  assert.equal(message.includes('Descuento'), false);
});

test('an order with a pack saving plus a coupon adds up on screen', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 3, price: 150, qty: 1 }],
    450,
    { name: 'Roger' },
    '',
    null,
    /* 45 off the pack + 40 from the coupon = 85 total. Printing only the
       coupon line would leave the customer unable to reach the total. */
    { subtotal: 450, discount: 85, total: 365, coupons: [{ code: 'VIP10', discount_amount: 40 }] },
  );

  assert.ok(message.includes('Subtotal: $450 MXN'));
  assert.ok(message.includes('Descuento: -$40 MXN'));
  assert.ok(message.includes('Descuento total: -$85 MXN'));
  assert.ok(message.includes('Total: $365 MXN'));
});
