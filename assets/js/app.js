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
import { renderProducts }                   from './catalog/render.js?v=1.0.13';
import { Recommendations }                 from './recommendations/index.js?v=1.0.13';
import { setupAssistant }                   from './ui/assistant.js?v=1.0.13';
import { setupBundles }                      from './ui/bundles.js?v=1.0.13';
import { Personalization }                  from './recommendations/personalization.js?v=1.0.13';
import { CatalogProvider }                  from './providers/catalog.js?v=1.0.13';
import { setupScrollAnimations,
         observeFadeUp,
         setupHeroParallax }             from './ui/animations.js?v=1.0.17';
import { setupHeader }                    from './ui/header.js';
import { showToast }                      from './ui/toast.js';
import { openProductModal,
         closeProductModal }             from './ui/modal.js?v=1.0.15';
import { SearchBar }                     from './ui/searchbar.js?v=1.0.2';
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
    addBundle: (bundle)   => Cart.addBundle(bundle),
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
    applyMoodFilter: (mood) => {
      SearchBar.applyMood(mood);
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    },
    scrollToCatalog: () => {
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
      closeCart();
    },
  },
  /* Privacy: let the visitor wipe their local taste signal at will. */
  personalization: {
    reset: () => Personalization.reset(),
  },
};

/* ── Personalized discovery — record genuine interest signals ──
   Only real interactions (opening a product or a recommendation)
   feed the local taste profile; the bulk on-load product_view is
   intentionally ignored. Privacy-safe, localStorage only. */
async function _recordTaste(productId) {
  if (!productId) return;
  try {
    const product = await CatalogProvider.getProductById(productId);
    if (product) Personalization.recordView(product);
  } catch { /* no-op: personalization stays off if catalog is unavailable */ }
}

EventBus.on('track:viewed_product', payload => _recordTaste(payload?.productId));
EventBus.on('track:opened_product_modal', payload => _recordTaste(payload?.productId));
EventBus.on('track:recommendation_clicked', payload => _recordTaste(payload?.productId));

/* ── Backwards-compat shims (used by existing HTML event attrs) */
window.toggleCart     = toggleCart;
window.openCart       = openCart;
window.closeCart      = closeCart;
window.sendWhatsApp   = sendWhatsApp;
window.scrollToCatalog = window.__rd.ui.scrollToCatalog;

/* ── API event bridge ───────────────────────────────────────── */
const _API_EVENT_MAP = {
  viewed_product:            'product_viewed',
  opened_product_modal:      'opened_product_modal',
  add_to_cart:               'product_added_to_cart',
  checkout_started:          'checkout_started',
  checkout_completed:        'checkout_completed',
  checkout_whatsapp_clicked: 'whatsapp_checkout_clicked',
  cart_minimum_prompt_shown: 'cart_minimum_prompt_shown',
  cart_minimum_prompt_converted: 'cart_minimum_prompt_converted',
  recommendation_viewed:     'recommendation_viewed',
  recommendation_clicked:    'recommendation_clicked',
  recommendation_added:      'recommendation_added',
  bundle_viewed:             'bundle_viewed',
  bundle_added:              'bundle_added',
  assistant_started:         'assistant_started',
  assistant_completed:       'assistant_completed',
};

Tracker.use((event, payload) => {
  const apiName = _API_EVENT_MAP[event];
  if (!apiName) return;
  trackEvent(apiName, _toApiPayload(event, payload));
});

function _toApiPayload(event, payload) {
  switch (event) {
    case 'viewed_product':
    case 'opened_product_modal':
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
    case 'checkout_completed':
      return {
        metadata: {
          cart_total:  payload.total,
          items_count: payload.itemCount,
          delivery:    payload.delivery,
          payment:     payload.payment,
        },
      };
    case 'recommendation_viewed':
      return {
        metadata: {
          ids:        payload.ids,
          count:      payload.count,
          rail_id:    payload.context?.railId,
          rail_title: payload.context?.railTitle,
        },
      };
    case 'recommendation_clicked':
    case 'recommendation_added':
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
    case 'cart_minimum_prompt_shown':
    case 'cart_minimum_prompt_converted':
      return {
        metadata: {
          cart_total: payload.total,
          threshold:  payload.threshold,
          remaining:  payload.remaining,
          progress:   payload.progress,
          ids:        payload.ids,
        },
      };
    case 'bundle_viewed':
    case 'bundle_added':
      return {
        metadata: {
          bundle_id: payload.bundleId,
          title:     payload.title,
          ids:       payload.ids,
          total:     payload.total,
        },
      };
    case 'assistant_started':
    case 'assistant_completed':
      return {
        metadata: {
          answers: payload.answers,
          ids:     payload.ids,
          count:   payload.count,
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

  /* Guided shopping assistant (inline, metadata-driven) */
  setupAssistant('assistant');

  /* Activate mood-based discovery rails (lazy-hydrates on scroll) */
  Recommendations.render('recommendation-rails');

  /* Dynamic smart bundles (kits from real metadata) */
  setupBundles('smart-bundles');

  /* After dynamic content is in DOM, observe scroll animations */
  observeFadeUp();
  setupScrollAnimations();

  /* UI setup */
  setupHeader();
  setupHeroParallax();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
