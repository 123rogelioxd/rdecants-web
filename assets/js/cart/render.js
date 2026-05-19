/* =============================================================
   RDECANTS — CART RENDERER
   Renders cart drawer from current Cart state.
   ============================================================= */

import { Cart }      from './cart.js';
import { EventBus }  from '../core/events.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';

const WHATSAPP_NUMBER = '5219516513018';

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
        <p class="cart-empty-desc">Explora nuestras fragancias premium</p>
      </div>
    `;
    if (totalEl) totalEl.textContent = '0';
    return;
  }

  const total = Cart.total();

  container.innerHTML = items.map(item => {
    const isMaxed = item.qty >= item.stock;
    const label   = item.type === 'pack' ? 'Pack' : `${item.size}ml`;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <p class="cart-item-house">${item.house}</p>
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-detail">${label} × ${item.qty}</p>
          <p class="cart-item-detail" style="color:${isMaxed ? 'var(--danger)' : 'var(--muted)'};">
            ${isMaxed ? 'Límite de stock alcanzado' : `Disponibles: ${item.stock}`}
          </p>
          <p class="cart-item-price">$${item.price * item.qty} MXN</p>
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
  document.getElementById('cart-drawer')?.classList.add('active');
  document.getElementById('cart-overlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
  Tracker.cartOpened();
}

export function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('active');
  document.getElementById('cart-overlay')?.classList.remove('active');
  document.body.style.overflow = '';
  Tracker.cartClosed();
}

export function toggleCart() {
  const isOpen = document.getElementById('cart-drawer')?.classList.contains('active');
  isOpen ? closeCart() : openCart();
}

/* ── WhatsApp checkout ──────────────────────────────────────── */
export function sendWhatsApp() {
  const items = Cart.items;
  if (!items.length) return;

  const total = Cart.total();
  Tracker.whatsappCheckout(items, total);

  let msg = '🛍️ *Pedido RDecants*%0A%0A';

  items.forEach(item => {
    const size = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    msg += `• *${item.name}* — ${item.qty} × ${size} ($${item.price * item.qty})%0A`;
  });

  msg += `%0A💰 *Total: $${total} MXN*%0A%0AHola, quiero confirmar mi pedido 🙌`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
}

/* ── Auto-update on cart changes ────────────────────────────── */
EventBus.on('cart:updated', () => {
  renderCart();
  updateCartCount();
});
