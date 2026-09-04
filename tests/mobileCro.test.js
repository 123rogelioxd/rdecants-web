/* =============================================================
   Mobile CRO audit — encoding, cart copy, honest PDP entry price,
   minimum messaging, required name, WhatsApp checkout.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

/* ── A. Encoding / accents ──────────────────────────────────── */

test('source files render accents as valid UTF-8 (no replacement char)', () => {
  for (const file of [
    'assets/js/ui/modal.js',
    'assets/js/catalog/render.js',
    'assets/js/cart/render.js',
    'assets/js/cart/momentum.js',
  ]) {
    const src = read(file);
    assert.ok(!src.includes('�'), `${file} must not contain U+FFFD`);
  }
});

test('previously corrupted strings now read correctly', () => {
  const modal = read('assets/js/ui/modal.js');
  assert.ok(modal.includes('Decant auténtico'), 'auténtico restored');
  assert.ok(modal.includes('Elige presentación'), 'presentación restored');
  assert.ok(modal.includes('Ideal para probar'), 'modal size guidance present');
  assert.ok(modal.includes('Ver perfil completo'), 'modal full-profile link present');
  assert.ok(!modal.includes('Ver detalles\n          <span aria-hidden="true">?'),
    'broken "?" arrow replaced');

  const catalog = read('assets/js/catalog/render.js');
  assert.ok(catalog.includes('Nuestra recomendación'), 'recomendación restored');
  assert.ok(catalog.includes('el catálogo tenga'), 'catálogo restored');
});

/* ── C. Cart title ──────────────────────────────────────────── */

/* The drawer markup lives in one module now (assets/js/ui/cartDrawer.js) and
   every entry point mounts it, so these guards check the single source. */
const CART_DRAWER_SRC = 'assets/js/ui/cartDrawer.js';

test('cart drawer title says "Tu carrito" (not "Tu Colección") with a subtitle', () => {
  const drawer = read(CART_DRAWER_SRC);
  assert.match(drawer, /class="cart-title">Tu carrito</, 'cart title');
  assert.doesNotMatch(drawer, /class="cart-title">Tu Colección</, 'old title gone');
  assert.match(drawer, /class="cart-subtitle"/, 'subtitle present');
  assert.match(drawer, /Revisa tu pedido antes de enviarlo por WhatsApp/, 'subtitle copy');
});

test('every entry point mounts the shared drawer through the page shell', () => {
  const shell = read('assets/js/core/shell.js');
  assert.match(shell, /mountCartDrawer\(\)/, 'the shell mounts the drawer');

  for (const entry of [
    'assets/js/app.js',
    'assets/js/pages/catalog.js',
    'assets/js/pages/finder.js',
    'assets/js/pages/help.js',
    'assets/js/pages/product.js',
    'assets/js/pages/mood.js',
  ]) {
    assert.match(read(entry), /bootstrapShell/, `${entry} boots through the shared shell`);
  }
});

test('cart upsell copy says "Completa tu pedido", not "Completa tu colección"', () => {
  const src = read('assets/js/cart/render.js');
  assert.ok(src.includes('Completa tu pedido'), 'new cart recommendation title present');
  assert.ok(!src.includes('Completa tu colección'), 'old collection title removed from cart recommendations');
});

/* The name is asked ONCE, in the delivery block.

   This test used to assert the opposite — that a "Tu nombre (opcional)" input
   existed in the checkout panel. That field was the bug: it was the only thing
   feeding the order's customer record, while the name the customer actually
   typed went into the delivery block's "Quién recibe" and stayed there. A
   customer who filled the form in correctly produced an order reading «Sin
   nombre» with no phone. */
test('the name is asked once, in the delivery block, and never twice', () => {
  const drawer = read(CART_DRAWER_SRC);
  assert.ok(!drawer.includes('id="checkout-name"'), 'the duplicate name input is gone');
  assert.ok(!drawer.includes('Tu nombre (opcional)'), 'the duplicate label is gone');
  assert.ok(!drawer.includes('id="checkout-name-error"'), 'its error slot went with it');

  // The one place it IS asked, alongside the phone that used to be missing
  // from the payload entirely.
  assert.ok(drawer.includes('id="delivery-recipient"'), 'recipient asked in the delivery block');
  assert.ok(drawer.includes('Quién recibe'), 'recipient labelled for the customer');
  assert.ok(drawer.includes('id="delivery-phone"'), 'phone asked in the delivery block');

  assert.ok(!drawer.includes('aria-required="true"'), 'no required field');
  assert.ok(!drawer.includes('id="checkout-phone"'), 'no second phone field');
  assert.ok(drawer.includes('id="checkout-notes-toggle"'), 'notes collapsed behind a toggle');
  assert.ok(drawer.includes('En WhatsApp confirmamos envío, pago y disponibilidad'), 'explains the next step');
  assert.ok(drawer.includes('class="cart-trust"'), 'trust strip present');
  assert.ok(drawer.includes('id="shipping-status"'), 'shipping eligibility status present');
  assert.ok(drawer.includes('id="checkout-fallback"'), 'popup-blocked fallback slot present');
  assert.ok(!drawer.includes('id="checkout-momentum"'), 'old momentum line removed');
});

/* ── B. Honest PDP entry price (no misleading 2ml "Desde") ───── */

