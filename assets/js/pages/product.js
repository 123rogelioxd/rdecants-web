/* =============================================================
   RDECANTS — PRODUCT PAGE ENTRY (/perfume/{slug})
   Mirrors app.js's bootstrap but renders a single product page.
   ============================================================= */

import { bootstrapShell } from '../core/shell.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker } from '../tracking/tracker.js';
import { AppState } from '../core/state.js';
import {
  buildProductPageHtml,
  hydrateProductPage,
  renderRelated,
  renderCollectionPairs,
  readSlugFromLocation,
  findProductBySlug,
  setProductSeo,
  upgradeRelatedWithRealSignal,
} from '../ui/productPage.js';

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

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

  setProductSeo(product);
  Tracker.productPdpView(product);
  hydrateProductPage(root, product);
  renderCollectionPairs(root, product, products);
  renderRelated(root, product, products);
  // Fire-and-forget: the local heuristic above already rendered the section.
  // This only upgrades it in place if R Supply OS's real-behaviour engine
  // has something to say for this product.
  upgradeRelatedWithRealSignal(root, product, products);

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
