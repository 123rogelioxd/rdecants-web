/* =============================================================
   RDECANTS - GUIDED SHOPPING ASSISTANT (logic)
   Context-first recommendations: usage fit beats raw scent overlap.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  CLIMATES,
  productSignals,
  scoreProfileMatch,
  normalizeText,
} from './taxonomy.js?v=2026.06.04.2';
import { getMatchTier } from './reasoning.js?v=2026.06.04.2';
import { isSellable, getOperationalScore, getAovSignal } from './scoring.js?v=2026.06.04.2';
import { getDefaultVariant, getOrderableVariants } from '../utils/prices.js?v=2026.06.04.2';
import { getGenderEligibility } from '../utils/gender.js?v=2026.06.04.2';

const MIN_RESULTS = 2;
const MAX_RESULTS = 4;
const LEVEL_BOOST = 2;
const GENDER_BOOST = 3;

const MAX_CONTEXT_SCORE = 40;
const MAX_OLFACTIVE_SCORE = 30;
const MAX_COMMERCIAL_SCORE = 20;
const MAX_POPULARITY_SCORE = 10;

/* Three high-value questions only (customer language, not internal taxonomy).
   Budget is intentionally NOT asked — the real 5 ml price is always shown on
   every result card, so a price question adds friction without adding signal.
   The engine still honours an explicit `budget` answer when provided (used by
   tests and any future surface); the finder UI simply leaves it unset ('any'). */
export const ASSISTANT_QUESTIONS = [
  {
    id: 'family',
    label: '¿Qué tipo de aroma buscas?',
    options: [
      { value: 'fresco', label: 'Fresco' },
      { value: 'dulce', label: 'Dulce' },
      { value: 'intenso', label: 'Intenso' },
    ],
  },
  {
    id: 'occasion',
    label: '¿Para qué momento?',
    options: [
      { value: 'dia', label: 'Diario' },
      { value: 'noche', label: 'Noche' },
      { value: 'oficina', label: 'Oficina' },
      { value: 'cita', label: 'Cita' },
    ],
  },
  {
    id: 'gender',
    label: '¿Para quién es?',
    options: [
      { value: 'any', label: 'Me da igual' },
      { value: 'hombre', label: 'Hombre' },
      { value: 'mujer', label: 'Mujer' },
      { value: 'unisex', label: 'Unisex' },
    ],
  },
];

const OCCASION_USE_CASES = {
  dia: ['diario'],
  noche: ['seductor', 'fiesta'],
  oficina: ['oficina'],
  fiesta: ['fiesta'],
  cita: ['seductor', 'elegante'],
  formal: ['elegante'],
  casual: ['diario'],
};

const OCCASION_LABEL = {
  dia: 'Diario',
  noche: 'Noche',
  oficina: 'Oficina',
  fiesta: 'Fiesta',
  cita: 'Cita',
  formal: 'Formal',
  casual: 'Casual',
};

const BUDGET_RANGES = {
  low: [0, 150],
  mid: [150, 250],
  high: [250, Infinity],
  any: [0, Infinity],
};

const _profileByKey = new Map(USE_CASE_PROFILES.map(p => [p.key, p]));

