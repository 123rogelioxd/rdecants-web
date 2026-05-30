/* =============================================================
   RDECANTS — GUIDED SHOPPING ASSISTANT (logic)
   A boutique-style guided picker: a few simple questions in, 2–4
   confident recommendations out. Pure + deterministic so it can be
   unit-tested; the UI lives in ui/assistant.js.

   Every recommendation is grounded in REAL catalog metadata and the
   shared taxonomy / operational scoring. No AI claims, no fabricated
   relevance — just honest, centralized matching.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  CLIMATES,
  productSignals,
  scoreProfileMatch,
} from './taxonomy.js?v=1.0.13';
import { getReasons, getMatchTier } from './reasoning.js?v=1.0.13';
import { isSellable, getOperationalScore, getAovSignal } from './scoring.js?v=1.0.13';
import { getDefaultVariant, getOrderableVariants } from '../utils/prices.js?v=1.0.13';

const MIN_RESULTS = 2;
const MAX_RESULTS = 4;
const LEVEL_BOOST = 2;

/* Question config consumed by the UI. */
export const ASSISTANT_QUESTIONS = [
  {
    id: 'family',
    label: '¿Qué tipo de aroma prefieres?',
    options: [
      { value: 'fresco', label: 'Fresco' },
      { value: 'dulce', label: 'Dulce' },
      { value: 'intenso', label: 'Intenso' },
    ],
  },
  {
    id: 'occasion',
    label: '¿Para qué ocasión?',
    options: [
      { value: 'dia', label: 'Día' },
      { value: 'noche', label: 'Noche' },
      { value: 'oficina', label: 'Oficina' },
      { value: 'fiesta', label: 'Fiesta' },
    ],
  },
  {
    id: 'budget',
    label: '¿Presupuesto por decant?',
    options: [
      { value: 'low', label: 'Hasta $150' },
      { value: 'mid', label: '$150–$250' },
      { value: 'high', label: '$250+' },
      { value: 'any', label: 'Sin límite' },
    ],
  },
];

const OCCASION_USE_CASES = {
  dia: ['diario'],
  noche: ['seductor', 'fiesta'],
  oficina: ['oficina'],
  fiesta: ['fiesta'],
};

const OCCASION_LABEL = {
  dia: 'Diario',
  noche: 'Noche',
  oficina: 'Oficina',
  fiesta: 'Fiesta',
};

const BUDGET_RANGES = {
  low: [0, 150],
  mid: [150, 250],
  high: [250, Infinity],
  any: [0, Infinity],
};

const _profileByKey = new Map(USE_CASE_PROFILES.map(p => [p.key, p]));

export function getAssistantRecommendations(answers = {}, products = [], { limit = MAX_RESULTS } = {}) {
  if (!Array.isArray(products) || !products.length) return [];

  const candidates = products
    .filter(isSellable)
    .map(product => ({ product, variant: _variantForBudget(product, answers.budget) }))
    .filter(entry => entry.variant)
    .map(entry => {
      const signals = productSignals(entry.product);
      const matchScore = _matchScore(entry.product, signals, answers);
      return { ...entry, matchScore };
    })
    .filter(entry => entry.matchScore > 0);

  if (!candidates.length) return [];

  const maxScore = Math.max(...candidates.map(c => c.matchScore));

  const ranked = candidates.sort((a, b) =>
    b.matchScore - a.matchScore ||
    getOperationalScore(b.product) - getOperationalScore(a.product) ||
    getAovSignal(b.product) - getAovSignal(a.product));

  const top = ranked.slice(0, Math.max(MIN_RESULTS, Math.min(limit, MAX_RESULTS)));

  return top.map(({ product, variant, matchScore }) => ({
    product,
    variant,
    matchScore,
    matchTier: getMatchTier(matchScore, maxScore),
    reasons: getReasons(product),
    useCase: OCCASION_LABEL[answers.occasion] ?? _topUseCaseLabel(product),
  }));
}

/* ── Scoring ───────────────────────────────────────────────── */
function _matchScore(product, signals, answers) {
  let score = 0;

  const family = SCENT_FAMILIES[answers.family];
  if (family) score += scoreProfileMatch(family, signals);

  const climate = CLIMATES[answers.climate];
  if (climate) score += scoreProfileMatch(climate, signals);

  const occasionKeys = OCCASION_USE_CASES[answers.occasion] ?? [];
  const occasionScore = occasionKeys.reduce((best, key) => {
    const profile = _profileByKey.get(key);
    return profile ? Math.max(best, scoreProfileMatch(profile, signals)) : best;
  }, 0);
  score += occasionScore;

  score += _levelAdjust(product, signals, answers.level);

  return score;
}

/* Beginners lean toward versatile / featured picks; enthusiasts
   toward more exclusive elegant profiles. Honest, metadata-based. */
function _levelAdjust(product, signals, level) {
  if (level === 'beginner') {
    const diario = _profileByKey.get('diario');
    const safe = product.featured || scoreProfileMatch(diario, signals) > 0;
    return safe ? LEVEL_BOOST : 0;
  }
  if (level === 'enthusiast') {
    const elegante = _profileByKey.get('elegante');
    return scoreProfileMatch(elegante, signals) > 0 ? LEVEL_BOOST : 0;
  }
  return 0;
}

function _variantForBudget(product, budget) {
  const [min, max] = BUDGET_RANGES[budget] ?? BUDGET_RANGES.any;
  const defaultVariant = getDefaultVariant(product);

  if (budget === 'any' || !budget) return defaultVariant;
  if (defaultVariant && _priceInRange(defaultVariant.price, min, max)) return defaultVariant;

  return getOrderableVariants(product)
    .find(variant => _priceInRange(variant.price, min, max)) ?? null;
}

function _priceInRange(price, min, max) {
  return Number.isFinite(price) && price >= min && price <= max;
}

function _topUseCaseLabel(product) {
  const signals = productSignals(product);
  const top = USE_CASE_PROFILES
    .map(p => ({ label: p.label, score: scoreProfileMatch(p, signals) }))
    .sort((a, b) => b.score - a.score)[0];
  return top && top.score > 0 ? top.label : 'Versátil';
}
