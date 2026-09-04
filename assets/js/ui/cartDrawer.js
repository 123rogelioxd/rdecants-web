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

      <!-- ── Entrega ────────────────────────────────────────────────────
           Where the order goes, and what R Supply OS charges to take it there.
           Sits before the coupon block because delivery changes the total and
           a customer should not discover a shipping cost after entering a code.

           Every price rendered inside here came from /api/web/delivery/quote.
           There is no element that shows a locally computed figure, and the
           "por confirmar" state is a distinct branch rather than a $0. -->
      <section class="delivery-panel" id="delivery-panel" aria-label="Entrega">
        <h3 class="delivery-title">¿Cómo lo quieres recibir?</h3>

        <div class="delivery-modes" id="delivery-modes" role="radiogroup" aria-label="Forma de entrega">
          <!-- No physical customer-facing store today. Hidden by default so
               it never flashes before deliveryPanel.js confirms R Supply OS
               is actually offering it (STOREFRONT_PICKUP_ENABLED) — see
               _loadModes() in ui/deliveryPanel.js. -->
          <button type="button" class="delivery-mode" data-mode="pickup" role="radio" aria-checked="false" hidden>
            <span class="delivery-mode-label">Recoger</span>
            <span class="delivery-mode-hint">En tienda</span>
          </button>
          <button type="button" class="delivery-mode" data-mode="local" role="radio" aria-checked="false">
            <span class="delivery-mode-label">Entrega local</span>
            <span class="delivery-mode-hint">Oaxaca y valle</span>
          </button>
          <button type="button" class="delivery-mode" data-mode="national" role="radio" aria-checked="false">
            <span class="delivery-mode-label">Envío</span>
            <span class="delivery-mode-hint">A todo México</span>
          </button>
        </div>

        <!-- Address: CP-first, shared shape for Local and National alike.
             See assets/js/cart/address.js — the same module drives this
             block and the one on the Cotiza tu perfume page. -->
        <div class="delivery-block" id="delivery-address-block" hidden data-address-root>
          <div class="delivery-grid">
            <label class="delivery-field" for="delivery-postal-code">
              <span>Código postal</span>
              <input class="checkout-field" id="delivery-postal-code" data-address="postal_code"
                     type="text" inputmode="numeric" autocomplete="postal-code"
                     maxlength="5" placeholder="68000">
            </label>

            <p class="delivery-location-hint" data-address-location hidden></p>

            <label class="delivery-field delivery-field--wide" data-address-colonia-select-wrap hidden>
              <span>Colonia</span>
              <select class="checkout-field" data-address-colonia-select>
                <option value="">Elige tu colonia</option>
              </select>
            </label>
            <label class="delivery-field delivery-field--wide" for="delivery-neighborhood" data-address-colonia-manual-wrap hidden>
              <span>Colonia</span>
              <input class="checkout-field" id="delivery-neighborhood" data-address="neighborhood"
                     type="text" autocomplete="address-level3" placeholder="Centro">
            </label>

            <label class="delivery-field delivery-field--wide" for="delivery-street">
              <span>Calle</span>
              <input class="checkout-field" id="delivery-street" data-address="street"
                     type="text" autocomplete="address-line1" placeholder="Calle Independencia">
            </label>
            <label class="delivery-field" for="delivery-exterior">
              <span>Número ext.</span>
              <input class="checkout-field" id="delivery-exterior" data-address="exterior_number"
                     type="text" placeholder="101">
            </label>

            <label class="delivery-field delivery-field--wide" for="delivery-recipient">
              <span>Quién recibe</span>
              <input class="checkout-field" id="delivery-recipient" data-address="recipient"
                     type="text" autocomplete="name" placeholder="Nombre completo">
            </label>
            <label class="delivery-field" for="delivery-phone">
              <span>Teléfono</span>
              <input class="checkout-field" id="delivery-phone" data-address="phone"
                     type="tel" inputmode="numeric" autocomplete="tel" placeholder="10 dígitos">
            </label>
          </div>

          <button type="button" class="delivery-more-toggle" data-address-more-toggle aria-expanded="false">
            + Interior / depto. (opcional)
          </button>
          <div class="delivery-grid delivery-more" data-address-more hidden>
            <label class="delivery-field" for="delivery-interior">
              <span>Interior / depto.</span>
              <input class="checkout-field" id="delivery-interior" data-address="interior_number"
                     type="text" placeholder="3">
            </label>
            <label class="delivery-field delivery-field--wide" for="delivery-references">
              <span>Referencias</span>
              <input class="checkout-field" id="delivery-references" data-address="references"
                     type="text" placeholder="Portón azul, entre 5 de Mayo y Morelos">
            </label>
            <!-- Manual fallback — only shown when the postal code did not
                 resolve, so a real gap in the SEPOMEX data never blocks
                 checkout (see address.js). -->
            <label class="delivery-field" for="delivery-city" data-address-city-wrap hidden>
              <span>Ciudad</span>
              <input class="checkout-field" id="delivery-city" data-address="city"
                     type="text" autocomplete="address-level2" placeholder="Oaxaca de Juárez">
            </label>
            <label class="delivery-field" for="delivery-state" data-address-state-wrap hidden>
              <span>Estado</span>
              <input class="checkout-field" id="delivery-state" data-address="state"
                     type="text" autocomplete="address-level1" placeholder="Oaxaca">
            </label>
          </div>
        </div>

        <button type="button" class="delivery-quote-btn" id="delivery-quote-btn" hidden>
          Calcular entrega
        </button>

        <!-- Real carrier options, one radio each. Rendered only when the server
             returned priced options. -->
        <div class="delivery-options" id="delivery-options" role="radiogroup"
             aria-label="Opciones de envío" hidden></div>

        <p class="delivery-msg" id="delivery-msg" data-tone="neutral" aria-live="polite" hidden></p>
      </section>

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
        <!-- The shipping line. Hidden until a mode is chosen; shows "Por
             confirmar" — never $0 — when nobody has priced the delivery. -->
        <div class="cart-summary-row" id="cart-shipping-row" hidden>
          <span class="cart-summary-row-label" id="cart-shipping-label">Envío</span>
          <span class="cart-summary-row-value" id="cart-shipping-value">Por confirmar</span>
        </div>
        <div class="cart-total-row">
          <span class="cart-total-label" id="cart-total-label">Total</span>
          <span class="cart-total-amount">$<span id="cart-total">0</span> <small>MXN</small></span>
        </div>
        <!-- Only rendered when shipping has a real price, because a grand total
             built on an unpriced delivery is a number nobody has to honour. -->
        <p class="cart-total-note" id="cart-total-note" hidden></p>
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
