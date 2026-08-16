/* =============================================================
   RDECANTS — RECOMMENDATION ENGINE
   Deterministic, explainable, testable. One pass, seven separated stages:

     1. normalize      recommendations/normalize.js  (canonical metadata)
     2. eligibility    hard constraints — pass or excluded, never "penalized"
     3. compatibility  per-dimension fit, weights normalized to 100
     4. confidence     how much metadata actually backs that number
     5. order          score → confidence → priority dims → stock → stable id
     6. explain        one line, built only from dimensions that scored
     7. present        finder / catalog UI (not this file)

   ── Design rules, and why ─────────────────────────────────────────

   HARD CONSTRAINTS (excluded, full stop):
     • not sellable, or no orderable variant with a real variant_id
     • gender incompatible with the answer, INCLUDING unknown gender —
       "no data" is not a match
     • a blocking metadata contradiction for an answered dimension
       (e.g. asked for "oficina", the backend says office_safe 0.10)
     • confidence below MIN_CONFIDENCE — too little metadata to claim a
       high-compatibility match
     • compatibility below HIGH_MATCH_THRESHOLD

   SOFT SIGNALS (move the score, never gate it):
     • every dimension's fit, weighted
     • stock health, featured, price — tie-breaks only, and only AFTER
       score and confidence have already been compared, so a popular or
       cheap product can never climb past a better match

   ABSENT ≠ NON-MATCHING. A dimension with no metadata is left out of the
   score's denominator, so missing data is not scored as a mismatch. But
   because leaving it out would otherwise *reward* having no data, the
   final number is scaled by confidence (see CONFIDENCE_FLOOR). An
   under-documented product can therefore never outrank an equally-fitting
   documented one.

   NO PRODUCT IS EVER NAMED. There is not one `if (name === …)` here. The
   previous engine carried a `knownHeavyNight` list of seven fragrance
   names used to fake contradictions the metadata could have expressed;
   every one of those cases is now a rule over real fields.
   ============================================================= */

import {
  normalizeProduct,
  score as scoreOf,
  meanScore,
  countTags,
  FAMILY_GROUPS,
} from './normalize.js';
import { getGenderEligibility, getGenderDisplay } from '../utils/gender.js';
import { getOperationalScore } from './scoring.js';
import { getDefaultVariant, getOrderableVariants } from '../utils/prices.js';

/* ── Tunables ─────────────────────────────────────────────────────
   Calibrated against the real 73-product catalog (see
   tests/engineCalibration.test.js, which fails if a change to these
   makes any answer combination return an empty or a padded top 3). */

/** A product must reach this compatibility (0–100) to be recommended. */
export const HIGH_MATCH_THRESHOLD = 62;

/** …and this much of the answered dimensions must actually have metadata. */
export const MIN_CONFIDENCE = 0.55;

/** Scores are scaled by CONFIDENCE_FLOOR + (1 - floor) × confidence, so a
    thin record cannot win on the dimensions it happens to document. */
export const CONFIDENCE_FLOOR = 0.6;

/** Never pad the results: fewer honest matches beats three cards. */
export const MAX_RESULTS = 3;

/* Dimension weights. Relative, renormalized over whatever the customer
   actually answered, so the reported number is always out of 100 and adding
   a question later cannot silently deflate the others. */
export const DIMENSION_WEIGHTS = {
  gender: 22,
  occasion: 26,
  goal: 22,
  climate: 16,
  family: 12,
  age: 8,
};

/* ── The answer contract ──────────────────────────────────────────
   Keys are the ones already in the catalog URL and the session handoff, so
   /catalogo.html?gender=mujer&age=15-18&occasion=noche&goal=destacar keeps
   working and nothing has to be migrated. `preference` is accepted as a
   legacy alias for `goal`. */

export const ANSWER_KEYS = ['gender', 'age', 'occasion', 'goal', 'climate', 'family', 'budget'];

/* Values the engine accepts. The customer-facing finder now offers a strict
   subset — `dia` / `salir` for occasion and `versatil` / `destacar` / `mejor`
   for goal — but every older value stays legal here, because they are still
   reachable from a shared `/catalogo.html?occasion=oficina` link, from the
   intent presets, and from a bookmarked finder result. Dropping them would
   turn a working link into an unranked catalogue. */
export const ANSWER_VALUES = {
  gender:   ['hombre', 'mujer', 'unisex'],
  age:      ['15-18', '19-24', '25-34', '35+'],
  occasion: ['dia', 'salir', 'oficina', 'cita', 'noche', 'regalo'],
  goal:     ['versatil', 'destacar', 'mejor', 'discreto'],
  climate:  ['calido', 'templado', 'frio'],
  family:   ['fresco', 'dulce', 'intenso', 'floral', 'elegante'],
};

/** Customer-facing label for any answer value — used by the editable
    "Para ti: Mujer · 15–18 · Noche · Que destaque" summary. */
export const ANSWER_LABELS = {
  gender:   { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Unisex', any: 'Cualquiera' },
  age:      { '15-18': '15–18', '19-24': '19–24', '25-34': '25–34', '35+': '35+' },
  occasion: { dia: 'De día', salir: 'Para salir', oficina: 'Oficina', cita: 'Cita', noche: 'Noche', regalo: 'Regalo' },
  goal:     { versatil: 'Oler bien', destacar: 'Que se note', mejor: 'El que mejor huele', discreto: 'Discreto' },
  climate:  { calido: 'Clima cálido', templado: 'Todo el año', frio: 'Clima frío' },
  family:   { fresco: 'Fresco', dulce: 'Dulce', intenso: 'Intenso', floral: 'Floral', elegante: 'Elegante' },
};

export const DIMENSION_LABELS = {
  gender: 'para quién',
  age: 'la edad',
  occasion: 'la ocasión',
  goal: 'lo que buscas',
  climate: 'el clima',
  family: 'el perfil de aroma',
};

/** Normalize an answer bag: legacy aliases resolved, unknown values dropped
    (never guessed), gift treated as wanting a safe pick unless stated. */
export function readAnswers(raw = {}) {
  const answers = {};
  const take = (key, value) => {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v || v === 'any') return;
    if (ANSWER_VALUES[key] && !ANSWER_VALUES[key].includes(v)) return;
    answers[key] = v;
  };

  take('gender', raw.gender);
  take('age', raw.age);
  /* `dia` used to be spelled `diario` by the intent presets. */
  take('occasion', raw.occasion === 'diario' ? 'dia' : raw.occasion);
  take('goal', raw.goal ?? raw.preference);
  take('climate', raw.climate);
  take('family', raw.family);
  if (raw.budget) answers.budget = String(raw.budget);

  /* A gift with no stated goal is a safe bet, not a loud one. Stated once
     here rather than hidden inside the scoring. */
  if (!answers.goal && answers.occasion === 'regalo') answers.goal = 'versatil';

  return answers;
}

