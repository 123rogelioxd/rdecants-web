/* =============================================================
   RDECANTS — COMPACT MOBILE CART
   Structural checks for the denser cart-item layout and the
   horizontally-scrollable "Completa tu pedido" strip, plus a
   regression guard that desktop's vertical upsell list is untouched.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderSrc = fs.readFileSync('assets/js/cart/render.js', 'utf8');
/* Line endings are normalised: the repo churns between LF and CRLF, and a
   marker pinned to one of them fails for reasons that have nothing to do
   with the cart layout this file is guarding. */
const css = fs.readFileSync('assets/css/components.css', 'utf8').replace(/\r\n/g, '\n');

/* components.css has more than one `@media (max-width: 768px)` block (the
   header's is much earlier in the file), so anchor on the mobile cart
   drawer's own unique override instead of the bare media-query string. */
const MOBILE_CART_MARKER = '.cart-drawer {\n    inset: 0;';
const mobileCartStart = css.indexOf(MOBILE_CART_MARKER);
assert.ok(mobileCartStart > -1, 'mobile cart-drawer override block found');
const baseBlock = css.slice(0, mobileCartStart);
const mobileBlock = css.slice(mobileCartStart);

/* ── Cart item: two short rows, not a tall stacked-controls card ── */

test('cart item template uses the compact two-row structure', () => {
  assert.match(renderSrc, /cart-item-top/);
  assert.match(renderSrc, /cart-item-bottom/);
  assert.match(renderSrc, /cart-item-id/);
  assert.match(renderSrc, /cart-item-meta-price/);
  /* The old tall single-column layout (info block beside a stacked
     remove+qty column) must be gone, not just supplemented. */
  assert.doesNotMatch(renderSrc, /cart-item-info/, 'old info wrapper removed');
  assert.doesNotMatch(renderSrc, /cart-item-controls/, 'old stacked controls column removed');
});

test('cart item keeps house/name/size/qty/price — internal stock count is never shown to the customer', () => {
  assert.match(renderSrc, /item\.house/);
  assert.match(renderSrc, /item\.name/);
  assert.match(renderSrc, /\$\{label\}/);
  assert.match(renderSrc, /item\.qty/);
  assert.match(renderSrc, /formatPrice\(subtotal, 'Precio por confirmar'\)/);
  /* Raw internal inventory ("Disponibles: 17") is never rendered — only a
     plain-language note appears, and only once the customer hits the max. */
  assert.doesNotMatch(renderSrc, /Disponibles:/);
  assert.match(renderSrc, /Máximo disponible/);
});

test('remove and quantity controls keep their exact cart API calls and a11y labels', () => {
  assert.match(renderSrc, /window\.__rd\.cart\.remove\('\$\{item\.key\}'\)/);
  assert.match(renderSrc, /window\.__rd\.cart\.changeQty\('\$\{item\.key\}', -1\)/);
  assert.match(renderSrc, /window\.__rd\.cart\.changeQty\('\$\{item\.key\}', 1\)/);
  assert.match(renderSrc, /aria-label="Eliminar \$\{item\.name\}"/);
  assert.match(renderSrc, /aria-label="Reducir cantidad"/);
  assert.match(renderSrc, /aria-label="Aumentar cantidad"/);
  assert.match(renderSrc, /\$\{isMaxed \? 'disabled' : ''\}/, 'max-stock still disables the + button');
});

test('44px touch targets are preserved for qty buttons and remove on mobile', () => {
  assert.match(css, /\.qty-btn\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s);
  assert.match(css, /\.remove-btn\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
});

/* ── "Completa tu pedido" — compact horizontal strip on mobile ─── */

test('the cross-sell list scrolls horizontally on mobile instead of stacking full-width cards', () => {
  assert.match(mobileBlock, /\.cart-upsells\s*>\s*\.cart-upsell-list\s*\{[^}]*overflow-x:\s*auto;/s);
  assert.match(mobileBlock, /\.cart-upsells\s*>\s*\.cart-upsell-list\s*\{[^}]*flex-direction:\s*row;/s);
});

test('upsell cards keep image, name, size/price and an add action — no large descriptions added', () => {
  assert.match(renderSrc, /cart-upsell-img/);
  assert.match(renderSrc, /cart-upsell-name/);
  assert.match(renderSrc, /variant\.size\}ml/);
  assert.match(renderSrc, /formatPrice\(variant\.price\)/);
  assert.match(renderSrc, /cart-upsell-add/);
});

test('the single shipping-completion recommendation stays full-width, not squeezed into the strip', () => {
  /* Scoped to a direct child of #cart-upsells so the one-item shipping
     card (nested inside .cart-shipping-complete) is excluded on purpose. */
  assert.doesNotMatch(mobileBlock, /\.cart-shipping-complete[^{]*\.cart-upsell-list\s*\{[^}]*overflow-x/s);
});

/* ── Desktop regression safety ────────────────────────────────── */

test('desktop upsell list is still a plain vertical stack (base rule untouched)', () => {
  assert.match(baseBlock, /\.cart-upsell-list\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
});

/* The guard is about the desktop cart item staying a single hairline card —
   not about a specific colour. The 2026-07 redesign repainted the palette
   (white-on-dark → ink-on-ivory), so pinning the old rgba literal would only
   assert that the theme never changes. */
test('desktop cart-item card styling (single hairline border + radius) is untouched', () => {
  assert.match(baseBlock, /\.cart-item\s*\{[^}]*border:\s*1px solid [^;]+;[^}]*border-radius:\s*12px;/s);
});
