/* =============================================================
   RDECANTS — CART DRAWER MARKUP (single source of truth)

   The drawer used to be copy-pasted into every HTML entry point. That
   guaranteed drift: a coupon-UI change once landed in index.html only
   and the feature was silently dead on the product and mood pages even
   though cart/render.js was correct everywhere. With five entry points
   after the redesign, the markup lives here once and every page mounts
   the same nodes.

   cart/render.js, cart/checkout.js and cart/discount.js address these
   elements by id — treat the ids below as that contract.
   ============================================================= */

export const CART_OVERLAY_HTML = `
<div id="cart-overlay" class="cart-overlay" onclick="closeCart()"></div>`;

export const CART_DRAWER_HTML = `
<aside id="cart-drawer" class="cart-drawer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Carrito de compras">

  <div class="cart-header">
    <div class="cart-header-text">
      <h2 class="cart-title">Tu carrito</h2>
      <p class="cart-subtitle">Revisa tu pedido antes de enviarlo por WhatsApp.</p>
    </div>
    <button class="cart-close" onclick="closeCart()" aria-label="Cerrar carrito">×</button>
  </div>

  <div class="cart-scroll" id="cart-scroll">
    <div class="cart-items" id="cart-items">
      <!-- Rendered by cart/render.js -->
    </div>

    <div class="cart-static">
      <div class="checkout-panel" id="checkout-form" aria-label="Datos de checkout">
        <label class="checkout-control checkout-control--primary" for="checkout-name">
          <span>Tu nombre (opcional)</span>
          <input class="checkout-field" id="checkout-name" type="text" autocomplete="name" placeholder="Ej. Roger Díaz">
          <small class="checkout-name-error" id="checkout-name-error" aria-live="polite"></small>
        </label>

        <button type="button" class="checkout-notes-toggle" id="checkout-notes-toggle" aria-expanded="false" aria-controls="checkout-notes">
          Agregar comentario
        </button>
        <textarea class="checkout-field checkout-textarea" id="checkout-notes" rows="3" placeholder="Horario, referencia o detalle especial" hidden></textarea>

        <p class="checkout-error" id="checkout-error" aria-live="polite"></p>
      </div>

      <div class="cart-discount" id="cart-discount">
        <button type="button" class="cart-discount-toggle" id="cart-discount-toggle"
          aria-expanded="false" aria-controls="cart-discount-form">
          ¿Tienes un código de descuento?
        </button>
        <div class="cart-discount-applied-list" id="cart-discount-applied-list" hidden><!-- applied coupon chips rendered by cart/render.js --></div>
        <form class="cart-discount-form" id="cart-discount-form" hidden>
          <input class="cart-discount-input" id="cart-discount-input" type="text"
                 placeholder="Código de descuento" autocomplete="off"
                 autocapitalize="characters" spellcheck="false"
                 aria-label="Código de descuento">
          <button class="cart-discount-apply" id="cart-discount-apply" type="submit">Aplicar</button>
        </form>
        <p class="cart-discount-msg" id="cart-discount-msg" data-tone="neutral" aria-live="polite" hidden></p>
        <p class="cart-campaign-hint" id="cart-campaign-hint" aria-live="polite" hidden></p>
        <p class="cart-discount-max-msg" id="cart-discount-max-msg" aria-live="polite" hidden>Máximo 2 cupones por pedido.</p>
      </div>

      <ul class="cart-trust" aria-label="Garantías del pedido">
        <li>✓ Perfumes originales</li>
        <li>✓ Decants preparados al momento</li>
        <li>✓ Envíos a todo México</li>
      </ul>

      <!-- Optional add-ons — secondary, after the customer has seen products,
           the checkout form and the trust list. Populated by cart/render.js. -->
      <section class="cart-upsells" id="cart-upsells" aria-label="Completa tu pedido" hidden></section>
    </div>
  </div>

  <div class="cart-footer">
    <div class="cart-action-panel">
      <div class="cart-summary" aria-label="Resumen del pedido">
        <div class="cart-summary-head">
          <span class="cart-summary-title">Resumen</span>
          <span class="cart-summary-count" id="cart-summary-count">0 artículos</span>
        </div>
        <div class="cart-summary-row">
          <span class="cart-summary-row-label">Subtotal</span>
          <span class="cart-summary-row-value" id="cart-subtotal-value">$0 MXN</span>
        </div>
        <div class="cart-discount-rows" id="cart-discount-rows" hidden><!-- one row per applied coupon, rendered by cart/render.js --></div>
        <div class="cart-total-row">
          <span class="cart-total-label">Total</span>
          <span class="cart-total-amount">$<span id="cart-total">0</span> <small>MXN</small></span>
        </div>
        <div class="shipping-status" id="shipping-status" hidden>
          <span class="shipping-badge" id="shipping-badge"></span>
          <span class="shipping-note" id="shipping-note"></span>
        </div>
      </div>

      <button class="btn-whatsapp" id="checkout-whatsapp" onclick="sendWhatsApp()" aria-label="Enviar pedido por WhatsApp">
        📲 Enviar pedido por WhatsApp
      </button>

      <p class="checkout-fallback" id="checkout-fallback" hidden></p>

      <p class="checkout-next">En WhatsApp confirmamos envío, pago y disponibilidad.</p>

      <button class="btn-continue" onclick="closeCart()" aria-label="Cerrar carrito y seguir explorando">
        Seguir comprando
      </button>
    </div>
  </div>
</aside>`;

/* Mount the overlay + drawer once, before the cart modules bind to them.
   Idempotent: a page that already carries the markup is left untouched. */
export function mountCartDrawer(doc = document) {
  if (doc.getElementById('cart-drawer')) return doc.getElementById('cart-drawer');

  const host = doc.createElement('div');
  host.innerHTML = `${CART_OVERLAY_HTML}${CART_DRAWER_HTML}`;
  while (host.firstElementChild) doc.body.appendChild(host.firstElementChild);

  return doc.getElementById('cart-drawer');
}
