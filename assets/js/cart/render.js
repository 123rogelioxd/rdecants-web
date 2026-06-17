/* =============================================================
   RDECANTS — CART RENDERER
   Renders cart drawer from current Cart state.
   ============================================================= */

import { Cart }      from './cart.js?v=2026.06.04.2';
import { sendCheckoutWhatsApp,
         syncCheckoutAvailability,
         trackCheckoutStarted } from './checkout.js?v=2026.06.04.2';
import { EventBus }  from '../core/events.js';
import { Tracker }   from '../tracking/tracker.js';
import { formatPrice, isValidPrice, getDefaultVariant } from '../utils/prices.js?v=2026.06.04.2';
import { CatalogProvider } from '../providers/catalog.js?v=2026.06.04.2';
import { getCartUpsells, getShippingCompletionUpsell } from '../recommendations/upsells.js?v=2026.06.04.2';
import { getCollectionPairs } from '../recommendations/crossSell.js?v=2026.06.04.2';
import { Personalization, filterDisliked } from '../recommendations/personalization.js?v=2026.06.04.2';
import { getShippingState } from './momentum.js?v=2026.06.04.2';

const WHATSAPP_NUMBER = '5219516513018';
let _prevFocus = null;

/* ── Render ─────────────────────────────────────────────────── */
export function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total');
  if (!container) return;

  const items = Cart.items;
  document.getElementById('cart-drawer')?.classList.toggle('cart-drawer--empty', !items.length);

  if (!items.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">R</div>
        <h3 class="cart-empty-title">Tu carrito est&aacute; vac&iacute;o</h3>
        <p class="cart-empty-desc">Agrega tus decants favoritos para armar tu pedido.</p>
        <button class="btn-continue cart-empty-cta" onclick="window.__rd.ui.scrollToCatalog()">
          Explorar cat&aacute;logo
        </button>
      </div>
    `;
    if (totalEl) totalEl.textContent = '0';
    _updateSummary(0, 0);
    syncCheckoutAvailability();
    return;
  }

  const total = Cart.total();
  const count = Cart.count();

  container.innerHTML = `
    <section class="cart-section cart-products-section" aria-label="Productos agregados">
      <p class="cart-section-label">Productos agregados</p>
      <div class="cart-product-list">
        ${items.map(item => {
    const isMaxed = item.qty >= item.stock;
    const label   = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <p class="cart-item-house">${item.house}</p>
          <p class="cart-item-name">${item.name}</p>
          <div class="cart-item-meta">
            <span>${label} &times; ${item.qty}</span>
            <span>Disponibles: ${item.stock}</span>
          </div>
          ${isMaxed ? '<p class="cart-stock-note">Máximo disponible seleccionado</p>' : ''}
          <p class="cart-item-price">${formatPrice(subtotal, 'Precio por confirmar')}</p>
        </div>
        <div class="cart-item-controls">
          <button class="remove-btn"
            onclick="window.__rd.cart.remove('${item.key}')"
            aria-label="Eliminar ${item.name}">×</button>
          <div class="qty-controls">
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', -1)"
              aria-label="Reducir cantidad">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', 1)"
              ${isMaxed ? 'disabled' : ''}
              aria-label="Aumentar cantidad">+</button>
          </div>
        </div>
      </div>
    `;
        }).join('')}
      </div>
    </section>
    <section class="cart-upsells" id="cart-upsells" aria-label="Completa tu pedido" hidden></section>
  `;

  if (totalEl) totalEl.textContent = total;
  _updateSummary(count, total);
  syncCheckoutAvailability();
  _renderUpsells();
}

/* ── Add-on upsells (operational-first, low friction) ───────── */
let _lastUpsellSig = '';

async function _renderUpsells() {
  const slot = document.getElementById('cart-upsells');
  if (!slot) return;

  const items = Cart.items;
  if (!items.length) {
    slot.hidden = true;
    slot.innerHTML = '';
    _lastUpsellSig = '';
    return;
  }

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    return;
  }

  /* Cart may have changed while awaiting the catalog */
  if (Cart.items.length !== items.length) return;

  const shipping = getShippingState(Cart.total());
  const taste = Personalization.getTaste();
  const eligible = filterDisliked(products, taste, { minCount: 3 });

  /* Below the shipping threshold → ONE cheapest-qualifying add-on, framed as
     a shipping opportunity ("Te faltan $X para calificar para envío").
     Never a block — if nothing qualifies we fall through to normal cross-sell. */
  if (!shipping.isEligible) {
    const rec = getShippingCompletionUpsell(Cart.items, eligible, shipping.remaining);
    if (rec) {
      _renderShippingCompletion(slot, rec, shipping);
      return;
    }
  }

  /* Eligible (or nothing qualifies) → optional complementary cross-sell. */
  const cartProducts = Cart.items
    .map(item => products.find(p => String(p.id) === String(item.sourceId ?? item.id)))
    .filter(Boolean);

  const pairs = getCollectionPairs(cartProducts, eligible, taste, { limit: 3 });
  const isCollection = pairs.length > 0;

  const suggestions = (isCollection ? pairs : getCartUpsells(Cart.items, eligible, {
    targetRemaining: shipping.remaining,
  }))
    .map(product => ({ product, variant: getDefaultVariant(product, 3) }))
    .filter(entry => entry.variant);

  if (!suggestions.length) {
    slot.hidden = true;
    slot.innerHTML = '';
    _lastUpsellSig = '';
    return;
  }

  /* Optional, non-blocking cross-sell. */
  slot.innerHTML = `
    <p class="cart-section-label">Completa tu pedido</p>
    <div class="cart-upsell-list">
      ${suggestions.map(_upsellRow).join('')}
    </div>`;
  slot.hidden = false;

  const railId = isCollection ? 'collection_builder_cart' : 'cart_upsell';
  const railTitle = 'Completa tu pedido';
  const sig = `${railId}:${suggestions.map(s => s.product.id).join('|')}`;
  if (sig !== _lastUpsellSig) {
    _lastUpsellSig = sig;
    if (isCollection) {
      Tracker.collectionBuilderViewed(suggestions.map(s => s.product), 'cart');
    } else {
      Tracker.recommendationView(suggestions.map(s => s.product), { railId, railTitle });
    }
  }

  slot.querySelectorAll('.cart-upsell-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = suggestions.find(s => String(s.product.id) === btn.dataset.productId);
      if (!entry) return;
      const position = Number(btn.dataset.position) + 1;
      if (isCollection) {
        Tracker.collectionBuilderClicked(entry.product, position, 'cart');
        Tracker.collectionBuilderAdded(entry.product, position, 'cart');
      } else {
        Tracker.recommendationClicked(entry.product, position, { railId, railTitle });
      }
      window.__rd?.cart?.add(entry.product.id, entry.variant.size);
    });
  });
}