/** Which dimensions this answer bag actually activates. */
export function activeDimensions(answers) {
  return Object.keys(DIMENSION_WEIGHTS).filter(key => answers[key]);
}

/* ══════════════════════════════════════════════════════════════════
   DIMENSION SCORERS
   Each returns { fit, coverage, evidence[], contradiction }.
     fit          0..1, or null when there is no metadata to judge with
     coverage     0..1, how much of the dimension's evidence exists
     contradiction { code, message } when the metadata actively rules the
                  product out for this answer — a HARD exclusion, only ever
                  raised from a real field, never from a product name
   ══════════════════════════════════════════════════════════════════ */

const NONE = { fit: null, coverage: 0, evidence: [], contradiction: null };

/* How strongly an occasion hit counts, by where it was authored. The
   dedicated `occasions` field is a statement; a recommendation/mood tag is
   corroboration. This is the fix for "one isolated tag made it a night
   fragrance": a tag alone reaches 0.55, never 1.0, and it still has to
   agree with the performance scores to clear the threshold. */
const OCCASION_HIT = { primaryExact: 1, primaryRelated: 0.6, tagExact: 0.55, tagRelated: 0.35 };

/* Occasion rules. `related` are occasions that genuinely corroborate;
   note what is NOT related: `cita` does not corroborate `noche`, and
   `social` corroborates neither. */
const OCCASION_RULES = {
  dia: {
    exact: ['diario', 'escuela'],
    related: ['social'],
    scores: { versatility: 0.4, office_safe: 0.2, beginner_friendly: 0.2, mass_appeal: 0.2 },
    contradiction: n => {
      const intensity = scoreOf(n, 'intensity');
      const versatility = scoreOf(n, 'versatility');
      return intensity !== null && versatility !== null && intensity >= 0.85 && versatility <= 0.5
        ? { code: 'too_intense_for_daily', message: 'demasiado intensa para uso diario' }
        : null;
    },
    phrase: 'para el día a día',
  },
  oficina: {
    exact: ['oficina'],
    related: ['diario', 'formal'],
    scores: { office_safe: 0.6, versatility: 0.25, elegance: 0.15 },
    contradiction: n => {
      const officeSafe = scoreOf(n, 'office_safe');
      const projection = scoreOf(n, 'projection');
      if (officeSafe !== null && officeSafe <= 0.3) {
        return { code: 'not_office_safe', message: 'la metadata la marca como no apta para oficina' };
      }
      if (projection !== null && projection >= 0.92) {
        return { code: 'projects_too_much_for_office', message: 'proyecta demasiado para oficina' };
      }
      return null;
    },
    phrase: 'para la oficina',
  },
  cita: {
    exact: ['cita'],
    related: ['noche', 'formal'],
    scores: { date_night: 0.55, compliment: 0.25, longevity: 0.2 },
    contradiction: n => {
      const dateNight = scoreOf(n, 'date_night');
      return dateNight !== null && dateNight <= 0.3
        ? { code: 'not_for_dates', message: 'la metadata no la respalda para citas' }
        : null;
    },
    phrase: 'para una cita',
  },
  noche: {
    exact: ['noche', 'fiesta'],
    related: ['formal'],
    scores: { night_out: 0.45, longevity: 0.2, projection: 0.2, intensity: 0.15 },
    contradiction: n => {
      const nightOut = scoreOf(n, 'night_out');
      return nightOut !== null && nightOut <= 0.32
        ? { code: 'not_for_night', message: 'la metadata no la respalda para la noche' }
        : null;
    },
    phrase: 'para la noche',
  },
  /* "Para salir" — the union of cita, noche and fiesta.
     This is not a simplification the metadata pays for. Measured against the
     live 96-product catalogue, `night_out` has TWO distinct values (85 for 47
     products, 90 for six) and `date_night` has 85 for 39 of 53, so asking
     "cita o noche?" returned an identical top three either way. The question
     was costing the customer a decision and buying nothing. Collapsing it
     keeps every signal both branches used and stops pretending to a precision
     the data does not have.

     Both `night_out` and `date_night` are read, so a product that is strong
     for one and unremarkable for the other still ranks. */
  salir: {
    exact: ['noche', 'fiesta', 'cita'],
    related: ['formal', 'social'],
    scores: { night_out: 0.3, date_night: 0.3, longevity: 0.2, compliment: 0.2 },
    contradiction: n => {
      const nightOut = scoreOf(n, 'night_out');
      const dateNight = scoreOf(n, 'date_night');
      /* Only a product the metadata rejects for BOTH modes of going out is
         contradicted. Failing one of the two is ordinary — the union is the
         whole point. */
      if (nightOut === null || dateNight === null) return null;
      return nightOut <= 0.32 && dateNight <= 0.3
        ? { code: 'not_for_going_out', message: 'la metadata no la respalda para salir' }
        : null;
    },
    phrase: 'para salir',
  },
  regalo: {
    exact: ['regalo'],
    related: ['diario', 'social'],
    scores: { mass_appeal: 0.35, blind_buy_safe: 0.3, beginner_friendly: 0.2, compliment: 0.15 },
    contradiction: n => {
      const blind = scoreOf(n, 'blind_buy_safe');
      return blind !== null && blind <= 0.28
        ? { code: 'risky_blind_buy', message: 'demasiado arriesgada para regalar a ciegas' }
        : null;
    },
    phrase: 'para regalar',
  },
};

