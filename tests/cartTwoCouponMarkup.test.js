/* =============================================================
   RDECANTS — SECOND COUPON UX: static markup + copy guards
   Cheap regression guards (source-string checks, no DOM) that complement
   tests/cartTwoCouponUI.test.js — catch a page missing the max-coupon
   element or render.js drifting from the spec copy.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const render = fs.readFileSync('assets/js/cart/render.js', 'utf8');

/* The drawer markup used to be copy-pasted into every HTML entry point, which
   is exactly how the second-coupon UI once shipped dead on two of three pages.
   It now lives in one module that every page mounts, so this guards the single
   source instead of chasing N copies. */
const drawer = fs.readFileSync('assets/js/ui/cartDrawer.js', 'utf8');
const entryPoints = ['index.html', 'catalogo.html', 'elegir.html', 'ayuda.html', 'product.html', 'mood.html'];

test('render.js uses the exact spec copy for the second-coupon flow', () => {
  assert.match(render, /'¿Tienes un código de descuento\?'/);
  assert.match(render, /'¿Tienes otro cupón\?'/);
  assert.match(render, /'Ingresa tu segundo código'/);
  assert.match(render, /'Aplicar otro cupón'/);
});

test('the shared cart drawer carries the discount-rows and max-message elements', () => {
  assert.match(drawer, /id="cart-discount-rows"/, 'per-coupon summary row container');
  assert.match(drawer, /id="cart-discount-max-msg"/, 'max-coupon message');
  assert.match(drawer, /Máximo 2 cupones por pedido\./, 'exact max-coupon copy');
  assert.match(drawer, /id="cart-discount-applied-list"/, 'applied-coupon card list');
  /* The old single combined discount row must be gone, not just supplemented. */
  assert.doesNotMatch(drawer, /id="cart-discount-row"/, 'old single-row markup removed');
});

test('no HTML entry point keeps its own copy of the drawer markup', () => {
  for (const name of entryPoints) {
    const html = fs.readFileSync(name, 'utf8');
    assert.doesNotMatch(html, /id="cart-drawer"/, `${name} must not inline the drawer`);
    assert.doesNotMatch(html, /id="cart-discount-toggle"/, `${name} must not inline the coupon controls`);
  }
});

test('the order summary renders one row per applied coupon, never combined', () => {
  assert.match(render, /cart-summary-row--discount/);
  assert.match(render, /applied\.map\(a => \{/);
  assert.doesNotMatch(render, /codes\.join\(', '\)/, 'discount codes are no longer combined into a single row');
});

test('each applied coupon card keeps its own independent Quitar action', () => {
  assert.match(render, /aria-label="Quitar código \$\{_escape\(code\)\}"/);
  assert.match(render, /data-code="\$\{_escape\(code\)\}"/);
});
