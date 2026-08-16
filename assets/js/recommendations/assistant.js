/* =============================================================
   RDECANTS — GUIDED SHOPPING ASSISTANT (questions + presentation)

   All ranking now lives in recommendations/engine.js. This file owns two
   things only:
     • the question set the finder renders
     • the shape the surfaces consume (finder picks, guided catalog rows)

   It used to own the scoring too, and that is where the bugs were:
     • `knownHeavyNight` — a hardcoded list of seven fragrance NAMES used
       to fake contradictions the metadata could have expressed. Deleted;
       every one of those cases is now a rule over a real field.
     • `_pickByScores` — chose the "safe" and "standout" cards by scanning
       the whole ranked list for the highest projection/longevity, ignoring
       both the ranking and the gender tier. A masculine-leaning product
       could therefore be presented as a woman's third recommendation even
       though it sat last in the order. Deleted; the three cards are now
       ranks #1, #2 and #3 of one order, nothing else.
     • `FIT_BAND` — bucketed scores 6 points wide and then sorted by PRICE
       inside a bucket, so a 6-point-worse match could lead because it was
       cheaper. Deleted; price is a tie-break after score, confidence,
       every priority dimension and stock health.
     • age did nothing but pick a bottle size. It is now a real (small,
       never disqualifying) affinity signal — see AGE_RULES in engine.js.
   ============================================================= */

import {
  rankCatalog,
  getRecommendations,
  evaluateProduct,
  explain,
  readAnswers,
  suggestedStarterMl,
  describeAnswers,
  AGE_RULES,
  ANSWER_LABELS,
  ANSWER_VALUES,
  HIGH_MATCH_THRESHOLD,
  MIN_CONFIDENCE,
  MAX_RESULTS,
} from './engine.js';
import { getMatchTier } from './reasoning.js';
import { describeScent } from './describe.js';
import { getVariantForSize } from '../utils/prices.js';
import { getGenderDisplay } from '../utils/gender.js';

export {
  suggestedStarterMl,
  describeAnswers,
  readAnswers,
  evaluateProduct,
  AGE_RULES,
  ANSWER_LABELS,
  ANSWER_VALUES,
  HIGH_MATCH_THRESHOLD,
  MIN_CONFIDENCE,
  MAX_RESULTS,
};

/* ── The questions ────────────────────────────────────────────────
   THREE one-tap questions, in the words a customer would actually use.
   Every one of them changes eligibility, score, order or the reason shown —
   tests/answerMatrix.test.js proves that across the whole grid.

   What each one buys, in R Supply OS fields:
     gender   → fragrance.gender_profile  (hard constraint + 22 weight)
     age      → fragrance.moods + beginner_friendly / luxury / exclusivity
                (8, plus the size suggested first)
     occasion → fragrance.occasions + night_out / date_night / longevity /
                compliment / versatility / office_safe / mass_appeal
                (26, the heaviest)
     goal     → compliment / longevity / exclusivity / projection /
                intensity / versatility / blind_buy_safe (22)

   Weights are renormalised over whatever was actually answered, so dropping
   a question re-weights the rest instead of deflating every score.

   ── What was removed, and why ──────────────────────────────────────
   CLIMATE was asked until now, and the argument for it was real: most
   products carry climate metadata. But it cost every visitor a fourth screen,
   and a run of the whole answer grid against the live 96-product catalogue
   showed exactly ONE combination dropping below three results without it —
   and that one used `regalo` + `discreto`, neither of which is asked any
   more. It survives as an internal signal and as a URL refinement
   (?climate=calido), fully scored when present. Nothing was deleted from the
   profiles.

   "OFICINA" and "ES UN REGALO" left the occasion question. Gift intent is a
   homepage path ("Para regalar"), not something to spend a mandatory screen
   on; office is a refinement most visitors do not need. Both remain legal
   answers the engine scores.

   "QUE SE NOTE POCO Y NO INCOMODE" (`discreto`) left the goal question. It
   asked the customer to rule themselves out, and the two-sided framing
   ("stand out" vs "don't bother anyone") made the third option feel like a
   punishment. It is still scored when a URL carries it.

   Scent family is still deliberately NOT asked. A first-time buyer cannot
   answer "fresco / dulce / intenso" before smelling anything; asking it is
   what made the old finder a quiz you had to already know perfume to pass. */
export const ASSISTANT_QUESTIONS = [
  {
    id: 'audience',
    label: '¿Para quién es?',
    /* One screen, two choices — they are a single thought for the customer. */
    groups: [
      {
        id: 'gender',
        label: 'Para quién',
        options: [
          { value: 'hombre', label: 'Hombre' },
          { value: 'mujer', label: 'Mujer' },
          { value: 'unisex', label: 'Me da igual' },
        ],
      },
      {
        id: 'age',
        label: 'Edad aproximada',
        options: [
          { value: '15-18', label: '15–18' },
          { value: '19-24', label: '19–24' },
          { value: '25-34', label: '25–34' },
          { value: '35+', label: '35+' },
        ],
      },
    ],
  },
  {
    id: 'occasion',
    /* "Salidas nocturnas" rather than "Para salir": the two options have to be
       read in a glance on a phone, and "de día / para salir" made someone stop
       to work out whether an evening dinner counts as "salir". The ANSWER is
       still `salir` — the same value the home tiles, the URL contract
       (?intent=salir) and every OCCASION_RULE already use — so this is a label
       change and not a second taxonomy. */
    label: '¿Cuándo lo vas a usar más?',
    options: [
      { value: 'dia', label: 'De día', hint: 'Diario, escuela, trabajo' },
      { value: 'salir', label: 'Salidas nocturnas', hint: 'Citas, fiesta, noche' },
    ],
  },
  {
    id: 'goal',
    label: '¿Qué buscas?',
    options: [
      { value: 'versatil', label: 'Solo quiero oler bien' },
      { value: 'destacar', label: 'Quiero que se note' },
      { value: 'mejor', label: 'Quiero ser el que mejor huele' },
    ],
  },
];

