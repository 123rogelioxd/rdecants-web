/* =============================================================
   The recommendation engine, stage by stage:
     eligibility (hard) · scoring (soft) · confidence · threshold ·
     ordering · explanation · the no-match path.

   Fixtures here are deliberately explicit about which R Supply OS fields
   they set, because the whole point of this engine is that a recommendation
   is traceable to a field.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateProduct, rankCatalog, getRecommendations, compareEvaluations,
  explain, readAnswers, describeAnswers, activeDimensions,
  DIMENSION_WEIGHTS, ANSWER_VALUES, ANSWER_LABELS,
  HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE, CONFIDENCE_FLOOR, MAX_RESULTS,
} from '../assets/js/recommendations/engine.js';

const variant = (size, price, stock = 10) => ({
  size, price, stock, availability: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: `v${size}`,
});

/* A complete, well-documented record: every dimension the finder asks about
   has both a canonical value and a numeric score. */
const COMPLETE = {
  occasions: ['diario', 'oficina'],
  climates: ['calido', 'templado'],
  moods: ['limpio', 'moderno', 'juvenil'],
  style_tags: ['fresco', 'limpio', 'versatil'],
  recommendation_tags: ['diario', 'oficina', 'facil_de_usar'],
  accords: ['citrico', 'acuatico'],
  scent_family_normalized: 'citrico',
  scores: {
    versatility: 85, mass_appeal: 82, blind_buy_safe: 80, beginner_friendly: 84,
    office_safe: 86, intensity: 38, projection: 42, longevity: 62,
    night_out: 32, date_night: 55, compliment: 66, elegance: 64,
    freshness: 86, summer: 88, cold_weather: 42, sweetness: 22,
    luxury: 50, exclusivity: 45, uniqueness: 45, value: 70,
  },
};

const product = (id, fragrance, extra = {}) => ({
  id, name: id, house: 'House',
  gender: 'gender' in extra ? extra.gender : 'unisex',
  notes: [], desc: '', story: '', badge: extra.badge ?? 'Disponible',
  featured: extra.featured ?? false, stock: extra.stock ?? 10,
  active: extra.active,
  variants: extra.variants ?? [variant(5, extra.price ?? 200, extra.stock ?? 10)],
  fragrance,
});

const FULL_ANSWERS = { gender: 'unisex', age: '25-34', occasion: 'oficina', goal: 'versatil', climate: 'calido' };
const ids = list => list.map(e => e.product.id);

/* ── The answer contract ────────────────────────────────────────── */

test('readAnswers keeps only known values and never guesses at an unknown one', () => {
  assert.deepEqual(readAnswers({ gender: 'mujer', occasion: 'noche', goal: 'destacar' }),
    { gender: 'mujer', occasion: 'noche', goal: 'destacar' });
  assert.deepEqual(readAnswers({ gender: 'martian', occasion: 'brunch' }), {});
  assert.deepEqual(readAnswers({}), {});
  assert.deepEqual(readAnswers(), {});
});

test('"any" and the legacy spellings resolve without inventing an answer', () => {
  assert.deepEqual(readAnswers({ gender: 'any' }), {}, 'no gender opinion');
  assert.deepEqual(readAnswers({ occasion: 'diario' }), { occasion: 'dia' });
  assert.deepEqual(readAnswers({ preference: 'destacar' }), { goal: 'destacar' });
  assert.deepEqual(readAnswers({ goal: 'discreto', preference: 'destacar' }), { goal: 'discreto' },
    'the current key wins over the legacy alias');
});

test('a gift with no stated goal becomes the safe goal, stated once', () => {
  assert.deepEqual(readAnswers({ occasion: 'regalo' }), { occasion: 'regalo', goal: 'versatil' });
  assert.deepEqual(readAnswers({ occasion: 'regalo', goal: 'destacar' }), { occasion: 'regalo', goal: 'destacar' });
});

test('only answered questions activate a dimension', () => {
  assert.deepEqual(activeDimensions(readAnswers({ occasion: 'noche' })), ['occasion']);
  assert.deepEqual(
    activeDimensions(readAnswers(FULL_ANSWERS)).sort(),
    ['age', 'climate', 'gender', 'goal', 'occasion'],
  );
});

test('every answer value has a customer-facing label', () => {
  for (const [key, values] of Object.entries(ANSWER_VALUES)) {
    for (const value of values) {
      assert.ok(ANSWER_LABELS[key]?.[value], `${key}=${value} has no label`);
    }
  }
  assert.deepEqual(
    describeAnswers({ gender: 'mujer', age: '15-18', occasion: 'noche', goal: 'destacar' }),
    ['Mujer', '15–18', 'Noche', 'Que destaque'],
  );
});

