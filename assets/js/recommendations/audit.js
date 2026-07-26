/* =============================================================
   RDECANTS — CATALOG METADATA AUDITOR

   Runs over EVERY product and variant R Supply OS sends and reports what
   is missing, contradictory or suspicious — with the exact field to fix
   upstream and the effect the defect has on recommendations.

   Why this exists: the storefront must be resistant to bad metadata, but
   it must never invent metadata to hide it. When the backend says a
   fragrance is masculine and its own summary says unisex, the right answer
   is not to guess — it is to keep the product in the catalog, keep it out
   of the high-confidence recommendations, and put the contradiction in a
   report someone can act on.

   Nothing here is fragrance-specific. Every rule reads a field. Add a new
   product and it is audited by the same rules; no code names a perfume.

   Usage
     import { auditCatalog, formatAuditMarkdown, formatAuditCsv } from './audit.js'
     const report = auditCatalog(products)

   In the browser: `window.__rd.audit()` prints the summary and returns the
   full report object (wired in core/shell.js).
   ============================================================= */

import { normalizeProduct, score as scoreOf, normalizeToken } from './normalize.js';
import { PRIMARY_SIZES } from '../utils/prices.js';

/* Severity order, worst first. `critical` means the product cannot be
   recommended with confidence at all; `high` means a recommendation would
   likely be wrong; `medium` degrades quality; `low` is cosmetic or SEO. */
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/* The five buckets the brief asks for, most severe first. */
export const CLASSIFICATIONS = [
  'no_apta_para_alta_confianza',
  'contradictoria',
  'sospechosa',
  'incompleta',
  'valida',
];

/* The score keys the recommendation engine actually reads. A `scores` object
   missing most of these is reported as suspicious rather than accepted. */
const ENGINE_SCORE_KEYS = [
  'freshness', 'sweetness', 'elegance', 'compliment', 'projection', 'longevity',
  'versatility', 'intensity', 'mass_appeal', 'beginner_friendly', 'office_safe',
  'night_out', 'date_night', 'summer', 'cold_weather', 'blind_buy_safe',
];

export const CLASSIFICATION_LABELS = {
  valida: 'Metadata válida',
  incompleta: 'Metadata incompleta',
  contradictoria: 'Metadata contradictoria',
  sospechosa: 'Metadata sospechosa',
  no_apta_para_alta_confianza: 'No apta para recomendaciones de alta confianza',
};

/* ── Rules ────────────────────────────────────────────────────────
   Each rule is (product, normalized) → issue | issue[] | null.
   An issue is { code, severity, field, raw, normalized, message, fixField,
   effect, kind }, where `kind` decides the classification bucket:
     'missing'       → incompleta
     'contradiction' → contradictoria
     'suspicious'    → sospechosa
     'blocking'      → no_apta_para_alta_confianza
   ============================================================= */

