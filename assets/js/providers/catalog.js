console.log('CATALOG PROVIDER NUEVO 1.0.9 CARGADO');

/* =============================================================
   RDECANTS — CATALOG PROVIDER
   Abstraction layer between rendering and data source.
   ============================================================= */

import { ApiClient } from '../api/client.js?v=1.0.7';
import { normalizeApiImageUrl } from '../api/config.js?v=1.0.7';
import { PACKS } from '../../../data/products.js?v=1.0.2';

let _productsCache = null;
let _packsCache = null;

export const CatalogProvider = {
  async getProducts() {
    if (_productsCache) return _productsCache;

    try {
      const data = await ApiClient.getCatalog();
      const items = Array.isArray(data?.data) ? data.data : data;

      if (Array.isArray(items)) {
        _productsCache = items.map(_mapProduct).filter(Boolean);
        return _productsCache;
      }
    } catch (err) {
      console.warn('[RDecants] catalog API unavailable.', err.message);
    }

    _productsCache = [];
    return _productsCache;
  },

  async getPacks() {
    if (_packsCache) return _packsCache;

    try {
      const data = await ApiClient.getPacks();
      const items = Array.isArray(data?.data) ? data.data : data;

      if (Array.isArray(items) && items.length) {
        _packsCache = items.map(_mapPack);
        return _packsCache;
      }
    } catch (err) {
      console.warn('[RDecants] packs API unavailable, using local data.', err.message);
    }

    _packsCache = PACKS;
    return _packsCache;
  },

  async getFeatured() {
    try {
      const data = await ApiClient.getFeatured();
      const items = Array.isArray(data?.data) ? data.data : data;

      if (Array.isArray(items) && items.length) {
        return _mapProduct(items[0]);
      }

      if (items && typeof items === 'object') {
        return _mapProduct(items);
      }
    } catch (err) {
      console.warn('[RDecants] featured API unavailable.', err.message);
    }

    const products = await this.getProducts();
    return products[0] || null;
  },

  async getProductById(id) {
    const products = await this.getProducts();
    return products.find(p => String(p.id) === String(id)) || null;
  },

  async getPackById(id) {
    const packs = await this.getPacks();
    return packs.find(p => String(p.id) === String(id)) || null;
  },

  async getRecommendations() {
    return [];
  },
};

function _mapProduct(p) {
  if (!p) return null;

  const id = String(p.id ?? p.product_id ?? p.slug ?? p.name);

  const notes = Array.isArray(p.notes)
    ? p.notes
    : typeof p.notes === 'string'
      ? p.notes.split(',').map(n => n.trim()).filter(Boolean)
      : [];

  const prices = p.prices && typeof p.prices === 'object'
    ? p.prices
    : {
        2: Number(p.price_2ml ?? p.price2 ?? 0),
        3: Number(p.price_3ml ?? p.price3 ?? 0),
        5: Number(p.price_5ml ?? p.price5 ?? 0),
        10: Number(p.price_10ml ?? p.price10 ?? 0),
      };

  const variants = Object.entries(prices)
    .map(([size, price]) => ({
      id: `${id}-${size}`,
      product_id: id,
      variant_id: `${id}-${size}`,
      size: Number(size),
      ml_size: Number(size),
      price: Number(price),
      retail_price: Number(price),
      availability: 10,
      stock: 10,
      soldOut: false,
      sold_out: false,
    }))
    .filter(v => Number.isFinite(v.size) && Number.isFinite(v.price) && v.price > 0);

  return {
    id,
    product_id: p.product_id ?? p.id ?? id,
    name: p.name ?? p.nombre ?? 'Perfume',
    house: p.house ?? p.brand ?? p.marca ?? '',
    desc: p.desc ?? p.description ?? p.descripcion ?? '',
    story: p.story ?? p.tagline ?? p.desc ?? p.description ?? p.descripcion ?? 'Fragancia original en decant premium.',
    concentration: _displayConcentration(p.concentration ?? p.concentracion ?? p.display_concentration),
    notes,
    image: _productImage(p),
    stock: 10,
    badge: p.badge ?? p.label ?? 'Disponible',
    featured: Boolean(p.featured),
    prices,
    variants,
  };
}

function _productImage(p, fallback = '') {
  return (
    normalizeApiImageUrl(p.image_url) ||
    normalizeApiImageUrl(p.image) ||
    normalizeApiImageUrl(p.imagen) ||
    fallback
  );
}

function _safeStock(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function _mapPack(p) {
  return {
    id: p.id ?? p.slug,
    name: p.name ?? 'Pack',
    emoji: p.emoji ?? '✦',
    desc: p.desc ?? p.description ?? '',
    detail: p.detail ?? p.detail_text ?? '',
    price: Number(p.price ?? 0),
    originalPrice: Number(p.original_price ?? p.originalPrice ?? p.price ?? 0),
    stock: _safeStock(p.stock) || 10,
    badge: p.badge ?? p.label ?? '',
  };
}

function _displayConcentration(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /^other$/i.test(normalized)) return null;

  const labels = {
    PARFUM: 'Parfum',
    EXTRAIT: 'Extrait',
    ELIXIR: 'Elixir',
    EDT: 'EDT',
    EDP: 'EDP',
  };

  return labels[normalized.toUpperCase()] ?? normalized;
}