const CONTEXT_RULES = {
  dia: {
    wanted: ['dia', 'diario', 'daily', 'daytime', 'casual', 'versatil', 'versatile'],
    contradictions: ['noche', 'night', 'nocturno', 'antro', 'club', 'fiesta', 'party'],
    penalty: 40,
    reason: 'Excelente para uso de día',
    warning: 'Mejor para planes de noche',
  },
  noche: {
    wanted: ['noche', 'night', 'nocturno', 'cita', 'date', 'fiesta', 'party', 'antro'],
    contradictions: [],
    penalty: 0,
    reason: 'Encaja con planes de noche',
  },
  oficina: {
    wanted: ['oficina', 'office', 'trabajo', 'work', 'formal', 'limpio', 'clean', 'discreto'],
    contradictions: ['antro', 'club', 'fiesta', 'party', 'alto rendimiento', 'llamativo', 'intenso', 'beast mode'],
    penalty: 30,
    reason: 'Adecuada para oficina',
    warning: 'Puede sentirse demasiado invasiva para oficina',
  },
  fiesta: {
    wanted: ['fiesta', 'party', 'antro', 'club', 'noche', 'night', 'social', 'alto rendimiento'],
    contradictions: [],
    penalty: 0,
    reason: 'Funciona para salidas y planes sociales',
  },
  cita: {
    wanted: ['cita', 'date', 'date night', 'romantic', 'seductor', 'sensual', 'elegante'],
    contradictions: ['oficina', 'office', 'gym', 'sport'],
    penalty: 15,
    reason: 'Encaja para una cita',
    warning: 'Menos enfocado a citas',
  },
  formal: {
    wanted: ['formal', 'evento formal', 'elegante', 'premium', 'lujo', 'sophisticated'],
    contradictions: ['gym', 'sport', 'playa', 'beach', 'casual only'],
    penalty: 20,
    reason: 'Funciona para contexto formal',
    warning: 'Mejor para planes casuales',
  },
  casual: {
    wanted: ['casual', 'diario', 'daily', 'daytime', 'facil de usar', 'easy wear'],
    contradictions: ['evento formal', 'formal only', 'black tie'],
    penalty: 15,
    reason: 'Fácil de usar en plan casual',
    warning: 'Puede sentirse demasiado formal',
  },
  calido: {
    wanted: ['calido', 'verano', 'summer', 'hot weather', 'warm-weather', 'tropical', 'fresco', 'fresh'],
    contradictions: ['frio', 'cold', 'invierno', 'winter', 'heavy', 'pesado', 'denso', 'gourmand', 'tabaco', 'tobacco'],
    penalty: 30,
    reason: 'Funciona bien en clima cálido',
    warning: 'Puede sentirse pesado en calor',
  },
  frio: {
    wanted: ['frio', 'cold', 'invierno', 'winter', 'templado', 'ambar', 'vainilla', 'tabaco', 'tobacco'],
    contradictions: [],
    penalty: 0,
    reason: 'Rinde mejor en clima fresco o frío',
  },
};

const FAMILY_RULES = {
  fresco: {
    wanted: ['fresco', 'fresh', 'limpio', 'clean', 'citrico', 'citrus', 'acuatico', 'aquatic', 'aromatico', 'aromatic'],
    reason: 'Perfil fresco y fácil de usar',
  },
  dulce: {
    wanted: ['dulce', 'sweet', 'vainilla', 'vanilla', 'tonka', 'miel', 'honey', 'frutal', 'fruity', 'gourmand'],
    reason: 'Toque dulce sin perder el contexto',
  },
  intenso: {
    wanted: ['intenso', 'intense', 'oud', 'cuero', 'leather', 'tabaco', 'tobacco', 'ambar', 'amber', 'especiado', 'spicy'],
    reason: 'Perfil intenso y con presencia',
  },
  elegante: {
    wanted: ['elegante', 'elegant', 'formal', 'premium', 'lujo', 'luxury', 'nicho', 'iris', 'woody', 'madera'],
    reason: 'Perfil elegante y pulido',
  },
};

export function getAssistantRecommendations(answers = {}, products = [], { limit = MAX_RESULTS } = {}) {
  if (!Array.isArray(products) || !products.length) return [];

  const candidates = products
    .filter(isSellable)
    .map(product => ({ product, genderEligibility: getGenderEligibility(product, answers.gender) }))
    .filter(entry => entry.genderEligibility.eligible)
    .map(entry => ({
      ...entry,
      variant: _variantForBudget(entry.product, answers.budget),
    }))
    .filter(entry => entry.variant)
    .map(entry => {
      const signals = productSignals(entry.product);
      const breakdown = _matchBreakdown(entry.product, signals, answers);
      const matchScore = breakdown.total;
      return {
        ...entry,
        breakdown,
        matchScore,
        rankScore: matchScore - entry.genderEligibility.penalty,
      };
    })
    .filter(entry => entry.matchScore > 0);

  if (!candidates.length) return [];

  const maxScore = Math.max(...candidates.map(c => c.matchScore));
  const ranked = candidates.sort((a, b) =>
    _priorityRank(a.genderEligibility.priority) - _priorityRank(b.genderEligibility.priority) ||
    b.rankScore - a.rankScore ||
    b.breakdown.context - a.breakdown.context ||
    b.breakdown.commercial - a.breakdown.commercial ||
    getAovSignal(b.product) - getAovSignal(a.product));

  const top = ranked.slice(0, Math.max(MIN_RESULTS, Math.min(limit, MAX_RESULTS)));

  return top.map(({ product, variant, matchScore, breakdown }) => ({
    product,
    variant,
    matchScore,
    matchTier: getMatchTier(matchScore, maxScore),
    reasons: _explainRecommendation(product, breakdown),
    scoreBreakdown: breakdown,
    useCase: OCCASION_LABEL[answers.occasion] ?? _topUseCaseLabel(product),
  }));
}