const RULES = [

  /* — Gender: the single most consequential field — */
  function genderMissing(product, n) {
    if (n.gender.present) return null;
    return {
      code: 'gender_missing', severity: 'critical', kind: 'blocking',
      field: 'fragrance.gender_profile', raw: n.gender.raw, normalized: n.gender.value,
      message: 'No hay ningún valor de género (ni gender ni gender_profile).',
      fixField: 'fragrance.gender_profile',
      effect: 'Excluida de TODA recomendación en la que el cliente elija Hombre, Mujer o Unisex; sólo aparece en el catálogo general.',
    };
  },

  function genderUnrecognized(product, n) {
    if (!n.gender.unrecognized) return null;
    return {
      code: 'gender_unrecognized', severity: 'critical', kind: 'suspicious',
      field: 'fragrance.gender_profile', raw: n.gender.raw, normalized: 'unknown',
      message: `El valor "${n.gender.raw}" no pertenece a la taxonomía (masculine, lean_masculine, unisex_masculine, unisex, unisex_feminine, lean_feminine, feminine).`,
      fixField: 'fragrance.gender_profile',
      effect: 'Se trata como género desconocido: excluida de las recomendaciones con género elegido.',
    };
  },

  /* The product's own prose disagrees with its structured field. Reported,
     never auto-corrected — the storefront does not overrule the backend. */
  function genderContradictsCopy(product, n) {
    const gender = n.gender.value;
    if (gender === 'unknown') return null;
    const copy = normalizeToken([
      product?.fragrance?.summary, product?.fragrance?.scent_profile_short,
      product?.desc, product?.story,
    ].filter(Boolean).join(' '));
    const claimsUnisex = copy.includes('unisex');
    const isGendered = ['masculine', 'feminine', 'lean_masculine', 'lean_feminine'].includes(gender);
    if (!claimsUnisex || !isGendered) return null;
    return {
      code: 'gender_contradicts_description', severity: 'high', kind: 'contradiction',
      field: 'fragrance.gender_profile vs fragrance.summary',
      raw: gender, normalized: gender,
      message: `La descripción dice "unisex" pero gender_profile es "${gender}".`,
      fixField: 'fragrance.gender_profile o fragrance.summary (uno de los dos está mal)',
      effect: 'El badge de la tarjeta y el filtro dicen Hombre/Mujer mientras el texto dice unisex; el cliente ve una incoherencia y quien elige Unisex no la recibe como coincidencia directa.',
    };
  },

  /* — Scores: the only performance evidence that exists — */
  function scoresMissing(product, n) {
    if (n.scoresPresent) return null;
    return {
      code: 'scores_missing', severity: 'critical', kind: 'blocking',
      field: 'fragrance.scores', raw: null, normalized: '{}',
      message: 'No hay ningún score (projection, intensity, longevity, office_safe, night_out, …).',
      fixField: 'fragrance.scores',
      effect: 'Sin datos de rendimiento no se puede afirmar "que destaque" ni "discreto": el producto no alcanza la confianza mínima y nunca recibe la etiqueta "Nuestra recomendación".',
    };
  },

  /* A scores object that exists but is nearly empty is worse than none at
     all, because it looks documented: the dimensions it does cover score
     normally while the rest silently lose coverage. */
  function scoresPartial(product, n) {
    if (!n.scoresPresent) return null;
    const present = ENGINE_SCORE_KEYS.filter(key => n.scores[key] !== undefined);
    if (present.length >= ENGINE_SCORE_KEYS.length - 2) return null;
    const missing = ENGINE_SCORE_KEYS.filter(key => n.scores[key] === undefined);
    return {
      code: 'scores_partial', severity: 'high', kind: 'suspicious',
      field: 'fragrance.scores',
      raw: `${present.length}/${ENGINE_SCORE_KEYS.length} claves`,
      normalized: present.join(', '),
      message: `El objeto de scores existe pero le faltan ${missing.length} claves: ${missing.join(', ')}.`,
      fixField: 'fragrance.scores',
      effect: 'Parece documentado pero no lo está: las dimensiones sin score pierden cobertura y el producto compite en desventaja sin que se note.',
    };
  },

  function scoresInvalid(product, n) {
    if (!n.invalidScores.length) return null;
    return {
      code: 'scores_invalid', severity: 'high', kind: 'suspicious',
      field: 'fragrance.scores', raw: JSON.stringify(n.invalidScores),
      normalized: 'descartados',
      message: `Scores fuera de rango o no numéricos: ${n.invalidScores.map(s => `${s.key}=${s.value}`).join(', ')}.`,
      fixField: 'fragrance.scores',
      effect: 'Esos scores se descartan (no se recortan a 0–100), así que la dimensión que dependía de ellos pierde cobertura.',
    };
  },

  /* — Occasion: the highest-weight dimension — */
  function occasionsAbsent(product, n) {
    if (n.occasions.present) return null;
    return {
      code: 'occasions_absent', severity: 'critical', kind: 'blocking',
      field: 'fragrance.occasions', raw: JSON.stringify(n.occasions.raw), normalized: '[]',
      message: 'No hay ninguna ocasión, ni en occasions ni en los tags.',
      fixField: 'fragrance.occasions',
      effect: 'La dimensión de mayor peso (26/100) queda sin cobertura, lo que baja la confianza y normalmente deja al producto fuera del top.',
    };
  },

  function occasionsOnlyInTags(product, n) {
    if (n.occasions.strength !== 'secondary') return null;
    return {
      code: 'occasions_empty_but_tagged', severity: 'high', kind: 'suspicious',
      field: 'fragrance.occasions', raw: '[]',
      normalized: JSON.stringify(n.occasions.secondary),
      message: `occasions está vacío mientras recommendation_tags / mood_tags sí describen ocasiones (${n.occasions.secondary.join(', ')}).`,
      fixField: 'fragrance.occasions',
      effect: 'La ocasión se lee sólo como evidencia secundaria (máximo 0.55 en vez de 1.00), así que el producto compite en desventaja contra otro idéntico que sí llenó el campo.',
    };
  },

  function occasionsMisfiled(product, n) {
    if (!n.occasions.misfiled.length) return null;
    return {
      code: 'climate_values_inside_occasions', severity: 'medium', kind: 'suspicious',
      field: 'fragrance.occasions', raw: JSON.stringify(n.occasions.raw),
      normalized: JSON.stringify(n.occasions.misfiled),
      message: `El array de ocasiones contiene valores de clima (${n.occasions.misfiled.join(', ')}).`,
      fixField: 'fragrance.occasions → fragrance.climates',
      effect: 'El normalizador los reencamina a clima para no puntuarlos como ocasión, pero el campo sigue mal en el backend.',
    };
  },

  function occasionsUnmapped(product, n) {
    if (!n.occasions.unmapped.length) return null;
    return {
      code: 'occasions_unknown_values', severity: 'low', kind: 'suspicious',
      field: 'fragrance.occasions', raw: JSON.stringify(n.occasions.unmapped), normalized: 'ignorados',
      message: `Valores de ocasión sin equivalente canónico: ${n.occasions.unmapped.join(', ')}.`,
      fixField: 'fragrance.occasions',
      effect: 'Se ignoran (no se adivinan), así que aportan cero a la puntuación.',
    };
  },

  /* — Climate — */
  function climatesAbsent(product, n) {
    if (n.climates.present) return null;
    return {
      code: 'climates_absent', severity: 'high', kind: 'missing',
      field: 'fragrance.climates', raw: JSON.stringify(n.climates.raw), normalized: '[]',
      message: 'No hay clima ni temporada.',
      fixField: 'fragrance.climates',
      effect: 'La pregunta de clima no puede evaluarse: pierde 16/100 de cobertura.',
    };
  },

  function climatesUnmapped(product, n) {
    if (!n.climates.unmapped.length) return null;
    return {
      code: 'climates_unknown_values', severity: 'low', kind: 'suspicious',
      field: 'fragrance.climates', raw: JSON.stringify(n.climates.unmapped), normalized: 'ignorados',
      message: `Valores de clima sin equivalente canónico: ${n.climates.unmapped.join(', ')}.`,
      fixField: 'fragrance.climates',
      effect: 'Se ignoran; el clima se evalúa sólo con los valores reconocidos.',
    };
  },

  /* — Olfactive family — */
  function familyNotNormalized(product, n) {
    const hasNormalized = Boolean(product?.fragrance?.scent_family_normalized);
    if (hasNormalized || !n.families.present) return null;
    return {
      code: 'scent_family_not_normalized', severity: 'medium', kind: 'missing',
      field: 'fragrance.scent_family_normalized',
      raw: String(product?.fragrance?.family ?? product?.fragrance?.fragrance_family ?? ''),
      normalized: JSON.stringify(n.families.values),
      message: 'Falta scent_family_normalized; la familia se deduce del texto libre de `family` y de los acordes.',
      fixField: 'fragrance.scent_family_normalized',
      effect: 'La familia se lee bien en la práctica, pero depende de parsear texto libre: un cambio de redacción arriba la rompe.',
    };
  },

  function familyAbsent(product, n) {
    if (n.families.present) return null;
    return {
      code: 'family_absent', severity: 'medium', kind: 'missing',
      field: 'fragrance.scent_family_normalized', raw: null, normalized: '[]',
      message: 'No hay familia olfativa ni acordes reconocibles.',
      fixField: 'fragrance.scent_family_normalized + fragrance.accords',
      effect: 'Si el cliente filtra por perfil de aroma, este producto no puede evaluarse en esa dimensión.',
    };
  },

  /* — Descriptive tag lists — */
  function tagsAbsent(product, n) {
    if (n.tags.values.length) return null;
    return {
      code: 'style_and_recommendation_tags_absent', severity: 'medium', kind: 'missing',
      field: 'fragrance.style_tags + fragrance.recommendation_tags', raw: '[]', normalized: '[]',
      message: 'No hay style_tags ni recommendation_tags: falta toda la evidencia corroborativa.',
      fixField: 'fragrance.recommendation_tags',
      effect: 'Se pierde toda la evidencia corroborativa: cada dimensión queda a media cobertura aunque tenga scores.',
    };
  },

  function moodsAbsent(product, n) {
    if (n.moods.values.length) return null;
    return {
      code: 'moods_absent', severity: 'medium', kind: 'missing',
      field: 'fragrance.moods', raw: '[]', normalized: '[]',
      message: 'No hay ningún mood (moderno, juvenil, elegante, maduro, serio…).',
      fixField: 'fragrance.moods',
      effect: 'La afinidad por edad se queda sin su única fuente de vocabulario (juvenil, moderno, elegante, maduro, serio).',
    };
  },

  /* — Commercial / operational — */
  function concentrationMissing(product) {
    if (product?.concentration) return null;
    return {
      code: 'concentration_missing', severity: 'low', kind: 'missing',
      field: 'concentration', raw: null, normalized: null,
      message: 'Sin concentración (EDT / EDP / Parfum / Extrait / Elixir).',
      fixField: 'concentration',
      effect: 'Dos productos con el mismo nombre base no se distinguen en la tarjeta ni en el buscador.',
    };
  },

  function notSellable(product, n) {
    if (n.offer.sellable) return null;
    return {
      code: 'not_sellable', severity: 'high', kind: 'blocking',
      field: 'variants[].stock / variants[].available',
      raw: JSON.stringify(_variants(product).map(v => ({ ml: v.size ?? v.ml, stock: v.stock }))),
      normalized: 'sin variante comprable',
      message: 'Ninguna variante tiene stock disponible.',
      fixField: 'variants[].stock',
      effect: 'Excluida de recomendaciones, de "Más vendidos" y del top 3 (regla dura: nunca recomendamos agotados).',
    };
  },

  function missingCoreSizes(product, n) {
    if (!n.offer.sellable || n.offer.hasAllCoreSizes) return null;
    const missing = PRIMARY_SIZES.filter(size => !n.offer.coreSizes.includes(size));
    return {
      code: 'missing_core_presentation', severity: 'medium', kind: 'missing',
      field: 'variants[].ml', raw: JSON.stringify(n.offer.orderableSizes),
      normalized: JSON.stringify(n.offer.coreSizes),
      message: `Faltan presentaciones comprables de ${missing.join(', ')} ml.`,
      fixField: 'variants (stock de 3 / 5 / 10 ml)',
      effect: 'La tienda promete 3, 5 y 10 ml: este producto no puede cumplir la talla sugerida para la edad elegida.',
    };
  },

  function variantWithoutId(product) {
    const broken = _variants(product).filter(v => {
      const orderable = (v.availability ?? v.stock ?? 0) > 0 && !v.soldOut;
      const id = String(v.variant_id ?? '').trim();
      return orderable && (!id || id === 'null' || id === 'undefined');
    });
    if (!broken.length) return null;
    return {
      code: 'variant_without_id', severity: 'critical', kind: 'blocking',
      field: 'variants[].id', raw: JSON.stringify(broken.map(v => v.size ?? v.ml)), normalized: 'no comprable',
      message: 'Hay variantes con stock pero sin variant_id, así que no se pueden pedir.',
      fixField: 'variants[].id',
      effect: 'El botón de compra queda muerto para esas presentaciones; la variante se excluye de la oferta.',
    };
  },

  function badgeContradictsStock(product) {
    const badge = normalizeToken(product?.badge);
    const stock = Number(product?.stock);
    if (!badge || !Number.isFinite(stock)) return null;
    const claimsScarcity = badge.includes('ultimas') || badge.includes('last');
    if (claimsScarcity && stock >= 20) {
      return {
        code: 'badge_contradicts_stock', severity: 'medium', kind: 'contradiction',
        field: 'badge vs stock', raw: `${product.badge} / stock ${stock}`, normalized: 'badge ignorado',
        message: `El badge dice escasez ("${product.badge}") con ${stock} unidades en stock.`,
        fixField: 'badge',
        effect: 'Escasez falsa. La tarjeta usa el estado real de stock, así que el badge sólo daña la credibilidad.',
      };
    }
    if (stock <= 0 && badge && !badge.includes('agotado')) {
      return {
        code: 'badge_on_sold_out', severity: 'medium', kind: 'contradiction',
        field: 'badge vs stock', raw: `${product.badge} / stock 0`, normalized: 'agotado',
        message: `El badge dice "${product.badge}" en un producto agotado.`,
        fixField: 'badge',
        effect: 'Ninguno en recomendaciones (el agotado ya está excluido), pero contradice la ficha.',
      };
    }
    return null;
  },

  /* — Tag ↔ score contradictions. These are the checks that would have
       caught the Torino-21 class of problem from the data side. — */
  function nightTagVsNightScore(product, n) {
    if (!n.occasions.values.includes('noche')) return null;
    const nightOut = scoreOf(n, 'night_out');
    if (nightOut === null || nightOut > 0.32) return null;
    return {
      code: 'night_tag_vs_low_night_score', severity: 'high', kind: 'contradiction',
      field: 'fragrance.occasions vs fragrance.scores.night_out',
      raw: `occasions incluye "noche" / night_out ${Math.round(nightOut * 100)}`,
      normalized: 'contradicción',
      message: 'Está etiquetada para noche pero su score night_out la desmiente.',
      fixField: 'fragrance.occasions o fragrance.scores.night_out',
      effect: 'Excluida de las recomendaciones de noche por contradicción dura: no se recomienda por un tag aislado.',
    };
  },

  function officeTagVsOfficeScore(product, n) {
    if (!n.occasions.values.includes('oficina')) return null;
    const officeSafe = scoreOf(n, 'office_safe');
    const projection = scoreOf(n, 'projection');
    if (officeSafe !== null && officeSafe <= 0.3) {
      return {
        code: 'office_tag_vs_low_office_safe', severity: 'high', kind: 'contradiction',
        field: 'fragrance.occasions vs fragrance.scores.office_safe',
        raw: `occasions incluye "oficina" / office_safe ${Math.round(officeSafe * 100)}`,
        normalized: 'contradicción',
        message: 'Etiquetada para oficina pero office_safe la desmiente.',
        fixField: 'fragrance.occasions o fragrance.scores.office_safe',
        effect: 'Excluida de las recomendaciones de oficina por contradicción dura.',
      };
    }
    if (projection !== null && projection >= 0.92) {
      return {
        code: 'office_tag_vs_extreme_projection', severity: 'medium', kind: 'contradiction',
        field: 'fragrance.occasions vs fragrance.scores.projection',
        raw: `occasions incluye "oficina" / projection ${Math.round(projection * 100)}`,
        normalized: 'contradicción',
        message: 'Etiquetada para oficina con una proyección extrema.',
        fixField: 'fragrance.scores.projection o fragrance.occasions',
        effect: 'Excluida de las recomendaciones de oficina.',
      };
    }
    return null;
  },

  function climateTagVsClimateScore(product, n) {
    const summer = scoreOf(n, 'summer');
    const cold = scoreOf(n, 'cold_weather');
    if (summer === null || cold === null) return null;

    if (n.climates.values.includes('calido') && summer <= 0.3) {
      return {
        code: 'warm_tag_vs_low_summer_score', severity: 'high', kind: 'contradiction',
        field: 'fragrance.climates vs fragrance.scores.summer',
        raw: `climates incluye "calido" / summer ${Math.round(summer * 100)}`,
        normalized: 'contradicción',
        message: 'Etiquetada para clima cálido pero su score de verano la desmiente.',
        fixField: 'fragrance.climates o fragrance.scores.summer',
        effect: 'Puntúa mal en la dimensión de clima cálido pese al tag; la evidencia numérica manda.',
      };
    }
    if (n.climates.values.includes('frio') && cold <= 0.3) {
      return {
        code: 'cold_tag_vs_low_cold_score', severity: 'high', kind: 'contradiction',
        field: 'fragrance.climates vs fragrance.scores.cold_weather',
        raw: `climates incluye "frio" / cold_weather ${Math.round(cold * 100)}`,
        normalized: 'contradicción',
        message: 'Etiquetada para clima frío pero su score de frío la desmiente.',
        fixField: 'fragrance.climates o fragrance.scores.cold_weather',
        effect: 'Puntúa mal en la dimensión de clima frío pese al tag.',
      };
    }
    return null;
  },

  function schoolTagVsIntensity(product, n) {
    if (!n.occasions.values.includes('escuela')) return null;
    const intensity = scoreOf(n, 'intensity');
    if (intensity === null || intensity < 0.85) return null;
    return {
      code: 'school_tag_vs_high_intensity', severity: 'medium', kind: 'contradiction',
      field: 'fragrance.occasions vs fragrance.scores.intensity',
      raw: `occasions incluye "escuela" / intensity ${Math.round(intensity * 100)}`,
      normalized: 'contradicción',
      message: 'Recomendada para la escuela con una intensidad muy alta.',
      fixField: 'fragrance.occasions o fragrance.scores.intensity',
      effect: 'Baja su afinidad para uso diario/escuela; puede quedar fuera del top por contradicción de intensidad.',
    };
  },

  function giftTagVsAppeal(product, n) {
    if (!n.occasions.values.includes('regalo')) return null;
    const blind = scoreOf(n, 'blind_buy_safe');
    if (blind === null || blind > 0.28) return null;
    return {
      code: 'gift_tag_vs_risky_blind_buy', severity: 'medium', kind: 'contradiction',
      field: 'fragrance.occasions vs fragrance.scores.blind_buy_safe',
      raw: `occasions incluye "regalo" / blind_buy_safe ${Math.round(blind * 100)}`,
      normalized: 'contradicción',
      message: 'Marcada como regalo aunque el backend la considera arriesgada a ciegas.',
      fixField: 'fragrance.occasions o fragrance.scores.blind_buy_safe',
      effect: 'Excluida de las recomendaciones de regalo por contradicción dura.',
    };
  },
];