function scoreOccasion(n, answer) {
  const rule = OCCASION_RULES[answer];
  if (!rule) return NONE;

  let tagFit = 0;
  const evidence = [];
  const seen = (list, values) => values.some(v => list.includes(v));

  if (seen(n.occasions.primary, rule.exact)) { tagFit = OCCASION_HIT.primaryExact; evidence.push('occasions'); }
  else if (seen(n.occasions.primary, rule.related)) { tagFit = OCCASION_HIT.primaryRelated; evidence.push('occasions~'); }
  else if (seen(n.occasions.secondary, rule.exact)) { tagFit = OCCASION_HIT.tagExact; evidence.push('tags'); }
  else if (seen(n.occasions.secondary, rule.related)) { tagFit = OCCASION_HIT.tagRelated; evidence.push('tags~'); }

  const keys = Object.keys(rule.scores);
  const signalFit = _weightedScore(n, rule.scores);
  if (signalFit !== null) evidence.push('scores');

  const contradiction = rule.contradiction?.(n) ?? null;

  return _blend({
    tagFit: n.occasions.present ? tagFit : null,
    signalFit,
    tagPresent: n.occasions.present,
    signalPresent: signalFit !== null,
    signalKeys: keys,
    n,
    evidence,
    contradiction,
  });
}

/* Goal rules. "destacar" and "discreto" are inverses of each other and both
   are answered from the projection / intensity / longevity / office_safe
   scores the backend already sends — the previous engine had no "discreto"
   at all and scored "destacar" off two keys plus a keyword list. */
const GOAL_RULES = {
  versatil: {
    scores: { versatility: 0.35, mass_appeal: 0.25, blind_buy_safe: 0.2, beginner_friendly: 0.2 },
    plusTags: ['versatil', 'facil_de_usar', 'limpio', 'atemporal', 'diario', 'crowdpleaser'],
    minusTags: ['polarizante', 'experimental', 'exclusivo'],
    requires: ['versatility', 'mass_appeal', 'blind_buy_safe', 'beginner_friendly'],
    requiresAtLeast: 2,
    phrase: 'fácil de usar',
  },
  destacar: {
    scores: { projection: 0.3, intensity: 0.25, longevity: 0.25, compliment: 0.2 },
    plusTags: ['alto_rendimiento', 'llamativo', 'beast_mode', 'nocturno', 'viral', 'seductor'],
    minusTags: ['discreto', 'sobrio'],
    /* "Que destaque" has to be EARNED, per the brief: enough signal of
       intensity, projection, duration or presence. With none of the three
       performance scores the dimension has no evidence at all — a
       `llamativo` tag is not a measurement — so it contributes nothing and
       drags confidence down instead of guessing. */
    requires: ['projection', 'intensity', 'longevity'],
    requiresAtLeast: 2,
    contradiction: n => {
      const projection = scoreOf(n, 'projection');
      const intensity = scoreOf(n, 'intensity');
      const longevity = scoreOf(n, 'longevity');
      const known = [projection, intensity, longevity].filter(v => v !== null);
      if (known.length < 2) return null;
      return (projection ?? 1) <= 0.45 && (intensity ?? 1) <= 0.45
        ? { code: 'cannot_stand_out', message: 'no tiene la proyección ni la intensidad para destacar' }
        : null;
    },
    phrase: 'para destacar',
  },
  /* "Quiero ser el que mejor huele."
     A claim about the RESULT — being the person people ask about — not about
     price, and deliberately not built from it. Price is not read here at all;
     it remains what it always was, a tie-break applied after score,
     confidence and every priority dimension.

     The keys were chosen by measuring how much each one actually separates
     the live catalogue, because a weight on a near-constant score is a weight
     that does nothing:

       compliment    11 distinct values, 53–80  → the real signal, so it leads
       longevity      5 distinct, genuinely bimodal (22 at 60, 28 at 80)
       exclusivity    6 distinct, but 42 of 53 sit at 80 → supporting only
       projection     6 distinct, 44 of 53 sit at 70   → light nudge only

     `elegance`, `luxury` and `uniqueness` are deliberately ABSENT despite
     sounding exactly right for this question. Each has three distinct values
     across the whole catalogue, so weighting them would add arithmetic and no
     ordering. Reintroduce them if the profiles ever carry real spread.

     `entry` and `budget_alternative` are real tags in the catalogue naming
     starter and cheaper-substitute products. They are negatives here because
     of what they say about the recommendation, not what they say about the
     price. */
  mejor: {
    scores: { compliment: 0.4, longevity: 0.25, exclusivity: 0.2, projection: 0.15 },
    plusTags: ['fragancia_firma', 'cumplidor', 'premium', 'lujoso', 'nicho', 'nicho_popular', 'elegante', 'alto_rendimiento'],
    minusTags: ['entry', 'budget_alternative', 'basico'],
    requires: ['compliment', 'longevity', 'exclusivity'],
    requiresAtLeast: 2,
    contradiction: n => {
      const compliment = scoreOf(n, 'compliment');
      const longevity = scoreOf(n, 'longevity');
      if (compliment === null) return null;
      /* Nothing that draws few compliments and fades can be the answer to
         "I want to be the best-smelling one", however good it is otherwise. */
      return compliment <= 0.55 && (longevity ?? 1) <= 0.6
        ? { code: 'not_a_standout', message: 'no destaca lo suficiente ni dura lo necesario para ser la que más se recuerda' }
        : null;
    },
    phrase: 'para ser quien mejor huele',
  },
  discreto: {
    /* Inverted keys: a low intensity/projection is a HIGH fit here. */
    scores: { office_safe: 0.35, versatility: 0.2 },
    inverseScores: { intensity: 0.25, projection: 0.2 },
    plusTags: ['limpio', 'discreto', 'profesional', 'sobrio', 'facil_de_usar', 'atemporal'],
    minusTags: ['llamativo', 'alto_rendimiento', 'beast_mode'],
    requires: ['office_safe', 'intensity', 'projection'],
    requiresAtLeast: 2,
    contradiction: n => {
      const intensity = scoreOf(n, 'intensity');
      const projection = scoreOf(n, 'projection');
      return intensity !== null && projection !== null && intensity >= 0.85 && projection >= 0.85
        ? { code: 'too_loud_for_discreet', message: 'demasiado intensa y con demasiada proyección para pasar discreta' }
        : null;
    },
    phrase: 'discreta',
  },
};

