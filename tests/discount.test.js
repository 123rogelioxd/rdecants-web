/* =============================================================
   Discount preview state — R Supply OS stays the source of truth.
   The frontend only previews; it never computes discount math and
   never sends the amount/total as truth.
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

/* Same specifier (incl. ?v=) that discount.js uses, so we patch the SAME
   ApiClient module instance. */
const { ApiClient } = await import('../assets/js/api/client.js?v=2026.06.04.2');
const { Discount, normalizeCode, buildPreviewPayload, API_DOWN_MSG } =
  await import('../assets/js/cart/discount.js?v=2026.06.04.2');

function stubPreview(fn) { ApiClient.previewDiscount = fn; }

test('normalizeCode trims, uppercases and strips whitespace', () => {
  assert.equal(normalizeCode('  vip8 '), 'VIP8');
  assert.equal(normalizeCode('ni ce'), 'NICE');
  assert.equal(normalizeCode(null), '');
});

test('buildPreviewPayload sends code, storefront channel and item ids (no packs)', () => {
  const payload = buildPreviewPayload('vip8', [
    { product_id: 123, variant_id: 456, qty: 2, type: 'product' },
    { product_id: 9, variant_id: null, qty: 1, type: 'pack' },
  ]);
  assert.equal(payload.code, 'VIP8');
  assert.equal(payload.channel, 'storefront');
  assert.deepEqual(payload.items, [{ product_id: 123, variant_id: 456, quantity: 2 }]);
});

test('preview returns "valid" with backend amount/total', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'VIP8', discount_amount: 44, total: 506,
  } }));

  const result = await Discount.preview('vip8', [{ product_id: 1, variant_id: 2, qty: 1 }], 550);
  assert.equal(result.status, 'valid');
  assert.equal(result.normalizedCode, 'VIP8');
  assert.equal(result.amount, 44);
  assert.equal(result.total, 506);
});

test('preview treats a 4xx rejection as invalid with a customer-safe message', async () => {
  stubPreview(async () => ({ ok: false, status: 422, data: { message: 'Ese código no aplica hoy.' } }));
  const result = await Discount.preview('bad', [], 200);
  assert.equal(result.status, 'invalid');
  assert.equal(result.message, 'Ese código no aplica hoy.');
});

test('preview treats a network failure as a soft error (never blocks checkout)', async () => {
  stubPreview(async () => { throw new Error('network down'); });
  const result = await Discount.preview('vip8', [], 200);
  assert.equal(result.status, 'error');
  assert.equal(result.message, API_DOWN_MSG);
});

test('preview treats ok:false / valid:false as invalid, not applied', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: { valid: false, message: 'Código expirado.' } }));
  const result = await Discount.preview('vip8', [], 200);
  assert.equal(result.status, 'invalid');
  assert.equal(result.message, 'Código expirado.');
});

test('apply persists a valid preview; code + totalFor reflect it', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'VIP8', discount_amount: 44, total: 506,
  } }));

  const result = await Discount.apply('vip8', [{ product_id: 1, variant_id: 2, qty: 1 }], 550);
  assert.equal(result.status, 'valid');
  assert.ok(Discount.isApplied());
  assert.equal(Discount.code, 'VIP8');
  assert.equal(Discount.amount(), 44);
  assert.equal(Discount.totalFor(550), 506);
  Discount.remove();
  assert.equal(Discount.isApplied(), false);
});

test('apply does NOT persist an invalid code', async () => {
  Discount.remove();
  stubPreview(async () => ({ ok: false, status: 422, data: { message: 'no' } }));
  const result = await Discount.apply('nope', [], 200);
  assert.equal(result.status, 'invalid');
  assert.equal(Discount.isApplied(), false);
});

test('totalFor clamps: discount never pushes the total below zero', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'BIG', discount_amount: 999, total: 0,
  } }));
  await Discount.apply('big', [], 100);
  assert.equal(Discount.totalFor(100), 0);
  Discount.remove();
});

test('revalidate refreshes the amount when the cart changes', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'VIP8', discount_amount: 44, total: 506,
  } }));
  await Discount.apply('vip8', [], 550);

  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'VIP8', discount_amount: 60, total: 690,
  } }));
  const result = await Discount.revalidate([], 750);
  assert.equal(result.status, 'valid');
  assert.equal(Discount.amount(), 60);
  assert.equal(Discount.totalFor(750), 690);
  Discount.remove();
});

test('revalidate removes the discount when it no longer validates (no stale totals)', async () => {
  stubPreview(async () => ({ ok: true, status: 200, data: {
    valid: true, normalized_code: 'VIP8', discount_amount: 44, total: 506,
  } }));
  await Discount.apply('vip8', [], 550);
  assert.ok(Discount.isApplied());

  stubPreview(async () => ({ ok: false, status: 422, data: { message: 'ya no aplica' } }));
  const result = await Discount.revalidate([], 100);
  assert.equal(result.status, 'invalid');
  assert.equal(Discount.isApplied(), false);
  assert.equal(Discount.totalFor(100), 100);
});
