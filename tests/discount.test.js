/* =============================================================
   Discount preview state — up to 2 stacked codes.
   R Supply OS stays the source of truth: the frontend only previews
   the whole code set (coupon_codes[]) and trusts the backend's
   applied/rejected breakdown. It never computes discount math.
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
const { Discount, normalizeCode, buildPreviewPayload, API_DOWN_MSG, MAX_COUPONS } =
  await import('../assets/js/cart/discount.js');

function stubPreview(fn) { ApiClient.previewDiscount = fn; }

/* Mirror the backend coordinator for a set of code definitions:
   defs = { CODE: { amount, stackable } }. Sequential-on-remainder is not needed
   here — fixed per-code amounts keep the module assertions deterministic. */
function stubBackend(defs, subtotal = 1000) {
  stubPreview(async (payload) => {
    const codes = (payload.coupon_codes || []).map(c => String(c).toUpperCase());
    const rejected = [];
    const seen = new Set();
    const unique = [];
    for (const c of codes) {
      if (seen.has(c)) { rejected.push({ code: c, message: 'Ese código ya está aplicado.' }); continue; }
      seen.add(c);
      if (unique.length >= 2) { rejected.push({ code: c, message: 'Solo puedes usar 2 códigos por pedido.' }); continue; }
      unique.push(c);
    }
    let valid = unique.filter(c => defs[c]);
    unique.filter(c => !defs[c]).forEach(c => rejected.push({ code: c, message: 'Ese código no es válido.' }));
    if (valid.length >= 2 && !valid.every(c => defs[c].stackable)) {
      const kept = valid[0];
      valid.slice(1).forEach(c => rejected.push({ code: c, message: 'Este código no se puede combinar con otro.' }));
      valid = [kept];
    }
    let seq = 1;
    const coupons = valid.map(c => ({ code: c, discount_amount: defs[c].amount, sequence: seq++ }));
    const total_discount = coupons.reduce((s, c) => s + c.discount_amount, 0);
    return {
      ok: true, status: 200,
      data: {
        ok: true, valid: coupons.length > 0, subtotal, coupons, rejected,
        coupon_codes: coupons.map(c => c.code), total_discount,
        total: Math.max(0, subtotal - total_discount),
      },
    };
  });
}

function reset() { Discount.clear(); }

test('normalizeCode trims, uppercases and strips whitespace', () => {
  assert.equal(normalizeCode('  vip8 '), 'VIP8');
  assert.equal(normalizeCode('ni ce'), 'NICE');
  assert.equal(normalizeCode(null), '');
});

test('buildPreviewPayload sends coupon_codes[], channel and item ids (no packs)', () => {
  const payload = buildPreviewPayload(['vip8', 'ten'], [
    { product_id: 123, variant_id: 456, qty: 2, type: 'product' },
    { product_id: 9, variant_id: null, qty: 1, type: 'pack' },
  ]);
  assert.deepEqual(payload.coupon_codes, ['VIP8', 'TEN']);
  assert.equal(payload.channel, 'storefront');
  assert.deepEqual(payload.items, [{ product_id: 123, variant_id: 456, quantity: 2 }]);
});

test('buildPreviewPayload accepts a single string code', () => {
  const payload = buildPreviewPayload('vip8', []);
  assert.deepEqual(payload.coupon_codes, ['VIP8']);
});

test('apply one valid code persists it; code + amount + totalFor reflect it', async () => {
  reset();
  stubBackend({ VIP8: { amount: 44, stackable: true } });

  const result = await Discount.apply('vip8', [{ product_id: 1, variant_id: 2, qty: 1 }], 550);
  assert.equal(result.status, 'valid');
  assert.equal(Discount.count(), 1);
  assert.equal(Discount.code, 'VIP8');
  assert.deepEqual(Discount.codes(), ['VIP8']);
  assert.equal(Discount.amount(), 44);
  assert.equal(Discount.totalFor(550), 506);
});

test('apply does NOT persist an invalid code', async () => {
  reset();
  stubBackend({});
  const result = await Discount.apply('nope', [], 200);
  assert.equal(result.status, 'invalid');
  assert.equal(Discount.isApplied(), false);
});

