/* =============================================================
   RDECANTS — SECOND COUPON UX (cart drawer)

   End-to-end (DOM-simulated) proof of the two-coupon flow described in the
   sprint brief: reveal → apply → separate summary rows → remove → re-enable
   → duplicate/incompatible/max guards → both codes reach checkout/WhatsApp.

   R Supply OS stays the source of truth (see discount.js) — this file stubs
   ApiClient.previewDiscount the same way tests/discount.test.js does and
   never computes discount math itself.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/', search: '' },
  addEventListener() {},
  scrollTo() {},
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

/* ── Minimal fake DOM — enough for render.js's discount panel + summary ── */
class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const on = force ?? !this.contains(name);
    on ? this.add(name) : this.remove(name);
    return on;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.style = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
    this.placeholder = '';
    this._attrs = {};
    this.dataset = {};
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ target: this, ...event }); }
  setAttribute(name, value) { this._attrs[name] = String(value); }
  getAttribute(name) { return this._attrs[name] ?? null; }
  focus() { this.focused = true; }
  querySelectorAll() { return []; }
}

const elements = Object.fromEntries([
  'cart-items', 'cart-drawer',
  'cart-discount', 'cart-discount-toggle', 'cart-discount-form',
  'cart-discount-applied-list', 'cart-discount-input', 'cart-discount-apply',
  'cart-discount-msg', 'cart-campaign-hint', 'cart-discount-max-msg',
  'cart-summary-count', 'cart-subtotal-value', 'cart-discount-rows', 'cart-total',
].map(id => [id, new FakeElement()]));

/* The max-coupon copy lives as static text in the HTML (render.js only
   toggles `hidden`) — seed it the same way so the assertions below reflect
   what a browser would actually show. */
elements['cart-discount-max-msg'].textContent = 'Máximo 2 cupones por pedido.';

globalThis.document = {
  body: new FakeElement(),
  getElementById: id => elements[id] ?? null,
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
};

