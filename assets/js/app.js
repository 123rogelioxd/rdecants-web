/* =============================================================
   RDECANTS — APP ENTRY POINT
   Bootstraps all modules and exposes window.__rd bridge.

   window.__rd is the ONLY global surface. Inline HTML onclick
   handlers use window.__rd.* instead of loose globals.
   ============================================================= */

import { Cart }                           from './cart/cart.js';
import { setupCheckout }                  from './cart/checkout.js';
import { renderCart, updateCartCount,
         openCart, closeCart,
         toggleCart, sendWhatsApp }       from './cart/render.js';
import { renderFeatured, renderProducts,
         renderPacks }                    from './catalog/render.js';
import { renderFeaturedCarousel }         from './catalog/featured.js';
import { Recommendations }                from './recommendations/index.js';
import { setupScrollAnimations,
         observeFadeUp,
         setupHeroParallax }             from './ui/animations.js';
import { setupHeader }                    from './ui/header.js';
import { showToast }                      from './ui/toast.js';
import { openProductModal,
         closeProductModal }             from './ui/modal.js';
import { SearchBar }                     from './ui/searchbar.js';
import { Tracker }                        from './tracking/tracker.js';
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

  /* Initial cart state */
  setupCheckout();
  renderCart();
  updateCartCount();

  /* Render catalog (async — provider pattern) */
  await renderFeaturedCarousel();
  await renderFeatured();
  await Recommendations.render();
  await renderProducts();
  await renderPacks();

  /* After dynamic content is in DOM, observe scroll animations */
  observeFadeUp();
  setupScrollAnimations();

  /* UI setup */
  setupHeader();
  setupHeroParallax();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
