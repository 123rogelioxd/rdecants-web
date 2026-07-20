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
const pages = {
  'index.html': fs.readFileSync('index.html', 'utf8'),
  'mood.html': fs.readFileSync('mood.html', 'utf8'),
  'product.html': fs.readFileSync('product.html', 'utf8'),
};

test('render.js uses the exact spec copy for the second-coupon flow', () => {
  assert.match(render, /'¿Tienes un código de descuento\?'/);
  assert.match(render, /'¿Tienes otro cupón\?'/);
  assert.match(render, /'Ingresa tu segundo código'/);
  assert.match(render, /'Aplicar otro cupón'/);
});

test('every cart drawer (index/mood/product) carries the discount-rows and max-message elements', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /id="cart-discount-rows"/, `${name} has the per-coupon summary row container`);
    assert.match(html, /id="cart-discount-max-msg"/, `${name} has the max-coupon message`);
    assert.match(html, /Máximo 2 cupones por pedido\./, `${name} has the exact max-coupon copy`);
    assert.match(html, /id="cart-discount-applied-list"/, `${name} has the applied-coupon card list`);
    /* The old single combined discount row must be gone, not just supplemented. */
    assert.doesNotMatch(html, /id="cart-discount-row"/, `${name} no longer has the old single-row markup`);
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
