/* =============================================================
   RDECANTS — GENDER NORMALIZATION
   The single authority on "who is this fragrance for". Consumed by the
   catalog filter, the recommendation engine, the metadata auditor and the
   card badge, so there is exactly one place where an R Supply OS value
   becomes a canonical one.

   ── Why this file was rewritten (July 2026) ────────────────────────
   R Supply OS sends `fragrance.gender_profile` (and `fragrance.gender`)
   from a seven-value taxonomy that includes `lean_masculine` and
   `lean_feminine`. Those two were missing from the alias tables, so
   normalizeGender('lean_masculine') fell through to 'unknown', and an
   unknown gender used to be *eligible* for every selection. Eight real
   products — Torino 21, Erba Pura, Erba Gold, Millesime Imperial, both
   Jean Lowes and two more — were therefore compatible with "Mujer".
   That is the whole Torino-21 bug: not a scoring accident, a normalizer
   that did not know a value the backend has always sent.
   ============================================================= */

/* Canonical values, ordered masculine → feminine. Everything downstream
   reasons in these seven strings plus 'unknown'. */
export const GENDER_VALUES = [
  'masculine',
  'lean_masculine',
  'unisex_masculine',
  'unisex',
  'unisex_feminine',
  'lean_feminine',
  'feminine',
];

/* Alias tables. Keys are already normalized by _token(): lowercased,
   accent-stripped, and every run of space / hyphen / underscore / slash
   collapsed to a single space. */
const ALIASES = new Map();

function _register(canonical, aliases) {
  /* The canonical value is registered as its own alias so normalizeGender
     is idempotent — normalizeGender(normalizeGender(x)) === normalizeGender(x)
     — which matters because providers/catalog.js stores the canonical form
     on `product.gender` and later code normalizes it again. */
  ALIASES.set(_token(canonical), canonical);
  for (const alias of aliases) ALIASES.set(_token(alias), canonical);
}

_register('masculine', [
  'hombre', 'masculino', 'male', 'masculine', 'men', 'mens', 'man', 'm',
  'para hombre', 'pour homme', 'homme', 'caballero', 'masc',
]);

_register('feminine', [
  'mujer', 'femenino', 'female', 'feminine', 'women', 'womens', 'woman',
  'dama', 'f', 'para mujer', 'pour femme', 'femme', 'fem',
]);

_register('unisex', [
  'unisex', 'mixto', 'neutro', 'neutral', 'unisex mixed', 'mixed', 'both',
  'para todos', 'ambos', 'genderless', 'shared',
]);

/* "Leaning" profiles: predominantly one gender, wearable by the other.
   R Supply OS spells these `lean_masculine` / `lean_feminine`. */
_register('lean_masculine', [
  'lean masculine', 'leaning masculine', 'mostly masculine',
  'predominantly masculine', 'inclinado masculino', 'inclinado a masculino',
  'mas masculino', 'tendencia masculina', 'masculine leaning',
]);

_register('lean_feminine', [
  'lean feminine', 'leaning feminine', 'mostly feminine',
  'predominantly feminine', 'inclinado femenino', 'inclinado a femenino',
  'mas femenino', 'tendencia femenina', 'feminine leaning',
]);

/* Unisex-first profiles with a slight tilt — a different thing from
   lean_*, which is gendered-first. Kept distinct because they behave
   differently for a "Unisex" selection. */
_register('unisex_masculine', [
  'unisex inclinado masculino', 'unisex masculino', 'unisex masculine',
  'unisex male', 'unisex men', 'masculine leaning unisex',
  'male leaning unisex', 'unisex mas masculino',
]);

_register('unisex_feminine', [
  'unisex inclinado femenino', 'unisex femenino', 'unisex feminine',
  'unisex female', 'unisex women', 'feminine leaning unisex',
  'female leaning unisex', 'unisex mas femenino',
]);

/* Values that explicitly mean "nobody filled this in". Distinguished from
   an unrecognised value only in the audit report — for matching, both are
   'unknown', i.e. no evidence, never a match. */
const UNKNOWN_VALUES = new Set([
  'sin asignar', 'no asignado', 'unassigned', 'unknown', 'desconocido',
  'n a', 'na', 'null', 'none', 'other', 'otro', '-',
].map(_token));

/* Selections that mean "do not filter by gender at all". */
const ANY_VALUES = new Set(['any', 'todos', 'todas', 'all', 'cualquiera', 'me da igual'].map(_token));

function _token(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_/|.]+/g, ' ')
    .trim();
}

export function normalizeGender(value) {
  const token = _token(value);
  if (!token || ANY_VALUES.has(token) || UNKNOWN_VALUES.has(token)) return 'unknown';
  return ALIASES.get(token) ?? 'unknown';
}

/* True when the raw value carried real information we simply could not
   map. The auditor reports these so R Supply OS can be corrected, instead
   of the storefront silently treating a typo as "no data". */
export function isUnrecognizedGender(value) {
  const token = _token(value);
  if (!token) return false;
  if (ANY_VALUES.has(token) || UNKNOWN_VALUES.has(token)) return false;
  return !ALIASES.has(token);
}

/* Every field R Supply OS has ever used for this, in priority order.
   `gender_raw` is what providers/catalog.js preserves before normalizing,
   so the auditor can compare raw against canonical. */
export function getRawProductGender(product) {
  if (!product || typeof product !== 'object') return product ?? null;
  const f = product.fragrance ?? {};
  return (
    f.gender_raw ??
    product.gender_raw ??
    product.gender ??
    product.gender_positioning ??
    product.gender_profile ??
    product.perfil_genero ??
    product.genero_orientado ??
    product.genero ??
    f.gender_positioning ??
    f.gender_profile ??
    f.gender ??
    f.perfil_genero ??
    null
  );
}

