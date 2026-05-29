/* =============================================================
   RDECANTS — MOOD PAGE ENTRY (/mood/{slug})
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
  buildMoodPageHtml,
  hydrateMoodPage,
  findMoodBySlug,
  readMoodSlugFromLocation,
} from '../ui/moodPage.js?v=1.0.0';

/* ── Global bridge ──────────────────────────────────────────── */
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

  const root = document.getElementById('mood-root');
  if (!root) return;

  const slug = readMoodSlugFromLocation();
  const mood = findMoodBySlug(slug);

  let products = [];
  try { products = await CatalogProvider.getProducts(); }
  catch { products = []; }

  root.innerHTML = buildMoodPageHtml(mood, products);

  if (!mood) {
    document.title = 'Mood no encontrado — RDecants';
    AppState.set('initialized', true);
    return;
  }

  document.title = `${mood.title} — RDecants`;
  hydrateMoodPage(root, mood, products);

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname, moodSlug: mood.slug });
});
