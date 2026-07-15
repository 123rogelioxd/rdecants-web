/* =============================================================
   Campaign attribution + auto-promo.

   R Supply OS' Growth Center generates storefront links carrying a promo code
   and UTM attribution. The storefront reads them, persists attribution with a
   TTL, auto-applies the promo when the cart can be priced, and forwards the
   CODE (never an amount) on the Web Order. R Supply OS stays the source of
   truth — the frontend never computes discount math.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/', search: '' },
};

const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
globalThis.sessionStorage = {
  getItem: k => (_store.has(`s:${k}`) ? _store.get(`s:${k}`) : null),
  setItem: (k, v) => _store.set(`s:${k}`, String(v)),
  removeItem: k => _store.delete(`s:${k}`),
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node-test' },
});

const KEY = 'rdecants_attribution';

/* Same specifier (incl. ?v=) the app uses, so these share module instances. */
const { Attribution, parseAttributionParams, sanitizeValue, normalizeCampaignCode } =
  await import('../assets/js/cart/attribution.js');
const { ApiClient } = await import('../assets/js/api/client.js');
const { Discount } = await import('../assets/js/cart/discount.js');
const { maybeAutoApplyPromo, resetAutoApplyGuard } =
  await import('../assets/js/cart/campaign.js');

function reset() {
  _store.clear();
  Discount.remove();
  resetAutoApplyGuard();
}
function stubPreview(fn) { ApiClient.previewDiscount = fn; }
function storedRecord() { return JSON.parse(_store.get(KEY)); }

const VALID_PREVIEW = async () => ({ ok: true, status: 200, data: {
  valid: true, normalized_code: 'VIP8', discount_amount: 44, total: 506,
} });

/* ── 1. Reading params ──────────────────────────────────────── */
test('reads promo + UTM params from the URL', () => {
  const parsed = parseAttributionParams('?promo=VIP8&utm_campaign=vip-julio&utm_source=instagram&utm_medium=story');
  assert.deepEqual(parsed, {
    discount_code: 'VIP8',
    promo: 'VIP8',
    campaign_slug: 'vip-julio',
    utm_campaign: 'vip-julio',
    utm_source: 'instagram',
    utm_medium: 'story',
  });
});

test('promo is preferred as the discount code over discount_code/code', () => {
  const parsed = parseAttributionParams('?promo=VIP8&discount_code=OTHER&code=THIRD');
  assert.equal(parsed.discount_code, 'VIP8');
  assert.equal(parsed.promo, 'VIP8');
});

test('discount_code then code fall back when promo is missing', () => {
  assert.equal(parseAttributionParams('?discount_code=SUMMER10').discount_code, 'SUMMER10');
  assert.equal(parseAttributionParams('?code=WELCOME').discount_code, 'WELCOME');
  /* No `promo` param → we never invent a promo from the fallback. */
  assert.equal('promo' in parseAttributionParams('?code=WELCOME'), false);
});

test('campaign_slug falls back to utm_campaign when absent', () => {
  const parsed = parseAttributionParams('?promo=X&utm_campaign=vip-julio');
  assert.equal(parsed.campaign_slug, 'vip-julio');
});

test('explicit campaign_slug wins over utm_campaign', () => {
  const parsed = parseAttributionParams('?promo=X&campaign_slug=real-slug&utm_campaign=vip-julio');
  assert.equal(parsed.campaign_slug, 'real-slug');
  assert.equal(parsed.utm_campaign, 'vip-julio');
});

test('empty params produce an empty record (nothing stored)', () => {
  assert.deepEqual(parseAttributionParams('?promo=&utm_source='), {});
  assert.deepEqual(parseAttributionParams(''), {});
});

