/* =============================================================
   RDECANTS — SEARCH ENGINE
   Pure filter + sort logic. Zero DOM, zero side effects.

   Exports:
     filterProducts(products, state) → filtered + sorted []
     getUniqueHouses(products)       → sorted string[]
     PRICE_RANGES / PRICE_LABELS / SORT_LABELS / MOOD_LABELS
   ============================================================= */

import { getSafePrice, priceSortValue } from '../utils/prices.js';
import { matchesGender, normalizeGender } from '../utils/gender.js';

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
BADGE_SCORE['MAS PEDIDO'] = 10;
BADGE_SCORE.BESTSELLER = 9;
BADGE_SCORE.CLASICO = 6;
BADGE_SCORE.ULTIMAS = 4;
BADGE_SCORE['ULTIMAS UNIDADES'] = 4;

const MAINSTREAM_HOUSES = [
  'dior',
  'chanel',
  'yves saint laurent',
  'ysl',
  'jean paul gaultier',
  'versace',
  'paco rabanne',
  'rabanne',
  'montblanc',
  'giorgio armani',
  'armani',
  'rasasi',
  'afnan',
];

const NICHE_HOUSES = [
  'xerjoff',
  'creed',
  'louis vuitton',
  'lv',
  'parfums de marly',
  'initio',
  'amouage',
  'bond no 9',
  'bond no. 9',
  'maison francis kurkdjian',
  'mfk',
  'kilian',
  'by kilian',
  'tom ford private blend',
];

const COMMERCIAL_HERO_PATTERNS = [
  /dior.*sauvage|sauvage.*dior/,
  /chanel.*bleu de chanel|bleu de chanel.*chanel/,
  /yves saint laurent.*\by\b|ysl.*\by\b|\by\b.*yves saint laurent|\by\b.*ysl/,
  /yves saint laurent.*myslf|ysl.*myslf|myslf.*yves saint laurent|myslf.*ysl/,
  /jean paul gaultier.*le beau|le beau.*jean paul gaultier/,
  /jean paul gaultier.*le male|le male.*jean paul gaultier/,
  /versace.*dylan blue|dylan blue.*versace/,
  /versace.*eros|eros.*versace/,
  /paco rabanne.*one million|rabanne.*one million|one million.*rabanne/,
  /paco rabanne.*invictus|rabanne.*invictus|invictus.*rabanne/,
  /montblanc.*explorer|explorer.*montblanc/,
  /armani.*acqua di gio|acqua di gio.*armani/,
  /armani.*code|code.*armani/,
  /rasasi.*hawas|hawas.*rasasi/,
  /afnan.*9pm|9pm.*afnan|afnan.*9 pm|9 pm.*afnan/,
];

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
  for_you:      'Para ti ✦',
};

export const MOOD_LABELS = {
  fresco:   'Fresco',
  dulce:    'Dulce',
  elegante: 'Elegante',
  fiesta:   'Fiesta',
  diario:   'Diario',
  lujo:     'Lujo',
};

/* Gender filter labels — values match normalizeGender() output. */
export const GENDER_LABELS = {
  hombre: 'Hombre',
  mujer:  'Mujer',
  unisex: 'Unisex',
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

  /* 4 — Gender preference
     Rules: hombre/mujer → include matching + unisex only
            unisex       → include only unisex
            null/'all'   → no filter                                    */
  if (state.gender) {
    result = result.filter(p => matchesGender(p, state.gender));
  }

  /* 5 — Price range (first valid product price) */
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
  /* Alias-strict path: when the query references a known commercial alias
     (ysl, bdc, jpg, "y edp", ...), the result must belong to that alias
     group. */
  const aliasGroups = _matchingAliasGroups(query);
  if (aliasGroups.length) {
    return aliasGroups.some(group => _productInAliasGroup(product, group));
  }

  const queryTokens = _searchTokens(query);
  if (!queryTokens.length) return false;

  const haystack = _searchText(product);
  const tokens = _searchTokens(haystack);

  /* Multi-token query: require every meaningful token to match commercial
     identity. Short glue words like "de" are ignored. */
  if (queryTokens.length > 1) {
    return queryTokens.every(part =>
      haystack.includes(part) ||
      _fuzzyTokenMatch(part, tokens)
    );
  }

  const [singleToken] = queryTokens;
  return (
    haystack.includes(singleToken) ||
    _fuzzyTokenMatch(singleToken, tokens)
  );
}

/** Alias groups whose meaningful terms appear in the query. */
function _matchingAliasGroups(query) {
  const queryTokens = new Set(query.split(/\s+/).filter(Boolean));
  return SEARCH_ALIASES.map(group => ({
    group,
    matchedTerms: group.terms.filter(term => {
      const t = _norm(term);
      if (!t || t.length < 3) return false;
      if (t.length === 1) return queryTokens.has(t);
      return query === t || query.includes(t);
    }),
  })).filter(match => match.matchedTerms.length);
}

/** A product belongs to an alias group iff its commercial identity matches it. */
function _productInAliasGroup(product, aliasMatch) {
  const identity = _searchText(product);
  return aliasMatch.matchedTerms.some(term => _aliasTermMatchesProduct(identity, _norm(term)));
}

