/* =============================================================
   RDECANTS — PURCHASE GUIDANCE
   Beginner-friendly orientation badges derived ONLY from real
   catalog metadata (notes, description, operational badge).
   Goal: reduce decision paralysis with a lightweight hint about
   when/how to wear a fragrance. No AI, no fabricated data.

   The mood/use-case vocabulary lives in recommendations/taxonomy.js
   so the assistant, bundles and reasoning all share one definition.
   Each product surfaces at most MAX_BADGES guidance chips, picked
   by score so we never clutter the card.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  productSignals,
  scoreProfileMatch,
} from '../recommendations/taxonomy.js?v=1.0.13';

const MAX_BADGES = 2;
const MIN_SCORE = 3;

export function getGuidanceBadges(product) {
  if (!product) return [];

  const signals = productSignals(product);

  return USE_CASE_PROFILES
    .map(profile => ({
      key: profile.key,
      label: profile.label,
      score: scoreProfileMatch(profile, signals),
    }))
    .filter(item => item.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_BADGES)
    .map(({ key, label }) => ({ key, label }));
}
