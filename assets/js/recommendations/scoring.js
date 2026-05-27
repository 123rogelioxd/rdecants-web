/* =============================================================
   RDECANTS — OPERATIONAL SCORING
   One honest, centralized operational-priority signal reused by
   the assistant and the bundle generator so ranking stays
   consistent and we never duplicate availability logic.

   IMPORTANT: this is NOT a margin score. The storefront has no
   cost/margin data. "Priority" here is an operational-health
   proxy built from real signals only:
     • stock health (centralized scarcity state)
     • featured flag (a backend-set priority)
     • high rotation / demand (centralized badge signal)
   Price is exposed separately as an AOV tie-break signal — never
   as profit.
   ============================================================= */

import { getScarcityState, hasHighDemand } from '../utils/scarcity.js?v=1.0.13';
import { getOrderableVariants, getDisplayVariant } from '../utils/prices.js?v=1.0.13';

const AVAILABLE_SCORE = 4;
const LOW_SCORE = 2;
const LAST_UNITS_SCORE = 0;
const FEATURED_BOOST = 3;
const DEMAND_BOOST = 2;

/* Can we actually sell this right now? */
export function isSellable(product) {
  return getScarcityState(product) !== 'sold_out' && getOrderableVariants(product).length > 0;
}

/* Operational priority — higher means healthier / safer to surface.
   Returns -Infinity for sold-out so callers can filter in one step. */
export function getOperationalScore(product) {
  const state = getScarcityState(product);
  if (state === 'sold_out') return -Infinity;

  let score = 0;
  if (state === 'available') score += AVAILABLE_SCORE;
  else if (state === 'low') score += LOW_SCORE;
  else if (state === 'last_units') score += LAST_UNITS_SCORE;

  if (product.featured) score += FEATURED_BOOST;
  if (hasHighDemand(product)) score += DEMAND_BOOST;

  return score;
}

/* AOV signal: the display price. Used ONLY as a gentle tie-break so
   that, among equally-relevant and equally-healthy options, we can
   surface a slightly higher-value pick. Not profit, not margin. */
export function getAovSignal(product) {
  const price = getDisplayVariant(product)?.price;
  return Number.isFinite(price) ? Number(price) : 0;
}
