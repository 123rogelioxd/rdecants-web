/* =============================================================
   RDECANTS — APP ENTRY POINT
   Bootstraps all modules and exposes window.__rd bridge.

   window.__rd is the ONLY global surface. Inline HTML onclick
   handlers use window.__rd.* instead of loose globals.
   ============================================================= */

import { Cart }                           from './cart/cart.js?v=1.0.15';
import { setupCheckout }                  from './cart/checkout.js?v=1.0.15';
import { renderCart, updateCartCount,
         openCart, closeCart,
         toggleCart, sendWhatsApp }       from './cart/render.js?v=1.0.15';
import { renderProducts, renderPacks }     from './catalog/render.js?v=1.0.13';
import { Recommendations }                 from './recommendations/index.js?v=1.0.13';
import { setupScrollAnimations,
         observeFadeUp,
         setupHeroParallax }             from './ui/animations.js?v=1.0.17';
import { setupHeader }                    from './ui/header.js';
import { showToast }                      from './ui/toast.js';
import { openProductModal,
         closeProductModal }             from './ui/modal.js?v=1.0.15';
import { SearchBar }                     from './ui/searchbar.js';
import { setupImageStates }              from './ui/images.js';
import { Tracker }                        from './tracking/tracker.js?v=1.0.13';
import { trackEvent }                     from './tracking/events.js?v=1.0.13';
import { EventBus }                       from './core/events.js';
import { AppState }                       from './core/state.js';

/* ── Global bridge ──────────────────────────────────────────── */
window.__rd = {
  cart: {
    add:       (id, size) => Cart.add(id, size),
    addPack:   (id)       => Cart.addPack(id),
    remove:    (key)      => Cart.remove(key),
    changeQty: (key, d)   => Cart.changeQty(key, d),
  },
  ui: {
    openCart,
    closeCart,
    toggleCart,
    sendWhatsApp,
    openProductModal,
    closeProductModal,
    clearSearch:  () => SearchBar.clearAll(),
    scrollToCatalog: () => {
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
      closeCart();
    },
  },
};

/* ── Backwards-compat shims (used by existing HTML event attrs) */
window.toggleCart     = toggleCart;
window.openCart       = openCart;
window.closeCart      = closeCart;
window.sendWhatsApp   = sendWhatsApp;
window.scrollToCatalog = window.__rd.ui.scrollToCatalog;

/* ── API event bridge ───────────────────────────────────────── */
const _API_EVENT_MAP = {
  product_viewed:            'product_viewed',
  add_to_cart:               'product_added_to_cart',
  checkout_started:          'checkout_started',
  checkout_whatsapp_clicked: 'whatsapp_checkout_clicked',
  recommendation_clicked:    'recommendation_clicked',
};

Tracker.use((event, payload) => {
  const apiName = _API_EVENT_MAP[event];
  if (!apiName) return;
  trackEvent(apiName, _toApiPayload(event, payload));
});

function _toApiPayload(event, payload) {
  switch (event) {
    case 'product_viewed':
      return {
        product_id: payload.productId,
        metadata: {
          name:             payload.productName,
          house:            payload.house,
          source_component: 'modal',
        },
      };
    case 'add_to_cart':
      return {
        product_id: payload.product_id ?? payload.productId,
        variant_id: payload.variant_id ?? `${payload.productId}-${payload.size}`,
        metadata: {
          name:             payload.productName,
          size:             payload.size,
          price:            payload.price,
          source_component: payload.source ?? 'size_btn',
        },
      };
    case 'checkout_started':
      return {
        metadata: {
          cart_total:  payload.total,
          items_count: payload.itemCount,
        },
      };
    case 'checkout_whatsapp_clicked':
      return {
        metadata: {
          cart_total:  payload.total,
          items_count: payload.itemCount,
          delivery:    payload.delivery,
          payment:     payload.payment,
        },
      };
    case 'recommendation_clicked':
      return {
        product_id: payload.productId,
        metadata: {
          name:             payload.productName,
          rail_id:          payload.context?.railId,
          rail_title:       payload.context?.railTitle,
          position:         payload.position,
          source_component: 'recommendation_rail',
        },
      };
    default:
      return {};
  }
}

/* ── Intro ──────────────────────────────────────────────────── */
function removeIntro() {
  setTimeout(() => {
    const intro = document.getElementById('intro');
    if (!intro) return;
    intro.style.transition = 'opacity 0.6s ease';
    intro.style.opacity    = '0';
    setTimeout(() => intro.remove(), 600);
  }, 2400);
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  removeIntro();
  setupImageStates();

  /* Initial cart state */
  setupCheckout();
  await Cart.reconcile({ silent: true });
  renderCart();
  updateCartCount();

  /* Render catalog (async — provider pattern) */
  await renderProducts();
  await renderPacks();

  /* Activate mood-based discovery rails (lazy-hydrates on scroll) */
  Recommendations.render('recommendation-rails');

  /* After dynamic content is in DOM, observe scroll animations */
  observeFadeUp();
  setupScrollAnimations();

  /* UI setup */
  setupHeader();
  setupHeroParallax();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