/* ── Weights ────────────────────────────────────────────────────── */

test('weights are renormalized over the answered dimensions, so the score is always out of 100', () => {
  const p = product('P', COMPLETE);

  const one = evaluateProduct(p, { occasion: 'oficina' });
  const all = evaluateProduct(p, FULL_ANSWERS);
  for (const e of [one, all]) {
    assert.ok(e.compatibility >= 0 && e.compatibility <= 100, `${e.compatibility}`);
    assert.ok(e.rawFit >= 0 && e.rawFit <= 1);
    assert.ok(e.confidence >= 0 && e.confidence <= 1);
  }
  assert.equal(Object.keys(one.breakdown).length, 1);
  assert.equal(Object.keys(all.breakdown).length, 5);

  /* Occasion is the heaviest dimension and gender is a hard constraint on
     top of its weight; age is the lightest. */
  assert.ok(DIMENSION_WEIGHTS.occasion > DIMENSION_WEIGHTS.goal);
  assert.ok(DIMENSION_WEIGHTS.goal >= DIMENSION_WEIGHTS.gender);
  assert.equal(Math.min(...Object.values(DIMENSION_WEIGHTS)), DIMENSION_WEIGHTS.age);
});

/* ── Hard constraints ───────────────────────────────────────────── */

test('sold out, inactive, and no-variant-id are hard exclusions', () => {
  const soldOut = product('SoldOut', COMPLETE, { stock: 0, variants: [variant(5, 200, 0)] });
  const inactive = product('Inactive', COMPLETE, { active: false });
  const noId = product('NoId', COMPLETE, { variants: [{ ...variant(5, 200), variant_id: null }] });

  for (const p of [soldOut, inactive, noId]) {
    const e = evaluateProduct(p, FULL_ANSWERS);
    assert.equal(e.eligible, false, p.id);
    assert.ok(e.exclusions.includes('sin_stock'), `${p.id}: ${e.exclusions}`);
  }
});

test('gender incompatibility is a hard exclusion, not a penalty to out-score', () => {
  const masculine = product('Masc', COMPLETE, { gender: 'masculine' });
  const e = evaluateProduct(masculine, { ...FULL_ANSWERS, gender: 'mujer' });
  assert.equal(e.eligible, false);
  assert.ok(e.exclusions.includes('genero_incompatible'));
});

test('an unknown gender is excluded when the question was answered, and fine when it was not', () => {
  const unknown = product('Unknown', COMPLETE, { gender: null });
  assert.ok(evaluateProduct(unknown, { ...FULL_ANSWERS, gender: 'mujer' }).exclusions.includes('genero_desconocido'));
  const noQuestion = evaluateProduct(unknown, { occasion: 'oficina', goal: 'versatil', climate: 'calido', age: '25-34' });
  assert.equal(noQuestion.eligible, true, 'no gender asked → no gender rule');
});

test('a metadata contradiction is a hard exclusion, sourced from a real field', () => {
  const notOfficeSafe = product('NotOffice', {
    ...COMPLETE,
    scores: { ...COMPLETE.scores, office_safe: 10 },
  });
  const e = evaluateProduct(notOfficeSafe, FULL_ANSWERS);
  assert.equal(e.eligible, false);
  assert.ok(e.exclusions.includes('contradice_occasion'));
  assert.equal(e.breakdown.occasion.contradiction.code, 'not_office_safe');
});

test('"que destaque" is refused without enough performance signal, never guessed from a tag', () => {
  const tagOnly = product('TagOnly', {
    occasions: ['noche', 'fiesta'],
    climates: ['frio'],
    moods: ['nocturno'],
    recommendation_tags: ['alto_rendimiento', 'llamativo'],
    style_tags: ['llamativo'],
    accords: ['ambar'],
    scent_family_normalized: 'oriental',
    scores: { night_out: 90, versatility: 40 },   /* no projection / intensity / longevity */
  });
  const e = evaluateProduct(tagOnly, { occasion: 'noche', goal: 'destacar', climate: 'frio' });
  assert.equal(e.breakdown.goal.coverage, 0, 'no performance data → no coverage for the goal');
  assert.equal(e.breakdown.goal.fit, null, 'and no score invented from the tags');
  assert.ok(e.exclusions.includes('metadata_insuficiente'), e.exclusions.join(','));
});

