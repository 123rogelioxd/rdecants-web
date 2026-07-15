/* =============================================================
   RDECANTS — PRODUCT PAGE ENTRY (/perfume/{slug})
   Mirrors app.js's bootstrap but renders a single product page.
   ============================================================= */

import { Cart } from '../cart/cart.js';
import { setupCheckout } from '../cart/checkout.js';
import {
  renderCart, updateCartCount,
  openCart, closeCart, toggleCart, sendWhatsApp,
  setupDiscountControls, setupCampaignAttribution,
} from '../cart/render.js';
import { CatalogProvider } from '../providers/catalog.js';
import { setupHeader } from '../ui/header.js';
import { setupImageStates } from '../ui/images.js';
import { Tracker } from '../tracking/tracker.js';
import { installBackendTracking } from '../tracking/backend.js';
import { AppState } from '../core/state.js';
import {
  buildProductPageHtml,
  hydrateProductPage,
  renderRelated,
  renderCollectionPairs,
  readSlugFromLocation,
  findProductBySlug,
} from '../ui/productPage.js';

/* ── Global bridge (shared with rest of the app) ─────────────── */
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
  scrollToCatalog: () => { window.location.href = '/#catalog'; },
};

window.toggleCart   = toggleCart;
window.openCart     = openCart;
window.closeCart    = closeCart;
window.sendWhatsApp = sendWhatsApp;

installBackendTracking(Tracker);

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  setupImageStates();
  setupCheckout();
  setupDiscountControls();
  await Cart.reconcile({ silent: true });
  renderCart();
  updateCartCount();
  setupCampaignAttribution();
  setupHeader();

  const root = document.getElementById('pdp-root');
  if (!root) return;

  const slug = readSlugFromLocation();
  if (!slug) {
    root.innerHTML = buildProductPageHtml(null);
    _markNotFoundForSeo();
    return;
  }

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const product = findProductBySlug(products, slug);
  root.innerHTML = buildProductPageHtml(product);

  if (!product) {
    document.title = 'Fragancia no disponible — RDecants';
    _markNotFoundForSeo();
    AppState.set('initialized', true);
    return;
  }

  document.title = `${product.name} — ${product.house ?? 'RDecants'}`;
  Tracker.productPdpView(product);
  hydrateProductPage(root, product);
  renderCollectionPairs(root, product, products);
  renderRelated(root, product, products);

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname, productId: product.id });
});

/* Static hosting always answers /perfume/{slug} with HTTP 200 (required for
   client-side routing to work at all) — there is no way to return a real 404
   status without a serverless function, which is out of scope here. The
   closest honest equivalent: tell search engines not to index an unknown or
   removed product URL, so a soft-404 page can never rank or get treated as
   real content. */
function _markNotFoundForSeo() {
  if (document.querySelector('meta[name="robots"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex';
  document.head.appendChild(meta);
}