function scoreGoal(n, answer) {
  const rule = GOAL_RULES[answer];
  if (!rule) return NONE;

  /* "What result do you want" is a claim about how a fragrance performs.
     With none of the performance scores present there is no evidence to
     make it with, so the dimension reports no coverage — which pushes the
     product under MIN_CONFIDENCE rather than letting a mood tag stand in
     for a measurement. */
  const knownRequired = (rule.requires ?? []).filter(key => scoreOf(n, key) !== null).length;
  if (rule.requires && knownRequired === 0) {
    return { fit: null, coverage: 0, evidence: [], contradiction: null };
  }

  const evidence = [];
  const direct = _weightedScore(n, rule.scores);
  const inverse = rule.inverseScores ? _weightedScore(n, rule.inverseScores, { invert: true }) : null;

  let signalFit = null;
  if (direct !== null || inverse !== null) {
    const parts = [];
    const directWeight = Object.values(rule.scores).reduce((a, b) => a + b, 0);
    const inverseWeight = Object.values(rule.inverseScores ?? {}).reduce((a, b) => a + b, 0);
    if (direct !== null) parts.push([direct, directWeight]);
    if (inverse !== null) parts.push([inverse, inverseWeight]);
    const total = parts.reduce((sum, [, w]) => sum + w, 0);
    signalFit = parts.reduce((sum, [v, w]) => sum + v * w, 0) / total;
    evidence.push('scores');
  }

  /* Tags corroborate; they cannot carry the dimension on their own. */
  const plus = countTags(n, rule.plusTags);
  const minus = countTags(n, rule.minusTags);
  const tagFit = (plus || minus)
    ? Math.max(0, Math.min(1, 0.45 + Math.min(3, plus) * 0.18 - Math.min(2, minus) * 0.3))
    : null;
  if (tagFit !== null) evidence.push('tags');

  /* Partial performance data: keep the reading, but discount both the claim
     and the confidence in it rather than inventing the missing numbers. */
  let coverageScale = 1;
  if (rule.requires && knownRequired < (rule.requiresAtLeast ?? 1)) {
    coverageScale = 0.5;
    if (signalFit !== null) signalFit *= 0.75;
  }

  const blended = _blend({
    tagFit,
    signalFit,
    tagPresent: tagFit !== null,
    signalPresent: signalFit !== null,
    signalKeys: [...Object.keys(rule.scores), ...Object.keys(rule.inverseScores ?? {})],
    n,
    evidence,
    contradiction: rule.contradiction?.(n) ?? null,
    /* The scores are the real evidence for a goal; tags only nudge. */
    signalShare: 0.75,
  });

  return { ...blended, coverage: blended.coverage * coverageScale };
}

const CLIMATE_RULES = {
  calido: {
    exact: ['calido'],
    related: ['templado'],
    scores: { summer: 0.6, freshness: 0.4 },
    contradiction: n => {
      const cold = scoreOf(n, 'cold_weather');
      const summer = scoreOf(n, 'summer');
      return cold !== null && summer !== null && cold >= 0.8 && summer <= 0.35
        ? { code: 'cold_weather_only', message: 'está pensada para clima frío' }
        : null;
    },
    phrase: 'en clima cálido',
  },
  frio: {
    exact: ['frio'],
    related: ['templado'],
    scores: { cold_weather: 0.7, intensity: 0.3 },
    contradiction: n => {
      const cold = scoreOf(n, 'cold_weather');
      const summer = scoreOf(n, 'summer');
      return cold !== null && summer !== null && summer >= 0.85 && cold <= 0.3
        ? { code: 'hot_weather_only', message: 'está pensada para clima cálido' }
        : null;
    },
    phrase: 'en clima frío',
  },
  templado: {
    exact: ['templado'],
    related: ['calido', 'frio'],
    /* All-year wearability is not the average of hot and cold — it is being
       decent in BOTH and not lopsided. */
    custom: n => {
      const summer = scoreOf(n, 'summer');
      const cold = scoreOf(n, 'cold_weather');
      if (summer === null || cold === null) return null;
      const both = Math.min(summer, cold);
      const balance = 1 - Math.abs(summer - cold);
      return Math.max(0, Math.min(1, 0.6 * both * 1.25 + 0.4 * balance));
    },
    customKeys: ['summer', 'cold_weather'],
    contradiction: () => null,
    phrase: 'todo el año',
  },
};

function scoreClimate(n, answer) {
  const rule = CLIMATE_RULES[answer];
  if (!rule) return NONE;

  const evidence = [];
  let tagFit = 0;
  if (rule.exact.some(v => n.climates.primary.includes(v))) { tagFit = OCCASION_HIT.primaryExact; evidence.push('climates'); }
  else if (rule.related.some(v => n.climates.primary.includes(v))) { tagFit = OCCASION_HIT.primaryRelated; evidence.push('climates~'); }
  else if (rule.exact.some(v => n.climates.secondary.includes(v))) { tagFit = OCCASION_HIT.tagExact; evidence.push('tags'); }
  else if (rule.related.some(v => n.climates.secondary.includes(v))) { tagFit = OCCASION_HIT.tagRelated; evidence.push('tags~'); }

  const signalFit = rule.custom ? rule.custom(n) : _weightedScore(n, rule.scores);
  if (signalFit !== null) evidence.push('scores');

  return _blend({
    tagFit: n.climates.present ? tagFit : null,
    signalFit,
    tagPresent: n.climates.present,
    signalPresent: signalFit !== null,
    signalKeys: rule.customKeys ?? Object.keys(rule.scores ?? {}),
    n,
    evidence,
    contradiction: rule.contradiction?.(n) ?? null,
  });
}

/* Age. R Supply OS sends NO age field — this is stated plainly rather than
   invented. What it does send is a mood vocabulary that carries real
   audience signal (`juvenil` on 33 products, `maduro`, `serio`, `elegante`,
   `profesional`) plus beginner_friendly / luxury / exclusivity scores. Age
   is therefore an affinity signal on the smallest weight of any dimension,
   and it can never make a product ineligible: no fragrance is forbidden by
   an age. It also still decides which size to suggest first. */