export function getProductGender(product) {
  if (!product || typeof product !== 'object') return normalizeGender(product);
  return normalizeGender(getRawProductGender(product));
}

/* ── Compatibility tiers ───────────────────────────────────────────
   primary    the product IS what was asked for
   secondary  genuinely compatible, just not the direct answer
   weak       wearable but tilted the other way — eligible, low value
   unknown    no gender metadata: never a match, only a catalog citizen
   rejected   incompatible; excluded outright

   `weight` is the 0..1 factor the recommendation engine multiplies the
   gender dimension by. `penalty` is the legacy point deduction kept for
   older callers. */
const TIERS = {
  primary:   { weight: 1,    penalty: 0 },
  secondary: { weight: 0.72, penalty: 8 },
  weak:      { weight: 0.4,  penalty: 22 },
  unknown:   { weight: 0,    penalty: Infinity },
  rejected:  { weight: 0,    penalty: Infinity },
};

/* Which product genders land in which tier, per selection. Anything not
   listed for a selection is rejected — that is what stops "Unisex" from
   quietly accepting the entire catalog. */
const COMPATIBILITY = {
  feminine: {
    primary:   ['feminine', 'lean_feminine'],
    secondary: ['unisex', 'unisex_feminine'],
    weak:      ['unisex_masculine'],
  },
  masculine: {
    primary:   ['masculine', 'lean_masculine'],
    secondary: ['unisex', 'unisex_masculine'],
    weak:      ['unisex_feminine'],
  },
  unisex: {
    primary:   ['unisex'],
    secondary: ['unisex_masculine', 'unisex_feminine'],
    weak:      ['lean_masculine', 'lean_feminine'],
  },
  unisex_masculine: {
    primary:   ['unisex_masculine', 'unisex'],
    secondary: ['masculine', 'lean_masculine'],
    weak:      ['unisex_feminine'],
  },
  unisex_feminine: {
    primary:   ['unisex_feminine', 'unisex'],
    secondary: ['feminine', 'lean_feminine'],
    weak:      ['unisex_masculine'],
  },
  lean_masculine: {
    primary:   ['lean_masculine', 'masculine'],
    secondary: ['unisex', 'unisex_masculine'],
    weak:      ['unisex_feminine'],
  },
  lean_feminine: {
    primary:   ['lean_feminine', 'feminine'],
    secondary: ['unisex', 'unisex_feminine'],
    weak:      ['unisex_masculine'],
  },
};

export function genderPriority(selectedGender, productGender) {
  const selected = normalizeGender(selectedGender);
  const product = normalizeGender(productGender);
  if (selected === 'unknown') return 'primary';        /* no selection → no opinion */
  if (product === 'unknown') return 'unknown';

  const table = COMPATIBILITY[selected];
  if (!table) return 'primary';
  for (const tier of ['primary', 'secondary', 'weak']) {
    if (table[tier].includes(product)) return tier;
  }
  return 'rejected';
}

export function getGenderEligibility(product, selectedGender) {
  if (!selectedGender || ANY_VALUES.has(_token(selectedGender))) {
    return { eligible: true, priority: 'primary', penalty: 0, weight: 1, productGender: getProductGender(product) };
  }

  const selected = normalizeGender(selectedGender);
  if (selected === 'unknown') {
    return { eligible: true, priority: 'primary', penalty: 0, weight: 1, productGender: getProductGender(product) };
  }

  const productGender = getProductGender(product);
  const priority = genderPriority(selected, productGender);
  const tier = TIERS[priority];

  return {
    /* 'unknown' is deliberately NOT eligible. A product with no gender
       metadata is not an exact match for anything, and treating missing
       data as compatible is what let masculine-coded products through. */
    eligible: priority !== 'rejected' && priority !== 'unknown',
    priority,
    penalty: tier.penalty,
    weight: tier.weight,
    productGender,
  };
}

/* Catalog FILTER semantics (a different question from ranking): "show me
   fragrances for X". Includes the direct answers and the genuinely
   compatible ones; excludes the ones tilted the other way, the unknowns
   and the incompatible. */
export function matchesGender(product, selectedGender) {
  if (!selectedGender || ANY_VALUES.has(_token(selectedGender))) return true;
  const { priority } = getGenderEligibility(product, selectedGender);
  return priority === 'primary' || priority === 'secondary';
}

/* ── Customer-facing display ───────────────────────────────────────
   Seven canonical values collapse to the three buckets a shopper needs on
   a card. The leaning profiles read as their dominant side, which is what
   the structured field actually asserts; where a product's own copy
   disagrees with its field, that is a metadata defect and the auditor
   reports it rather than the card papering over it. */
const DISPLAY = {
  masculine:        { key: 'masculine', label: 'Hombre' },
  lean_masculine:   { key: 'masculine', label: 'Hombre' },
  feminine:         { key: 'feminine',  label: 'Mujer' },
  lean_feminine:    { key: 'feminine',  label: 'Mujer' },
  unisex:           { key: 'unisex',    label: 'Unisex' },
  unisex_masculine: { key: 'unisex',    label: 'Unisex' },
  unisex_feminine:  { key: 'unisex',    label: 'Unisex' },
};

/* { key, label } for the badge, or null when there is nothing true to
   say. Never guesses from the name, the notes or the description. */
export function getGenderDisplay(product) {
  const gender = typeof product === 'string' ? normalizeGender(product) : getProductGender(product);
  return DISPLAY[gender] ?? null;
}
