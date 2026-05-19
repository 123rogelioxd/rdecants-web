/* =============================================================
   RDECANTS — RECOMMENDATIONS MODULE
   Scaffold for future Recommendation Engine integration.

   Integration path:
     1. Connect to R Supply OS Recommendation Engine API
     2. Pass user context (sessionId, taste_profile, history)
     3. Receive scored product list
     4. Inject into homepage via renderRecommendations()
     5. Track via Tracker.recommendationView / Clicked / Ignored

   This module is intentionally empty in V1.
   The tracking layer (tracker.js) already emits all required
   events for attribution once this module is wired up.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }         from '../tracking/tracker.js';

export const Recommendations = {

  /* Returns recommended products for the current session.
     V1: falls back to featured + high-demand products.
     Future: calls Recommendation Engine API. */
  async get(_context = {}) {
    const products = await CatalogProvider.getProducts();
    return products.filter(p => p.badge === 'MÁS PEDIDO' || p.featured).slice(0, 3);
  },

  /* Render slot — will power "Suggested for you" strip. */
  async render(_containerId, _context = {}) {
    /* Not implemented in V1 */
  },
};