const AGE_RULES = {
  '15-18': {
    moods: { juvenil: 1, fresco: 0.55, dulce: 0.5, moderno: 0.5, social: 0.45 },
    scores: { beginner_friendly: 0.5, mass_appeal: 0.3, blind_buy_safe: 0.2 },
    starterMl: 3,
    phrase: 'para tu edad',
  },
  '19-24': {
    moods: { social: 1, juvenil: 0.8, moderno: 0.7, seductor: 0.45, llamativo: 0.4 },
    scores: { mass_appeal: 0.4, compliment: 0.3, beginner_friendly: 0.3 },
    starterMl: 5,
    phrase: 'para tu edad',
  },
  '25-34': {
    moods: { moderno: 1, elegante: 0.75, profesional: 0.6, sensual: 0.5, limpio: 0.45 },
    scores: { versatility: 0.4, elegance: 0.3, compliment: 0.3 },
    starterMl: 5,
    phrase: 'para tu edad',
  },
  '35+': {
    moods: { maduro: 1, elegante: 0.95, serio: 0.8, profesional: 0.6, misterioso: 0.45 },
    scores: { elegance: 0.4, luxury: 0.3, exclusivity: 0.3 },
    starterMl: 5,
    phrase: 'para tu edad',
  },
};

export function suggestedStarterMl(age) {
  return AGE_RULES[String(age ?? '')]?.starterMl ?? 5;
}

export { AGE_RULES };

function scoreAge(n, answer) {
  const rule = AGE_RULES[answer];
  if (!rule) return NONE;

  const evidence = [];
  const moods = n.moods.values;
  let moodFit = null;
  if (moods.length) {
    moodFit = 0;
    for (const [mood, weight] of Object.entries(rule.moods)) {
      if (moods.includes(mood)) moodFit = Math.max(moodFit, weight);
    }
    evidence.push('moods');
  }

  const signalFit = _weightedScore(n, rule.scores);
  if (signalFit !== null) evidence.push('scores');

  return _blend({
    tagFit: moodFit,
    signalFit,
    tagPresent: moods.length > 0,
    signalPresent: signalFit !== null,
    signalKeys: Object.keys(rule.scores),
    n,
    evidence,
    contradiction: null,   /* age never excludes a fragrance */
    signalShare: 0.5,
  });
}

const FAMILY_SCORES = {
  fresco: { freshness: 1 },
  dulce: { sweetness: 1 },
  intenso: { intensity: 1 },
  elegante: { elegance: 1 },
  floral: null,
};

const FAMILY_PHRASES = {
  fresco: 'perfil fresco',
  dulce: 'perfil dulce',
  intenso: 'perfil intenso',
  floral: 'perfil floral',
  elegante: 'perfil elegante',
};

function scoreFamily(n, answer) {
  const group = FAMILY_GROUPS[answer];
  if (!group) return NONE;

  const evidence = [];
  let tagFit = null;
  if (n.families.present) {
    const hits = group.filter(family => n.families.values.includes(family)).length;
    tagFit = hits === 0 ? 0 : hits === 1 ? 0.75 : 1;
    evidence.push('families');
  }

  const scoreSpec = FAMILY_SCORES[answer];
  const signalFit = scoreSpec ? _weightedScore(n, scoreSpec) : null;
  if (signalFit !== null) evidence.push('scores');

  return _blend({
    tagFit,
    signalFit,
    tagPresent: n.families.present,
    signalPresent: signalFit !== null,
    signalKeys: Object.keys(scoreSpec ?? {}),
    n,
    evidence,
    contradiction: null,
    /* The declared family is the stronger evidence here; the score is a
       corroborating intensity reading. */
    signalShare: 0.4,
  });
}

function scoreGender(n, answer, eligibility) {
  if (!answer) return NONE;
  const display = getGenderDisplay(n.gender.value);
  return {
    fit: n.gender.present ? eligibility.weight : null,
    coverage: n.gender.present ? 1 : 0,
    evidence: n.gender.present ? ['gender_profile'] : [],
    contradiction: null,   /* handled as a hard constraint, not a penalty */
    label: display?.label ?? null,
    priority: eligibility.priority,
  };
}

/* ── Blending helpers ─────────────────────────────────────────────
   Tag evidence and numeric evidence are combined, not summed: a dimension
   backed by both is worth full coverage; one backed by only one of them is
   worth half, which is how "we only have a tag for this" reaches the
   confidence gate instead of masquerading as certainty. */
function _blend({
  tagFit, signalFit, tagPresent, signalPresent, signalKeys, n,
  evidence, contradiction, signalShare = 0.55,
}) {
  const tagShare = 1 - signalShare;

  if (tagPresent && signalPresent) {
    return {
      fit: tagShare * (tagFit ?? 0) + signalShare * (signalFit ?? 0),
      coverage: 1,
      evidence,
      contradiction,
    };
  }
  if (signalPresent) {
    return { fit: signalFit, coverage: 0.5 * _scoreKeyCoverage(n, signalKeys) + 0.25, evidence, contradiction };
  }
  if (tagPresent) {
    return { fit: tagFit, coverage: 0.5, evidence, contradiction };
  }
  return { fit: null, coverage: 0, evidence: [], contradiction };
}

function _scoreKeyCoverage(n, keys) {
  if (!keys?.length) return 0.5;
  return keys.filter(key => scoreOf(n, key) !== null).length / keys.length;
}

/* Weighted mean over ONLY the score keys the backend actually sent. Returns
   null when none of them exist — never 0, which would read as "bad fit". */
function _weightedScore(n, spec, { invert = false } = {}) {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(spec ?? {})) {
    const value = scoreOf(n, key);
    if (value === null) continue;
    sum += (invert ? 1 - value : value) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}

/* ══════════════════════════════════════════════════════════════════
   STAGE 2–4 — evaluate one product against one answer bag
   ══════════════════════════════════════════════════════════════════ */

/**
 * Full, inspectable verdict for a single product. Pure; safe to call from
 * tests and from the audit report.
 *
 * @returns {{
 *   product, normalized, eligible, exclusions: string[],
 *   compatibility: number, rawFit: number, confidence: number,
 *   breakdown: Record<string, {weight, fit, coverage, contribution, evidence}>,
 *   variant, genderPriority, operational
 * }}
 */
