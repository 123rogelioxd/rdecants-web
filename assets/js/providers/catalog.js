/* =============================================================
   RDECANTS — CATALOG PROVIDER
   Abstraction layer between rendering and data source.

   Priority:
     1. R Supply OS API  (live, via ApiClient)
     2. Local data/products.js  (fallback if API is down)

   Renderers only talk to CatalogProvider — never to the API
   or local data directly.
   ============================================================= */

import { ApiClient }         from '../api/client.js?v=1.0.2';
import { PRODUCTS, PACKS }   from '../../../data/products.js?v=1.0.2';

/* Session-level cache — one fetch per page load */
let _productsCache = null;
let _packsCache    = null;

export const CatalogProvider = {

  async getProducts() {
    if (_productsCache) return _productsCache;
    try {
      const inventory = await ApiClient.getDecantsProducts();
      const items = Array.isArray(inventory?.data) ? inventory.data : inventory;
      if (Array.isArray(items) && items.length) {
        _productsCache = items.map(_mapInventoryProduct).filter(Boolean);
        if (_productsCache.length) return _productsCache;
      }
    } catch (err) {
      console.warn('[RDecants] decants inventory API unavailable, trying web catalog.', err.message);
    }
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

  const variants = Array.isArray(p.variants)
    ? p.variants.map(v => _mapVariant(v, p.id ?? p.slug)).filter(Boolean)
    : null;

  const prices = p.prices && typeof p.prices === 'object'
    ? p.prices
    : variants?.length
      ? variants.reduce((acc, variant) => {
          acc[variant.size] = variant.price;
          return acc;
        }, {})
    : {
        3:  Number(p.price_3ml  ?? p.price3  ?? 0),
        5:  Number(p.price_5ml  ?? p.price5  ?? 0),
        10: Number(p.price_10ml ?? p.price10 ?? 0),
      };

  const stock = variants?.length
    ? variants.reduce((sum, variant) => sum + variant.availability, 0)
    : _safeStock(p.stock);

  return {
    id:       p.id       ?? p.slug,
    product_id: p.product_id ?? p.id ?? p.slug,
    name:     p.name,
    house:    p.house    ?? p.brand   ?? '',
    desc:     p.desc     ?? p.description ?? '',
    story:    p.story    ?? p.tagline ?? '',
    notes,
    image:    p.image    ?? p.image_url ?? '',
    stock,
    badge:    p.badge    ?? p.label  ?? '',
    featured: !!p.featured,
    prices,
    variants,
  };
}

function _mapInventoryProduct(p) {
  if (!p?.is_active && p?.is_active !== undefined) return null;

  const id = String(p.id ?? p.product_id ?? p.slug ?? p.name);
  const variants = (p.active_variants ?? p.variants ?? [])
    .map(v => _mapVariant(v, id))
    .filter(Boolean);
  const prices = variants.reduce((acc, variant) => {
    acc[variant.size] = variant.price;
    return acc;
  }, {});
  const tags = Array.isArray(p.use_case_tags) ? p.use_case_tags : [];
  const family = p.fragrance_family ? [p.fragrance_family] : [];
  const notes = [...family, ...tags].filter(Boolean).slice(0, 4);
  const stock = variants.reduce((sum, variant) => sum + variant.availability, 0);

  return {
    id,
    product_id: p.id ?? id,
    name: [p.name, p.concentration].filter(Boolean).join(' '),
    house: p.house ?? p.brand ?? '',
    desc: p.description ?? _inventoryDesc(tags),
    story: p.story ?? _inventoryStory(p, tags),
    notes,
    image: p.image ?? p.image_url ?? _fallbackImage(p),
    stock,
    badge: _inventoryBadge(stock, tags),
    featured: Boolean(p.featured),
    prices,
    variants,
    source: 'inventory_api',
  };
}

function _mapVariant(v, productId) {
  if (!v?.is_active && v?.is_active !== undefined) return null;
  const size = Number(v.ml_size ?? v.size);
  const price = Number(v.retail_price ?? v.price);
  if (!Number.isFinite(size) || !Number.isFinite(price) || price <= 0) return null;
  const availability = _variantAvailability(v);
  const soldOut = Boolean(v.sold_out ?? v.soldOut ?? availability <= 0);

  return {
    id: v.id ?? v.variant_id ?? `${productId}-${size}`,
    product_id: v.product_id ?? productId,
    variant_id: v.variant_id ?? v.id ?? `${productId}-${size}`,
    size,
    ml_size: size,
    price,
    retail_price: price,
    availability,
    stock: availability,
    soldOut,
    sold_out: soldOut,
  };
}

function _variantAvailability(v) {
  if (v.availability !== undefined) return _safeStock(v.availability);
  if (v.stock !== undefined) return _safeStock(v.stock);
  if (!Array.isArray(v.stock_entries)) return 0;
  return v.stock_entries.reduce((sum, entry) => {
    const onHand = Number(entry.quantity_on_hand ?? 0);
    const reserved = Number(entry.quantity_reserved ?? 0);
    const available = Number.isFinite(onHand - reserved) ? onHand - reserved : 0;
    return sum + Math.max(0, available);
  }, 0);
}

function _safeStock(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function _inventoryBadge(stock, tags = []) {
  if (stock <= 0) return 'Agotado';
  if (stock <= 3) return 'Pocas piezas';
  if (tags.some(tag => _norm(tag).includes('bestseller'))) return 'Más pedido';
  return '';
}

function _inventoryDesc(tags = []) {
  return tags.length ? `Perfil ${tags.slice(0, 3).join(', ')}.` : 'Decant premium listo para descubrir.';
}

function _inventoryStory(p, tags = []) {
  if (p.description) return p.description;
  if (tags.includes('diario')) return 'Una opción pulida para usar todos los días.';
  if (tags.includes('noche')) return 'Para salidas, cenas y momentos con más presencia.';
  if (tags.includes('verano')) return 'Fresco, limpio y fácil de llevar en clima cálido.';
  return 'Fragancia original en decant premium, preparada bajo pedido.';
}

function _fallbackImage(p) {
  const text = _norm(`${p.brand ?? ''} ${p.name ?? ''}`);
  if (text.includes('bleu') || text.includes('chanel')) return 'assets/featured/bleu-de-chanel-edt-hero.webp';
  if (text.includes('sauvage') || text.includes('dior')) return 'assets/featured/dior-sauvage-edp-hero.webp';
  if (text.includes('yves') || text.includes('ysl') || text.includes(' y ')) return 'assets/featured/ysl-y-edp-hero.webp';
  if (text.includes('acqua') || text.includes('armani')) return 'assets/featured/rasassi-hawas-ice-hero.webp';
  if (text.includes('million') || text.includes('paco')) return 'assets/featured/one-million-lucky-hero.webp';
  return 'assets/featured/jpg-le-male-elixir-hero.webp';
}

function _norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function _mapPack(p) {
  const name = p.name === 'Ultra Luxury' ? 'Lujo Nicho' : p.name;
  return {
    id:            p.id            ?? p.slug,
    name,
    emoji:         p.emoji         ?? '✦',
    desc:          p.desc          ?? p.description ?? '',
    detail:        p.detail        ?? p.detail_text ?? '',
    price:         Number(p.price),
    originalPrice: Number(p.original_price ?? p.originalPrice ?? p.price),
    stock:         _safeStock(p.stock),
    badge:         _packBadge(p.badge ?? p.label ?? ''),
  };
}

function _packBadge(value) {
  const text = String(value ?? '').trim();
  const normalized = _norm(text);
  if (normalized === 'best seller') return 'Más pedido';
  if (normalized === 'daily') return 'Diario';
  if (normalized === 'summer') return 'Verano';
  if (normalized === 'night') return 'Noche';
  if (normalized === 'limited') return 'Limitado';
  return text;
}
