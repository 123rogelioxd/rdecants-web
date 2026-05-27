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

const SEARCH_ALIASES = [
  { terms: ['yves saint laurent', 'ysl', 'y edp', 'y'], match: ['yves saint laurent', 'ysl', ' y ', 'y edp'] },
  { terms: ['bleu de chanel', 'bleu', 'bdc'], match: ['bleu de chanel', 'bleu', 'chanel'] },
  { terms: ['jean paul gaultier', 'jpg', 'le male', 'gaultier'], match: ['jean paul gaultier', 'jpg', 'le male', 'gaultier'] },
  { terms: ['acqua di gio', 'adg', 'aqua di gio'], match: ['acqua di gio', 'acqua', 'adg'] },
];

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
  trending:     'Destacados',
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
    result = result.filter(p => _matchesSearch(p, q));
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

function _matchesSearch(product, query) {
  const aliasGroups = _matchingAliasGroups(query);
  if (aliasGroups.length) {
    const productAliasText = _norm(_productAliases(product).join(' '));
    const productText = _searchText(product);
    return aliasGroups.some(group =>
      group.match.some(term => productText.includes(_norm(term))) ||
      group.terms.some(term => productAliasText.includes(_norm(term)))
    );
  }

  const expanded = _expandQuery(query);
  const haystack = _searchText(product);
  const tokens = haystack.split(/\s+/).filter(Boolean);

  return expanded.some(term =>
    (term.length > 1 && haystack.includes(term)) ||
    (term.length === 1 && tokens.includes(term)) ||
    term.split(/\s+/).every(part => _fuzzyTokenMatch(part, tokens))
  );
}

function _matchingAliasGroups(query) {
  return SEARCH_ALIASES.filter(group => group.terms.some(term => query === _norm(term) || query.includes(_norm(term))));
}

function _searchText(product) {
  return _norm([
    product.name,
    product.house,
    product.brand,
    product.sku,
    product.badge,
    product.story,
    product.desc,
    ...(product.notes ?? []),
    ..._productAliases(product),
  ].join(' '));
}

function _expandQuery(query) {
  const terms = new Set([query]);
  SEARCH_ALIASES.forEach(group => {
    if (!group.terms.some(term => query.includes(term))) return;
    group.terms.forEach(term => terms.add(_norm(term)));
    group.match.forEach(term => terms.add(_norm(term)));
  });
  return [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
}

function _productAliases(product) {
  const text = _norm(`${product.house ?? ''} ${product.name ?? ''}`);
  const aliases = [];
  SEARCH_ALIASES.forEach(group => {
    if (group.match.some(term => text.includes(_norm(term)))) {
      aliases.push(...group.terms, ...group.match);
    }
  });
  return aliases;
}

function _fuzzyTokenMatch(queryToken, tokens) {
  if (queryToken.length <= 1) return tokens.includes(queryToken);
  return tokens.some(token =>
    token.includes(queryToken) ||
    queryToken.includes(token) ||
    _distanceWithin(queryToken, token, queryToken.length > 5 ? 2 : 1)
  );
}

function _distanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? last
        : Math.min(last, prev[j - 1], prev[j]) + 1;
      last = temp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length] <= max;
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