test('a product with no fragrance record at all is excluded on confidence', () => {
  const bare = product('Bare', null);
  const e = evaluateProduct(bare, FULL_ANSWERS);
  assert.equal(e.eligible, false);
  assert.ok(e.exclusions.includes('metadata_insuficiente'));
  assert.ok(e.confidence < MIN_CONFIDENCE);
});

/* ── Missing metadata is neither rewarded nor punished as a mismatch ── */

test('a thin record cannot out-score a complete one at equal fit on what it does document', () => {
  /* Both are perfect on occasion. The thin one simply has nothing else. */
  const thin = product('Thin', {
    occasions: ['oficina'],
    climates: ['calido'],
    moods: ['limpio'],
    recommendation_tags: ['oficina'],
    accords: ['citrico'],
    scores: { office_safe: 95, versatility: 95, mass_appeal: 95, blind_buy_safe: 95, beginner_friendly: 95 },
  });
  const complete = product('Complete', COMPLETE);

  const thinEval = evaluateProduct(thin, FULL_ANSWERS);
  const completeEval = evaluateProduct(complete, FULL_ANSWERS);

  assert.ok(thinEval.confidence < completeEval.confidence, 'less metadata → less confidence');
  /* And confidence scales the reported score, so the gap is visible there too. */
  assert.ok(thinEval.compatibility < 100 * thinEval.rawFit,
    'the raw fit is discounted by the confidence it rests on');
  assert.equal(
    completeEval.compatibility,
    Math.round(100 * completeEval.rawFit * (CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * completeEval.confidence) * 10) / 10,
  );
});

test('an absent dimension is left out of the score rather than scored as a mismatch', () => {
  const { summer, cold_weather, freshness, ...rest } = COMPLETE.scores;
  const noClimate = product('NoClimate', {
    ...COMPLETE, climates: [], climate_tags: [], seasons: [], scores: rest,
  });
  const e = evaluateProduct(noClimate, FULL_ANSWERS);
  assert.equal(e.breakdown.climate.coverage, 0);
  assert.equal(e.breakdown.climate.contribution, 0);
  assert.equal(e.breakdown.climate.fit, null, 'null, not 0 — we do not know, it does not "not fit"');

  /* Partial evidence is partial coverage, not none: `freshness` alone is a
     real if weaker warm-weather signal. */
  const partial = product('PartialClimate', {
    ...COMPLETE, climates: [], climate_tags: [], seasons: [],
    scores: { ...rest, freshness: 86 },
  });
  const partialEval = evaluateProduct(partial, FULL_ANSWERS);
  assert.ok(partialEval.breakdown.climate.coverage > 0 && partialEval.breakdown.climate.coverage < 1);
});

/* ── Ordering ───────────────────────────────────────────────────── */

test('ordering is score, then confidence, then the priority dimensions, then stock, then price', () => {
  const better = product('Better', COMPLETE, { price: 500 });
  const worse = product('Worse', { ...COMPLETE, scores: { ...COMPLETE.scores, office_safe: 62, versatility: 62 } }, { price: 100 });
  const res = rankCatalog([worse, better], FULL_ANSWERS).results;
  assert.deepEqual(ids(res), ['Better', 'Worse'], 'a better match is never displaced by a lower price');

  /* Price only speaks once the match is genuinely identical. */
  const cheap = product('Cheap', COMPLETE, { price: 150 });
  const pricey = product('Pricey', COMPLETE, { price: 400 });
  const tie = rankCatalog([pricey, cheap], FULL_ANSWERS).results;
  assert.equal(tie[0].compatibility, tie[1].compatibility);
  assert.deepEqual(ids(tie), ['Cheap', 'Pricey']);
});

test('a popular or featured product cannot climb past a better match', () => {
  const hyped = product('Hyped', { ...COMPLETE, scores: { ...COMPLETE.scores, office_safe: 60, versatility: 60 } },
    { featured: true, badge: 'MÁS PEDIDO', stock: 90, price: 120 });
  const quietBetter = product('QuietBetter', COMPLETE, { price: 450, stock: 4 });
  const res = rankCatalog([hyped, quietBetter], FULL_ANSWERS).results;
  assert.equal(res[0].product.id, 'QuietBetter');
});

