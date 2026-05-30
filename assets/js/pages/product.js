/* =============================================================
   RDECANTS — PRODUCT PAGE ENTRY (/perfume/{slug})
   Mirrors app.js's bootstrap but renders a single product page.
   ============================================================= */

import { Cart } from '../cart/cart.js?v=1.0.15';
import { setupCheckout } from '../cart/checkout.js?v=1.0.15';
import {
  renderCart, updateCartCount,
  openCart, closeCart, toggleCart, sendWhatsApp,
} from '../cart/render.js?v=1.0.15';
import { CatalogProvider } from '../providers/catalog.js?v=1.0.16';
import { setupHeader } from '../ui/header.js';
import { setupImageStates } from '../ui/images.js';
import { Tracker } from '../tracking/tracker.js';
import { AppState } from '../core/state.js';
import {
  buildProductPageHtml,
  hydrateProductPage,
  renderRelated,
  renderCollectionPairs,
  readSlugFromLocation,
  findProductBySlug,
} from '../ui/productPage.js?v=1.0.1';

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

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  setupImageStates();
  setupCheckout();
  await Cart.reconcile({ silent: true });
  renderCart();
  updateCartCount();
  setupHeader();

  const root = document.getElementById('pdp-root');
  if (!root) return;

  const slug = readSlugFromLocation();
  if (!slug) {
    root.innerHTML = buildProductPageHtml(null);
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
    AppState.set('initialized', true);
    return;
  }

  document.title = `${product.name} — ${product.house ?? 'RDecants'}`;
  Tracker.productViewed(product);
  hydrateProductPage(root, product);
  renderCollectionPairs(root, product, products);
  renderRelated(root, product, products);

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname, productId: product.id });
});
