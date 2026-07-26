/* =============================================================
   RDECANTS — PAGE SHELL
   Everything every page needs before its own content renders: the
   window.__rd bridge, the cart (state, drawer, checkout, coupons),
   header search, the mobile nav drawer and backend tracking.

   Split out when the storefront became three pages (home, catalog,
   guided finder) so the bootstrap exists once instead of being copied
   per entry point.
   ============================================================= */

import { Cart }                    from '../cart/cart.js';
import { setupCheckout }           from '../cart/checkout.js';
import { renderCart, updateCartCount,
         openCart, closeCart, toggleCart, sendWhatsApp,
         setupDiscountControls,
         setupCampaignAttribution } from '../cart/render.js';
import { setupHeader }             from '../ui/header.js';
import { setupNav }                from '../ui/nav.js';
import { mountCartDrawer }         from '../ui/cartDrawer.js';
import { setupImageStates }        from '../ui/images.js';
import { openProductModal,
         closeProductModal }       from '../ui/modal.js';
import { SearchBar }               from '../ui/searchbar.js';
import { Personalization }         from '../recommendations/personalization.js';
import { CatalogProvider }         from '../providers/catalog.js';
import { Tracker }                 from '../tracking/tracker.js';
import { installBackendTracking }  from '../tracking/backend.js';
import { EventBus }                from '../core/events.js';

const CATALOG_URL = '/catalogo.html';

/* ── Global bridge — the ONLY global surface ─────────────────────
   Inline HTML handlers (onclick="toggleCart()") and rendered markup
   both go through window.__rd.* instead of loose globals. */
export function installBridge() {
  window.__rd = window.__rd || {};

  window.__rd.cart = {
    add:       (id, size) => Cart.add(id, size),
    addPack:   (id)       => Cart.addPack(id),
    addBundle: (bundle)   => Cart.addBundle(bundle),
    remove:    (key)      => Cart.remove(key),
    changeQty: (key, d)   => Cart.changeQty(key, d),
  };

  window.__rd.ui = {
    openCart, closeCart, toggleCart, sendWhatsApp,
    openProductModal, closeProductModal,
    clearSearch: () => SearchBar.clearAll(),
    clearGuide:  () => SearchBar.clearGuide(),
    applyForYouSort: (source = 'user') => {
      Tracker.forYouSortApplied(source);
      SearchBar.applySort('for_you');
    },
    applyMoodFilter: (mood) => {
      /* Off the catalog page there is no grid to re-rank — go to it. */
      if (!document.getElementById('products-grid')) {
        window.location.href = `${CATALOG_URL}?mood=${encodeURIComponent(mood)}`;
        return;
      }
      SearchBar.applyMood(mood);
      const target = document.getElementById('sf-bar') || document.getElementById('catalog');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    scrollToCatalog: () => {
      const catalog = document.getElementById('catalog');
      if (!catalog) { window.location.href = CATALOG_URL; return; }
      catalog.scrollIntoView({ behavior: 'smooth' });
      closeCart();
    },
  };

  /* Privacy: let the visitor wipe their local taste signal at will. */
  window.__rd.personalization = { reset: () => Personalization.reset() };

  /* Backwards-compat shims for the inline event attributes in the markup. */
  window.toggleCart      = toggleCart;
  window.openCart        = openCart;
  window.closeCart       = closeCart;
  window.sendWhatsApp    = sendWhatsApp;
  window.scrollToCatalog = window.__rd.ui.scrollToCatalog;
}

/* ── Personalized discovery — record genuine interest signals ──
   Only real interactions (opening a product or a recommendation) feed
   the local taste profile; the bulk on-load product_view is ignored.
   Privacy-safe, localStorage only. */
export function installTasteSignals() {
  const record = async productId => {
    if (!productId) return;
    try {
      const product = await CatalogProvider.getProductById(productId);
      if (product) Personalization.recordView(product);
    } catch { /* no-op: personalization stays off if catalog is unavailable */ }
  };

  EventBus.on('track:viewed_product',        p => record(p?.productId));
  EventBus.on('track:opened_product_modal',  p => record(p?.productId));
  EventBus.on('track:recommendation_clicked', p => record(p?.productId));
}

/* Async because the cart reconciles against the live catalog before its
   first paint; callers await it so nothing renders over a stale cart. */
export async function bootstrapShell() {
  installBridge();
  installTasteSignals();
  installBackendTracking(Tracker);

  /* The drawer must exist before checkout/coupons/render bind to its ids. */
  mountCartDrawer();

  setupImageStates();
  setupCheckout();
  setupDiscountControls();
  await Cart.reconcile({ silent: true });
  renderCart();
  updateCartCount();

  /* Campaign links from R Supply OS: read ?promo/utm params, persist
     attribution and auto-apply the promo when possible. Non-blocking. */
  setupCampaignAttribution();

  setupHeader();
  setupNav();
}
