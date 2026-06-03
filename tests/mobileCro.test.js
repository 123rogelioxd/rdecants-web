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
  assert.ok(modal.includes('pruébalo desde'), 'pruébalo restored');
  assert.ok(!modal.includes('Ver detalles\n          <span aria-hidden="true">?'),
    'broken "?" arrow replaced');

  const catalog = read('assets/js/catalog/render.js');
  assert.ok(catalog.includes('Agregar a mi colección'), 'colección restored');
  assert.ok(catalog.includes('el catálogo tenga'), 'catálogo restored');
});

/* ── C. Cart title ──────────────────────────────────────────── */

test('cart drawer title says "Tu carrito" (not "Tu Colección") with a subtitle', () => {
  for (const file of ['index.html', 'product.html', 'mood.html']) {
    const html = read(file);
    assert.match(html, /class="cart-title">Tu carrito</, `${file} cart title`);
    assert.doesNotMatch(html, /class="cart-title">Tu Colección</, `${file} old title gone`);
    assert.match(html, /class="cart-subtitle"/, `${file} subtitle present`);
    assert.match(html, /Revisa tu pedido antes de enviarlo por WhatsApp/, `${file} subtitle copy`);
  }
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
  assert.ok(heroSlice.includes('Desde 3ml'), 'hero anchors "Desde" to a selectable size');
  assert.ok(heroSlice.includes('$120'), 'hero shows the real 3ml entry price');
  assert.ok(!heroSlice.includes('$80'), 'hero must NOT show the 2ml $80 price');
});

test('PDP size grid offers 3/5/10ml only — never a 2ml button', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const html = buildProductPageHtml(sample2ml);

  assert.ok(html.includes('data-size="3"'), '3ml selectable');
  assert.ok(html.includes('data-size="5"'), '5ml selectable');
  assert.ok(!html.includes('data-size="2"'), '2ml is not a selectable presentation');
});

/* ── D. Minimum order messaging ─────────────────────────────── */

test('below-minimum cart surfaces the remaining amount with "mínimo"', async () => {
  const { getCartMomentum } = await import('../assets/js/cart/momentum.js');
  const m = getCartMomentum({ count: 1, total: 150, hasValidName: false });
  assert.equal(m.key, 'minimum');
  assert.equal(m.minimum.remaining, 50);
  assert.match(m.message, /Te faltan \$50/);
  assert.match(m.message, /mínimo/, 'accent rendered correctly');
});

/* ── E. Required customer name still enforced ───────────────── */

test('checkout still requires a customer name', async () => {
  globalThis.window = globalThis.window || { location: { hostname: 'localhost', pathname: '/' } };
  globalThis.localStorage = globalThis.localStorage || {
    getItem() { return null; }, setItem() {}, removeItem() {},
  };
  globalThis.document = globalThis.document || { getElementById: () => null };

  const { validateCheckout } = await import('../assets/js/cart/checkout.js');

  const empty = validateCheckout({ name: '', phone: '', notes: '' });
  assert.ok(empty, 'empty name is rejected');
  assert.equal(empty.key, 'name');
  assert.match(empty.message, /nombre/);

  const ok = validateCheckout({ name: 'Roger', phone: '', notes: '' });
  assert.equal(ok, null, 'valid name passes');
});

/* ── F. WhatsApp checkout message still builds ──────────────── */

test('WhatsApp checkout message still builds with name and items', async () => {
  globalThis.window = globalThis.window || { location: { hostname: 'localhost', pathname: '/' } };
  globalThis.localStorage = globalThis.localStorage || {
    getItem() { return null; }, setItem() {}, removeItem() {},
  };
  globalThis.document = globalThis.document || { getElementById: () => null };

  const { buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 }],
    170,
    { name: 'Roger' },
    'WEB-1',
  );
  assert.match(message, /Me interesa este decant:/);
  assert.match(message, /Mi nombre es Roger\./);
  assert.match(message, /Total: \$170 MXN/);
});