function _matchScore(product, signals, answers) {
  return _matchBreakdown(product, signals, answers).total;
}

function _matchBreakdown(product, signals, answers) {
  const context = _contextScore(product, signals, answers);
  const olfactive = _olfactiveScore(product, signals, answers);
  const commercial = _commercialScore(product);
  const popularity = _popularityScore(product);
  const performance = _performanceScore(product, answers);
  const adjustment = _levelAdjust(product, signals, answers.level) + _genderScore(product, answers.gender);

  return {
    context: context.score,
    olfactive: olfactive.score,
    commercial,
    popularity,
    performance: performance.score,
    penalty: context.penalty,
    warnings: context.warnings,
    positives: [...context.positives, ...olfactive.positives, ...performance.positives],
    total: context.score + olfactive.score + commercial + popularity + performance.score + adjustment - context.penalty,
  };
}

function _contextScore(product, signals, answers) {
  const meta = _metadata(product);
  const positives = [];
  const warnings = [];
  let score = 0;
  let penalty = 0;

  for (const key of [answers.occasion, answers.climate].filter(Boolean)) {
    const rule = CONTEXT_RULES[key];
    if (!rule) continue;

    const wantedHits = _countTagHits(meta.context, rule.wanted);
    const legacyScore = _legacyContextScore(key, signals);
    if (wantedHits > 0 || legacyScore > 0) {
      score += Math.min(16, wantedHits * 8 + Math.min(8, legacyScore));
      if (rule.reason) positives.push(rule.reason);
    }

    if (_hasAny(meta.context, rule.contradictions) || _hasContextContradiction(product, key)) {
      penalty += rule.penalty;
      if (rule.warning) warnings.push(rule.warning);
    }
  }

  const scores = product?.fragrance?.scores ?? {};
  const versatility = _num(scores.versatility);
  if (answers.occasion === 'dia' && versatility >= 0.75) {
    score += 6;
    positives.push('Alta versatilidad para el día a día');
  }
  if (answers.occasion === 'oficina' && _num(scores.projection) >= 0.85) {
    penalty += 30;
    warnings.push('Puede proyectar demasiado para oficina');
  }
  if (answers.climate === 'calido' && _num(scores.freshness) >= 0.65) {
    score += 6;
  }

  return {
    score: Math.min(MAX_CONTEXT_SCORE, score),
    penalty,
    positives: _dedupe(positives),
    warnings: _dedupe(warnings),
  };
}

function _olfactiveScore(product, signals, answers) {
  const meta = _metadata(product);
  const positives = [];
  let score = 0;

  const family = SCENT_FAMILIES[answers.family];
  const legacyFamilyScore = family ? scoreProfileMatch(family, signals) : 0;
  if (family) score += Math.min(12, legacyFamilyScore);

  const familyRule = FAMILY_RULES[answers.family];
  if (familyRule) {
    const hits = _countTagHits(meta.olfactive, familyRule.wanted);
    if (hits > 0 || legacyFamilyScore > 0) {
      score += Math.min(14, hits * 5);
      positives.push(familyRule.reason);
    }
  }

  if (answers.family === 'dulce') {
    const sweetness = _num(product?.fragrance?.scores?.sweetness);
    if (sweetness >= 0.35) {
      score += sweetness >= 0.75 ? 7 : 5;
      positives.push(sweetness >= 0.75 ? 'Dulzor marcado' : 'Moderadamente dulce');
    }
  }

  return {
    score: Math.min(MAX_OLFACTIVE_SCORE, score),
    positives: _dedupe(positives),
  };
}

function _commercialScore(product) {
  const f = product?.fragrance ?? {};
  const scores = f.scores ?? {};
  let score = 0;
  score += Math.max(_num(scores.crowdpleaser), _num(scores.mass_appeal), _num(scores.compliment)) * 8;
  score += _num(scores.versatility) * 8;

  const tags = _normalizedList([...(f.recommendation_tags ?? []), ...(f.commercial_roles ?? []), product?.commercial_role]);
  if (_hasAny(tags, ['fragancia firma', 'signature', 'versatil', 'versatile', 'diario', 'daily'])) score += 4;
  if (_hasAny(tags, ['polarizing', 'experimental'])) score -= 8;

  return Math.max(0, Math.min(MAX_COMMERCIAL_SCORE, score));
}

