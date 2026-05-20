/* =============================================================
   RDECANTS — SEARCH ENGINE
   Pure filter + sort logic. Zero DOM, zero side effects.

   Exports:
     filterProducts(products, state) → filtered + sorted []
     getUniqueHouses(products)       → sorted string[]
     PRICE_RANGES / PRICE_LABELS / SORT_LABELS / MOOD_LABELS
   ============================================================= */

import { getSafePrice, priceSortValue } from '../utils/prices.js';

/* ── Mood rules ─────────────────────────────────────────────────
   All keywords are lowercase, diacritics stripped (see _norm).
   A product matches a mood if ANY note, badge, or text matches.   */
const MOOD_MAP = {
  fresco: {
    notes:  ['marino', 'citrico', 'menta', 'mineral', 'mandarina'],
    badges: ['fresco', 'verano', 'summer', 'daily'],
    text:   ['fresco', 'limpio', 'azul', 'calor', 'fresca'],
  },
  dulce: {
    notes:  ['vainilla', 'miel', 'coco', 'tonka', 'canela', 'manzana', 'frutas'],
    badges: ['trending'],
    text:   ['dulce', 'juvenil', 'cumplidos'],
  },
  elegante: {
    notes:  ['madera', 'ambar', 'cedro', 'jengibre', 'tabaco'],
    badges: ['clasico', 'classic'],
    text:   ['elegante', 'atemporal', 'clasico', 'discreto'],
  },
  fiesta: {
    notes:  ['lavanda', 'especias'],
    badges: ['alta demanda', 'nuevo', 'night', 'ultimas', 'mas pedido'],
    text:   ['noche', 'nocturno', 'salidas', 'conquista', 'rastro'],
  },
  diario: {
    notes:  ['manzana', 'jengibre', 'citrico'],
    badges: ['diario', 'value', 'daily'],
    text:   ['diario', 'versatil', 'fallar', 'cotidian'],
  },
  lujo: {
    notes:  ['miel', 'tabaco', 'frutas'],
    badges: ['ultra luxury', 'limited'],
    text:   ['lujo', 'exclusivo', 'carisimo', 'caro'],
  },
};

/* Badge score for "Trending" sort — higher = shown first */
const BADGE_SCORE = {
  'MÁS PEDIDO':       10,
  'TRENDING':          9,
  'BEST SELLER':       9,
  'ALTA DEMANDA':      8,
  'NUEVO':             7,
  'CLÁSICO':           6,
  'CLASSIC':           6,
  'ULTRA LUXURY':      5,
  'LIMITED':           5,
  'ÚLTIMAS':           4,
  'ÚLTIMAS UNIDADES':  4,
  'VERANO':            3,
  'SUMMER':            3,
  'FRESCO':            3,
  'NIGHT':             3,
  'DIARIO':            3,
  'DAILY':             3,
  'VALUE':             2,
};

/* ── Public constants ──────────────────────────────────────────── */

export const PRICE_RANGES = {
  accesible: [0,   149],
  premium:   [150, 249],
  luxury:    [250, Infinity],
};

export const PRICE_LABELS = {
  accesible: 'Hasta $150',
  premium:   '$150 – $250',
  luxury:    '$250+',
};

export const SORT_LABELS = {
  trending:     'Trending',
  'price-asc':  'Menor precio',
  'price-desc': 'Mayor precio',
  popular:      'Más popular',
};

export const MOOD_LABELS = {
  fresco:   'Fresco',
  dulce:    'Dulce',
  elegante: 'Elegante',
  fiesta:   'Fiesta',
  diario:   'Diario',
  lujo:     'Lujo',
};

/* ── Main export ───────────────────────────────────────────────── */

/**
 * @param {object[]} products  — full product array from CatalogProvider
 * @param {object}   state     — { query, mood, house, priceRange, sort }
 * @returns {object[]}  filtered + sorted subset
 */
export function filterProducts(products, state) {
  let result = [...products];

  /* 1 — Text search (name, house, notes, story, desc) */
  if (state.query?.trim()) {
    const q = _norm(state.query);
    result = result.filter(p =>
      _norm(p.name).includes(q)  ||
      _norm(p.house).includes(q) ||
      (p.notes ?? []).some(n => _norm(n).includes(q)) ||
      _norm(p.story ?? '').includes(q) ||
      _norm(p.desc  ?? '').includes(q)
    );
  }

  /* 2 — Mood */
  if (state.mood) {
    result = result.filter(p => _matchesMood(p, state.mood));
  }

  /* 3 — House */
  if (state.house) {
    result = result.filter(p => p.house === state.house);
  }

    /* 4 — Price range (first valid product price) */
  if (state.priceRange && PRICE_RANGES[state.priceRange]) {
    const [min, max] = PRICE_RANGES[state.priceRange];
    result = result.filter(p => {
      const price = getSafePrice(p);
      return price !== null && price >= min && price <= max;
    });
  }

  /* 5 — Sort */
  return _sort(result, state.sort ?? 'trending');
}

/**
 * Returns alphabetically sorted list of unique house names.
 */
export function getUniqueHouses(products) {
  return [...new Set(products.map(p => p.house).filter(Boolean))].sort();
}

/* ── Internals ─────────────────────────────────────────────────── */

/** Lowercase + strip diacritics for fuzzy matching */
function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function _matchesMood(product, mood) {
  const rules = MOOD_MAP[mood];
  if (!rules) return true;

  const notes  = (product.notes ?? []).map(_norm);
  const badge  = _norm(product.badge ?? '');
  const text   = _norm(`${product.story ?? ''} ${product.desc ?? ''}`);

  return (
    rules.notes.some(kw  => notes.some(n => n.includes(kw))) ||
    rules.badges.some(kw => badge.includes(kw)) ||
    rules.text.some(kw   => text.includes(kw))
  );
}

/** Reference price for sorting (first valid product price) */
function _ref5ml(p) {
  return priceSortValue(p);
}

function _sort(products, sort) {
  const arr = [...products];
  switch (sort) {
    case 'price-asc':
      return arr.sort((a, b) => _ref5ml(a) - _ref5ml(b));
    case 'price-desc':
      return arr.sort((a, b) => priceSortValue(b, 'desc') - priceSortValue(a, 'desc'));
    case 'popular':
      /* low stock → high demand → appears first */
      return arr.sort((a, b) => (a.stock ?? 99) - (b.stock ?? 99));
    case 'trending':
    default:
      return arr.sort((a, b) =>
        (BADGE_SCORE[b.badge] ?? 0) - (BADGE_SCORE[a.badge] ?? 0)
      );
  }
}
