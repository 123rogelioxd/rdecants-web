/* =============================================================
   RDECANTS — MOOD ENGINE
   Scores any product against a mood definition using fragrance
   intelligence metadata first, with a legacy notes/text fallback
   so products that haven't been enriched yet still rank.

   Pure: no DOM, no fetch. Testable end-to-end.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  productSignals,
  scoreProfileMatch,
  normalizeText,
} from '../recommendations/taxonomy.js?v=1.0.13';

/* Per-signal weights. Fragrance metadata is canonical; legacy notes
   are kept as a tie-breaker so products without enriched data still
   surface in a sensible order. */
const W = {
  family: 8,
  mood:   4,
  style:  3,
  context: 3,
  accord: 2,
  note:   3,
  house:  6,
  scoreFloor: 5,
  legacy: 2,
};

/**
 * Returns an integer score >= 0 indicating how strongly a product
 * matches the mood's `match` spec. 0 means "does not belong".
 */
export function scoreProductForMood(product, mood) {
  if (!product || !mood?.match) return 0;
  const m = mood.match;
  const f = product.fragrance ?? null;
  let score = 0;

  /* ── Fragrance-metadata path (preferred) ──────────────────── */
  if (f) {
    const family = normalizeText(f.scent_family_normalized);
    if (family && _containsAny(m.families, family)) score += W.family;

    score += _countOverlap(m.moods, f.mood_tags) * W.mood;
    score += _countOverlap(m.styles, f.style_tags) * W.style;
    score += _countOverlap(m.contexts, f.recommended_context_tags) * W.context;
    score += _countOverlap(m.accords, f.accords) * W.accord;

    /* Score thresholds: e.g. "freshness >= 60" awards a fixed bonus. */
    if (m.scoreFloor && f.scores) {
      for (const [key, floor] of Object.entries(m.scoreFloor)) {
        const raw = Number(f.scores[key]);
        if (!Number.isFinite(raw)) continue;
        const pct = raw <= 1 ? raw * 100 : raw <= 10 ? raw * 10 : raw;
        if (pct >= floor) score += W.scoreFloor;
      }
    }
  }

  /* ── Common signals (work with or without fragrance metadata) ── */
  if (m.notes?.length) {
    const notes = (product.notes ?? []).map(normalizeText);
    score += m.notes.reduce((sum, want) => {
      const n = normalizeText(want);
      return sum + (notes.some(have => have.includes(n)) ? 1 : 0);
    }, 0) * W.note;
  }

  if (m.houses?.length) {
    const house = normalizeText(product.house);
    if (m.houses.some(h => house.includes(normalizeText(h)))) score += W.house;
  }

  /* ── Legacy fallback: use the taxonomy USE_CASE_PROFILES scorer
       so products without enriched fragrance metadata still rank. ── */
  if (m.legacyKey) {
    const profile = USE_CASE_PROFILES.find(p => p.key === m.legacyKey);
    if (profile) score += scoreProfileMatch(profile, productSignals(product)) * W.legacy;
  }

  return score;
}

/**
 * Returns the top-N products ranked for the given mood, score > 0.
 * Tie-breaker: lower stock (signal of demand) first, then product id
 * for determinism.
 */
export function rankProductsForMood(products, mood, { limit = 12 } = {}) {
  if (!Array.isArray(products) || !mood) return [];
  return products
    .map(product => ({ product, score: scoreProductForMood(product, mood) }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const stockA = Number(a.product.stock ?? 99);
      const stockB = Number(b.product.stock ?? 99);
      if (stockA !== stockB) return stockA - stockB;
      return String(a.product.id).localeCompare(String(b.product.id));
    })
    .slice(0, limit)
    .map(item => item.product);
}

/* ── Helpers ───────────────────────────────────────────────── */

function _containsAny(list, value) {
  if (!Array.isArray(list)) return false;
  return list.some(item => normalizeText(item) === value);
}

function _countOverlap(want = [], have = []) {
  if (!Array.isArray(want) || !want.length || !Array.isArray(have) || !have.length) return 0;
  const wantSet = new Set(want.map(normalizeText));
  const haveSet = new Set(have.map(normalizeText));
  let n = 0;
  for (const v of haveSet) if (wantSet.has(v)) n += 1;
  return n;
}
