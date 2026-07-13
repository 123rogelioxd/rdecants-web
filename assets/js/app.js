/* =============================================================
   RDECANTS — APP ENTRY POINT
   Bootstraps all modules and exposes window.__rd bridge.

   window.__rd is the ONLY global surface. Inline HTML onclick
   handlers use window.__rd.* instead of loose globals.
   ============================================================= */

import { Cart }                           from './cart/cart.js?v=2026.06.04.2';
import { setupCheckout }                  from './cart/checkout.js?v=2026.06.04.2';
import { renderCart, updateCartCount,
         openCart, closeCart,
         toggleCart, sendWhatsApp,
         setupDiscountControls,
         setupCampaignAttribution }       from './cart/render.js?v=2026.06.04.2';
import { renderProducts }                   from './catalog/render.js?v=2026.06.04.2';
import { Recommendations }                 from './recommendations/index.js?v=2026.06.04.2';
import { setupAssistant }                   from './ui/assistant.js?v=2026.06.04.2';
import { setupDiscoverySets }               from './ui/discoverySets.js?v=2026.06.04.2';
import { Personalization }                  from './recommendations/personalization.js?v=2026.06.04.2';
import { CatalogProvider }                  from './providers/catalog.js?v=2026.06.04.2';
import { setupScrollAnimations,
         observeFadeUp,
         setupHeroParallax }             from './ui/animations.js?v=2026.06.14.1';
import { setupHeader }                    from './ui/header.js';
import { setupShortcuts }                 from './ui/shortcuts.js';
import { showToast }                      from './ui/toast.js';
import { openProductModal,
         closeProductModal }             from './ui/modal.js?v=2026.06.04.2';
import { SearchBar }                     from './ui/searchbar.js?v=2026.06.04.2';
import { setupImageStates }              from './ui/images.js';
import { Tracker }                        from './tracking/tracker.js';
import { installBackendTracking }          from './tracking/backend.js?v=2026.06.04.2';
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
    applyForYouSort: (source = 'user') => {
      Tracker.forYouSortApplied(source);
      SearchBar.applySort('for_you');
    },
    applyMoodFilter: (mood) => {
      SearchBar.applyMood(mood);
      /* Scroll the search bar into view so the user can see the active
         filter chip + "Explorando" indicator, not just the grid. */
      const target = document.getElementById('sf-bar')
        || document.getElementById('catalog');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

installBackendTracking(Tracker);

/* ── Intro ──────────────────────────────────────────────────── */
function removeIntro() {
  const intro = document.getElementById('intro');
  if (!intro) return;

  /* Skip animation on repeat visits within the same session */
  const seen = sessionStorage.getItem('rd_intro');
  if (seen) {
    intro.remove();
    return;
  }
  sessionStorage.setItem('rd_intro', '1');

  /* First visit: short branded moment then clear */
  setTimeout(() => {
    intro.style.transition = 'opacity 0.5s ease';
    intro.style.opacity    = '0';
    setTimeout(() => intro.remove(), 500);
  }, 700);
}

/* ── Behavioral observability ───────────────────────────────── */
function _setupScrollTracking() {
  /* Scroll depth — fires at 25/50/75/100% */
  const depths  = [25, 50, 75, 100];
  const reached = new Set();
  const onScroll = () => {
    const scrollable = document.body.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const pct = Math.round((window.scrollY / scrollable) * 100);
    depths.forEach(d => {
      if (pct >= d && !reached.has(d)) {
        reached.add(d);
        Tracker.scrollDepthReached(d);
      }
    });
    if (reached.size === depths.length) window.removeEventListener('scroll', onScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Section viewed — fires once per section when 15% enters viewport */
  const SECTIONS = [
    'assistant', 'recommendation-rails', 'discovery-sets',
  ];
  if (!('IntersectionObserver' in window)) return;
  SECTIONS.forEach((id, positionIndex) => {
    const el = document.getElementById(id);
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        obs.disconnect();
        Tracker.sectionViewed(id, positionIndex);
      }
    }, { threshold: 0.15 });
    obs.observe(el);
  });
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  removeIntro();
  setupImageStates();

  /* Initial cart state */
  setupCheckout();
  setupDiscountControls();
  await Cart.reconcile({ silent: true });
  renderCart();
  updateCartCount();

  /* Campaign links from R Supply OS: read ?promo/utm params, persist attribution
     and auto-apply the promo when possible. Non-blocking. */
  setupCampaignAttribution();

  /* Render catalog (async — provider pattern) */
  await renderProducts();

  /* Guided shopping assistant (inline, metadata-driven) */
  setupAssistant('assistant');

  /* Discovery shortcuts + hero/nav scroll links → real filters or the finder.
     Runs after the catalog (SearchBar.init) and finder are mounted so their
     module state is ready. */
  setupShortcuts();

  /* Mood-based discovery rails (lazy-hydrates on scroll) — capped at 3 moods */
  Recommendations.render('recommendation-rails');

  /* Kits para empezar — single merged kit section (honest pricing, no fake discount).
     Anchor Discovery, Taste Builder and Smart Bundles are intentionally NOT mounted
     on the home page anymore; their modules are kept for reuse elsewhere. */
  setupDiscoverySets('discovery-sets');

  /* After dynamic content is in DOM, observe scroll animations */
  observeFadeUp();
  setupScrollAnimations();

  /* UI setup */
  setupHeader();
  setupHeroParallax();
  _setupScrollTracking();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