const sample2ml = {
  id: 'test-2ml',
  slug: 'test-2ml',
  name: 'Test Fragrance',
  house: 'Test House',
  concentration: 'EDP',
  stock: 10,
  variants: [
    { id: 'v2', size: 2, ml_size: 2, price: 80, retail_price: 80, availability: 10, stock: 10, available: true, soldOut: false, sold_out: false, variant_id: '1', product_id: 'test-2ml' },
    { id: 'v3', size: 3, ml_size: 3, price: 120, retail_price: 120, availability: 10, stock: 10, available: true, soldOut: false, sold_out: false, variant_id: '2', product_id: 'test-2ml' },
    { id: 'v5', size: 5, ml_size: 5, price: 180, retail_price: 180, availability: 10, stock: 10, available: true, soldOut: false, sold_out: false, variant_id: '3', product_id: 'test-2ml' },
  ],
  fragrance: null,
};

test('price helpers exclude the 2ml completer from primary/entry variants', async () => {
  const { getPrimaryVariants, getEntryVariant, PRIMARY_SIZES } =
    await import('../assets/js/utils/prices.js');

  assert.deepEqual(PRIMARY_SIZES, [3, 5, 10]);
  assert.deepEqual(getPrimaryVariants(sample2ml).map(v => v.size), [3, 5]);

  const entry = getEntryVariant(sample2ml);
  assert.equal(entry.size, 3, 'entry is the smallest selectable size');
  assert.equal(entry.price, 120, 'entry price is the 3ml price, not the 2ml $80');
});

test('PDP hero never advertises the 2ml price as the "Desde" entry', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const html = buildProductPageHtml(sample2ml);

  const heroSlice = html.slice(
    html.indexOf('id="pdp-hero"'),
    html.indexOf('id="pdp-novice"'),
  );
  assert.ok(heroSlice.includes('pruébalo desde'), 'hero anchors the entry price copy');
  assert.ok(heroSlice.includes('$120'), 'hero shows the real 3ml entry price');
  assert.ok(!heroSlice.includes('$80'), 'hero must NOT show the 2ml $80 price');
  assert.ok(!heroSlice.includes('data-size="2"'), '2ml is never a selectable presentation');
});

test('PDP size grid offers 3/5/10ml only — never a 2ml button', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const html = buildProductPageHtml(sample2ml);

  assert.ok(html.includes('data-size="3"'), '3ml selectable');
  assert.ok(html.includes('data-size="5"'), '5ml selectable');
  assert.ok(!html.includes('data-size="2"'), '2ml is not a selectable presentation');
});

/* ── D. Minimum order messaging ─────────────────────────────── */

test('below-threshold cart is local-pickup, accent-correct and non-blocking', async () => {
  const { getCartMomentum } = await import('../assets/js/cart/momentum.js');
  const m = getCartMomentum({ count: 1, total: 150 });
  assert.equal(m.key, 'local');
  assert.equal(m.shipping.remaining, 20);
  assert.match(m.message, /local/, 'explains local pickup');
  assert.match(m.message, /envío/, 'accent rendered correctly');
  assert.doesNotMatch(m.message, /mínimo|faltan/, 'no blocking / minimum language');
});

test('checkout CTA is one constant action — only the empty state differs', async () => {
  const { getCheckoutButtonLabel, getCheckoutButtonState } =
    await import('../assets/js/cart/checkout.js');

  /* With items in the cart, the label and state never change — not for a
     missing name, not for a below-recommended total. */
  assert.equal(getCheckoutButtonLabel({ isEmpty: false }), '📲 Enviar pedido por WhatsApp');
  assert.equal(getCheckoutButtonState({ isEmpty: false }), 'ready');

  assert.equal(
    getCheckoutButtonLabel({ isEmpty: false, minimum: { isComplete: false }, hasValidName: false }),
    '📲 Enviar pedido por WhatsApp',
  );
  assert.equal(
    getCheckoutButtonState({ isEmpty: false, minimum: { isComplete: false }, hasValidName: false }),
    'ready',
  );

  /* Empty is the only non-ready state. */
  assert.equal(getCheckoutButtonLabel({ isEmpty: true }), 'Agrega una fragancia para finalizar');
  assert.equal(getCheckoutButtonState({ isEmpty: true }), 'empty');
});

/* ── E. Zero required fields — name is optional ─────────────── */

test('checkout has no required fields — an empty name still passes', async () => {
  globalThis.window = globalThis.window || { location: { hostname: 'localhost', pathname: '/' } };
  globalThis.localStorage = globalThis.localStorage || {
    getItem() { return null; }, setItem() {}, removeItem() {},
  };
  globalThis.document = globalThis.document || { getElementById: () => null };

  const { validateCheckout } = await import('../assets/js/cart/checkout.js');

  assert.equal(validateCheckout({ name: '', notes: '' }), null, 'empty name is allowed');
  assert.equal(validateCheckout({ name: 'Roger', notes: '' }), null, 'named order is allowed');
});

/* ── F. WhatsApp checkout message still builds ──────────────── */

/* The message carries the folio and nothing else — see
   checkoutWhatsApp.test.js for the full contract. Kept here because the mobile
   funnel's last step is this handoff, and a message that started reprinting
   the cart again would be a regression this file should notice. */
test('the WhatsApp handoff is a folio, not a copy of the cart', async () => {
  globalThis.window = globalThis.window || { location: { hostname: 'localhost', pathname: '/' } };
  globalThis.localStorage = globalThis.localStorage || {
    getItem() { return null; }, setItem() {}, removeItem() {},
  };
  globalThis.document = globalThis.document || { getElementById: () => null };

  const { buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');
  const message = buildWhatsAppMessage('WEB-20260904-0001');

  assert.equal(message, 'Hola, quiero confirmar mi pedido WEB-20260904-0001.');
  assert.ok(!/Me interesa|Mi nombre es|Total:/.test(message));
});
