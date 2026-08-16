/* =============================================================
   RDECANTS — CATALOG PROVIDER
   Abstraction layer between rendering and data source.
   ============================================================= */

import { ApiClient } from '../api/client.js';
import { normalizeApiImageUrl } from '../api/config.js';
import { normalizeGender } from '../utils/gender.js';
import { sentenceCase, composeDisplayName } from '../utils/presentation.js';
import { normalizePacks } from '../recommendations/starterPacks.js';
/* PACKS is deliberately no longer imported. The demo fixture carries invented
   pack prices, and a pack is a priced commercial offer — see getPacks(). */
import { PRODUCTS } from '../../../data/products.js';

let _productsCache = null;
let _packsCache = null;

/* Local demo data (data/products.js) is a DEVELOPER fallback only. It must
   never reach real customers. This pure predicate decides whether the fallback
   is allowed for a given environment so it can be unit-tested off the DOM.

   Rules:
     • The kill switch `DECANTS_HIDE_DEMO_PRODUCTS = true` disables demo data
       everywhere (production ships with it set).
     • Otherwise demo data is allowed only on localhost / 127.0.0.1.
     • Any other host (production) never falls back to demo products; a catalog
       failure degrades to a clean empty state instead. */
export function isDemoFallbackAllowed({ hostname = '', hideFlag = false } = {}) {
  if (hideFlag === true || String(hideFlag).toLowerCase() === 'true') return false;
  const host = String(hostname).toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

function _demoFallbackAllowed() {
  const hostname = globalThis.window?.location?.hostname ?? '';
  const hideFlag = globalThis.document
    ?.querySelector?.('meta[name="DECANTS_HIDE_DEMO_PRODUCTS"]')
    ?.getAttribute?.('content') ?? false;
  return isDemoFallbackAllowed({ hostname, hideFlag });
}

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
    } catch {
      /* Network/transport failure — fall through to the environment-gated
         fallback below. No production console noise. */
    }

    /* Production degrades to a clean empty state (no demo SKUs). Returned
       un-cached so the API can recover on a later call. */
    if (!_demoFallbackAllowed()) return [];

    _productsCache = PRODUCTS.map(_mapProduct).filter(Boolean);
    return _productsCache;
  },

  /**
   * Curated beginner packs, exactly as R Supply OS configured them.
   *
   * Returns `[]` for every failure mode there is — feature off, table not
   * migrated, endpoint down, nothing configured, every pack currently
   * unsellable — because the storefront's response to all of them is the
   * same: hide the section.
   *
   * There is NO demo fallback here, unlike getProducts(). A pack is a priced
   * commercial offer, and `data/products.js` PACKS are stale fixtures with
   * invented prices; showing one to a real customer would be advertising a
   * bundle at a number nobody approved. An empty rail is the honest outcome.
   *
   * Products inside each pack are the SAME payload /api/web/catalog serves,
   * mapped through the same `_mapProduct`, so a pack carries no separately
   * stored price, stock or image.
   */
  async getPacks() {
    if (_packsCache) return _packsCache;

    try {
      const data = await ApiClient.getPacks();
      const items = Array.isArray(data?.data) ? data.data : data;

      if (Array.isArray(items)) {
        _packsCache = normalizePacks(items.map(_mapPackPayload)).filter(Boolean);
        return _packsCache;
      }
    } catch {
      /* No console noise: an un-migrated or switched-off backend is an
         expected state during rollout, not an error the visitor caused. */
    }

    return [];
  },

  /**
   * The active promotional banner, or null.
   *
   * Same contract as the packs above: null covers "no promotion", "campaign
   * not live", "feature off" and "endpoint down", and the home hides its
   * section for all four.
   */
  async getPromotion() {
    try {
      const data = await ApiClient.getPromotion();
      return _mapPromotion(data?.promotion ?? null);
    } catch {
      return null;
    }
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

  /**
   * Editorial placements for a slot ('roger' | 'hero'), newest curation first.
   *
   * Returns `[]` for every failure mode there is — feature off, table not
   * migrated, endpoint down, nothing scheduled — because the home treats all
   * four identically: fall back to the derived order. An empty rail is never
   * an acceptable outcome, so the caller must always have something to show.
   *
   * The product inside each entry is the SAME payload /api/web/catalog serves,
   * so it is mapped through the same `_mapProduct` and carries no separately
   * stored price, stock or image.
   */
  async getMerchandising(slot) {
    try {
      const data = await ApiClient.getMerchandising();
      const entries = Array.isArray(data?.[slot]) ? data[slot] : [];

      return entries
        .map(entry => {
          const product = _mapProduct(entry?.product);
          if (!product) return null;
          return {
            label: entry.label ?? null,
            reason: entry.reason ?? null,
            headline: entry.headline ?? null,
            body: entry.body ?? null,
            cta: entry.cta ?? null,
            secondaryCta: entry.secondary_cta ?? null,
            product,
          };
        })
        .filter(Boolean);
    } catch {
      /* No console noise: an un-migrated or switched-off backend is an
         expected state during rollout, not an error the visitor caused. */
      return [];
    }
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

/* Exported so tests can run the recommendation engine and the auditor over a
   real R Supply OS response through the EXACT mapping production uses,
   instead of a hand-written approximation that quietly agrees with the code.
   See tests/fixtures/rsupplyos-catalog.json. */
export function mapApiProduct(raw) {
  return _mapProduct(raw);
}

function _mapProduct(p) {
  if (!p) return null;

  const id = String(p.id ?? p.product_id ?? p.slug ?? p.name);

  /* Presentation normalization (see utils/presentation.js): compose the
     concentration into the display name so duplicate base names (two
     "SAUVAGE", "LE MALE" vs "LE MALE ELIXIR") are self-distinguishing, and
     sentence-case the machine-written description/story. rawName is kept for
     any consumer that needs the un-composed name. Invents nothing. */
  const rawName = p.name ?? p.nombre ?? 'Perfume';
  const concentration = _displayConcentration(p.concentration ?? p.concentracion ?? p.display_concentration);

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

  const apiVariants = Array.isArray(p.variants ?? p.variantes)
    ? (p.variants ?? p.variantes)
    : [];

  const variants = (apiVariants.length
    ? apiVariants.map(v => _mapVariant(v, id))
    : Object.entries(prices).map(([size, price]) => _mapVariant({
        id: `${id}-${size}`,
        product_id: p.product_id ?? p.id ?? id,
        variant_id: null,
        size,
        ml_size: size,
        price,
        retail_price: price,
        availability: p.stock ?? 10,
        stock: p.stock ?? 10,
        soldOut: false,
        sold_out: false,
      }, id))
  ).filter(v => Number.isFinite(v.size) && Number.isFinite(v.price) && v.price > 0);

  return {
    id,
    sku: p.sku ?? p.product_sku ?? null,
    product_id: p.product_id ?? p.id ?? id,
    slug: p.slug ?? null,
    category: p.category ?? p.categoria ?? null,
    name: composeDisplayName(rawName, concentration),
    rawName,
    house: p.house ?? p.brand ?? p.marca ?? '',
    desc: sentenceCase(p.desc ?? p.description ?? p.descripcion ?? ''),
    story: sentenceCase(p.story ?? p.tagline ?? p.desc ?? p.description ?? p.descripcion ?? 'Fragancia original en decant premium.'),
    concentration,
    /* Canonical for the app, raw for the auditor. `gender` is one of the
       seven values in utils/gender.js (or 'unknown'); `gender_raw` is
       whatever R Supply OS actually said, so a value we cannot map is
       reportable instead of invisible. */
    gender: normalizeGender(_rawGender(p)),
    gender_raw: _rawGender(p),
    notes,
    image: _productImage(p),
    stock: variants.length ? Math.max(...variants.map(v => v.availability)) : _safeStock(p.stock),
    available_ml: _sharedAvailableMl(p, variants),
    badge: p.badge ?? p.label ?? 'Disponible',
    active: p.active ?? p.is_active,
    status: p.status ?? p.state ?? null,
    featured: Boolean(p.featured),
    hero: Boolean(p.hero),
    commercial_role: p.commercial_role ?? p.commercialRole ?? p.launch_role ?? null,
    fragrance: _mapFragrance(p.fragrance),
    prices,
    variants,
  };
}

/* Fragrance metadata is the entire input to the recommendation engine and
   the catalog auditor, so this mapper is deliberately LOSSLESS for every
   field R Supply OS sends. The previous version silently dropped `gender`,
   `gender_profile`, `moods`, `family` and `summary` — which is why the
   gender chain in utils/gender.js appeared to have fallbacks that could
   never fire, and why the auditor had nothing raw to compare against.

   Two shapes are kept side by side on purpose:
     • the canonical arrays the app reads
     • `*_raw` copies of the values the audit report has to quote verbatim
   Nothing is invented and no empty array replaces a populated alias — the
   union happens in recommendations/normalize.js, which owns the rules. */
function _mapFragrance(f) {
  if (!f || typeof f !== 'object') return null;
  const arr = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
  const first = (...values) => values.find(v => v !== null && v !== undefined && v !== '') ?? null;

  return {
    canonical_name: f.canonical_name ?? null,
    aliases: arr(f.aliases),

    /* Gender — the field the whole engine gates on. Preserved verbatim so
       the auditor can report exactly which value needs fixing upstream. */
    gender_raw: first(f.gender_positioning, f.gender_profile, f.gender, f.perfil_genero),
    gender: f.gender ?? null,
    gender_profile: f.gender_profile ?? null,

    /* Olfactive identity. `family` / `fragrance_family` are free text and
       `scent_family_normalized` is a single token; the normalizer reads
       all three because only 55 of 73 products carry the normalized one. */
    scent_family_normalized: f.scent_family_normalized ?? null,
    family: f.family ?? null,
    fragrance_family: f.fragrance_family ?? null,
    accords: arr(f.accords),

    /* Context. `occasions` and `climates` are the authored fields;
       the *_tags variants are the same data under older names. */
    occasions: arr(f.occasions ?? f.occasion_tags),
    occasion_tags: arr(f.occasion_tags),
    recommended_context_tags: arr(f.recommended_context_tags),
    climates: arr(f.climates ?? f.climate_tags),
    climate_tags: arr(f.climate_tags),
    seasons: arr(f.seasons ?? f.season_tags),
    season_tags: arr(f.season_tags),

    /* Descriptive tag lists — no controlled vocabulary, corroboration only. */
    moods: arr(f.moods ?? f.mood_tags),
    mood_tags: arr(f.mood_tags ?? f.moods),
    style_tags: arr(f.style_tags),
    recommendation_tags: arr(f.recommendation_tags),
    commercial_roles: arr(f.commercial_roles ?? f.commercial_role_tags),
    signature_keywords: arr(f.signature_keywords),
    search_terms: arr(f.search_terms ?? f.metadata_keywords),

    /* Notes, in both the nested and flattened shapes the backend sends. */
    notes: f.notes && typeof f.notes === 'object' && !Array.isArray(f.notes)
      ? { top: arr(f.notes.top), heart: arr(f.notes.heart), base: arr(f.notes.base) }
      : null,
    notes_top: arr(f.notes_top ?? f.notes?.top),
    notes_middle: arr(f.notes_middle ?? f.notes?.heart),
    notes_base: arr(f.notes_base ?? f.notes?.base),

    summary: f.summary ?? f.scent_profile_short ?? null,

    /* 0–1 for the app; the untouched 0–100 payload for the audit report. */
    scores: _mapScores(f.scores),
    scores_raw: f.scores && typeof f.scores === 'object' ? { ...f.scores } : null,
  };
}

function _rawGender(p) {
  return (
    p.gender ??
    p.gender_positioning ??
    p.gender_profile ??
    p.perfil_genero ??
    p.genero_orientado ??
    p.genero ??
    p.fragrance?.gender_positioning ??
    p.fragrance?.gender_profile ??
    p.fragrance?.gender ??
    p.fragrance?.perfil_genero ??
    null
  );
}

function _mapScores(scores) {
  if (!scores || typeof scores !== 'object') return {};
  return Object.fromEntries(Object.entries(scores).map(([key, value]) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return [key, value];
    return [key, n > 1 ? n / 100 : n];
  }));
}

function _mapVariant(v, fallbackProductId) {
  const size = Number.parseFloat(v.size ?? v.ml_size ?? v.ml ?? v.label);
  const price = Number(v.price ?? v.retail_price ?? v.precio_venta ?? 0);
  const stock = _safeStock(v.stock);
  const variantId = _variantId(v);
  const available = Object.prototype.hasOwnProperty.call(v, 'available') ? Boolean(v.available) : stock > 0;
  const soldOut = Boolean(v.sold_out ?? v.soldOut ?? false) || !available || stock <= 0;

  return {
    ...v,
    id: variantId ?? `${fallbackProductId}-${size}`,
    product_id: v.product_id ?? v.producto_id ?? fallbackProductId,
    variant_id: variantId,
    size,
    ml_size: size,
    price,
    retail_price: price,
    availability: stock,
    stock,
    public_stock: stock,
    available,
    soldOut,
    sold_out: soldOut,
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

function _sharedAvailableMl(product, variants) {
  const explicit = product?.available_ml ?? product?.availableMl;
  if (explicit !== null && explicit !== undefined && explicit !== '') {
    const value = Number(explicit);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  const candidates = variants
    .map(variant => Number(variant.size) * Number(variant.stock))
    .filter(value => Number.isFinite(value) && value >= 0);

  return candidates.length ? Math.max(...candidates) : null;
}

/**
 * Map a pack's nested products through the SAME `_mapProduct` the catalog
 * uses, then hand the result to the shared normalizer.
 *
 * The mapping matters: it is what makes a pack's product identical to the same
 * perfume opened from the grid — same id, same image URL normalization, same
 * variant shape — so `Cart` can re-resolve it and the modal can open it with
 * no pack-specific branch.
 */
function _mapPackPayload(p) {
  if (!p) return null;

  return {
    ...p,
    items: Array.isArray(p.items)
      ? p.items.map(item => ({ ...item, product: _mapProduct(item?.product) }))
      : [],
  };
}

/** Presentation facts only — the endpoint sends nothing else. */
function _mapPromotion(p) {
  if (!p) return null;

  const headline = String(p.headline ?? '').trim();
  if (!headline) return null;

  const mobile = normalizeApiImageUrl(p.image?.mobile) || null;
  const desktop = normalizeApiImageUrl(p.image?.desktop) || null;

  return {
    id: p.id ?? null,
    campaignSlug: p.campaign_slug ?? null,
    headline,
    body: String(p.body ?? '').trim() || null,
    image: {
      /* Either creative stands in for the other, matching the backend's own
         fallback, so a promotion uploaded in a hurry is never half-rendered. */
      mobile: mobile ?? desktop,
      desktop: desktop ?? mobile,
    },
    cta: p.cta?.url ? { label: p.cta.label || 'Ver promoción', url: p.cta.url } : null,
    endsAt: p.ends_at ?? null,
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

function _variantId(raw = {}) {
  if (Object.prototype.hasOwnProperty.call(raw, 'variant_id')) return raw.variant_id;
  if (Object.prototype.hasOwnProperty.call(raw, 'variante_producto_id')) return raw.variante_producto_id;
  return raw.id ?? null;
}