/* Variants can arrive as anything at all from a broken payload; the auditor
   must survive that and report it rather than crash the page it runs on. */
function _variants(product) {
  return Array.isArray(product?.variants) ? product.variants.filter(Boolean) : [];
}

/* ── Runner ───────────────────────────────────────────────────────── */

/** Audit one product. Pure. */
export function auditProduct(product) {
  const n = normalizeProduct(product);
  const issues = [];

  for (const rule of RULES) {
    const result = rule(product, n);
    if (!result) continue;
    for (const issue of [].concat(result)) issues.push(issue);
  }

  issues.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const kinds = new Set(issues.map(i => i.kind));
  const classifications = [];
  if (kinds.has('blocking')) classifications.push('no_apta_para_alta_confianza');
  if (kinds.has('contradiction')) classifications.push('contradictoria');
  if (kinds.has('suspicious')) classifications.push('sospechosa');
  if (kinds.has('missing')) classifications.push('incompleta');
  if (!classifications.length) classifications.push('valida');

  return {
    id: n.id,
    name: n.name,
    house: n.house,
    gender: { raw: n.gender.raw, normalized: n.gender.value },
    /* The classification is the most severe bucket that applies; the full
       list is kept so a product can be reported as both contradictory and
       incomplete without one hiding the other. */
    classification: CLASSIFICATIONS.find(c => classifications.includes(c)) ?? 'valida',
    classifications,
    issues,
    worstSeverity: issues.length ? issues[0].severity : null,
    normalized: {
      gender: n.gender.value,
      occasions: n.occasions.values,
      occasionStrength: n.occasions.strength,
      climates: n.climates.values,
      climateStrength: n.climates.strength,
      seasons: n.seasons.values,
      families: n.families.values,
      moods: n.moods.values,
      scoreKeys: Object.keys(n.scores).sort(),
      orderableSizes: n.offer.orderableSizes,
      sellable: n.offer.sellable,
    },
  };
}

