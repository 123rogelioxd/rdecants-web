/* =============================================================
   RDECANTS — R SUPPLY OS METADATA NORMALIZATION
   ONE layer between "what the backend sends" and "what the engine reasons
   about". Nothing downstream may read a raw fragrance field directly.

   ── The contract this layer consumes ──────────────────────────────
   Captured from GET /api/web/catalog on 2026-07-26 (73 products, 355
   variants). Snapshot in tests/fixtures/rsupplyos-catalog.json.

   product.*
     id, product_id, slug, name, house, concentration, desc, story, notes[],
     image, stock, available_ml, badge, featured, prices{ml:price},
     variants[{ id, ml, price, available, stock }], type, category

   product.fragrance.*                                       present / 73
     summary                     73   free text
     family                      73   free text ("aromatico citrico verde")
     gender                      73   masculine | feminine | lean_masculine
                                      | lean_feminine | unisex
     gender_profile              72   same taxonomy (NAXOS only has `gender`)
     accords                     73   frutal, dulce, citrico, amaderado…
     notes{top,heart,base}       73
     occasions                   73   diario, oficina, escuela, cita, noche,
                                      fiesta, antro, social, evento_formal,
                                      regalo, gimnasio, playa — POLLUTED with
                                      climate values: calor, frio, verano
     climates                    73   templado, calido, frio, verano,
                                      invierno, primavera, otono,
                                      todo_clima, todo_el_ano, fresco,
                                      "hot weather", "cold weather"
     moods                       73   moderno, social, juvenil, elegante,
                                      limpio, seductor, nocturno, maduro…
     canonical_name              73
     fragrance_family            69   duplicate of `family`
     scent_profile_short         69   duplicate of `summary`
     mood_tags                   69   duplicate of `moods`
     climate_tags                69   subset of `climates`
     notes_top/middle/base       69   flattened `notes`
     seasons                     68   subset of `climates`
     scent_family_normalized     55   aromatico, gourmand, amaderado, frutal…
     style_tags                  52
     recommendation_tags         52
     scores                      52   0–100 ints (see SCORE_KEYS)
     aliases                     50
     commercial_roles            47
     signature_keywords           7
     search_terms                 2
     metadata_keywords            2

   product.fragrance.scores.*  (0–100, normalized to 0–1 here)
     freshness sweetness elegance compliment projection longevity
     versatility exclusivity intensity mass_appeal beginner_friendly
     uniqueness luxury value office_safe night_out date_night summer
     cold_weather blind_buy_safe

   NOT PRESENT anywhere in the payload: any age / age_segment field, any
   `versatility`-style "discreet" flag, `occasion_tags`, `season_tags`,
   `recommended_context_tags`, `commercial_role_tags`, `gender_positioning`.
   The older aliases are still read defensively — they cost nothing and the
   backend has used them before — but nothing depends on them existing.

   ── Two rules this file exists to enforce ─────────────────────────
   1. ABSENT ≠ NON-MATCHING. Every dimension reports `present` separately
      from its values, so the engine can score "we know this and it does
      not fit" (0 score, full coverage) differently from "we do not know"
      (no score, no coverage). Missing metadata never earns points and
      never counts as agreement.
   2. AN EMPTY ARRAY NEVER HIDES A FULL ONE. Each dimension unions every
      alias that carries it, so `occasions: []` alongside
      `recommendation_tags: ['oficina','diario']` still yields occasion
      evidence — flagged as secondary-strength, because a tag list is
      weaker evidence than the dedicated field.
   ============================================================= */

import {
  getProductGender,
  getRawProductGender,
  isUnrecognizedGender,
} from '../utils/gender.js';
import { getOrderableVariants, getValidVariants, PRIMARY_SIZES } from '../utils/prices.js';
import { isSellable } from './scoring.js';

/* ── Token normalization ──────────────────────────────────────────
   Case, accents, hyphens, underscores and internal whitespace all
   collapse, so `Evento_Formal`, `evento formal` and `EVENTO-FORMAL`
   are one token. Canonical tokens use single underscores. */
export function normalizeToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ── Canonical vocabularies ───────────────────────────────────────── */

