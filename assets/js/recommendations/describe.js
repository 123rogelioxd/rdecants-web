/* =============================================================
   RDECANTS — PLAIN-LANGUAGE PRODUCT DESCRIPTIONS

   A first-time buyer cannot act on "EDP · gourmand · 8/10 longevity".
   This turns the catalog metadata we actually have into a short human
   sentence — "Dulce, atractivo y duradero" — used on the home cards and
   in the finder results so both describe a fragrance the same way.

   Everything here is deterministic and derived from REAL metadata
   (scent-family match over notes/description + the fragrance scores the
   backend supplies). Nothing is invented: when a product carries no
   usable signal the description is an empty string and the caller simply
   omits the line.
   ============================================================= */

import {
  SCENT_FAMILIES,
  USE_CASE_PROFILES,
  productSignals,
  scoreProfileMatch,
} from './taxonomy.js';

/* Score thresholds. The backend sends 0–1 (or 0–100, normalised below).
   Set high enough that a claim like "duradero" is only made when the data
   actually says so. */
const STRONG = 0.75;
const CLEAR = 0.7;

const FAMILY_ADJECTIVE = {
  fresco: 'Fresco',
  dulce: 'Dulce',
  intenso: 'Intenso',
};

/* Second adjective — what it feels like to wear, in priority order. */
const CHARACTER_RULES = [
  { key: 'crowdpleaser', min: CLEAR, word: 'atractivo' },
  { key: 'versatility',  min: CLEAR, word: 'fácil de usar' },
  { key: 'freshness',    min: STRONG, word: 'limpio' },
  { key: 'sweetness',    min: STRONG, word: 'goloso' },
];

/* Third adjective — how it performs. */
const PERFORMANCE_RULES = [
  { key: 'longevity',  min: STRONG, word: 'duradero' },
  { key: 'projection', min: STRONG, word: 'con presencia' },
];

function _num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const normalized = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, normalized));
}

function _scores(product) {
  return product?.fragrance?.scores ?? {};
}

/* The scent family the product's own notes and copy match best. */
export function dominantFamily(product) {
  const signals = productSignals(product);
  let best = null;
  let bestScore = 0;
  for (const key of Object.keys(SCENT_FAMILIES)) {
    const score = scoreProfileMatch(SCENT_FAMILIES[key], signals);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore > 0 ? best : null;
}

/* The occasion the product's metadata supports best (never a guess). */
export function dominantUseCase(product) {
  const signals = productSignals(product);
  let best = null;
  let bestScore = 0;
  for (const profile of USE_CASE_PROFILES) {
    const score = scoreProfileMatch(profile, signals);
    if (score > bestScore) { bestScore = score; best = profile; }
  }
  return bestScore > 0 ? best : null;
}

/* "Dulce, atractivo y duradero" — up to three adjectives, in a fixed
   order (family → character → performance) so the same product always
   reads the same way. Returns '' when there is nothing honest to say. */
export function describeProduct(product) {
  const words = [];

  const family = dominantFamily(product);
  if (family && FAMILY_ADJECTIVE[family]) words.push(FAMILY_ADJECTIVE[family]);

  const scores = _scores(product);
  const character = CHARACTER_RULES.find(rule => _num(scores[rule.key]) >= rule.min);
  if (character) words.push(character.word);

  const performance = PERFORMANCE_RULES.find(rule => _num(scores[rule.key]) >= rule.min);
  if (performance) words.push(performance.word);

  /* Nothing from the scores: fall back to the use-case the notes support,
     which is still real metadata, just coarser. */
  if (words.length < 2) {
    const useCase = dominantUseCase(product);
    if (useCase && !words.includes(useCase.label)) {
      words.push(`para ${useCase.short}`);
    }
  }

  if (!words.length) return '';
  if (words.length === 1) return words[0];

  const head = words.slice(0, -1).join(', ');
  return `${head} y ${words[words.length - 1]}`;
}

/* A two-sentence version for the finder results: what it smells like,
   then when to wear it. Same data, more room. */
export function describeForBeginner(product) {
  const base = describeProduct(product);
  const useCase = dominantUseCase(product);
  if (!base) return '';
  if (!useCase) return `${base}.`;
  return `${base}. Buena opción para ${useCase.short}.`;
}