/** Audit the whole catalog. */
export function auditCatalog(products = []) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const rows = list.map(auditProduct);

  const byClassification = {};
  for (const key of CLASSIFICATIONS) byClassification[key] = [];
  for (const row of rows) byClassification[row.classification].push(row.id);

  const bySeverity = {};
  const byCode = {};
  for (const row of rows) {
    for (const issue of row.issues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
    }
  }

  return {
    products: rows,
    summary: {
      total: rows.length,
      clean: rows.filter(r => r.classification === 'valida').length,
      withIssues: rows.filter(r => r.issues.length).length,
      recommendable: rows.filter(r => !r.classifications.includes('no_apta_para_alta_confianza')).length,
      byClassification: Object.fromEntries(
        Object.entries(byClassification).map(([key, ids]) => [key, ids.length]),
      ),
      bySeverity,
      byCode,
    },
    byClassification,
  };
}

/* ── Exports for humans ───────────────────────────────────────────── */

const CSV_COLUMNS = [
  'product_id', 'name', 'house', 'classification', 'severity', 'code',
  'field', 'raw_value', 'normalized_value', 'problem', 'fix_in_rsupplyos',
  'effect_on_recommendations',
];

function _csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Flat CSV, one row per issue — the version to paste into a spreadsheet. */
export function formatAuditCsv(report) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of report.products) {
    for (const issue of row.issues) {
      lines.push([
        row.id, row.name, row.house, row.classification, issue.severity, issue.code,
        issue.field, issue.raw, issue.normalized, issue.message, issue.fixField, issue.effect,
      ].map(_csvCell).join(','));
    }
  }
  return lines.join('\n');
}

