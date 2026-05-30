/* =============================================================
   RDECANTS — PERSONALIZED DISCOVERY
   Lightweight, privacy-safe taste signal kept entirely in
   localStorage. We remember only what helps surface relevant
   fragrances — recently viewed product ids and derived mood / house
   affinities. No PII, no network, no auth, fully resettable.

   The effect is intentionally SUBTLE: affinity only nudges ordering;
   ties always preserve the original (deterministic) order, so a new
   visitor sees the normal catalog and a returning one sees their
   leanings float gently to the top.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  productSignals,
  scoreProfileMatch,
  normalizeText,
} from './taxonomy.js?v=1.0.13';

const STORAGE_KEY = 'rd_taste';
const MAX_VIEWED = 40;
const HOUSE_WEIGHT = 2;
const TOP_MOODS_PER_VIEW = 2;
const LIKE_WEIGHT = 3;    // explicit like = 3× normal view signal
const DISLIKE_WEIGHT = 2; // explicit dislike subtracts 2× from matched profiles

/* ── Pure affinity scoring ─────────────────────────────────── */
export function scoreAffinity(product, taste) {
  if (!product || !taste) return 0;

  const signals = productSignals(product);
  let score = 0;

  for (const profile of USE_CASE_PROFILES) {
    const weight = taste.moods?.[profile.key] || 0;
    if (weight > 0 && scoreProfileMatch(profile, signals) > 0) score += weight;
  }

  const house = normalizeText(product.house);
  if (house && taste.houses?.[house]) score += taste.houses[house] * HOUSE_WEIGHT;

  return score;
}

/* Stable, subtle re-rank: affinity nudges, original order breaks ties. */
export function personalizeProducts(products, taste) {
  if (!Array.isArray(products) || !taste) return products ?? [];
  return products
    .map((product, idx) => ({ product, idx, aff: scoreAffinity(product, taste) }))
    .sort((a, b) => b.aff - a.aff || a.idx - b.idx)
    .map(entry => entry.product);
}

/* Reorder both the items within each rail and the rails themselves. */
export function personalizeRails(rails, taste) {
  if (!Array.isArray(rails) || !taste) return rails ?? [];
  return rails
    .map((rail, idx) => {
      const items = personalizeProducts(rail.items, taste);
      const railAff = items.reduce((sum, p) => sum + scoreAffinity(p, taste), 0);
      return { rail: { ...rail, items }, idx, railAff };
    })
    .sort((a, b) => b.railAff - a.railAff || a.idx - b.idx)
    .map(entry => entry.rail);
}

/* The dominant use-case moods of a single product (pure). */
export function deriveProductMoods(product) {
  const signals = productSignals(product);
  return USE_CASE_PROFILES
    .map(p => ({ key: p.key, score: scoreProfileMatch(p, signals) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_MOODS_PER_VIEW)
    .map(p => p.key);
}

/* Apply one product's signal onto a taste object (pure helper). */
export function applyView(taste, product) {
  const next = _normalizeTaste(taste);
  if (!product) return next;

  const id = String(product.id);
  next.viewed = [id, ...next.viewed.filter(x => x !== id)].slice(0, MAX_VIEWED);

  for (const mood of deriveProductMoods(product)) {
    next.moods[mood] = (next.moods[mood] || 0) + 1;
  }

  const house = normalizeText(product.house);
  if (house) next.houses[house] = (next.houses[house] || 0) + 1;

  return next;
}

/* ── Explicit taste signals (like / dislike) ───────────────────
   Pure helpers that complement applyView with stronger signals.
   Like = 3× view weight + added to likes list.
   Dislike = reduces matched profile weights (floor 0) + added to dislikes list.
   ─────────────────────────────────────────────────────────────── */
export function applyLike(taste, product) {
  const next = _normalizeTaste(taste);
  if (!product) return next;

  const id = String(product.id);
  next.likes = [...new Set([id, ...(next.likes ?? [])])];
  next.viewed = [id, ...next.viewed.filter(x => x !== id)].slice(0, MAX_VIEWED);

  for (const mood of deriveProductMoods(product)) {
    next.moods[mood] = (next.moods[mood] || 0) + LIKE_WEIGHT;
  }
  const house = normalizeText(product.house);
  if (house) next.houses[house] = (next.houses[house] || 0) + LIKE_WEIGHT;

  return next;
}

export function applyDislike(taste, product) {
  const next = _normalizeTaste(taste);
  if (!product) return next;

  const id = String(product.id);
  next.dislikes = [...new Set([id, ...(next.dislikes ?? [])])];

  for (const mood of deriveProductMoods(product)) {
    next.moods[mood] = Math.max(0, (next.moods[mood] || 0) - DISLIKE_WEIGHT);
  }
  const house = normalizeText(product.house);
  if (house) next.houses[house] = Math.max(0, (next.houses[house] || 0) - DISLIKE_WEIGHT);

  return next;
}

/* ── Store (localStorage, guarded for non-browser/SSR/tests) ── */
function _emptyTaste() {
  return { moods: {}, houses: {}, viewed: [], likes: [], dislikes: [] };
}

function _normalizeTaste(taste) {
  const t = taste && typeof taste === 'object' ? taste : {};
  return {
    moods:    { ...(t.moods || {}) },
    houses:   { ...(t.houses || {}) },
    viewed:   Array.isArray(t.viewed)   ? [...t.viewed]   : [],
    likes:    Array.isArray(t.likes)    ? [...t.likes]    : [],
    dislikes: Array.isArray(t.dislikes) ? [...t.dislikes] : [],
  };
}

function _load() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? _normalizeTaste(JSON.parse(raw)) : _emptyTaste();
  } catch {
    return _emptyTaste();
  }
}

function _save(taste) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(taste));
  } catch {
    /* storage unavailable — personalization simply stays off */
  }
}

export const Personalization = {
  getTaste() {
    return _load();
  },

  hasSignal() {
    return _load().viewed.length > 0;
  },

  recordView(product) {
    if (!product) return;
    _save(applyView(_load(), product));
  },

  recordRecommendationOpen(product) {
    this.recordView(product);
  },

  recordLike(product) {
    if (!product) return;
    _save(applyLike(_load(), product));
  },

  recordDislike(product) {
    if (!product) return;
    _save(applyDislike(_load(), product));
  },

  getLikes() {
    return _load().likes;
  },

  getDislikes() {
    return _load().dislikes;
  },

  reset() {
    _save(_emptyTaste());
  },
};