const { ApiClient } = await import('../assets/js/api/client.js');
const { CatalogProvider } = await import('../assets/js/providers/catalog.js');
const { Tracker } = await import('../assets/js/tracking/tracker.js');
const { Cart } = await import('../assets/js/cart/cart.js');
const { Discount } = await import('../assets/js/cart/discount.js');
const { renderDiscountPanel, setupDiscountControls } = await import('../assets/js/cart/render.js');
const { buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');

/* Tracker fires many methods across cart/discount/checkout flows — none of
   them matter for this UI test, so silence them all instead of naming each. */
for (const key of Object.keys(Tracker)) {
  if (typeof Tracker[key] === 'function') Tracker[key] = () => {};
}

CatalogProvider.getProductById = async id => (
  id === 'p1'
    ? { id: 'p1', product_id: 'p1', name: 'Sauvage', house: 'Dior',
        variants: [{ size: 5, price: 1050, stock: 5, availability: 5, variant_id: '5' }] }
    : null
);

/* Mirrors the backend coordinator (same shape as tests/discount.test.js). */
function stubBackend(defs, subtotal = 1050) {
  ApiClient.previewDiscount = async payload => {
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
    unique.filter(c => !defs[c]).forEach(c => rejected.push({ code: c, message: 'Ese código no es válido o ya expiró.' }));
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
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function submitCode(code) {
  elements['cart-discount-input'].value = code;
  elements['cart-discount-form'].dispatch('submit', { preventDefault() {} });
  await flush();
}

function removeCode(code) {
  elements['cart-discount-applied-list'].dispatch('click', {
    target: { closest: () => ({ dataset: { code } }) },
  });
}

test('two-coupon UX flow end-to-end', async () => {
  Cart.clear();
  Discount.clear();
  stubBackend({ ESPANA40: { amount: 40, stackable: true }, ACERTASTE60: { amount: 60, stackable: true } }, 1050);
  setupDiscountControls();

  await Cart.add('p1', 5);
  assert.equal(Cart.total(), 1050, 'subtotal is $1,050 as in the brief');

  /* ── No coupon applied: default toggle + input, nothing revealed ── */
  renderDiscountPanel();
  assert.equal(elements['cart-discount-toggle'].hidden, false);
  assert.equal(elements['cart-discount-toggle'].textContent, '¿Tienes un código de descuento?');
  assert.equal(elements['cart-discount-form'].hidden, true);
  assert.equal(elements['cart-discount-max-msg'].hidden, true);

  /* ── Apply the first coupon ── */
  await submitCode('espana40');
  assert.equal(Discount.count(), 1);
  assert.deepEqual(Discount.codes(), ['ESPANA40']);

  /* One coupon applied: "¿Tienes otro cupón?" secondary action appears,
     collapsed behind the toggle (not auto-opened). */
  assert.equal(elements['cart-discount-toggle'].hidden, false, '¿Tienes otro cupón? is visible');
  assert.equal(elements['cart-discount-toggle'].textContent, '¿Tienes otro cupón?');
  assert.equal(elements['cart-discount-form'].hidden, true, 'second input starts collapsed');

  /* Clicking it reveals the second input with the spec copy. */
  elements['cart-discount-toggle'].dispatch('click');
  assert.equal(elements['cart-discount-form'].hidden, false);
  assert.equal(elements['cart-discount-input'].placeholder, 'Ingresa tu segundo código');
  assert.equal(elements['cart-discount-apply'].textContent, 'Aplicar otro cupón');

  /* Duplicate code is rejected without clobbering the first coupon. */
  await submitCode('ESPANA40');
  assert.match(elements['cart-discount-msg'].textContent, /ya está aplicado/i);
  assert.deepEqual(Discount.codes(), ['ESPANA40'], 'first coupon untouched by the duplicate attempt');

  /* An incompatible code surfaces the backend's message verbatim. */
  stubBackend({
    ESPANA40: { amount: 40, stackable: true },
    LONE: { amount: 999, stackable: false },
  }, 1050);
  await submitCode('LONE');
  assert.match(elements['cart-discount-msg'].textContent, /no se puede combinar/i);
  assert.deepEqual(Discount.codes(), ['ESPANA40'], 'first coupon survives an incompatible second code');

  /* Applying the valid second coupon preserves the first. */
  stubBackend({ ESPANA40: { amount: 40, stackable: true }, ACERTASTE60: { amount: 60, stackable: true } }, 1050);
  await submitCode('acertaste60');
  assert.deepEqual(Discount.codes(), ['ESPANA40', 'ACERTASTE60']);
  assert.equal(Discount.amount(), 100);

  /* Two coupons applied: both cards render, input hides, max message shows. */
  assert.match(elements['cart-discount-applied-list'].innerHTML, /ESPANA40/);
  assert.match(elements['cart-discount-applied-list'].innerHTML, /ACERTASTE60/);
  assert.equal(elements['cart-discount-toggle'].hidden, true);
  assert.equal(elements['cart-discount-form'].hidden, true);
  assert.equal(elements['cart-discount-max-msg'].hidden, false);
  assert.equal(elements['cart-discount-max-msg'].textContent, 'Máximo 2 cupones por pedido.');

  /* Order summary: each discount on its OWN row, matching the $950 example. */
  const rows = elements['cart-discount-rows'].innerHTML;
  assert.match(rows, /ESPANA40[\s\S]*-\$40 MXN/);
  assert.match(rows, /ACERTASTE60[\s\S]*-\$60 MXN/);
  assert.equal(elements['cart-discount-rows'].hidden, false);
  assert.equal(Discount.totalFor(Cart.total()), 950, 'combined total matches the API response: 1050 - 40 - 60');

  /* The interface never accepts a third code — the API-level guard still
     applies even if something bypassed the hidden UI. */
  const thirdAttempt = await Discount.apply('THIRD', Cart.items, Cart.total());
  assert.equal(thirdAttempt.status, 'max');
  assert.equal(Discount.count(), 2);

  /* ── Removing one coupon preserves the other and re-enables the slot ── */
  removeCode('ACERTASTE60');
  await flush();
  assert.deepEqual(Discount.codes(), ['ESPANA40'], 'removing ACERTASTE60 keeps ESPANA40');
  assert.equal(Discount.amount(), 40);

  renderDiscountPanel();
  assert.equal(elements['cart-discount-toggle'].hidden, false, 'second-coupon action is available again');
  assert.equal(elements['cart-discount-toggle'].textContent, '¿Tienes otro cupón?');
  assert.equal(elements['cart-discount-max-msg'].hidden, true);
  assert.equal(Cart.items.length, 1, 'removing a coupon never clears the cart');

  /* Removing the remaining coupon returns to the zero-coupon state. */
  removeCode('ESPANA40');
  await flush();
  assert.equal(Discount.isApplied(), false);
  renderDiscountPanel();
  assert.equal(elements['cart-discount-toggle'].textContent, '¿Tienes un código de descuento?');
  assert.equal(Cart.items.length, 1, 'removing the last coupon never clears the cart');
});

test('checkout WhatsApp message and order payload carry both applied coupons', async () => {
  Cart.clear();
  Discount.clear();
  stubBackend({ ESPANA40: { amount: 40, stackable: true }, ACERTASTE60: { amount: 60, stackable: true } }, 1050);
  setupDiscountControls();

  await Cart.add('p1', 5);
  await submitCode('espana40');
  elements['cart-discount-toggle'].dispatch('click');
  await submitCode('acertaste60');
  assert.deepEqual(Discount.codes(), ['ESPANA40', 'ACERTASTE60']);

  const message = buildWhatsAppMessage(Cart.items, Cart.total(), { name: 'Roger' }, '', Discount.applied);
  assert.match(message, /Código: ESPANA40/);
  assert.match(message, /Descuento: -\$40 MXN/);
  assert.match(message, /Código: ACERTASTE60/);
  assert.match(message, /Descuento: -\$60 MXN/);
  assert.match(message, /Descuento total: -\$100 MXN/);
  assert.match(message, /Total: \$950 MXN/);
});

test('existing one-coupon checkout stays compatible (no second code applied)', async () => {
  Cart.clear();
  Discount.clear();
  stubBackend({ ESPANA40: { amount: 40, stackable: true } }, 1050);
  setupDiscountControls();

  await Cart.add('p1', 5);
  await submitCode('espana40');
  assert.deepEqual(Discount.codes(), ['ESPANA40']);

  const message = buildWhatsAppMessage(Cart.items, Cart.total(), { name: 'Roger' }, '', Discount.applied);
  assert.match(message, /Código: ESPANA40/);
  assert.match(message, /Total: \$1,?010 MXN/);
  assert.doesNotMatch(message, /Descuento total:/, 'single-coupon message keeps the pre-existing shape');
});