/* Single cheapest-qualifying recommendation that reaches the shipping
   threshold in one tap. Optional and non-blocking. */
function _renderShippingCompletion(slot, { product, variant }, shipping) {
  slot.innerHTML = `
    <div class="cart-shipping-complete">
      <p class="cart-shipping-complete-head">
        Te faltan <strong>${formatPrice(shipping.remaining)}</strong> para calificar para envío.
      </p>
      <div class="cart-upsell-list">
        ${_upsellRow({ product, variant }, 0)}
      </div>
    </div>`;
  slot.hidden = false;

  const sig = `ship_complete:${product.id}:${variant.size}`;
  if (sig !== _lastUpsellSig) {
    _lastUpsellSig = sig;
    Tracker.recommendedProductShown(product, variant, shipping.remaining);
    Tracker.amountMissingForShipping(shipping);
  }

  slot.querySelector('.cart-upsell-add')?.addEventListener('click', () => {
    Tracker.recommendedProductAdded(product, variant, shipping.remaining);
    window.__rd?.cart?.add(product.id, variant.size);
  });
}

function _upsellRow({ product, variant }, idx) {
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <div class="cart-upsell-item">
      <span class="cart-upsell-img">
        ${hasImage
          ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('cart-upsell-img--fallback');this.remove()">`
          : ''}
      </span>
      <div class="cart-upsell-info">
        <p class="cart-upsell-house">${product.house ?? ''}</p>
        <p class="cart-upsell-name">${product.name}</p>
        <p class="cart-upsell-meta">${variant.size}ml &middot; ${formatPrice(variant.price)}</p>
      </div>
      <button class="cart-upsell-add" data-product-id="${product.id}" data-position="${idx}"
        aria-label="Agregar ${product.name} ${variant.size}ml a tu pedido">+</button>
    </div>`;
}

function _updateSummary(count, total) {
  const countEl = document.getElementById('cart-summary-count');
  const subtotalEl = document.getElementById('cart-subtotal');

  if (countEl) countEl.textContent = `${count} ${count === 1 ? 'artículo' : 'artículos'}`;
  if (subtotalEl) subtotalEl.textContent = formatPrice(total, '$0 MXN');
}

export function updateCartCount() {
  const count   = Cart.count();
  const countEl = document.getElementById('cart-count');
  const dot     = document.querySelector('.cart-dot');
  if (countEl) countEl.textContent = count;
  if (dot)     dot.classList.toggle('visible', count > 0);
}

/* ── Drawer open / close ────────────────────────────────────── */
export function openCart() {
  const drawer = document.getElementById('cart-drawer');
  _prevFocus = document.activeElement;
  drawer?.classList.add('active');
  drawer?.setAttribute('aria-hidden', 'false');
  document.getElementById('cart-overlay')?.classList.add('active');
  document.body.classList.add('cart-open');
  document.body.style.overflow = 'hidden';
  Tracker.cartOpened();
  trackCheckoutStarted();
  document.removeEventListener('keydown', _handleCartKey);
  document.addEventListener('keydown', _handleCartKey);
  setTimeout(() => drawer?.querySelector('.cart-close')?.focus(), 120);
}

export function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  drawer?.classList.remove('active');
  drawer?.setAttribute('aria-hidden', 'true');
  document.getElementById('cart-overlay')?.classList.remove('active');
  document.body.classList.remove('cart-open');
  document.body.style.overflow = '';
  Tracker.cartClosed();
  document.removeEventListener('keydown', _handleCartKey);
  _prevFocus?.focus?.();
  _prevFocus = null;
}

export function toggleCart() {
  const isOpen = document.getElementById('cart-drawer')?.classList.contains('active');
  isOpen ? closeCart() : openCart();
}

/* ── WhatsApp checkout ──────────────────────────────────────── */
export function sendWhatsApp() {
  sendCheckoutWhatsApp(WHATSAPP_NUMBER);
}

function _handleCartKey(e) {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer?.classList.contains('active')) return;

  if (e.key === 'Escape') {
    closeCart();
    return;
  }

  if (e.key !== 'Tab') return;

  const focusable = Array.from(drawer.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ── Auto-update on cart changes ────────────────────────────── */
EventBus.on('cart:updated', () => {
  renderCart();
  updateCartCount();
});
