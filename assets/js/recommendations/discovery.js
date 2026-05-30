/* =============================================================
   RDECANTS — DISCOVERY LOGIC
   Selects anchor products for "¿Conoces alguno de estos?" and
   retrieves similarity-based recommendations for a given anchor.

   Pure: no DOM, fully unit-testable.
   Delegates all similarity ranking to upsells.getRelatedProducts
   so the same engine powers modal related, PDP related, and
   anchor discovery — one truth, no duplication.
   ============================================================= */

import { isSellable, getOperationalScore, getAovSignal } from './scoring.js?v=1.0.13';
import { getRelatedProducts } from './upsells.js?v=1.0.14';

const DEFAULT_ANCHOR_LIMIT = 5;
const DEFAULT_REC_LIMIT    = 4;

/**
 * Select the best anchor products from a live catalog.
 * Anchors are operationally healthy products — featured and
 * in-demand picks the user is most likely to already know.
 */
export function getAnchorProducts(products, { limit = DEFAULT_ANCHOR_LIMIT } = {}) {
  if (!Array.isArray(products) || !products.length) return [];
  return products
    .filter(isSellable)
    .sort((a, b) =>
      getOperationalScore(b) - getOperationalScore(a) ||
      getAovSignal(b) - getAovSignal(a))
    .slice(0, limit);
}

/**
 * Get similarity-based recommendations for a given anchor product.
 * Reuses getRelatedProducts — the same engine behind modal and PDP
 * related rails — so ranking stays consistent across the site.
 */
export function getDiscoveryRecommendations(anchor, products, { limit = DEFAULT_REC_LIMIT } = {}) {
  if (!anchor || !Array.isArray(products)) return [];
  return getRelatedProducts(anchor, products, { limit });
}