function _aliasTermMatchesProduct(identity, term) {
  if (!term || term.length < 3) return false;
  if (identity.includes(term)) return true;
  if (term === 'bdc') return identity.includes('bleu de chanel');
  if (term === 'jpg') return identity.includes('jean paul gaultier');
  if (term === 'ysl') return identity.includes('yves saint laurent');
  if (term === 'adg') return identity.includes('acqua di gio');
  return false;
}

function _searchText(product) {
  const f = product.fragrance ?? null;
  return _norm([
    product.name,
    product.house,
    product.brand,
    product.slug,
    product.concentration,
    f?.canonical_name,
    ...(f?.aliases ?? []),
  ].filter(Boolean).join(' '));
}

function _searchTokens(text) {
  return _norm(text).split(/\s+/).filter(token => token.length >= 3);
}

function _fuzzyTokenMatch(queryToken, tokens) {
  if (queryToken.length < 3) return false;
  return tokens.some(token =>
    token.includes(queryToken) ||
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

function _badgeScore(product) {
  const badge = _norm(product?.badge ?? '').toUpperCase();
  return BADGE_SCORE[badge] ?? 0;
}

function _commercialIdentity(product) {
  const f = product?.fragrance ?? null;
  return _norm([
    product?.house,
    product?.brand,
    product?.name,
    product?.slug,
    f?.canonical_name,
    ...(f?.aliases ?? []),
  ].filter(Boolean).join(' '));
}

function _commercialRole(product) {
  return _norm(
    product?.commercial_role ??
    product?.commercialRole ??
    product?.commercialRoleNormalized ??
    product?.launch_role ??
    product?.role ??
    ''
  );
}

function _houseMatches(product, houses) {
  const house = _norm(`${product?.house ?? ''} ${product?.brand ?? ''}`);
  return houses.some(name => house.includes(name));
}

function _isNicheHouse(product) {
  return _houseMatches(product, NICHE_HOUSES);
}

function _isMainstreamHouse(product) {
  return _houseMatches(product, MAINSTREAM_HOUSES);
}

function _isCommercialHeroName(product) {
  const identity = _commercialIdentity(product);
  return COMMERCIAL_HERO_PATTERNS.some(pattern => pattern.test(identity));
}

function _hasRealHeroSignal(product) {
  const role = _commercialRole(product);
  return (
    product?.hero === true ||
    role.includes('hero') ||
    role.includes('best') ||
    role.includes('bestseller') ||
    _badgeScore(product) >= 9
  );
}

function _launchHeroRank(product) {
  const role = _commercialRole(product);
  if (product?.hero === true || role.includes('hero') || role.includes('best') || role.includes('bestseller')) return 3;
  if (product?.featured && !_isNicheHouse(product)) return 2;
  if (_badgeScore(product) >= 9) return 1;
  return 0;
}

function _commercialPriority(product) {
  const role = _commercialRole(product);
  const realHero = _hasRealHeroSignal(product);
  const niche = _isNicheHouse(product);

  if (role.includes('commercial') || role.includes('mainstream') || role.includes('designer')) return 6;
  if (_isCommercialHeroName(product)) return 6;
  if (_isMainstreamHouse(product)) return 5;
  if (niche) return realHero ? 6 : 1;
  if (role.includes('niche') || role.includes('premium') || role.includes('luxury')) return realHero ? 6 : 2;
  return 3;
}

/* Audience-weighted gender priority for the default commercial sort.
   Most current buyers shop men's/unisex, so those surface first; women's
   fragrances drop only as a *tiebreaker* — featured/trending women still
   rank by those higher-priority keys above and are never hidden.
   Untagged (null) is treated as broad so it isn't penalised. */
const GENDER_PRIORITY = {
  masculine: 2,
  unisex: 2,
  unisex_masculine: 2,
  unisex_feminine: 2,
  feminine: 1,
};
function _genderPriority(gender) {
  const normalized = normalizeGender(gender);
  return GENDER_PRIORITY[normalized] ?? 2;
}

/* In-stock = 1, sold-out = 0. Prefers top-level stock, falls back to
   variant availability, and stays permissive when neither is known. */
function _availabilityRank(p) {
  if (typeof p.stock === 'number') return p.stock > 0 ? 1 : 0;
  if (Array.isArray(p.variants) && p.variants.length) {
    return p.variants.some(v => ((v.availability ?? v.stock ?? 0) > 0) && !v.soldOut) ? 1 : 0;
  }
  return 1;
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
      /* Commercial ranking (highest priority first):
         1. available (in stock) before sold-out
         2. featured products
         3. trending / best-seller badge score
         4. men's & unisex before women's (audience tiebreaker only)
         5. more stock before less (slight freshness signal)
         Stable: equal products keep their incoming order. */
      return arr.sort((a, b) =>
        _availabilityRank(b) - _availabilityRank(a) ||
        _commercialPriority(b) - _commercialPriority(a) ||
        _launchHeroRank(b) - _launchHeroRank(a) ||
        _badgeScore(b) - _badgeScore(a) ||
        _genderPriority(b.gender) - _genderPriority(a.gender) ||
        (b.stock ?? 0) - (a.stock ?? 0)
      );
  }
}