export const OCCASIONS = [
  'diario', 'escuela', 'oficina', 'social', 'cita', 'noche', 'fiesta',
  'formal', 'deporte', 'playa', 'regalo',
];

export const CLIMATES = ['calido', 'templado', 'frio'];

export const SEASONS = ['primavera', 'verano', 'otono', 'invierno', 'todo_el_ano'];

export const FAMILIES = [
  'citrico', 'acuatico', 'aromatico', 'verde', 'floral', 'frutal',
  'dulce', 'gourmand', 'especiado', 'amaderado', 'cuero', 'oriental',
  'almizclado',
];

export const SCORE_KEYS = [
  'freshness', 'sweetness', 'elegance', 'compliment', 'projection',
  'longevity', 'versatility', 'exclusivity', 'intensity', 'mass_appeal',
  'beginner_friendly', 'uniqueness', 'luxury', 'value', 'office_safe',
  'night_out', 'date_night', 'summer', 'cold_weather', 'blind_buy_safe',
  /* Older names the backend has used for the same ideas. */
  'crowdpleaser', 'projection_percieved',
];

function _table(spec) {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(spec)) {
    map.set(normalizeToken(canonical), canonical);
    for (const alias of aliases) map.set(normalizeToken(alias), canonical);
  }
  return map;
}

/* Occasion aliases. NOTE what is deliberately NOT here: `cita` is not a
   `noche` alias and `social` is not a `noche` alias. Conflating them is
   how Torino 21 — whose `occasions` array is empty and whose only related
   tag is `cita` — used to collect "encaja con planes de noche". */
const OCCASION_ALIASES = _table({
  diario:  ['uso_diario', 'daily', 'day', 'dia', 'daytime', 'everyday', 'cotidiano'],
  escuela: ['school', 'universidad', 'campus', 'clases'],
  oficina: ['office', 'trabajo', 'work', 'profesional', 'professional', 'business'],
  social:  ['salidas', 'salidas_casuales', 'casual', 'reuniones', 'amigos', 'hangout'],
  cita:    ['citas', 'date', 'date_night', 'romantico', 'romantic', 'seductor', 'sensual', 'seduccion'],
  noche:   ['nocturno', 'night', 'night_out', 'eventos_nocturnos', 'evening', 'noches'],
  fiesta:  ['party', 'antro', 'club', 'reventon', 'discoteca', 'festival', 'bar'],
  formal:  ['evento_formal', 'eventos_formales', 'formal_event', 'gala', 'black_tie', 'boda', 'ceremonia'],
  deporte: ['gimnasio', 'gym', 'sport', 'deportivo', 'entrenamiento', 'workout'],
  playa:   ['beach', 'alberca', 'pool', 'vacaciones', 'holiday'],
  regalo:  ['gift', 'para_regalar', 'regalos'],
});

/* Climate aliases, including the season names and the English forms that
   arrive mixed into the same arrays. Season → climate is a real mapping in
   this catalog: `verano` genuinely means "wear it in the heat". */
const CLIMATE_ALIASES = _table({
  calido:   ['calor', 'hot', 'hot_weather', 'warm', 'warm_weather', 'verano', 'summer', 'tropical', 'humedo'],
  frio:     ['cold', 'cold_weather', 'invierno', 'winter', 'fresco', 'cool', 'otono', 'autumn', 'fall'],
  templado: ['temperate', 'mild', 'todo_clima', 'all_weather', 'todo_el_ano', 'all_year', 'primavera', 'spring', 'entretiempo'],
});

const SEASON_ALIASES = _table({
  primavera:   ['spring'],
  verano:      ['summer', 'calor'],
  otono:       ['autumn', 'fall'],
  invierno:    ['winter'],
  todo_el_ano: ['all_year', 'todo_clima', 'all_weather', 'todo_ano', 'atemporal'],
});

/* Olfactive families. `scent_family_normalized` carries compound values
   ('aromatico_dulce', 'oriental_dulce') and `family` is free text
   ('aromatico citrico verde'), so both are tokenised and every recognised
   part is kept rather than only the first. */
