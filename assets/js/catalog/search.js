/* =============================================================
   RDECANTS Ã¢â‚¬â€ SEARCH ENGINE
   Pure filter + sort logic. Zero DOM, zero side effects.

   Exports:
     filterProducts(products, state) Ã¢â€ â€™ filtered + sorted []
     getUniqueHouses(products)       Ã¢â€ â€™ sorted string[]
     PRICE_RANGES / PRICE_LABELS / SORT_LABELS / MOOD_LABELS
   ============================================================= */

import { getSafePrice, priceSortValue } from '../utils/prices.js';

/* Ã¢â€â‚¬Ã¢â€â‚¬ Mood rules Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

/* Badge score for "Trending" sort Ã¢â‚¬â€ higher = shown first */
const BADGE_SCORE = {
  'MÃƒÂS PEDIDO':       10,
  'TRENDING':          9,
  'BEST SELLER':       9,
  'ALTA DEMANDA':      8,
  'NUEVO':             7,
  'CLÃƒÂSICO':           6,
  'CLASSIC':           6,
  'ULTRA LUXURY':      5,
  'LIMITED':           5,
  'ÃƒÅ¡LTIMAS':           4,
  'ÃƒÅ¡LTIMAS UNIDADES':  4,
  'VERANO':            3,
  'SUMMER':            3,
  'FRESCO':            3,
  'NIGHT':             3,
  'DIARIO':            3,
  'DAILY':             3,
  'VALUE':             2,
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Public constants Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

export const PRICE_RANGES = {
  accesible: [0,   149],
  premium:   [150, 249],
  luxury:    [250, Infinity],
};

export const PRICE_LABELS = {
  accesible: 'Hasta $150',
  premium:   '$150 Ã¢â‚¬â€œ $250',
  luxury:    '$250+',
};

export const SORT_LABELS = {
  trending:     'Destacados',
  'price-asc':  'Menor precio',
  'price-desc': 'Mayor precio',
  popular:      'MÃƒÂ¡s popular',
  for_you:      'Para ti Ã¢Å“Â¦',
};

export const MOOD_LABELS = {
  fresco:   'Fresco',
  dulce:    'Dulce',
  elegante: 'Elegante',
  fiesta:   'Fiesta',
  diario:   'Diario',
  lujo:     'Lujo',
};

/* Gender filter labels Ã¢â‚¬â€ values match _normalizeGender() output in catalog.js */
export const GENDER_LABELS = {
  male:   'Hombre',
  female: 'Mujer',
  unisex: 'Unisex',
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Main export Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

/**
 * @param {object[]} products  Ã¢â‚¬â€ full product array from CatalogProvider
 * @param {object}   state     Ã¢â‚¬â€ { query, mood, house, priceRange, sort }
 * @returns {object[]}  filtered + sorted subset
 */
export function filterProducts(products, state) {
  let result = [...products];
  const hasQuery = Boolean(state.query?.trim());

  /* 1 - Commercial text search (name, brand/house, canonical/version, aliases) */
  if (hasQuery) {
    const q = _searchNorm(state.query);
    result = _searchProducts(result, q);
  }

  /* 2 Ã¢â‚¬â€ Mood */
  if (state.mood) {
    result = result.filter(p => _matchesMood(p, state.mood));
  }

  /* 3 Ã¢â‚¬â€ House */
  if (state.house) {
    result = result.filter(p => p.house === state.house);
  }

    /* 4 Ã¢â‚¬â€ Gender preference
     Rules: male/female Ã¢â€ â€™ include matching + unisex + untagged (null)
            unisex      Ã¢â€ â€™ include only unisex (explicit category)
            null/'all'  Ã¢â€ â€™ no filter                                    */
  if (state.gender) {
    result = result.filter(p => _matchesGender(p.gender ?? null, state.gender));
  }

  /* 5 Ã¢â‚¬â€ Price range (first valid product price) */
  if (state.priceRange && PRICE_RANGES[state.priceRange]) {
    const [min, max] = PRICE_RANGES[state.priceRange];
    result = result.filter(p => {
      const price = getSafePrice(p);
      return price !== null && price >= min && price <= max;
    });
  }

  /* 5 Ã¢â‚¬â€ Sort */
  return _sort(result, state.sort ?? 'trending', hasQuery);
}

/**
 * Returns alphabetically sorted list of unique house names.
 */
export function getUniqueHouses(products) {
  return [...new Set(products.map(p => p.house).filter(Boolean))].sort();
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Internals Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

/** Gender compatibility:
 *  - 'unisex' filter Ã¢â€ â€™ only explicit unisex products
 *  - 'male'/'female' Ã¢â€ â€™ matching gender + unisex wildcard + untagged (null)
 *  - null            Ã¢â€ â€™ no restriction (all products pass)              */
function _matchesGender(productGender, filterGender) {
  if (!filterGender) return true;
  if (filterGender === 'unisex') return productGender === 'unisex';
  if (productGender === null)    return true;           /* untagged: permissive */
  if (productGender === 'unisex') return true;          /* unisex: wildcard */
  return productGender === filterGender;
}

/** Lowercase + strip diacritics for fuzzy matching */
function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function _searchProducts(products, query) {
  if (query.length < 2) return [];

  return products
    .map(product => ({ product, score: _searchScore(product, query) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.product);
}

function _searchScore(product, query) {
  const fields = _commercialSearchFields(product);
  const aliasFields = _searchList([
    ...(product.aliases ?? []),
    ...(product.fragrance?.aliases ?? []),
  ]);
  const fuzzyFields = _searchList([
    product.name,
    product.house,
    product.brand,
    ...(product.aliases ?? []),
    ...(product.fragrance?.aliases ?? []),
  ]);
  const allText = fields.join(' ');
  const queryTokens = _tokens(query).filter(t => t.length > 1);

  if (aliasFields.some(alias => alias === query)) return 1000;
  if (aliasFields.some(alias => _strongAliasPartial(query, alias))) return 900;
  if (fields.some(field => field === query)) return 800;
  if (fields.some(field => _strongPartial(query, field))) return 700;

  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every(token =>
      allText.includes(token) ||
      fuzzyFields.some(field => _fuzzyTokenMatch(token, _tokens(field)))
    );
    return allTokensMatch ? 500 : 0;
  }

  if (allText.includes(query)) return 450;
  return fuzzyFields.some(field => _fuzzyTokenMatch(query, _tokens(field))) ? 250 : 0;
}

function _commercialSearchFields(product) {
  const f = product.fragrance ?? null;
  return _searchList([
    product.name,
    product.house,
    product.brand,
    product.canonical_name,
    product.canonicalName,
    product.version,
    product.display_version,
    product.concentration,
    f?.canonical_name,
    ...(product.aliases ?? []),
    ...(f?.aliases ?? []),
  ]);
}

function _searchList(values) {
  return values.map(_searchNorm).filter(Boolean);
}

function _searchNorm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019'`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function _tokens(value) {
  return value.split(/\s+/).filter(Boolean);
}

function _strongPartial(query, field) {
  if (!query || !field) return false;
  return field.includes(query);
}

function _strongAliasPartial(query, alias) {
  if (!query || !alias) return false;
  if (alias.includes(query)) return true;
  if (!query.includes(alias)) return false;
  return alias.length >= 4 || alias.length / query.length >= 0.6;
}

function _fuzzyTokenMatch(queryToken, tokens) {
  if (queryToken.length <= 1) return tokens.includes(queryToken);
  return tokens.some(token =>
    token.includes(queryToken) ||
    (token.length > 3 && queryToken.includes(token)) ||
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

function _sort(products, sort, hasQuery = false) {
  const arr = [...products];
  switch (sort) {
    case 'price-asc':
      return arr.sort((a, b) => _ref5ml(a) - _ref5ml(b));
    case 'price-desc':
      return arr.sort((a, b) => priceSortValue(b, 'desc') - priceSortValue(a, 'desc'));
    case 'popular':
      /* low stock Ã¢â€ â€™ high demand Ã¢â€ â€™ appears first */
      return arr.sort((a, b) => (a.stock ?? 99) - (b.stock ?? 99));
    case 'trending':
    default:
      if (hasQuery) return arr;
      return arr.sort((a, b) =>
        (BADGE_SCORE[b.badge] ?? 0) - (BADGE_SCORE[a.badge] ?? 0)
      );
  }
}