export function evaluateProduct(product, rawAnswers = {}) {
  const answers = readAnswers(rawAnswers);
  const n = normalizeProduct(product);
  const exclusions = [];

  /* — Hard: can we sell it at all? — */
  const orderable = getOrderableVariants(product).filter(v => _hasVariantId(v));
  if (!n.offer.sellable || !orderable.length) exclusions.push('sin_stock');

  /* — Hard: budget, when one was given. A price band is a constraint on
       what can be bought, not a compatibility dimension, so it selects the
       variant and excludes the product when nothing fits — it never moves
       the score. Not asked by the finder; carried in the URL contract. */
  const budgetVariant = _variantForBudget(product, orderable, answers.budget);
  if (answers.budget && answers.budget !== 'any' && !budgetVariant) exclusions.push('fuera_de_presupuesto');

  /* — Hard: gender — */
  const eligibility = getGenderEligibility(product, answers.gender);
  if (answers.gender && !eligibility.eligible) {
    exclusions.push(eligibility.priority === 'unknown' ? 'genero_desconocido' : 'genero_incompatible');
  }

  /* — Per-dimension fit — */
  const dims = {
    gender: answers.gender ? scoreGender(n, answers.gender, eligibility) : null,
    occasion: answers.occasion ? scoreOccasion(n, answers.occasion) : null,
    goal: answers.goal ? scoreGoal(n, answers.goal) : null,
    climate: answers.climate ? scoreClimate(n, answers.climate) : null,
    family: answers.family ? scoreFamily(n, answers.family) : null,
    age: answers.age ? scoreAge(n, answers.age) : null,
  };

  const breakdown = {};
  let weightedFit = 0;
  let coveredWeight = 0;
  let activeWeight = 0;
  let coverageSum = 0;

  for (const [key, result] of Object.entries(dims)) {
    if (!result) continue;
    const weight = DIMENSION_WEIGHTS[key];
    activeWeight += weight;
    coverageSum += weight * result.coverage;

    if (result.contradiction) exclusions.push(`contradice_${key}`);

    const fit = result.fit;
    if (result.coverage > 0 && fit !== null) {
      weightedFit += weight * fit;
      coveredWeight += weight;
    }

    breakdown[key] = {
      weight,
      fit: fit === null ? null : _round(fit, 3),
      coverage: _round(result.coverage, 3),
      contribution: result.coverage > 0 && fit !== null ? _round(weight * fit, 2) : 0,
      evidence: result.evidence ?? [],
      contradiction: result.contradiction ?? null,
      label: result.label ?? null,
    };
  }

  const rawFit = coveredWeight > 0 ? weightedFit / coveredWeight : 0;
  const confidence = activeWeight > 0 ? coverageSum / activeWeight : 0;
  /* Scaling by confidence is what stops a thin record from winning on the
     handful of dimensions it happens to document. */
  const compatibility = _round(
    100 * rawFit * (CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * confidence),
    1,
  );

  if (activeWeight > 0 && confidence < MIN_CONFIDENCE) exclusions.push('metadata_insuficiente');
  if (activeWeight > 0 && compatibility < HIGH_MATCH_THRESHOLD) exclusions.push('compatibilidad_baja');

  return {
    product,
    normalized: n,
    eligible: exclusions.length === 0,
    exclusions,
    compatibility,
    rawFit: _round(rawFit, 3),
    confidence: _round(confidence, 3),
    breakdown,
    variant: budgetVariant ?? getDefaultVariant(product),
    genderPriority: eligibility.priority,
    operational: getOperationalScore(product),
  };
}

function _hasVariantId(variant) {
  const id = String(variant?.variant_id ?? '').trim();
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}

const BUDGET_RANGES = {
  low: [0, 150],
  mid: [150, 250],
  high: [250, Infinity],
  any: [0, Infinity],
};

function _variantForBudget(product, orderable, budget) {
  if (!budget || budget === 'any') return getDefaultVariant(product);
  const range = BUDGET_RANGES[budget];
  if (!range) return getDefaultVariant(product);
  const [min, max] = range;
  const inRange = variant => {
    const price = Number(variant?.price);
    return Number.isFinite(price) && price >= min && price <= max;
  };
  const preferred = getDefaultVariant(product);
  if (inRange(preferred)) return preferred;
  return orderable.find(inRange) ?? null;
}

/* ══════════════════════════════════════════════════════════════════
   STAGE 5 — ordering
   Score first. Confidence second. Only then the priority dimensions,
   stock health and price. Nothing commercial can jump a better match,
   because nothing commercial is compared until everything about the match
   is already equal.
   ══════════════════════════════════════════════════════════════════ */

const PRIORITY_ORDER = ['gender', 'occasion', 'goal', 'climate', 'family', 'age'];
const GENDER_RANK = { primary: 0, secondary: 1, weak: 2, unknown: 3, rejected: 4 };

export function compareEvaluations(a, b) {
  if (b.compatibility !== a.compatibility) return b.compatibility - a.compatibility;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;

  const rankA = GENDER_RANK[a.genderPriority] ?? 3;
  const rankB = GENDER_RANK[b.genderPriority] ?? 3;
  if (rankA !== rankB) return rankA - rankB;

  for (const key of PRIORITY_ORDER) {
    const fitA = a.breakdown[key]?.fit ?? -1;
    const fitB = b.breakdown[key]?.fit ?? -1;
    if (fitA !== fitB) return fitB - fitA;
  }

  if (b.operational !== a.operational) return b.operational - a.operational;

  const priceA = Number(a.variant?.price ?? Infinity);
  const priceB = Number(b.variant?.price ?? Infinity);
  if (priceA !== priceB) return priceA - priceB;

  return String(a.product.id).localeCompare(String(b.product.id));
}

/* ══════════════════════════════════════════════════════════════════
   STAGE 6 — explanation
   Built ONLY from dimensions that actually contributed points, ordered by
   how much they contributed. No percentages, no invented notes, no
   performance claim the scores do not support.
   ══════════════════════════════════════════════════════════════════ */

const MIN_PHRASE_FIT = 0.6;

/* Traits are adjectival ("perfil femenino"); contexts answer "for what"
   ("para la noche"). They are joined differently. */
