/* =============================================================
   RDECANTS — COLLECTION BUILDER / CROSS-SELL
   Finds complementary products for a basket or a single PDP seed.

   The key distinction from getCartUpsells (which scores similarity):
   this module scores CONTRAST — what covers a different occasion,
   mood, or intensity than what the user already has.

   Examples of desired output:
     Fresh/daily → Night/seductive
     Office      → Date night
     Designer    → Niche discovery
     Safe        → Statement

   Pure: receives catalog + cart/seed products, returns sorted
   complementary candidates. DOM-free and unit-testable.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  productSignals,
  scoreProfileMatch,
  normalizeText,
} from './taxonomy.js?v=1.0.13';
import { isSellable, getOperationalScore } from './scoring.js?v=1.0.13';
import { scoreAffinity } from './personalization.js?v=1.0.13';

/* ── Complement axes ────────────────────────────────────────────── */

/* Use-case complements: what the cart/seed is "missing". */
export const COMPLEMENT_MAP = {
  diario:   ['seductor', 'fiesta', 'elegante'],
  oficina:  ['seductor', 'fiesta'],
  fiesta:   ['diario', 'oficina', 'tropical'],
  tropical: ['seductor', 'elegante'],
  seductor: ['diario', 'oficina', 'tropical'],
  elegante: ['diario', 'tropical'],
};

/* Scent-family complements. */
export const FAMILY_COMPLEMENT_MAP = {
  fresco:  ['dulce', 'intenso'],
  dulce:   ['fresco'],
  intenso: ['fresco'],
};

/* Human-readable reason shown on the PDP "Combina bien con" card. */
export const COMPLEMENT_REASON = {
  seductor: 'Para la noche',
  fiesta:   'Para salidas',
  elegante: 'Para ocasiones especiales',
  diario:   'Para el día a día',
  oficina:  'Para el trabajo',
  tropical: 'Para el verano',
};

/* ── Scoring weights ────────────────────────────────────────────── */

const COMPLEMENT_UC_WEIGHT   = 1;   // multiplier on profile score for a complement use-case
const DUPLICATE_UC_PENALTY   = 0.5; // reduce score when candidate matches cart's own use-case
const FAMILY_COMPLEMENT_BONUS = 5;  // candidate is in a complement scent family
const FAMILY_SAME_PENALTY     = 3;  // candidate is in the same scent family as cart
const TASTE_BOOST_WEIGHT      = 0.3; // secondary tiebreaker: taste affinity boost
const MIN_SCORE               = 5;  // minimum complement score to include/show

/* ── Main export ────────────────────────────────────────────────── */

/**
 * Returns up to `limit` complementary products for the given seeds.
 * Returns [] when confidence is low (all candidates below MIN_SCORE).
 *
 * @param {object[]} seedProducts  - cart items or [pdpProduct]
 * @param {object[]} allProducts   - full eligible catalog (pre-filtered for dislikes)
 * @param {object}   taste         - personalization taste object (may be empty)
 * @param {object}   opts
 * @param {number}   opts.limit    - max results (default 3)
 */
export function getCollectionPairs(seedProducts, allProducts, taste, { limit = 3 } = {}) {
  if (!Array.isArray(seedProducts) || !seedProducts.length) return [];
  if (!Array.isArray(allProducts) || !allProducts.length) return [];

  const inSeed = new Set(seedProducts.map(p => String(p?.id ?? '')).filter(Boolean));
  const analysis = _analyseSeeds(seedProducts);

  const scored = allProducts
    .filter(p => p && !inSeed.has(String(p.id)) && isSellable(p))
    .map(p => ({ product: p, score: _complementScore(p, analysis, taste) }))
    .filter(e => e.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(e => e.product);
}

/**
 * Returns the dominant complement use-case key for a set of seeds,
 * and a human-readable reason string for the PDP label.
 */
export function getComplementReason(seedProducts) {
  if (!Array.isArray(seedProducts) || !seedProducts.length) return '';
  const { complementUseCases } = _analyseSeeds(seedProducts);
  const first = [...complementUseCases][0];
  return first ? (COMPLEMENT_REASON[first] ?? '') : '';
}

/* ── Pure helpers ───────────────────────────────────────────────── */

function _analyseSeeds(seedProducts) {
  const ucTotals = {};
  for (const profile of USE_CASE_PROFILES) {
    for (const p of seedProducts) {
      const signals = productSignals(p);
      ucTotals[profile.key] = (ucTotals[profile.key] ?? 0) + scoreProfileMatch(profile, signals);
    }
  }

  const sorted = Object.entries(ucTotals).sort((a, b) => b[1] - a[1]);
  const dominantKey = sorted[0]?.[0] ?? null;

  /* Use cases the seeds already cover (score ≥ 3 = at least one note or badge match). */
  const cartUseCases = new Set(sorted.filter(([, s]) => s >= 3).map(([k]) => k));

  /* Complement use cases = what the cart is missing for that dominant profile. */
  const complementUseCases = new Set(
    (COMPLEMENT_MAP[dominantKey] ?? []).filter(k => !cartUseCases.has(k)),
  );

  /* Scent families of the seeds. */
  const cartFamilies = new Set(seedProducts.map(_bestScentFamily).filter(Boolean));

  /* Which scent families would complement those. */
  const complementFamilies = new Set(
    [...cartFamilies].flatMap(f => FAMILY_COMPLEMENT_MAP[f] ?? []),
  );

  return { dominantKey, cartUseCases, complementUseCases, cartFamilies, complementFamilies };
}

function _complementScore(candidate, analysis, taste) {
  const signals = productSignals(candidate);
  let score = 0;

  /* Reward matching a complement use case. */
  for (const ucKey of analysis.complementUseCases) {
    const profile = USE_CASE_PROFILES.find(p => p.key === ucKey);
    if (profile) score += scoreProfileMatch(profile, signals) * COMPLEMENT_UC_WEIGHT;
  }

  /* Penalise matching a use case the seeds already cover. */
  for (const ucKey of analysis.cartUseCases) {
    const profile = USE_CASE_PROFILES.find(p => p.key === ucKey);
    if (profile) score -= scoreProfileMatch(profile, signals) * DUPLICATE_UC_PENALTY;
  }

  /* Reward being in a complement scent family. */
  const candidateFamily = _bestScentFamily(candidate);
  if (candidateFamily && analysis.complementFamilies.has(candidateFamily)) {
    score += FAMILY_COMPLEMENT_BONUS;
  } else if (candidateFamily && analysis.cartFamilies.has(candidateFamily)) {
    score -= FAMILY_SAME_PENALTY;
  }

  /* Operational health. */
  score += _healthAdj(candidate);

  /* Taste affinity as a secondary tiebreaker. */
  if (taste) score += scoreAffinity(candidate, taste) * TASTE_BOOST_WEIGHT;

  return score;
}

function _bestScentFamily(product) {
  /* Prefer explicit API field; fall back to taxonomy scoring. */
  const explicit = product.fragrance?.scent_family_normalized;
  if (explicit) return normalizeText(explicit);

  const signals = productSignals(product);
  return Object.values(SCENT_FAMILIES)
    .map(f => ({ key: f.key, score: scoreProfileMatch(f, signals) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.key ?? null;
}

function _healthAdj(product) {
  let adj = 0;
  if (product.featured) adj += 2;
  if (getOperationalScore(product) > 80) adj += 1;
  return adj;
}
