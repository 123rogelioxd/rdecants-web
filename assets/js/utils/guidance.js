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
} from '../recommendations/taxonomy.js?v=2026.06.04.2';

const MAX_BADGES = 2;
const MIN_SCORE = 3;

export function getDisplayBadges(product, { limit = MAX_BADGES } = {}) {
  if (!product) return [];

  const curated = _curatedBadges(product);
  if (curated.length) return curated.slice(0, limit);

  return getGuidanceBadges(product).slice(0, limit);
}

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

function _curatedBadges(product) {
  const f = product?.fragrance;
  if (!f) return [];

  const seen = new Set();
  const badges = [];

  for (const source of [f.mood_tags, f.recommendation_tags, f.style_tags]) {
    for (const raw of _asArray(source)) {
      const key = _badgeKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      badges.push({ key, label: _badgeLabel(raw) });
    }
  }

  return badges;
}

function _asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function _badgeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w]/g, '');
}

function _badgeLabel(value) {
  const label = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}