function _phraseFor(key, answers, entry, normalized) {
  if (!entry || entry.coverage <= 0 || entry.fit === null || entry.fit < MIN_PHRASE_FIT) return null;

  switch (key) {
    case 'occasion': return { kind: 'context', text: OCCASION_RULES[answers.occasion]?.phrase };
    case 'goal':     return { kind: answers.goal === 'destacar' ? 'context' : 'trait', text: GOAL_RULES[answers.goal]?.phrase };
    case 'climate':  return { kind: 'context', text: CLIMATE_RULES[answers.climate]?.phrase };
    case 'age':      return { kind: 'context', text: AGE_RULES[answers.age]?.phrase };
    case 'family':   return { kind: 'trait', text: FAMILY_PHRASES[answers.family] };
    case 'gender': {
      const label = entry.label;
      if (!label) return null;
      const map = { Hombre: 'perfil masculino', Mujer: 'perfil femenino', Unisex: 'perfil unisex' };
      return { kind: 'trait', text: map[label] };
    }
    default: return null;
  }
}

/* One extra, honest performance trait — only when a score the customer's
   own answer already asked about is genuinely high. */
function _performanceTrait(normalized, answers) {
  const wantsPerformance = answers.goal === 'destacar' || answers.occasion === 'noche' || answers.occasion === 'cita';
  if (!wantsPerformance) return null;
  const longevity = scoreOf(normalized, 'longevity');
  if (longevity !== null && longevity >= 0.78) return { kind: 'trait', text: 'con buena duración' };
  return null;
}

