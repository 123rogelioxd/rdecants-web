/* =============================================================
   RDECANTS — CART RENDERER
   Renders cart drawer from current Cart state.
   ============================================================= */

import { Cart }      from './cart.js?v=1.0.3';
import { sendCheckoutWhatsApp,
         syncCheckoutAvailability,
         trackCheckoutStarted } from './checkout.js?v=1.0.3';
import { EventBus }  from '../core/events.js';
import { Tracker }   from '../tracking/tracker.js';
import { formatPrice, isValidPrice } from '../utils/prices.js?v=1.0.3';

const WHATSAPP_NUMBER = '5219516513018';
let _prevFocus = null;

/* ── Render ─────────────────────────────────────────────────── */
export function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total');
  if (!container) return;

  const items = Cart.items;

  if (!items.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">✦</div>
        <h3 class="cart-empty-title">Tu colección está vacía</h3>
        <p class="cart-empty-desc">Explora fragancias premium y arma una seleccion a tu medida.</p>
        <button class="btn-continue cart-empty-cta" onclick="window.__rd.ui.scrollToCatalog()">
          Ver catalogo
        </button>
      </div>
    `;
    if (totalEl) totalEl.textContent = '0';
    syncCheckoutAvailability();
    return;
  }

  const total = Cart.total();

  container.innerHTML = items.map(item => {
    const isMaxed = item.qty >= item.stock;
    const label   = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <p class="cart-item-house">${item.house}</p>
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-detail">${label} × ${item.qty}</p>
          <p class="cart-item-detail" style="color:${isMaxed ? 'var(--danger)' : 'var(--muted)'};">
            ${isMaxed ? 'Límite de stock alcanzado' : `Disponibles: ${item.stock}`}
          </p>
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
  }).join('');

  if (totalEl) totalEl.textContent = total;
  syncCheckoutAvailability();
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
