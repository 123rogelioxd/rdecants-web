/* Separate delivery, review and registered screens; mounted once by the shell. */
export const CHECKOUT_FLOW_HTML = `
<div class="checkout-overlay" id="checkout-overlay" hidden>
  <section class="checkout-dialog" id="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1">
    <header class="checkout-heading">
      <span class="checkout-brand">R. <span>RDECANTS</span></span>
      <button type="button" class="checkout-close" id="checkout-close" aria-label="Cerrar pedido">×</button>
    </header>
    <nav class="checkout-progress" aria-label="Progreso del pedido">
      <button type="button" data-checkout-edit="cart"><span>1</span> Carrito</button>
      <button type="button" data-checkout-edit="delivery" data-checkout-progress="delivery"><span>2</span> Entrega</button>
      <span data-checkout-progress="confirm"><span>3</span> Confirmar</span>
      <span data-checkout-progress="registered"><span>4</span> Registro</span>
    </nav>
    <div class="checkout-scroll" id="checkout-scroll">
      <div class="checkout-intro">
        <p class="checkout-eyebrow" id="checkout-eyebrow">PASO 2 DE 4</p>
        <h2 id="checkout-title" tabindex="-1">Entrega</h2>
        <p id="checkout-subtitle">Elige cómo recibir tu pedido.</p>
      </div>
      <div class="checkout-layout" id="checkout-layout">
        <div class="checkout-content">
          <section id="checkout-step-delivery" data-checkout-step="delivery" aria-label="Datos de entrega">
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

          <div class="delivery-grid">
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
          <button type="button" class="delivery-more-toggle" data-address-more-toggle aria-expanded="false">
            + Interior / referencias (opcional)
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
          </div>
        </div>

        <button type="button" class="delivery-quote-btn" id="delivery-quote-btn" hidden>
          Calcular entrega
        </button>

        <!-- WHEN — local delivery only, and only once we know where it goes.
             A PREFERENCE, not an appointment: the heading says "preferido",
             the note says we confirm it by WhatsApp, and "Lo coordinamos por
             WhatsApp" is always available as the zero-friction answer. The days
             and windows come from /api/web/delivery/options; nothing about them
             is hardcoded here. See ui/deliveryPanel.js. -->
        <div class="delivery-when" id="delivery-when" hidden>
          <h4 class="delivery-when-title" id="delivery-when-title">¿Cuándo te queda mejor?</h4>
          <div class="delivery-when-days" id="delivery-when-days" role="group" aria-labelledby="delivery-when-title"></div>
          <div class="delivery-when-slots" id="delivery-when-slots" role="group" aria-label="Horario preferido"></div>
          <p class="delivery-when-note">Es tu horario preferido. Lo confirmamos por WhatsApp.</p>
        </div>

        <!-- Real carrier options, one radio each. Rendered only when the server
             returned priced options. -->
        <div class="delivery-options" id="delivery-options" role="radiogroup"
             aria-label="Opciones de envío" hidden></div>

        <p class="delivery-msg" id="delivery-msg" data-tone="neutral" aria-live="polite" hidden></p>
      </section>
          </section>
          <section id="checkout-step-confirm" data-checkout-step="confirm" aria-label="Revisar pedido" hidden>
            <div class="checkout-review-card">
              <div class="checkout-section-title"><h3>Tu selección</h3><button type="button" data-checkout-edit="cart">Editar carrito</button></div>
              <div id="checkout-review-items"></div>
            </div>
            <div class="checkout-review-card">
              <div class="checkout-section-title"><h3>Entrega</h3><button type="button" data-checkout-edit="delivery">Editar entrega</button></div>
              <div id="checkout-review-address"></div>
            </div>
            <div class="checkout-review-card" id="checkout-review-notes" hidden></div>
          </section>
          <section id="checkout-step-registered" data-checkout-step="registered" aria-label="Pedido registrado" hidden>
            <!-- What is TRUE at this moment, said in the order a customer
                 asks it: the order exists, the stock is held, nothing has been
                 charged, and here is when we are aiming for. Every line is a
                 fact the server confirmed in its response — none of it is
                 assumed by this screen. -->
            <div class="checkout-registered">
              <span class="checkout-success-icon" aria-hidden="true">✓</span>
              <p class="checkout-folio" id="checkout-folio"></p>
              <ul class="checkout-facts" id="checkout-registered-facts"></ul>
              <p class="checkout-registration-note">El registro de tu pedido no realiza un cobro.</p>
              <a class="checkout-whatsapp" id="checkout-registered-whatsapp" target="_blank" rel="noopener">Confirmar por WhatsApp</a>
              <!-- Straight to the customer's own order. The browser was
                   securely remembered while the order was being registered, so
                   this never asks anyone to sign in to see what they just
                   bought. -->
              <a class="checkout-secondary" id="checkout-view-order" href="/cuenta.html">Ver mi pedido</a>
              <button type="button" class="checkout-secondary checkout-secondary--quiet" id="checkout-keep-shopping">Seguir comprando</button>
            </div>
          </section>
        </div>
        <aside class="checkout-summary" id="checkout-summary" aria-label="Resumen del pedido"></aside>
      </div>
    </div>
    <footer class="checkout-actions" id="checkout-actions">
      <p class="checkout-step-error" id="checkout-step-error" role="alert" hidden></p>
      <p class="checkout-action-hint" id="checkout-action-hint">Revisarás tu pedido antes de registrarlo.</p>
      <div class="checkout-actions-row">
        <button type="button" class="checkout-secondary" id="checkout-back">Volver al carrito</button>
        <button type="button" class="checkout-primary" id="checkout-next">Revisar pedido →</button>
      </div>
    </footer>
  </section>
</div>`;