const FAMILY_ALIASES = _table({
  citrico:    ['citrus', 'citricos', 'hesperidado', 'lemon', 'bergamota'],
  acuatico:   ['aquatic', 'marino', 'marine', 'oceanico', 'fresh_aquatic'],
  aromatico:  ['aromatic', 'herbal', 'fougere', 'lavanda'],
  verde:      ['green', 'vegetal'],
  floral:     ['flowery', 'flores', 'flor'],
  frutal:     ['fruity', 'frutas', 'fruta'],
  dulce:      ['sweet', 'azucarado'],
  gourmand:   ['gourmande', 'postre', 'dessert', 'vanilla', 'vainilla', 'caramelo', 'chocolate'],
  especiado:  ['spicy', 'spiced', 'especias', 'especia'],
  amaderado:  ['woody', 'maderas', 'madera', 'woods', 'sandalo', 'cedro', 'vetiver'],
  cuero:      ['leather', 'leathery', 'piel'],
  oriental:   ['ambarado', 'amber', 'ambery', 'ambar', 'oud', 'agarwood', 'incienso', 'resinoso'],
  almizclado: ['musk', 'musky', 'almizcle', 'white_musk'],
});

/* Which canonical families each answerable "scent" option accepts. The
   finder does not ask this today (it is an optional refinement carried in
   the URL), but the mapping is one place either way. */
export const FAMILY_GROUPS = {
  fresco:   ['citrico', 'acuatico', 'aromatico', 'verde'],
  dulce:    ['dulce', 'gourmand', 'frutal'],
  intenso:  ['oriental', 'cuero', 'especiado', 'amaderado'],
  floral:   ['floral'],
  elegante: ['amaderado', 'almizclado', 'aromatico'],
};

/* Free-form descriptive tags kept as normalized tokens. These are NOT a
   vocabulary we control, so they are never used alone to assert a match —
   only as corroborating evidence beside a score or a canonical value. */
const TAG_FIELDS = [
  'style_tags', 'recommendation_tags', 'recommended_context_tags',
  'commercial_roles', 'commercial_role_tags', 'signature_keywords',
];

/* ── Field readers ────────────────────────────────────────────────
   Every reader unions all known aliases and reports whether ANY of them
   carried data, so one empty array can never mask a populated sibling. */