/** Readable report, grouped by severity then product. */
export function formatAuditMarkdown(report) {
  const out = [];
  const s = report.summary;

  out.push('# Auditoría de metadata del catálogo — RDecants / R Supply OS', '');
  out.push(`- Productos auditados: **${s.total}**`);
  out.push(`- Sin ningún hallazgo: **${s.clean}**`);
  out.push(`- Con hallazgos: **${s.withIssues}**`);
  out.push(`- Aptos para recomendaciones de alta confianza: **${s.recommendable}**`, '');

  out.push('## Clasificación', '');
  out.push('| Clasificación | Productos |', '| --- | --- |');
  for (const key of CLASSIFICATIONS) {
    out.push(`| ${CLASSIFICATION_LABELS[key]} | ${s.byClassification[key] ?? 0} |`);
  }
  out.push('');

  out.push('## Hallazgos por tipo', '');
  out.push('| Código | Casos |', '| --- | --- |');
  for (const [code, count] of Object.entries(s.byCode).sort((a, b) => b[1] - a[1])) {
    out.push(`| \`${code}\` | ${count} |`);
  }
  out.push('');

  out.push('## Valores recibidos vs. normalizados, producto por producto', '');
  out.push('| ID | Producto | `gender_profile` → canónico | `occasions` → canónico (fuerza) | `climates` → canónico | familia → canónico | scores | ml comprables |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.products) {
    const nz = row.normalized;
    out.push([
      `\`${row.id}\``,
      `${row.house} ${row.name}`,
      `${_md(row.gender.raw)} → **${nz.gender}**`,
      `${nz.occasions.length ? nz.occasions.join(', ') : '—'} (${nz.occasionStrength})`,
      nz.climates.length ? nz.climates.join(', ') : '—',
      nz.families?.length ? nz.families.join(', ') : '—',
      nz.scoreKeys.length ? `${nz.scoreKeys.length} claves` : '**ninguno**',
      nz.orderableSizes.length ? nz.orderableSizes.join('/') : '**agotado**',
    ].join(' | ').replace(/^/, '| ') + ' |');
  }
  out.push('');

  for (const severity of SEVERITIES) {
    const rows = report.products
      .map(row => [row, row.issues.filter(i => i.severity === severity)])
      .filter(([, issues]) => issues.length);
    if (!rows.length) continue;

    out.push(`## Severidad: ${severity}`, '');
    out.push('| ID | Producto | Campo | Valor recibido | Normalizado | Problema | Corregir en R Supply OS | Efecto en recomendaciones |');
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const [row, issues] of rows) {
      for (const issue of issues) {
        out.push(`| \`${row.id}\` | ${row.house} ${row.name} | \`${issue.field}\` | ${_md(issue.raw)} | ${_md(issue.normalized)} | ${_md(issue.message)} | \`${issue.fixField}\` | ${_md(issue.effect)} |`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}

function _md(value) {
  if (value === null || value === undefined) return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
