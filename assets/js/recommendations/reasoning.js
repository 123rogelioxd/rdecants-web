/* =============================================================
   RDECANTS — PRODUCT REASONING
   Deterministic, reusable "¿por qué esta fragancia?" phrases built
   purely from catalog metadata via the shared taxonomy. No LLM, no
   fabrication — same input always yields the same human-sounding,
   boutique explanation.

   getReasons(product)        -> short phrases ("Ideal para el calor y la oficina")
   getMatchTier(score, max)   -> confidence indicator for the assistant
   ============================================================= */

import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  productSignals,
  scoreProfileMatch,
} from './taxonomy.js?v=1.0.13';

const USE_CASE_THRESHOLD = 4;
const FAMILY_THRESHOLD = 4;
const DEFAULT_LIMIT = 2;

const FAMILY_PHRASE = {
  fresco: 'Perfecto si te gustan aromas limpios y frescos',
  dulce: 'Ideal si disfrutas perfumes dulces y envolventes',
  intenso: 'Para quien busca aromas intensos y con presencia',
};

const SINGLE_USE_CASE_PHRASE = {
  diario: 'Ideal para el día a día',
  oficina: 'Perfecto para la oficina',
  fiesta: 'Gran opción para fiesta nocturna',
  tropical: 'Ideal para clima cálido y verano',
  seductor: 'Una apuesta segura para la noche',
  elegante: 'Elegante para ocasiones especiales',
};

export function getReasons(product, { limit = DEFAULT_LIMIT } = {}) {
  if (!product) return [];

  const signals = productSignals(product);
  const reasons = [];

  const useCases = USE_CASE_PROFILES
    .map(p => ({ key: p.key, short: p.short, score: scoreProfileMatch(p, signals) }))
    .filter(p => p.score >= USE_CASE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (useCases.length >= 2) {
    reasons.push(`Ideal para ${useCases[0].short} y ${useCases[1].short}`);
  } else if (useCases.length === 1) {
    reasons.push(SINGLE_USE_CASE_PHRASE[useCases[0].key]);
  }

  const family = Object.values(SCENT_FAMILIES)
    .map(f => ({ key: f.key, score: scoreProfileMatch(f, signals) }))
    .filter(f => f.score >= FAMILY_THRESHOLD)
    .sort((a, b) => b.score - a.score)[0];

  if (family) reasons.push(FAMILY_PHRASE[family.key]);

  return _dedupe(reasons).slice(0, limit);
}

/* Confidence indicator from a normalized match ratio. */
export function getMatchTier(score, maxScore) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return { key: 'fair', label: 'Buena opción', ratio: 0 };
  }

  const ratio = Math.max(0, Math.min(1, score / maxScore));
  if (ratio >= 0.66) return { key: 'high', label: 'Match alto', ratio };
  if (ratio >= 0.33) return { key: 'good', label: 'Buen match', ratio };
  return { key: 'fair', label: 'Match suave', ratio };
}

function _dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}