/* ── 2. Sanitization / XSS ──────────────────────────────────── */
test('sanitizeValue strips markup and control chars — no XSS surface', () => {
  assert.equal(sanitizeValue('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(sanitizeValue('vip"><img src=x>'), 'vipimg srcx');
  assert.equal(sanitizeValue('  vip-julio  '), 'vip-julio');
});

test('sanitizeValue caps length and query params never carry HTML through parse', () => {
  const parsed = parseAttributionParams('?promo=' + encodeURIComponent('<b>VIP8</b>'));
  assert.equal(/[<>]/.test(parsed.discount_code), false);
  assert.ok(parsed.discount_code.length <= 64);
});

test('normalizeCampaignCode upper-cases for display only', () => {
  assert.equal(normalizeCampaignCode('  vip8 '), 'VIP8');
});

/* ── 3. Storage, survival & TTL ─────────────────────────────── */
test('capture stores attribution and current() returns it (survives re-reads)', () => {
  reset();
  Attribution.capture('?promo=VIP8&utm_source=instagram&utm_medium=story');
  const a = Attribution.current();
  assert.equal(a.discount_code, 'VIP8');
  assert.equal(a.utm_source, 'instagram');
  /* A second read (e.g. another page) still sees it. */
  assert.equal(Attribution.current().discount_code, 'VIP8');
});

test('attribution survives internal navigation (capture with no params keeps it)', () => {
  reset();
  Attribution.capture('?promo=VIP8&campaign_slug=vip-julio');
  Attribution.capture('');            // internal page, no campaign params
  assert.equal(Attribution.current().discount_code, 'VIP8');
  assert.equal(Attribution.current().campaign_slug, 'vip-julio');
});

test('attribution expires after the TTL', () => {
  reset();
  Attribution.capture('?promo=VIP8');
  const rec = storedRecord();
  rec.ts = Date.now() - (25 * 60 * 60 * 1000); // 25h ago > 24h TTL
  _store.set(KEY, JSON.stringify(rec));
  assert.equal(Attribution.current(), null);
  assert.equal(Attribution.pendingPromoCode(), null);
});

test('pendingPromoCode reflects the resolved code', () => {
  reset();
  Attribution.capture('?code=WELCOME');
  assert.equal(Attribution.pendingPromoCode(), 'WELCOME');
});

/* ── 4. Manual dismiss / override semantics ─────────────────── */
test('dismissPromo stops auto-apply but keeps UTM attribution for reporting', () => {
  reset();
  Attribution.capture('?promo=VIP8&utm_source=instagram&campaign_slug=vip-julio');
  Attribution.dismissPromo();

  assert.equal(Attribution.pendingPromoCode(), null);
  const order = Attribution.forOrder();
  assert.equal('discount_code' in order, false, 'dismissed code is not forwarded');
  assert.equal(order.promo, 'VIP8', 'promo attribution stays');
  assert.equal(order.utm_source, 'instagram');
  assert.equal(order.campaign_slug, 'vip-julio');
});

test('re-visiting the URL re-enables a previously dismissed promo', () => {
  reset();
  Attribution.capture('?promo=VIP8');
  Attribution.dismissPromo();
  assert.equal(Attribution.pendingPromoCode(), null);
  Attribution.capture('?promo=VIP8'); // fresh visit
  assert.equal(Attribution.pendingPromoCode(), 'VIP8');
});

/* ── 5. Order + tracking payloads ───────────────────────────── */
test('forOrder forwards code + campaign/UTM only — never an amount', () => {
  reset();
  Attribution.capture('?promo=VIP8&campaign_slug=vip-julio&utm_campaign=vip-julio&utm_source=instagram&utm_medium=story');
  const order = Attribution.forOrder();
  assert.deepEqual(order, {
    discount_code: 'VIP8',
    promo: 'VIP8',
    campaign_slug: 'vip-julio',
    utm_campaign: 'vip-julio',
    utm_source: 'instagram',
    utm_medium: 'story',
  });
  assert.equal('discount_amount' in order, false);
  assert.equal('total' in order, false);
});

test('forOrder omits empty keys when only some params exist', () => {
  reset();
  Attribution.capture('?utm_source=instagram&utm_medium=story');
  const order = Attribution.forOrder();
  assert.deepEqual(Object.keys(order).sort(), ['utm_medium', 'utm_source']);
  assert.equal('discount_code' in order, false);
});

test('clear wipes attribution entirely (post-checkout)', () => {
  reset();
  Attribution.capture('?promo=VIP8');
  Attribution.clear();
  assert.equal(Attribution.current(), null);
  assert.deepEqual(Attribution.forOrder(), {});
});

/* ── 6. Auto-apply orchestration ────────────────────────────── */
test('does not require items on landing — promo stays pending on empty cart', async () => {
  reset();
  Attribution.capture('?promo=VIP8');
  const res = await maybeAutoApplyPromo({ items: [], total: 0 });
  assert.equal(res.status, 'pending');
  assert.equal(Discount.isApplied(), false);
});

test('auto-applies the pending promo once the cart has an item (valid → backend discount)', async () => {
  reset();
  stubPreview(VALID_PREVIEW);
  Attribution.capture('?promo=VIP8');

  let applied = null;
  const res = await maybeAutoApplyPromo({
    items: [{ product_id: 1, variant_id: 2, qty: 1 }],
    total: 550,
    onApplied: r => { applied = r; },
  });

  assert.equal(res.status, 'valid');
  assert.ok(Discount.isApplied());
  assert.equal(Discount.code, 'VIP8');
  assert.equal(Discount.amount(), 44);           // straight from the backend preview
  assert.equal(applied.normalizedCode, 'VIP8');
});

test('an invalid promo never blocks checkout and is not held as applied', async () => {
  reset();
  stubPreview(async () => ({ ok: false, status: 422, data: { message: 'Ese código ya expiró.' } }));
  Attribution.capture('?promo=BAD');

  let msg = null;
  const res = await maybeAutoApplyPromo({
    items: [{ product_id: 1, variant_id: 2, qty: 1 }],
    total: 200,
    onMessage: (m, tone) => { msg = { m, tone }; },
  });

  assert.equal(res.status, 'invalid');
  assert.equal(Discount.isApplied(), false);
  assert.equal(msg.tone, 'invalid');
  /* Attribution stays so the sale is still credited to the campaign. */
  assert.equal(Attribution.current().discount_code, 'BAD');
});

test('an API/network failure does not crash and keeps checkout open', async () => {
  reset();
  stubPreview(async () => { throw new Error('network down'); });
  Attribution.capture('?promo=VIP8');

  let msg = null;
  const res = await maybeAutoApplyPromo({
    items: [{ product_id: 1, variant_id: 2, qty: 1 }],
    total: 200,
    onMessage: (m, tone) => { msg = { m, tone }; },
  });

  assert.equal(res.status, 'error');
  assert.equal(Discount.isApplied(), false);
  assert.equal(msg.tone, 'error');
});

test('a manually-applied code wins — auto-apply skips (manual overrides URL promo)', async () => {
  reset();
  stubPreview(VALID_PREVIEW);
  /* Customer manually applied a code. */
  await Discount.apply('MANUAL', [{ product_id: 1, variant_id: 2, qty: 1 }], 550);
  assert.ok(Discount.isApplied());

  Attribution.capture('?promo=VIP8');
  const res = await maybeAutoApplyPromo({ items: [{ product_id: 1, variant_id: 2, qty: 1 }], total: 550 });
  assert.equal(res.status, 'skip_applied');
});

test('auto-apply only hits the API once per page load (rejected code is not retried)', async () => {
  reset();
  let calls = 0;
  stubPreview(async () => { calls += 1; return { ok: false, status: 422, data: { message: 'no' } }; });
  Attribution.capture('?promo=BAD');

  const items = [{ product_id: 1, variant_id: 2, qty: 1 }];
  await maybeAutoApplyPromo({ items, total: 200 });
  const second = await maybeAutoApplyPromo({ items, total: 240 }); // cart changed again
  assert.equal(second.status, 'skip_attempted');
  assert.equal(calls, 1);
});