/** The answer id each step writes (a grouped step writes one per group). */
export function questionAnswerIds(question) {
  return question.groups ? question.groups.map(group => group.id) : [question.id];
}

/* Legacy alias: the finder used to call the third question `preference`.
   A gift with no stated goal is still treated as wanting a safe pick —
   stated here rather than hidden in the ranking. */
export function resolvePreference(answers = {}) {
  const goal = answers.goal ?? answers.preference;
  if (ANSWER_VALUES.goal.includes(goal)) return goal;
  return answers.occasion === 'regalo' ? 'versatil' : null;
}

/* ── Result shapes ────────────────────────────────────────────────── */

function _toRecommendation(evaluation, answers, rank) {
  return {
    product: evaluation.product,
    variant: evaluation.variant,
    /* 0–100 compatibility. Kept under the old key so existing surfaces
       keep working; it is a percentage of the answered weights now, not an
       unbounded point total. */
    matchScore: evaluation.compatibility,
    compatibility: evaluation.compatibility,
    confidence: evaluation.confidence,
    matchTier: getMatchTier(evaluation.compatibility, 100),
    genderDisplay: getGenderDisplay(evaluation.product),
    reason: explain(evaluation, answers, { rank }),
    reasons: [explain(evaluation, answers, { rank })],
    scoreBreakdown: evaluation.breakdown,
    useCase: ANSWER_LABELS.occasion?.[answers.occasion] ?? 'Versátil',
    genderPriority: evaluation.genderPriority,
  };
}

/**
 * Capped recommendations (the old finder API). Best first, never padded.
 */
export function getAssistantRecommendations(answers = {}, products = [], { limit = MAX_RESULTS } = {}) {
  if (!Array.isArray(products) || !products.length) return [];
  const ranked = rankCatalog(products, answers, { limit });
  return ranked.results.map((evaluation, index) =>
    _toRecommendation(evaluation, ranked.answers, index + 1));
}

/**
 * Uncapped guided-catalog ranking — the SAME order as the finder, so the
 * grid and the three picks can never disagree. Returns only matches that
 * cleared every hard constraint and both gates; the caller offers
 * "Ver todo el catálogo" to leave personalized mode.
 */
export function rankCatalogForAnswers(answers = {}, products = []) {
  if (!Array.isArray(products) || !products.length) return [];
  const ranked = rankCatalog(products, answers);
  return ranked.results.map((evaluation, index) => ({
    ..._toRecommendation(evaluation, ranked.answers, index + 1),
    rank: index + 1,
    isTop: index === 0,
  }));
}

/**
 * The guided catalog's full envelope: the same ranked rows plus the honest
 * states the grid has to render (nothing found, only compatible profiles,
 * and the single condition worth relaxing).
 *
 * Rows obey the engine's monotonicity rule (see REFINABLE in engine.js):
 * adding `De día` or a gender here can only ever remove products.
 */
export function rankGuidedCatalog(answers = {}, products = []) {
  const ranked = rankCatalog(products, answers);
  return {
    answers: ranked.answers,
    rows: ranked.results.map((evaluation, index) => ({
      ..._toRecommendation(evaluation, ranked.answers, index + 1),
      rank: index + 1,
      isTop: index === 0,
    })),
    notices: ranked.notices,
    relaxation: ranked.relaxation,
    total: ranked.total,
  };
}

/**
 * The finder's three cards. Ranks #1, #2, #3 of ONE order — no roles, no
 * second selection pass, so the card order is literally the score order.
 *
 * Returns the full result envelope so the page can render the honest
 * states too: `notices` (e.g. only compatible-profile matches were found)
 * and `relaxation` (the single condition whose removal would help most).
 */
export function getBeginnerPicks(answers = {}, products = []) {
  const { picks } = getFinderResult(answers, products);
  return picks;
}

export function getFinderResult(answers = {}, products = []) {
  const result = getRecommendations(products, answers, { limit: MAX_RESULTS });
  const starterMl = suggestedStarterMl(result.answers.age);

  return {
    ...result,
    summary: describeAnswers(result.answers),
    picks: result.picks.map(pick => {
      const suggestedVariant = getVariantForSize(pick.product, starterMl) ?? pick.variant;
      return {
        ...pick,
        /* `role` used to be best / safe / standout, which implied three
           different jobs and let the second and third card be chosen by a
           different rule than the first. It is now just the position. */
        role: `rank${pick.rank}`,
        /* Scent only, never a use case. describeForBeginner appends "Buena
           opción para {use case}" derived from the product's own notes with no
           knowledge of the answers, so under a card that says "la mejor
           coincidencia para la noche" it printed "Buena opción para el día a
           día". On this surface the reason owns the context and the
           description says what it smells like. */
        blurb: describeScent(pick.product),
        reasons: [pick.reason],
        matchScore: pick.compatibility,
        matchTier: getMatchTier(pick.compatibility, 100),
        scoreBreakdown: pick.breakdown,
        suggestedVariant,
        suggestedMl: suggestedVariant?.size ?? starterMl,
      };
    }),
  };
}

/** Customer-facing label for the Nth card. Strict score order, no roles. */
export function pickLabel(rank) {
  return `Nuestra recomendación #${rank}`;
}

/* Kept as an object for the surfaces that render a static label list. */
export const PICK_LABELS = {
  1: pickLabel(1),
  2: pickLabel(2),
  3: pickLabel(3),
};

export const PICK_ORDER = [1, 2, 3];
