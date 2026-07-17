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

/* Brand abbreviations are identity aliases, not query shortcuts. They are
   added to a product's searchable identity and must still combine with every
   other meaningful query token ("jpg le beau" cannot degrade to "jpg"). */
const BRAND_QUERY_ALIASES = [
  { alias: 'jpg', brand: 'jean paul gaultier' },
  { alias: 'ysl', brand: 'yves saint laurent' },
  { alias: 'adg', brand: 'acqua di gio' },
  { alias: 'lv',  brand: 'louis vuitton' },
  { alias: 'mfk', brand: 'maison francis kurkdjian' },
];

const MIN_SEARCH_SCORE = 600;
const SEARCH_SCORE = {
  nameExact:       1000,
  namePrefix:       950,
  namePhrase:       900,
  primaryAllTokens: 850,
  aliasExact:       800,
  aliasPhrase:      750,
  partialIdentity:  MIN_SEARCH_SCORE,
};

/* Query-token equivalents are intentionally narrow. They let common numeric
   naming variants participate in the same all-token rule without turning a
   short token into a substring or fuzzy wildcard. */
const SEARCH_TOKEN_EQUIVALENTS = {
  '1': ['one'],
  one: ['1'],
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
  let searchScores = null;

  /* 1 — Text search. Keep the score alongside the original product object so
     subsequent filters are a true intersection and never refill the grid. */
  if (state.query?.trim()) {
    searchScores = new Map();
    result = result.filter(product => {
      const score = scoreSearchResult(product, state.query);
      if (score < MIN_SEARCH_SCORE) return false;
      searchScores.set(product, score);
      return true;
    });
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

  /* 6 — Sort. With a query, relevance is always the primary key and the
     selected catalog sort (including Destacados) is only a tiebreaker. */
  return searchScores
    ? _sortByRelevance(result, searchScores, state.sort ?? 'trending')
    : _sort(result, state.sort ?? 'trending');
}

/**
 * Returns alphabetically sorted list of unique house names.
 */
export function getUniqueHouses(products) {
  return [...new Set(products.map(p => p.house).filter(Boolean))].sort();
}

/* ── Internals ─────────────────────────────────────────────────── */

/** Canonical query normalization: case/accents/punctuation/space agnostic. */
function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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

/**
 * Relevance score for a product/query pair. A score below MIN_SEARCH_SCORE is
 * not eligible. Description and tags can add a small corroborating boost but
 * can never make a product eligible on their own.
 */
export function scoreSearchResult(product, rawQuery) {
  const query = _norm(rawQuery);
  const meaningfulQueryTokens = _searchTokens(query);
  if (!query || !meaningfulQueryTokens.length) return 0;

  /* Short words cannot qualify alone, but inside a meaningful compound query
     they must match exactly (Y in "Y EDP", le in "Le parfum", de/di in
     fragrance names). This prevents the remaining long token from taking over. */
  const queryTokens = _identityTokens(query);

  const fields = _searchFields(product);
  const namePhrases = [...fields.names, ...fields.brandAndName];
  const primaryTokens = _identityTokens([...fields.names, ...fields.brands].join(' '));
  const identityTokens = _identityTokens([
    ...fields.names,
    ...fields.brands,
    ...fields.brandAliases,
    ...fields.aliases,
  ].join(' '));

  let score = 0;

  if (fields.names.some(name => name === query)) {
    score = SEARCH_SCORE.nameExact;
  } else if (namePhrases.some(name => _startsWithPhrase(name, query))) {
    score = SEARCH_SCORE.namePrefix;
  } else if (namePhrases.some(name => _containsPhrase(name, query))) {
    score = SEARCH_SCORE.namePhrase;
  } else if (_allTokensMatch(queryTokens, primaryTokens, { allowFuzzy: false })) {
    score = SEARCH_SCORE.primaryAllTokens;
  } else if (fields.aliases.some(alias => alias === query)) {
    score = SEARCH_SCORE.aliasExact;
  } else if (fields.aliases.some(alias => _containsPhrase(alias, query))) {
    score = SEARCH_SCORE.aliasPhrase;
  } else {
    const quality = _allTokensMatch(queryTokens, identityTokens, { allowFuzzy: true });
    if (!quality) return 0;
    score = SEARCH_SCORE.partialIdentity + quality;
  }

  /* Secondary metadata is a bounded tiebreak signal after identity qualifies. */
  const secondaryTokens = new Set(_searchTokens(fields.secondary.join(' ')));
  const secondaryBoost = meaningfulQueryTokens.reduce(
    (total, token) => total + (secondaryTokens.has(token) ? 2 : 0),
    0,
  );
  return score + Math.min(secondaryBoost, 10);
}

function _searchFields(product) {
  const f = product?.fragrance ?? null;
  const concentration = _norm(product?.concentration);
  const rawNames = _uniqueNormalized([
    product?.name,
    product?.rawName,
    product?.raw_name,
  ]);
  const names = _uniqueNormalized([
    ...rawNames,
    ...rawNames.map(name => concentration && !name.endsWith(` ${concentration}`)
      ? `${name} ${concentration}`
      : name),
  ]);
  const brands = _uniqueNormalized([product?.house, product?.brand]);
  const brandAliases = BRAND_QUERY_ALIASES
    .filter(({ brand }) => brands.some(value => _containsPhrase(value, brand)))
    .map(({ alias }) => alias);
  const aliases = _uniqueNormalized([
    ..._asArray(product?.aliases),
    product?.canonical_name,
    product?.slug,
    product?.sku,
    f?.canonical_name,
    ..._asArray(f?.aliases),
  ]);
  const brandAndName = _uniqueNormalized(
    brands.flatMap(brand => names.flatMap(name => [
      `${brand} ${name}`,
      `${name} ${brand}`,
    ])),
  );
  const secondary = _uniqueNormalized([
    product?.desc,
    product?.story,
    product?.badge,
    product?.category,
    ..._asArray(product?.notes),
    f?.scent_family_normalized,
    ..._asArray(f?.mood_tags),
    ..._asArray(f?.recommendation_tags),
    ..._asArray(f?.recommended_context_tags),
    ..._asArray(f?.style_tags),
    ..._asArray(f?.accords),
  ]);

  return { names, brands, brandAliases, aliases, brandAndName, secondary };
}

function _asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function _uniqueNormalized(values) {
  return [...new Set(values.map(_norm).filter(Boolean))];
}

function _startsWithPhrase(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `);
}

function _containsPhrase(text, phrase) {
  return text === phrase || ` ${text} `.includes(` ${phrase} `);
}

function _searchTokens(text) {
  return _identityTokens(text).filter(token => token.length >= 3);
}

function _identityTokens(text) {
  return _norm(text).split(/\s+/).filter(Boolean);
}

function _allTokensMatch(queryTokens, identityTokens, { allowFuzzy }) {
  let quality = 0;
  for (const queryToken of queryTokens) {
    const tokenQuality = Math.max(
      0,
      ...identityTokens.map(identityToken =>
        _tokenMatchQuality(queryToken, identityToken, allowFuzzy)),
    );
    if (!tokenQuality) return 0;
    quality += tokenQuality;
  }
  return quality;
}

function _tokenMatchQuality(queryToken, identityToken, allowFuzzy) {
  if (queryToken === identityToken) return 6;
  if ((SEARCH_TOKEN_EQUIVALENTS[queryToken] ?? []).includes(identityToken)) return 6;
  if (queryToken.length >= 4 && identityToken.startsWith(queryToken)) return 4;
  if (!allowFuzzy || queryToken.length < 4 || identityToken.length < 4) return 0;

  /* Three-letter tokens (EDT/EDP/eau) are exact-only. For longer words, keep
     edit distance bounded and proportional; notably, beau can never match eau. */
  const maxDistance = queryToken.length >= 6 ? 2 : 1;
  return _distanceWithin(queryToken, identityToken, maxDistance) ? 1 : 0;
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

function _sortByRelevance(products, searchScores, sort) {
  const tiebreakOrder = new Map(
    _sort(products, sort).map((product, index) => [product, index]),
  );

  return [...products].sort((a, b) =>
    (searchScores.get(b) ?? 0) - (searchScores.get(a) ?? 0) ||
    (tiebreakOrder.get(a) ?? 0) - (tiebreakOrder.get(b) ?? 0)
  );
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