function _list(value) {
  if (Array.isArray(value)) return value.flat(2).filter(v => v !== null && v !== undefined && v !== '');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function _tokens(values) {
  return _list(values).map(normalizeToken).filter(Boolean);
}

/* A free-text family string ("aromatico citrico verde") contributes each
   of its words; a compound token ("aromatico_dulce") contributes each of
   its parts. */
function _splitTokens(values) {
  const out = [];
  for (const raw of _list(values)) {
    for (const part of String(raw).split(/[^A-Za-z0-9À-ÿ]+/)) {
      const token = normalizeToken(part);
      if (token) out.push(token);
    }
    const whole = normalizeToken(raw);
    if (whole) out.push(whole);
  }
  return out;
}

function _map(tokens, table) {
  const out = [];
  for (const token of tokens) {
    const canonical = table.get(token);
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/* Tokens that were populated but matched nothing in our vocabulary. The
   auditor reports them; the engine ignores them. Never silently dropped. */
function _unmapped(tokens, table) {
  return [...new Set(tokens.filter(token => !table.has(token)))];
}

/* Scores: R Supply OS sends 0–100 integers. Anything non-finite, negative
   or over 100 is dropped rather than clamped into a lie — a bad number is
   missing data, and the auditor is told about it. */
function _scores(raw) {
  const scores = {};
  const invalid = [];
  if (!raw || typeof raw !== 'object') return { scores, invalid, present: false };

  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (!Number.isFinite(n)) { invalid.push({ key, value }); continue; }
    const unit = n > 1 ? n / 100 : n;
    if (unit < 0 || unit > 1) { invalid.push({ key, value }); continue; }
    scores[normalizeToken(key)] = unit;
  }

  /* One alias pair worth collapsing: older payloads called mass appeal
     `crowdpleaser`. Read either, expose both, invent neither. */
  if (scores.crowdpleaser === undefined && scores.mass_appeal !== undefined) {
    scores.crowdpleaser = scores.mass_appeal;
  }
  if (scores.mass_appeal === undefined && scores.crowdpleaser !== undefined) {
    scores.mass_appeal = scores.crowdpleaser;
  }

  return { scores, invalid, present: Object.keys(scores).length > 0 };
}

/* ── The normalized shape ─────────────────────────────────────────── */

const _cache = new WeakMap();

/**
 * Canonical, engine-ready view of one product. Pure and memoized per
 * object identity, so the ranking pass over 73 products normalizes once.
 *
 * Shape:
 *   gender      { value, raw, present, unrecognized }
 *   occasions   { primary[], secondary[], values[], present, strength, raw[], unmapped[] }
 *   climates    { …same shape… }
 *   seasons     { values[], present, raw[] }
 *   families    { values[], present, raw[], unmapped[] }
 *   moods       { values[] }   normalized mood tokens, vocabulary-free
 *   tags        { values[] }   style / recommendation / commercial tokens
 *   scores      { …0..1 }      only the keys that were actually sent
 *   offer       { sellable, orderableSizes[], coreSizes[], hasAllCoreSizes }
 */
export function normalizeProduct(product) {
  if (!product || typeof product !== 'object') return _emptyNormalized(product);
  const cached = _cache.get(product);
  if (cached) return cached;

  const f = product.fragrance ?? {};

  /* — Gender —
     `present` means "we hold real gender information", i.e. the value
     resolved to one of the seven canonical profiles. It deliberately does
     NOT mean "the field was non-empty": providers/catalog.js writes the
     canonical string 'unknown' onto `product.gender`, and treating that
     literal as evidence would have made a product with no gender at all
     look fully documented. */
  const rawGender = getRawProductGender(product);
  const genderValue = getProductGender(product);
  const gender = {
    value: genderValue,
    raw: rawGender ?? null,
    present: genderValue !== 'unknown',
    unrecognized: isUnrecognizedGender(rawGender),
  };

  /* — Occasions —
     The dedicated field is primary evidence. Tag lists and mood lists are
     secondary: real, but weaker, because they were not authored as an
     occasion statement. Climate words that leak into `occasions` are
     routed to the climate dimension instead of being scored as occasions. */
  const occasionFieldTokens = _tokens([f.occasions, f.occasion_tags, f.recommended_context_tags]);
  const occasionTagTokens = _tokens([f.recommendation_tags, f.moods, f.mood_tags, f.style_tags]);
  const occasionPrimary = _map(occasionFieldTokens, OCCASION_ALIASES);
  const occasionSecondary = _map(occasionTagTokens, OCCASION_ALIASES)
    .filter(value => !occasionPrimary.includes(value));

  const occasions = {
    primary: occasionPrimary,
    secondary: occasionSecondary,
    values: [...occasionPrimary, ...occasionSecondary],
    raw: _list([f.occasions, f.occasion_tags]),
    /* Climate tokens found inside the occasions array — a real backend
       defect, surfaced rather than absorbed. */
    misfiled: _map(occasionFieldTokens, CLIMATE_ALIASES),
    unmapped: _unmapped(occasionFieldTokens, OCCASION_ALIASES)
      .filter(token => !CLIMATE_ALIASES.has(token)),
    present: occasionPrimary.length > 0 || occasionSecondary.length > 0,
    strength: occasionPrimary.length ? 'primary' : occasionSecondary.length ? 'secondary' : 'none',
  };

  /* — Climates — dedicated fields, plus the season names and the climate
       words misfiled under occasions. */
  const climateFieldTokens = _tokens([f.climates, f.climate_tags, f.seasons, f.season_tags]);
  const climatePrimary = _map(climateFieldTokens, CLIMATE_ALIASES);
  const climateFromOccasions = occasions.misfiled.filter(v => !climatePrimary.includes(v));
  const climates = {
    primary: climatePrimary,
    secondary: climateFromOccasions,
    values: [...climatePrimary, ...climateFromOccasions],
    raw: _list([f.climates, f.climate_tags]),
    unmapped: _unmapped(climateFieldTokens, CLIMATE_ALIASES),
    present: climatePrimary.length > 0 || climateFromOccasions.length > 0,
    strength: climatePrimary.length ? 'primary' : climateFromOccasions.length ? 'secondary' : 'none',
  };

  const seasonTokens = _tokens([f.seasons, f.season_tags]);
  const seasons = {
    values: _map(seasonTokens, SEASON_ALIASES),
    raw: _list([f.seasons, f.season_tags]),
    present: seasonTokens.length > 0,
  };

  /* — Olfactive families — */
  const familyTokens = _splitTokens([
    f.scent_family_normalized, f.family, f.fragrance_family, f.accords,
  ]);
  const familyValues = _map(familyTokens, FAMILY_ALIASES);
  const families = {
    values: familyValues,
    raw: _list([f.scent_family_normalized, f.family, f.fragrance_family]),
    accords: _tokens(f.accords),
    unmapped: _unmapped(familyTokens, FAMILY_ALIASES),
    present: familyValues.length > 0,
  };

  /* — Free-form descriptive tags. No controlled vocabulary, so these only
       ever corroborate. — */
  const moods = { values: [...new Set(_tokens([f.moods, f.mood_tags]))] };
  const tags = { values: [...new Set(_tokens(TAG_FIELDS.map(key => f[key])))] };

  /* — Scores — */
  const { scores, invalid, present: scoresPresent } = _scores(f.scores);

  /* — What can actually be bought right now — */
  const orderable = getOrderableVariants(product);
  const orderableSizes = [...new Set(orderable.map(v => Number(v.size)))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  const coreSizes = orderableSizes.filter(size => PRIMARY_SIZES.includes(size));

  const normalized = {
    id: String(product.id ?? product.product_id ?? ''),
    name: String(product.name ?? product.rawName ?? ''),
    house: String(product.house ?? ''),
    concentration: product.concentration ?? null,
    gender,
    occasions,
    climates,
    seasons,
    families,
    moods,
    tags,
    scores,
    scoresPresent,
    invalidScores: invalid,
    hasFragranceRecord: Boolean(product.fragrance),
    offer: {
      sellable: isSellable(product),
      orderableSizes,
      coreSizes,
      hasAllCoreSizes: PRIMARY_SIZES.every(size => coreSizes.includes(size)),
      variantCount: getValidVariants(product).length,
    },
  };

  _cache.set(product, normalized);
  return normalized;
}

function _emptyNormalized(product) {
  const none = { values: [], primary: [], secondary: [], raw: [], unmapped: [], present: false, strength: 'none' };
  return {
    id: String(product ?? ''),
    name: '', house: '', concentration: null,
    gender: { value: 'unknown', raw: null, present: false, unrecognized: false },
    occasions: { ...none, misfiled: [] },
    climates: { ...none },
    seasons: { values: [], raw: [], present: false },
    families: { ...none, accords: [] },
    moods: { values: [] },
    tags: { values: [] },
    scores: {}, scoresPresent: false, invalidScores: [],
    hasFragranceRecord: false,
    offer: { sellable: false, orderableSizes: [], coreSizes: [], hasAllCoreSizes: false, variantCount: 0 },
  };
}

/* ── Helpers shared by the engine and the auditor ─────────────────── */

/** A score in 0..1, or null when the backend never sent it. Never 0-by-default. */
export function score(normalized, key) {
  const value = normalized?.scores?.[key];
  return typeof value === 'number' ? value : null;
}

/** Mean of the score keys that exist, or null when none of them do. */
export function meanScore(normalized, keys) {
  const values = keys.map(key => score(normalized, key)).filter(v => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** How many of the requested score keys the backend actually sent. */
export function scoreCoverage(normalized, keys) {
  if (!keys.length) return 0;
  return keys.filter(key => score(normalized, key) !== null).length / keys.length;
}

/** True when any of `terms` appears in the product's free-form tags/moods. */
export function hasTag(normalized, terms = []) {
  const pool = [...(normalized?.tags?.values ?? []), ...(normalized?.moods?.values ?? [])];
  return terms.some(term => pool.includes(normalizeToken(term)));
}

/** How many of `terms` appear in the free-form tags/moods. */
export function countTags(normalized, terms = []) {
  const pool = new Set([...(normalized?.tags?.values ?? []), ...(normalized?.moods?.values ?? [])]);
  return terms.reduce((sum, term) => sum + (pool.has(normalizeToken(term)) ? 1 : 0), 0);
}