test('ordering is deterministic and independent of input order', () => {
  const catalog = [
    product('A', COMPLETE, { price: 200 }),
    product('B', COMPLETE, { price: 200 }),
    product('C', { ...COMPLETE, scores: { ...COMPLETE.scores, versatility: 80 } }, { price: 200 }),
  ];
  const one = ids(rankCatalog(catalog, FULL_ANSWERS).results);
  const two = ids(rankCatalog([...catalog].reverse(), FULL_ANSWERS).results);
  const three = ids(rankCatalog([catalog[1], catalog[2], catalog[0]], FULL_ANSWERS).results);
  assert.deepEqual(one, two);
  assert.deepEqual(two, three);
  /* A total tie resolves on the product id, so the order is stable forever. */
  assert.ok(one.indexOf('A') < one.indexOf('B'));
});

test('compareEvaluations is a total order (antisymmetric, reflexive-zero)', () => {
  const catalog = [
    product('A', COMPLETE), product('B', COMPLETE, { price: 300 }),
    product('C', { ...COMPLETE, scores: { ...COMPLETE.scores, versatility: 70 } }),
  ];
  const evals = catalog.map(p => evaluateProduct(p, FULL_ANSWERS));
  for (const a of evals) {
    assert.equal(compareEvaluations(a, a), 0);
    for (const b of evals) {
      if (a === b) continue;
      assert.equal(Math.sign(compareEvaluations(a, b)), -Math.sign(compareEvaluations(b, a)));
    }
  }
});

/* ── Thresholds ─────────────────────────────────────────────────── */

test('nothing below the compatibility threshold is recommended, and results are never padded', () => {
  const good = product('Good', COMPLETE);
  const poor = product('Poor', {
    ...COMPLETE,
    occasions: ['fiesta'],
    climates: ['frio'],
    scores: { ...COMPLETE.scores, office_safe: 40, versatility: 35, summer: 20, cold_weather: 90 },
  });
  const { results } = rankCatalog([good, poor], FULL_ANSWERS);
  assert.equal(results.length, 1, 'one honest match, not two cards');
  for (const e of results) assert.ok(e.compatibility >= HIGH_MATCH_THRESHOLD);
});

test('getRecommendations caps at three and numbers them in order', () => {
  const catalog = Array.from({ length: 8 }, (_, i) =>
    product(`P${i}`, { ...COMPLETE, scores: { ...COMPLETE.scores, versatility: 88 - i } }, { price: 200 }));
  const { picks, total } = getRecommendations(catalog, FULL_ANSWERS);
  assert.equal(picks.length, MAX_RESULTS);
  assert.ok(total > MAX_RESULTS, 'the full ranking is longer than the three shown');
  assert.deepEqual(picks.map(p => p.rank), [1, 2, 3]);
  assert.deepEqual(picks.map(p => p.label), [
    'Nuestra recomendación #1', 'Nuestra recomendación #2', 'Nuestra recomendación #3',
  ]);
  for (let i = 1; i < picks.length; i++) {
    assert.ok(picks[i - 1].compatibility >= picks[i].compatibility);
  }
});

/* ── Explanations ───────────────────────────────────────────────── */

test('an explanation names only dimensions that scored, and claims no performance the scores deny', () => {
  const p = product('P', COMPLETE);
  const e = evaluateProduct(p, FULL_ANSWERS);
  const reason = explain(e, FULL_ANSWERS, { rank: 1 });

  assert.match(reason, /^La mejor coincidencia/);
  assert.match(reason, /oficina/);
  assert.doesNotMatch(reason, /noche|fiesta|destacar/, 'nothing the answers did not ask about');
  assert.doesNotMatch(reason, /duración/, 'longevity is 0.62 — no duration claim');
  assert.doesNotMatch(reason, /\d/, 'no numbers, no false precision');
  assert.ok(reason.length <= 130, reason);
});

test('rank 2 and 3 do not claim to be the best match', () => {
  const catalog = [
    product('A', COMPLETE),
    product('B', { ...COMPLETE, scores: { ...COMPLETE.scores, versatility: 80 } }),
  ];
  const { picks } = getRecommendations(catalog, FULL_ANSWERS);
  assert.match(picks[0].reason, /^La mejor coincidencia/);
  assert.match(picks[1].reason, /^Buena coincidencia/);
});

test('a duration claim appears only when the question asked about performance AND longevity is high', () => {
  const longLasting = product('Long', {
    ...COMPLETE,
    occasions: ['noche', 'fiesta'],
    scores: { ...COMPLETE.scores, night_out: 90, projection: 82, intensity: 80, longevity: 88, compliment: 85 },
  });
  const nightAnswers = { occasion: 'noche', goal: 'destacar' };
  assert.match(explain(evaluateProduct(longLasting, nightAnswers), nightAnswers, { rank: 1 }), /duración/);

  /* Same product, a question that is not about performance → no such claim. */
  const dayAnswers = { occasion: 'dia', goal: 'versatil' };
  assert.doesNotMatch(explain(evaluateProduct(longLasting, dayAnswers), dayAnswers, { rank: 1 }), /duración/);
});