function _joinEs(list) {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

/* "perfil femenino" + "perfil dulce" reads as one idea, not two, so the
   repeated noun is collapsed: "perfil femenino y dulce". Without this the
   line came out as "Perfil femenino y perfil dulce", which is the kind of
   machine phrasing that makes a real recommendation sound generated. */
function _collapseProfileTraits(traits) {
  const profiles = [];
  const rest = [];
  for (const trait of traits) {
    if (trait.startsWith('perfil ')) profiles.push(trait.slice('perfil '.length));
    else rest.push(trait);
  }
  return profiles.length ? [`perfil ${_joinEs(profiles)}`, ...rest] : rest;
}

/* Trait clauses are joined with "y" — unless one of them already contains a
   "y" from the profile collapse above, in which case a comma keeps the
   sentence from stuttering ("perfil femenino y dulce, con buena duración"). */
function _joinTraits(list) {
  if (list.length <= 1) return list[0] ?? '';
  return list.some(text => text.includes(' y ')) ? list.join(', ') : _joinEs(list);
}

export function explain(evaluation, rawAnswers = {}, { rank = 1 } = {}) {
  const answers = readAnswers(rawAnswers);
  const ordered = Object.entries(evaluation.breakdown)
    .filter(([, entry]) => entry.contribution > 0)
    .sort((a, b) => b[1].contribution - a[1].contribution);

  const phrases = ordered
    .map(([key, entry]) => _phraseFor(key, answers, entry, evaluation.normalized))
    .filter(p => p && p.text);

  const performance = _performanceTrait(evaluation.normalized, answers);
  if (performance) phrases.push(performance);

  const contexts = _dedupe(phrases.filter(p => p.kind === 'context').map(p => p.text)).slice(0, 2);
  const traits = _collapseProfileTraits(
    _dedupe(phrases.filter(p => p.kind === 'trait').map(p => p.text)).slice(0, 3),
  ).slice(0, 2);

  if (!contexts.length && !traits.length) {
    /* Nothing scored high enough to claim anything specific. Say the true,
       minimal thing rather than a generic compliment. */
    return 'Compatible con tus respuestas, con margen para explorar más.';
  }

  const lead = rank === 1 ? 'La mejor coincidencia' : 'Buena coincidencia';
  if (contexts.length) {
    const head = `${lead} ${_joinEs(contexts)}`;
    return traits.length ? `${head}. ${_capitalize(_joinTraits(traits))}.` : `${head}.`;
  }
  return `${_capitalize(_joinTraits(traits))}.`;
}

function _dedupe(list) { return [...new Set(list.filter(Boolean))]; }
function _capitalize(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }
function _round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */

/**
 * Rank a catalog against an answer bag.
 *
 * @returns {{
 *   answers, results, all, excluded, notices: string[],
 *   relaxation: {dimension, label, gained} | null,
 *   thresholds: {highMatch, minConfidence}
 * }}
 *
 * `results` are the matches that cleared every hard constraint and both
 * gates, best first. It is never padded: two strong matches return two.
 * `relaxation` names the ONE condition whose removal would help most, so
 * the UI can offer it explicitly instead of quietly loosening the rules.
 */
export function rankCatalog(products, rawAnswers = {}, { limit = Infinity } = {}) {
  const answers = readAnswers(rawAnswers);
  const list = Array.isArray(products) ? products.filter(Boolean) : [];

  const all = list.map(product => evaluateProduct(product, answers));
  const results = all
    .filter(e => e.eligible)
    .filter(e => _survivesEveryRefinementSubset(e.product, answers))
    .sort(compareEvaluations);
  /* `excluded` stays the raw per-product verdict for the full answer set —
     it is diagnostic (the auditor and the "why not" copy read it), and a
     product dropped by the monotonicity rule below was genuinely eligible
     under these answers. Calling it "excluded" would misreport why. */
  const excluded = all.filter(e => !e.eligible);

  const notices = [];
  if (!list.length) notices.push('catalogo_vacio');
  if (answers.gender && results.length && results.every(e => e.genderPriority === 'weak')) {
    notices.push('solo_perfiles_compatibles');
  }
  if (list.length && !results.length) notices.push('sin_coincidencias');

  return {
    answers,
    results: Number.isFinite(limit) ? results.slice(0, limit) : results,
    total: results.length,
    all,
    excluded,
    notices,
    relaxation: results.length ? null : _bestRelaxation(list, answers),
    thresholds: { highMatch: HIGH_MATCH_THRESHOLD, minConfidence: MIN_CONFIDENCE },
  };
}

/* =============================================================
   MONOTONIC REFINEMENT — adding an answer may only take products away

   ── The defect ─────────────────────────────────────────────────────
   `De día` matched 33 products. `De día` + `Caballero` matched 48.

   `compatibility` is a weighted AVERAGE of per-dimension fit, so adding a
   dimension a product scores WELL on raises its average. ERBA PURA went
   from 43.8 to 69.6 — over the 62 gate — purely because `gender` was
   averaged in. Nineteen products entered the result set by having a
   constraint ADDED.

   The catalog bar presents answers as composable filters —
   `[De día ×] [Caballero ×]` — and a customer who adds a constraint must
   never be shown more things than before.

   ── The rule ───────────────────────────────────────────────────────
   A product may appear under an answer set only if it would also appear
   under every subset of those answers:

       results(A) = { p : eligible(p, A′) for every A′ ⊆ A }

   which gives the invariant for any dimension, in any order:

       results(A) ⊆ results(A \ {d})

   because every subset of A \ {d} is also a subset of A.

   ── Why here, in the engine ────────────────────────────────────────
   It was first written one layer up, in the guided catalog alone. That
   broke a contract this file already owed: the finder's three picks are
   the first rows of the guided catalog, and the finder hands its answers
   to the catalog through the URL. Measured across the 72-combination
   answer grid, a catalog-only rule left 17 combinations where the finder
   recommended a perfume the catalog then refused to list. One eligibility
   rule, one engine, every surface coherent.

   ── Which dimensions it closes over, and why not all of them ───────
   REFINABLE below is the set of answers the CATALOG lets a customer add
   and remove one at a time — the home tiles write `occasion`, the quick
   buttons and the drawer pill write `gender`, and both render as their own
   removable chip. Those are the taps that must not grow the grid.

   `age`, `goal`, `climate` and `family` only ever arrive as part of one
   atomic answer set (the finder's three questions, or a URL), so no
   customer can experience "I added it and got more". Closing over them as
   well is not free: on the same 72-combination grid it emptied 24 of them,
   so a third of finder sessions would answer three questions and be told
   there is nothing — a worse defect than the one being fixed, and not one
   the invariant requires.

   `gender: 'unisex'` is deliberately not treated as a refinement either.
   The finder offers it as "Me da igual" — a stated ABSENCE of preference —
   and a non-preference cannot narrow anything. (It is also degenerate as a
   standalone state: no product clears a single-dimension gate on it, so
   intersecting with it would empty every set it touched.) Nothing about
   how unisex products are scored or matched changes here; this only
   declines to read "me da igual" as a constraint.

   With that scope the finder is bit-for-bit what it was — 0 empty
   combinations, the same 13 thin ones — and the catalog invariant holds
   exactly.

   ── What it does not do ────────────────────────────────────────────
   It moves no threshold, changes no score and reorders nothing: it only
   drops rows that qualified solely because a constraint was added. And it
   is a pure function of the ANSWER SET, not of the order the customer
   built it in, so a shared `?occasion=dia&gender=hombre` link restores the
   same grid as clicking through. */
export const REFINABLE = ['occasion', 'gender'];

/** The refinements present in an answer set — see REFINABLE above. */
function _refinements(answers) {
  return REFINABLE.filter(dimension => {
    const value = answers[dimension];
    if (!value) return false;
    /* "Me da igual" is not a refinement. */
    return !(dimension === 'gender' && value === 'unisex');
  });
}

function _survivesEveryRefinementSubset(product, answers) {
  const dimensions = _refinements(answers);

  /* Below two refinements there is nothing to enforce: dropping the only
     one leaves the state the customer came from, which is this same set. */
  if (dimensions.length < 2) return true;

  const total = 1 << dimensions.length;
  /* Every subset except the full set. Non-refinable answers are carried
     through untouched, so each check is "the same question with one filter
     lifted", not a differently-informed judgement. */
  for (let mask = 0; mask < total - 1; mask++) {
    const subset = { ...answers };
    for (let i = 0; i < dimensions.length; i++) {
      if (!(mask & (1 << i))) delete subset[dimensions[i]];
    }
    if (!evaluateProduct(product, subset).eligible) return false;
  }

  return true;
}

/* Which single answer, dropped, unblocks the most matches. Only ONE is ever
   offered, and only as an explicit choice — the engine never relaxes a
   condition on the customer's behalf. Gender is never offered: someone who
   said "Mujer" did not mean "maybe men's". */
const RELAXABLE = ['climate', 'family', 'age', 'goal', 'occasion'];

function _bestRelaxation(products, answers) {
  let best = null;
  for (const dimension of RELAXABLE) {
    if (!answers[dimension]) continue;
    const relaxed = { ...answers };
    delete relaxed[dimension];
    /* Counted through the same monotonicity rule the grid applies, so the
       empty state cannot promise "aparecen 12 opciones" and then show a
       different number. */
    const gained = products.reduce(
      (count, product) => count + (
        evaluateProduct(product, relaxed).eligible && _survivesEveryRefinementSubset(product, relaxed) ? 1 : 0
      ),
      0,
    );
    if (gained > 0 && (!best || gained > best.gained)) {
      best = { dimension, label: DIMENSION_LABELS[dimension], gained };
    }
  }
  return best;
}

/**
 * The finder's view: at most three, numbered strictly by compatibility, each
 * with the size to try first and a one-line reason.
 */
export function getRecommendations(products, rawAnswers = {}, { limit = MAX_RESULTS } = {}) {
  const ranked = rankCatalog(products, rawAnswers, { limit });
  const answers = ranked.answers;
  const starterMl = suggestedStarterMl(answers.age);

  return {
    ...ranked,
    picks: ranked.results.map((evaluation, index) => ({
      rank: index + 1,
      label: `Nuestra recomendación #${index + 1}`,
      product: evaluation.product,
      variant: evaluation.variant,
      starterMl,
      compatibility: evaluation.compatibility,
      confidence: evaluation.confidence,
      genderDisplay: getGenderDisplay(evaluation.product),
      reason: explain(evaluation, answers, { rank: index + 1 }),
      breakdown: evaluation.breakdown,
    })),
  };
}

/** Human-readable summary of the answers, for the editable results header. */
export function describeAnswers(rawAnswers = {}) {
  const answers = readAnswers(rawAnswers);
  return ['gender', 'age', 'occasion', 'goal', 'climate', 'family']
    .filter(key => answers[key])
    .map(key => ANSWER_LABELS[key]?.[answers[key]] ?? answers[key]);
}
