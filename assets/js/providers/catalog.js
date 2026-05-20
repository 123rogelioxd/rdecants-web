/* =============================================================
   RDECANTS — CATALOG PROVIDER
   Abstraction layer between rendering and data source.

   Priority:
     1. R Supply OS API  (live, via ApiClient)
     2. Local data/products.js  (fallback if API is down)

   Renderers only talk to CatalogProvider — never to the API
   or local data directly.
   ============================================================= */

import { ApiClient }         from '../api/client.js';
import { PRODUCTS, PACKS }   from '../../../data/products.js';

/* Session-level cache — one fetch per page load */
let _productsCache = null;
let _packsCache    = null;

export const CatalogProvider = {

  async getProducts() {
    if (_productsCache) return _productsCache;
    try {
      const data = await ApiClient.getCatalog();
      if (Array.isArray(data) && data.length) {
        _productsCache = data.map(_mapProduct);
        return _productsCache;
      }
    } catch (err) {
      console.warn('[RDecants] catalog API unavailable, using local data.', err.message);
    }
    _productsCache = PRODUCTS;
    return _productsCache;
  },

  async getPacks() {
    if (_packsCache) return _packsCache;
    try {
      const data = await ApiClient.getPacks();
      if (Array.isArray(data) && data.length) {
        _packsCache = data.map(_mapPack);
        return _packsCache;
      }
    } catch (err) {
      console.warn('[RDecants] packs API unavailable, using local data.', err.message);
    }
    _packsCache = PACKS;
    return _packsCache;
  },

  /* featured contract: API always returns [] or [product] */
  async getFeatured() {
    try {
      const data = await ApiClient.getFeatured();
      if (Array.isArray(data) && data.length) {
        return _mapProduct(data[0]);
      }
    } catch (err) {
      console.warn('[RDecants] featured API unavailable, using local data.', err.message);
    }
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

  async getRecommendations(_context = {}) {
    return [];
  },
};

/* ── Field mappers ────────────────────────────────────────────── */

function _mapProduct(p) {
  const notes = Array.isArray(p.notes)
    ? p.notes
    : typeof p.notes === 'string'
      ? p.notes.split(',').map(n => n.trim()).filter(Boolean)
      : [];

  const prices = p.prices && typeof p.prices === 'object'
    ? p.prices
    : {
        3:  Number(p.price_3ml  ?? p.price3  ?? 0),
        5:  Number(p.price_5ml  ?? p.price5  ?? 0),
        10: Number(p.price_10ml ?? p.price10 ?? 0),
      };

  return {
    id:       p.id       ?? p.slug,
    name:     p.name,
    house:    p.house    ?? p.brand   ?? '',
    desc:     p.desc     ?? p.description ?? '',
    story:    p.story    ?? p.tagline ?? '',
    notes,
    image:    p.image    ?? p.image_url ?? '',
    stock:    Number(p.stock)  ?? 0,
    badge:    p.badge    ?? p.label  ?? '',
    featured: !!p.featured,
    prices,
  };
}

function _mapPack(p) {
  return {
    id:            p.id            ?? p.slug,
    name:          p.name,
    emoji:         p.emoji         ?? '✦',
    desc:          p.desc          ?? p.description ?? '',
    detail:        p.detail        ?? p.detail_text ?? '',
    price:         Number(p.price),
    originalPrice: Number(p.original_price ?? p.originalPrice ?? p.price),
    stock:         Number(p.stock) ?? 0,
    badge:         p.badge         ?? p.label ?? '',
  };
}