function _performanceScore(product, answers) {
  if (!['long_lasting', 'long-lasting', 'longevity'].includes(normalizeText(answers.performance))) {
    return { score: 0, positives: [] };
  }

  const f = product?.fragrance ?? {};
  const tags = _normalizedList([...(f.recommendation_tags ?? []), ...(f.style_tags ?? []), ...(f.commercial_roles ?? [])]);
  const longevity = _num(f.scores?.longevity);
  const hasPerformanceTag = _hasAny(tags, ['alto rendimiento', 'long lasting', 'long-lasting', 'beast mode']);
  const score = Math.min(10, longevity * 8 + (hasPerformanceTag ? 2 : 0));
  return {
    score,
    positives: score > 0 ? ['Buena duración'] : [],
  };
}

function _popularityScore(product) {
  const operational = getOperationalScore(product);
  if (!Number.isFinite(operational)) return 0;
  return Math.max(0, Math.min(MAX_POPULARITY_SCORE, operational));
}

function _genderScore(product, genderPref) {
  if (!genderPref || genderPref === 'any') return 0;
  const eligibility = getGenderEligibility(product, genderPref);
  return eligibility.priority === 'primary' ? GENDER_BOOST : 0;
}

function _priorityRank(priority) {
  return { primary: 0, secondary: 1, fallback: 2 }[priority] ?? 3;
}

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

function _metadata(product) {
  const f = product?.fragrance ?? {};
  return {
    context: _normalizedList([
      ...(f.recommendation_tags ?? []),
      ...(f.recommended_context_tags ?? []),
      ...(f.occasions ?? []),
      ...(f.climates ?? f.climate_tags ?? []),
      ...(f.seasons ?? f.season_tags ?? []),
      ...(f.mood_tags ?? []),
    ]),
    olfactive: _normalizedList([
      f.scent_family_normalized,
      ...(f.accords ?? []),
      ...(f.style_tags ?? []),
      ...(f.mood_tags ?? []),
    ]),
  };
}

function _legacyContextScore(key, signals) {
  if (key === 'calido' || key === 'frio') {
    const climate = CLIMATES[key];
    return climate ? Math.min(8, scoreProfileMatch(climate, signals)) : 0;
  }

  const keys = OCCASION_USE_CASES[key] ?? [];
  return keys.reduce((best, profileKey) => {
    const profile = _profileByKey.get(profileKey);
    return profile ? Math.max(best, Math.min(8, scoreProfileMatch(profile, signals))) : best;
  }, 0);
}

function _hasContextContradiction(product, key) {
  const f = product?.fragrance ?? {};
  const scores = f.scores ?? {};
  const family = normalizeText(f.scent_family_normalized);
  const name = normalizeText(`${product?.house ?? ''} ${product?.name ?? ''}`);
  const knownHeavyNight = [
    'le male elixir',
    'stronger with you intensely',
    'spicebomb extreme',
    'one million elixir',
    '1 million elixir',
    'afnan 9pm',
    '9pm',
    'invictus victory elixir',
  ];

  if (key === 'dia' && knownHeavyNight.some(term => name.includes(term))) return true;
  if (key === 'calido' && (knownHeavyNight.some(term => name.includes(term)) || (_num(scores.sweetness) >= 0.8 && _num(scores.freshness) <= 0.35))) return true;
  if (key === 'oficina' && (_num(scores.projection) >= 0.85 || family === 'gourmand')) return true;
  return false;
}

function _explainRecommendation(product, breakdown) {
  const warnings = (breakdown?.warnings ?? []).map(reason => `! ${reason}`);
  const positives = (breakdown?.positives ?? []).slice(0, 4);
  return _dedupe([...positives, ...warnings]).slice(0, 5);
}

function _normalizedList(values = []) {
  return values.flat().map(normalizeText).filter(Boolean);
}

function _hasAny(values, terms = []) {
  return terms.some(term => values.some(value => value.includes(normalizeText(term))));
}

function _countTagHits(values, terms = []) {
  return terms.reduce((sum, term) => sum + (values.some(value => value.includes(normalizeText(term))) ? 1 : 0), 0);
}

function _num(value) {
  const n = Number(value);
  const normalized = n > 1 ? n / 100 : n;
  return Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 0;
}

function _dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}
