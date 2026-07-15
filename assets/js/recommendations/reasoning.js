/* =============================================================
   RDECANTS - PRODUCT REASONING
   Deterministic "why this fragrance?" phrases built from curated
   fragrance metadata. Public guidance intentionally avoids legacy
   text inference so a sweet/night fragrance cannot be mislabeled as
   fresh, clean, office-safe, or any other generic fallback.

   Priority: recommendation_tags -> mood_tags -> style_tags -> climates.
   ============================================================= */

import { normalizeText } from './taxonomy.js';

const DEFAULT_LIMIT = 4;

const TAG_PHRASES = {
  recommendation: {
    noche: 'Ideal para la noche, fiestas y salidas',
    fiesta: 'Ideal para la noche, fiestas y salidas',
    party: 'Ideal para la noche, fiestas y salidas',
    antro: 'Ideal para la noche, fiestas y salidas',
    social: 'Ideal para salidas y planes sociales',
    cita: 'Muy buena opción para citas',
    date: 'Muy buena opción para citas',
    evento_formal: 'Funciona para eventos formales con presencia',
    formal: 'Funciona para eventos formales con presencia',
    fragancia_firma: 'Puede funcionar como fragancia firma si te gusta destacar',
    alto_rendimiento: 'Pensada para quien busca alto rendimiento',
    oficina: 'Adecuada para oficina cuando buscas algo pulido',
    diario: 'Ideal para el día a día',
  },
  mood: {
    juvenil: 'Vibra juvenil y seductora',
    seductor: 'Vibra juvenil y seductora',
    sensual: 'Vibra sensual y seductora',
    nocturno: 'Hecha para planes de noche',
    dulce: 'Vibra dulce y llamativa',
    limpio: 'Vibra limpia y fácil de usar',
    fresco: 'Vibra fresca y ligera',
  },
  style: {
    dulce: 'Perfecto si te gustan aromas dulces, especiados y llamativos',
    spicy: 'Perfecto si te gustan aromas dulces, especiados y llamativos',
    especiado: 'Perfecto si te gustan aromas dulces, especiados y llamativos',
    llamativo: 'Perfecto si te gustan aromas dulces, especiados y llamativos',
    moderno: 'Estilo moderno y fácil de notar',
    nocturno: 'Estilo nocturno, ideal para destacar',
    frutal: 'Tiene un perfil frutal y juvenil',
    gourmand: 'Perfecto si disfrutas aromas dulces y envolventes',
    fresco: 'Perfecto si te gustan aromas frescos y ligeros',
    limpio: 'Perfecto si te gustan aromas limpios y discretos',
  },
  climate: {
    frio: 'Mejor en clima fresco o templado',
    cold: 'Mejor en clima fresco o templado',
    invierno: 'Mejor en clima fresco o templado',
    templado: 'Mejor en clima fresco o templado',
    calido: 'Mejor en clima cálido',
    verano: 'Mejor en clima cálido',
  },
};

export function getReasons(product, { limit = DEFAULT_LIMIT } = {}) {
  if (!product) return [];
  return _curatedReasons(product).slice(0, limit);
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

function _curatedReasons(product) {
  const f = product?.fragrance;
  if (!f) return [];

  const groups = [
    _phrasesFor(f.recommendation_tags, TAG_PHRASES.recommendation),
    _phrasesFor(f.mood_tags, TAG_PHRASES.mood),
    _phrasesFor(f.style_tags, TAG_PHRASES.style),
    _phrasesFor(f.climates, TAG_PHRASES.climate),
  ];

  const primary = groups.map(group => group[0]).filter(Boolean);
  const extras = groups.flatMap(group => group.slice(1));
  return _dedupe([...primary, ...extras]);
}

function _phrasesFor(tags, phraseMap) {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag => phraseMap[_tagKey(tag)]).filter(Boolean);
}

function _tagKey(value) {
  return normalizeText(value)
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w]/g, '');
}

function _dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}