test('repeated "perfil" phrases are collapsed instead of stuttering', () => {
  const feminineSweet = product('FemSweet', {
    ...COMPLETE,
    occasions: ['cita'],
    accords: ['vainilla', 'frutal'],
    scent_family_normalized: 'gourmand',
    scores: { ...COMPLETE.scores, date_night: 90, sweetness: 88, compliment: 85, longevity: 82, projection: 70, intensity: 68 },
  }, { gender: 'feminine' });
  const answers = { gender: 'mujer', occasion: 'cita', goal: 'destacar', family: 'dulce' };
  const reason = explain(evaluateProduct(feminineSweet, answers), answers, { rank: 1 });

  assert.equal((reason.match(/perfil/gi) ?? []).length, 1, reason);
  /* At most one "y" per sentence — "perfil femenino y perfil dulce y con
     buena duración" was the machine-sounding phrasing this replaces. */
  for (const sentence of reason.split('. ')) {
    assert.ok((sentence.match(/ y /g) ?? []).length <= 1, `stuttering clause: ${sentence}`);
  }
  assert.match(reason, /Perfil femenino y dulce/);
});

/* ── The no-match path ──────────────────────────────────────────── */

test('no match explains itself and offers exactly ONE named condition to relax', () => {
  const coldOnly = product('ColdOnly', {
    ...COMPLETE,
    climates: ['frio', 'invierno'],
    scores: { ...COMPLETE.scores, summer: 15, cold_weather: 92 },
  });
  const { results, notices, relaxation } = rankCatalog([coldOnly], FULL_ANSWERS);

  assert.equal(results.length, 0);
  assert.ok(notices.includes('sin_coincidencias'));
  assert.equal(relaxation.dimension, 'climate');
  assert.ok(relaxation.gained >= 1, 'and it says how much it would help');
  assert.ok(relaxation.label, 'named in customer language');
});

test('gender is never offered as the condition to relax', () => {
  const masculineOnly = product('Masc', COMPLETE, { gender: 'masculine' });
  const { relaxation } = rankCatalog([masculineOnly], { gender: 'mujer', occasion: 'oficina', goal: 'versatil', climate: 'calido' });
  assert.ok(!relaxation || relaxation.dimension !== 'gender',
    'someone who said "Mujer" did not mean "maybe men\'s"');
});

test('an empty catalog and a broken API degrade to a stated notice, never to an error', () => {
  for (const input of [[], null, undefined, 'not-an-array']) {
    const r = rankCatalog(input, FULL_ANSWERS);
    assert.deepEqual(r.results, []);
    assert.ok(r.notices.includes('catalogo_vacio'), JSON.stringify(input));
    assert.equal(r.relaxation, null);
  }
});

test('a weak-only gender match is flagged so the UI can say so', () => {
  /* lean_masculine is the closest compatible profile for "Unisex" — real,
     but not a unisex product, and the customer is told. */
  const lean = product('Lean', COMPLETE, { gender: 'lean_masculine' });
  const { results, notices } = rankCatalog([lean], { ...FULL_ANSWERS, gender: 'unisex' });
  assert.equal(results.length, 1);
  assert.equal(results[0].genderPriority, 'weak');
  assert.ok(notices.includes('solo_perfiles_compatibles'));
});

/* ── Numeric safety ────────────────────────────────────────────── */

test('malformed products never produce NaN, a negative score or one above 100', () => {
  const nasty = [
    null, undefined, {}, { id: 'x' },
    { id: 'y', variants: 'nope', fragrance: { scores: { projection: 'alto' } } },
    { id: 'z', variants: [{ size: NaN, price: NaN }], fragrance: { occasions: null, climates: 7 } },
    { id: 'w', variants: [variant(5, 200)], fragrance: { scores: { intensity: Infinity, summer: -1 } } },
  ];
  for (const p of nasty) {
    const e = evaluateProduct(p, FULL_ANSWERS);
    assert.ok(Number.isFinite(e.compatibility), JSON.stringify(p));
    assert.ok(e.compatibility >= 0 && e.compatibility <= 100, `${e.compatibility}`);
    assert.ok(Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 1);
  }
  assert.doesNotThrow(() => rankCatalog(nasty, FULL_ANSWERS));
});
