/* =============================================================
   RDECANTS — CATALOG PROVIDER
   Abstraction layer between rendering and data source.

   Architecture contract:
   ┌─────────────────────────────────────────────────────┐
   │  Rendering code ONLY talks to CatalogProvider.      │
   │  CatalogProvider decides where data comes from:     │
   │    • local products.js  (current — fallback)        │
   │    • REST API           (future)                    │
   │    • Recommendation Engine (future)                 │
   │    • Personalization layer (future)                 │
   └─────────────────────────────────────────────────────┘

   To swap data source: change only this file.
   ============================================================= */

import { PRODUCTS, PACKS } from '../../../data/products.js';

export const CatalogProvider = {

  async getProducts() {
    return PRODUCTS;
  },

  async getPacks() {
    return PACKS;
  },

  async getFeatured() {
    const products = await this.getProducts();
    return products.find(p => p.featured) || null;
  },

  async getProductById(id) {
    const products = await this.getProducts();
    return products.find(p => p.id === id) || null;
  },

  async getPackById(id) {
    const packs = await this.getPacks();
    return packs.find(p => p.id === id) || null;
  },

  /* ── Future: hook for recommendation overrides ──────────── */
  async getRecommendations(_context = {}) {
    return [];
  }
};