test('two stackable codes both apply; amount is the combined total', async () => {
  reset();
  stubBackend({ TEN: { amount: 100, stackable: true }, F50: { amount: 50, stackable: true } });

  await Discount.apply('ten', [], 1000);
  const second = await Discount.apply('f50', [], 1000);

  assert.equal(second.status, 'valid');
  assert.deepEqual(Discount.codes(), ['TEN', 'F50']);
  assert.equal(Discount.amount(), 150);
  assert.equal(Discount.totalFor(1000), 850);
});

test('a non-stackable second code is rejected and the first stays applied', async () => {
  reset();
  stubBackend({ KEEP: { amount: 100, stackable: true }, LONE: { amount: 50, stackable: false } });

  await Discount.apply('keep', [], 1000);
  const second = await Discount.apply('lone', [], 1000);

  assert.equal(second.status, 'invalid');
  assert.match(second.message, /no se puede combinar/i);
  assert.deepEqual(Discount.codes(), ['KEEP']);
  assert.equal(Discount.amount(), 100);
});

test('duplicate code is blocked client-side (not re-sent)', async () => {
  reset();
  stubBackend({ TEN: { amount: 100, stackable: true } });
  await Discount.apply('ten', [], 1000);
  const dup = await Discount.apply('TEN', [], 1000);
  assert.equal(dup.status, 'duplicate');
  assert.equal(Discount.count(), 1);
});

test('a third code is blocked at MAX_COUPONS', async () => {
  reset();
  stubBackend({ A: { amount: 10, stackable: true }, B: { amount: 10, stackable: true }, C: { amount: 10, stackable: true } });
  await Discount.apply('a', [], 1000);
  await Discount.apply('b', [], 1000);
  const third = await Discount.apply('c', [], 1000);
  assert.equal(third.status, 'max');
  assert.equal(Discount.count(), MAX_COUPONS);
});

test('removing one of two leaves the other applied with a refreshed amount', async () => {
  reset();
  stubBackend({ TEN: { amount: 100, stackable: true }, F50: { amount: 50, stackable: true } });
  await Discount.apply('ten', [], 1000);
  await Discount.apply('f50', [], 1000);

  await Discount.remove('F50', [], 1000);
  assert.deepEqual(Discount.codes(), ['TEN']);
  assert.equal(Discount.amount(), 100);
});

test('removing the last code clears the discount', async () => {
  reset();
  stubBackend({ TEN: { amount: 100, stackable: true } });
  await Discount.apply('ten', [], 1000);
  await Discount.remove('TEN', [], 1000);
  assert.equal(Discount.isApplied(), false);
  assert.equal(Discount.totalFor(1000), 1000);
});

test('totalFor clamps: discount never pushes the total below zero', async () => {
  reset();
  stubBackend({ BIG: { amount: 999, stackable: true } }, 100);
  await Discount.apply('big', [], 100);
  assert.equal(Discount.totalFor(100), 0);
});

test('revalidate refreshes amounts when the cart changes', async () => {
  reset();
  stubBackend({ VIP8: { amount: 44, stackable: true } });
  await Discount.apply('vip8', [], 550);

  stubBackend({ VIP8: { amount: 60, stackable: true } });
  const result = await Discount.revalidate([], 750);
  assert.equal(result.status, 'valid');
  assert.equal(Discount.amount(), 60);
  assert.equal(Discount.totalFor(750), 690);
});

test('revalidate drops a code that no longer validates (no stale totals)', async () => {
  reset();
  stubBackend({ VIP8: { amount: 44, stackable: true } });
  await Discount.apply('vip8', [], 550);
  assert.ok(Discount.isApplied());

  stubBackend({}); // code no longer valid
  const result = await Discount.revalidate([], 100);
  assert.equal(result.status, 'invalid');
  assert.equal(Discount.isApplied(), false);
  assert.equal(Discount.totalFor(100), 100);
});

test('a network failure is a soft error and never persists (checkout stays open)', async () => {
  reset();
  stubPreview(async () => { throw new Error('network down'); });
  const result = await Discount.apply('vip8', [], 200);
  assert.equal(result.status, 'error');
  assert.equal(result.message, API_DOWN_MSG);
  assert.equal(Discount.isApplied(), false);
});
