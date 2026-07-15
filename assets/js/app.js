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
         toggleCart, sendWhatsApp,
         setupDiscountControls,
         setupCampaignAttribution }       from './cart/render.js';
import { renderProducts }                   from './catalog/render.js';
import { setupGuide }                        from './ui/guide.js';
import { SearchBar }                         from './ui/searchbar.js';
import { Personalization }                  from './recommendations/personalization.js';
import { CatalogProvider }                  from './providers/catalog.js';
import { setupScrollAnimations,
         observeFadeUp }                 from './ui/animations.js';
import { setupHeader }                    from './ui/header.js';
import { openProductModal,
         closeProductModal }             from './ui/modal.js';
import { setupImageStates }              from './ui/images.js';
import { Tracker }                        from './tracking/tracker.js';
import { installBackendTracking }          from './tracking/backend.js';
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
    /* Exit guided mode ("Ver todo") back to the full catalog. */
    clearGuide: () => SearchBar.clearGuide(),
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
    'guide', 'catalog', 'faq',
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

/* ── Scroll links (hero CTA, header nav, footer) ────────────────
   Smooth-scroll to a section; when the link is marked data-focus-finder,
   open the guide finder so a beginner lands on the questions, not just
   near them. */
function _setupScrollLinks() {
  document.querySelectorAll('[data-scroll]').forEach(el => {
    el.addEventListener('click', event => {
      const target = document.getElementById(el.dataset.scroll);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (el.hasAttribute('data-focus-finder')) {
        window.setTimeout(() => {
          const toggle = document.getElementById('guide-finder-toggle');
          if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
        }, 420);
      }
    });
  });
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
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

  /* Render catalog (async — provider pattern). SearchBar mounts here; the guide
     bar drives it via SearchBar.applyGuide, so the catalog must exist first. */
  await renderProducts();

  /* Guide bar — the catalog's control layer (intent chips + compact finder).
     Mounted after the catalog so SearchBar is ready to receive applyGuide().
     Rails, the standalone finder section, mood section and kit section are
     intentionally NOT mounted on the home page anymore; their engines are
     reused contextually (finder ranking drives the grid; kits appear after a
     recommendation; mood pages remain as /mood/{slug} landing pages). */
  setupGuide('guide');

  /* Hero / header / footer scroll links → smooth-scroll, optionally opening the
     finder. Replaces the old shortcuts binder. */
  _setupScrollLinks();

  /* After dynamic content is in DOM, observe scroll animations */
  observeFadeUp();
  setupScrollAnimations();

  /* UI setup */
  setupHeader();
  _setupScrollTracking();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
