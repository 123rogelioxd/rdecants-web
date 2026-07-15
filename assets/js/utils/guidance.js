/* =============================================================
   RDECANTS - STOREFRONT BADGE PRESENTATION POLICY
   Selects a small, deterministic set of buyer-useful chips from
   source catalog metadata without changing the RSupplyOS payload.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  productSignals,
  scoreProfileMatch,
} from '../recommendations/taxonomy.js';
import { MAX_VISIBLE_BADGES } from '../ui/displayLimits.js';

const MIN_SCORE = 3;

const CONTEXT_POLICIES = {
  catalog_card: {
    max: 2,
    includePerformance: false,
    categoryRank: { scent: 0, occasion: 1, unknown: 2, audience: 3 },
    categoryOrder: ['scent', 'occasion'],
  },
  quick_view: {
    max: 3,
    includePerformance: false,
    categoryRank: { scent: 0, occasion: 1, unknown: 2, audience: 3 },
    categoryOrder: ['scent', 'occasion', 'occasion'],
  },
  product_detail: {
    max: MAX_VISIBLE_BADGES,
    includePerformance: true,
    categoryRank: { scent: 0, occasion: 1, unknown: 2, performance: 3, audience: 4 },
    categoryOrder: ['scent', 'occasion', 'occasion', 'unknown', 'performance', 'audience'],
  },
  default: {
    max: MAX_VISIBLE_BADGES,
    includePerformance: false,
    categoryRank: { scent: 0, occasion: 1, unknown: 2, audience: 3 },
    categoryOrder: ['scent', 'occasion'],
  },
};

const BADGE_ALIASES = {
  dulce:              { key: 'dulce', label: 'Dulce', category: 'scent' },
  sweet:              { key: 'dulce', label: 'Dulce', category: 'scent' },
  fresco:             { key: 'fresco', label: 'Fresco', category: 'scent' },
  fresh:              { key: 'fresco', label: 'Fresco', category: 'scent' },
  limpio:             { key: 'fresco', label: 'Fresco', category: 'scent' },

  amaderado:          { key: 'amaderado', label: 'Amaderado', category: 'scent' },
  woody:              { key: 'amaderado', label: 'Amaderado', category: 'scent' },
  madera:             { key: 'amaderado', label: 'Amaderado', category: 'scent' },

  elegante:           { key: 'elegante', label: 'Elegante', category: 'scent' },
  elegant:            { key: 'elegante', label: 'Elegante', category: 'scent' },
  formal:             { key: 'elegante', label: 'Elegante', category: 'scent' },

  intenso:            { key: 'intenso', label: 'Intenso', category: 'scent' },
  intense:            { key: 'intenso', label: 'Intenso', category: 'scent' },

  diario:             { key: 'diario', label: 'Diario', category: 'occasion' },
  daily:              { key: 'diario', label: 'Diario', category: 'occasion' },
  everyday:           { key: 'diario', label: 'Diario', category: 'occasion' },
  versatil:           { key: 'diario', label: 'Diario', category: 'occasion' },
  versatile:          { key: 'diario', label: 'Diario', category: 'occasion' },

  noche:              { key: 'noche', label: 'Noche', category: 'occasion' },
  night:              { key: 'noche', label: 'Noche', category: 'occasion' },
  nocturno:           { key: 'noche', label: 'Noche', category: 'occasion' },

  cita:               { key: 'cita', label: 'Cita', category: 'occasion' },
  cita_casual:        { key: 'cita', label: 'Cita', category: 'occasion' },
  date:               { key: 'cita', label: 'Cita', category: 'occasion' },
  date_night:         { key: 'cita', label: 'Cita', category: 'occasion' },

  fiesta:             { key: 'fiesta', label: 'Fiesta', category: 'occasion' },
  party:              { key: 'fiesta', label: 'Fiesta', category: 'occasion' },

  oficina:            { key: 'oficina', label: 'Oficina', category: 'occasion' },
  office:             { key: 'oficina', label: 'Oficina', category: 'occasion' },

  regalo:             { key: 'regalo', label: 'Regalo', category: 'occasion' },
  gift:               { key: 'regalo', label: 'Regalo', category: 'occasion' },

  hombre:             { key: 'hombre', label: 'Hombre', category: 'audience' },
  masculine:          { key: 'hombre', label: 'Hombre', category: 'audience' },
  male:               { key: 'hombre', label: 'Hombre', category: 'audience' },

  mujer:              { key: 'mujer', label: 'Mujer', category: 'audience' },
  feminine:           { key: 'mujer', label: 'Mujer', category: 'audience' },
  female:             { key: 'mujer', label: 'Mujer', category: 'audience' },

  unisex:             { key: 'unisex', label: 'Unisex', category: 'audience' },

  duracion_excepcional: { key: 'buen_rendimiento', label: 'Buen rendimiento', category: 'performance' },
  larga_duracion:       { key: 'buen_rendimiento', label: 'Buen rendimiento', category: 'performance' },
  alto_rendimiento:     { key: 'buen_rendimiento', label: 'Buen rendimiento', category: 'performance' },
  long_lasting:         { key: 'buen_rendimiento', label: 'Buen rendimiento', category: 'performance' },
  beast_mode:           { key: 'buen_rendimiento', label: 'Buen rendimiento', category: 'performance' },

  maxima_proyeccion:    { key: 'buena_proyeccion', label: 'Buena proyecci\u00f3n', category: 'performance' },
  buena_proyeccion:     { key: 'buena_proyeccion', label: 'Buena proyecci\u00f3n', category: 'performance' },
  proyeccion:           { key: 'buena_proyeccion', label: 'Buena proyecci\u00f3n', category: 'performance' },
  projection:           { key: 'buena_proyeccion', label: 'Buena proyecci\u00f3n', category: 'performance' },

  premium:              { key: 'premium', label: 'Premium', category: 'hype' },
  recomendado:          { key: 'recomendado', label: 'Recomendado', category: 'hype' },
  recommended:          { key: 'recomendado', label: 'Recomendado', category: 'hype' },
  disponible:           { key: 'disponible', label: 'Disponible', category: 'hype' },
  available:            { key: 'disponible', label: 'Disponible', category: 'hype' },
};

const SOURCE_FIELDS = [
  { path: ['fragrance', 'mood_tags'], rank: 0 },
  { path: ['fragrance', 'recommendation_tags'], rank: 1 },
  { path: ['fragrance', 'recommended_context_tags'], rank: 2 },
  { path: ['fragrance', 'occasions'], rank: 3 },
  { path: ['fragrance', 'style_tags'], rank: 4 },
  { path: ['fragrance', 'climates'], rank: 5 },
  { path: ['fragrance', 'commercial_roles'], rank: 6 },
  { path: ['commercial_role'], rank: 7 },
  { path: ['badge'], rank: 8 },
];

export function getDisplayBadges(product, { context = 'default', limit } = {}) {
  if (!product) return [];

  const policy = CONTEXT_POLICIES[context] ?? CONTEXT_POLICIES.default;
  const max = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : policy.max;

  return _policyBadges(product, policy)
    .slice(0, max)
    .map(({ key, label }) => ({ key, label }));
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
    .slice(0, MAX_VISIBLE_BADGES)
    .map(({ key, label }) => ({ key, label }));
}

function _policyBadges(product, policy) {
  const seen = new Set();
  const badges = [];
  const hasDisplayedAudience = Boolean(_audienceKey(product?.gender));
  let inputOrder = 0;

  for (const field of SOURCE_FIELDS) {
    for (const raw of _asArray(_getPath(product, field.path))) {
      inputOrder += 1;
      const normalized = _badgeKey(raw);
      if (!normalized) continue;

      const badge = _normalizeBadge(raw, normalized);
      if (!badge || seen.has(badge.key)) continue;
      if (badge.category === 'hype') continue;
      if (badge.category === 'performance' && !policy.includePerformance) continue;
      if (badge.category === 'audience' && hasDisplayedAudience) continue;

      const categoryRank = _categoryRank(policy, badge.category);
      if (!Number.isFinite(categoryRank)) continue;

      seen.add(badge.key);
      badges.push({
        ...badge,
        categoryRank,
        sourceRank: field.rank,
        inputOrder,
        rawKey: normalized,
      });
    }
  }

  const sorted = badges.sort((a, b) =>
    a.categoryRank - b.categoryRank ||
    a.sourceRank - b.sourceRank ||
    a.inputOrder - b.inputOrder ||
    a.rawKey.localeCompare(b.rawKey)
  );

  return _spreadCategories(sorted, policy);
}

function _spreadCategories(badges, policy) {
  const output = [];
  const used = new Set();

  for (const category of policy.categoryOrder ?? []) {
    const badge = badges.find(item => item.category === category && !used.has(item.key));
    if (!badge) continue;
    output.push(badge);
    used.add(badge.key);
  }

  for (const badge of badges) {
    if (used.has(badge.key)) continue;
    output.push(badge);
    used.add(badge.key);
  }

  return output;
}

function _normalizeBadge(raw, normalized) {
  const alias = BADGE_ALIASES[normalized];
  if (alias) return alias;

  return {
    key: normalized,
    label: _badgeLabel(raw),
    category: 'unknown',
  };
}

function _categoryRank(policy, category) {
  return Object.prototype.hasOwnProperty.call(policy.categoryRank, category)
    ? policy.categoryRank[category]
    : policy.categoryRank.unknown;
}

function _getPath(obj, path) {
  return path.reduce((value, key) => value?.[key], obj);
}

function _audienceKey(value) {
  const key = _badgeKey(value);
  const badge = key ? BADGE_ALIASES[key] : null;
  return badge?.category === 'audience' ? badge.key : '';
}

function _asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
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
