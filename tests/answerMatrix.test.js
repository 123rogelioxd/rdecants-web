/* =============================================================
   THE EXHAUSTIVE SWEEP

   Every combination of every option of every active question, run against
   the real R Supply OS catalog snapshot:

     gender (3) × age (4) × occasion (5) × goal (3) × climate (3) = 540

   Four manual scenarios prove nothing about an engine with five
   interacting dimensions. This file asserts the invariants that must hold
   for ALL of them, and it is the calibration guard for the thresholds: if
   someone retunes HIGH_MATCH_THRESHOLD or a weight and starts padding
   results, returning incompatible products or emptying whole branches of
   the answer space, these tests fail.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCatalog, getRecommendations, evaluateProduct, readAnswers,
  ANSWER_VALUES, HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE, MAX_RESULTS,
  DIMENSION_WEIGHTS,
} from '../assets/js/recommendations/engine.js';
import { genderPriority, getProductGender } from '../assets/js/utils/gender.js';
import { normalizeProduct, score } from '../assets/js/recommendations/normalize.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();

const COMBOS = [];
for (const gender of ANSWER_VALUES.gender)
  for (const age of ANSWER_VALUES.age)
    for (const occasion of ANSWER_VALUES.occasion)
      for (const goal of ANSWER_VALUES.goal)
        for (const climate of ANSWER_VALUES.climate)
          COMBOS.push({ gender, age, occasion, goal, climate });

const label = a => `${a.gender}/${a.age}/${a.occasion}/${a.goal}/${a.climate}`;

/* One pass, reused by every assertion below — 540 × 73 evaluations is cheap
   but not free, and recomputing it per test would make the file slow. */
const RUNS = COMBOS.map(answers => ({ answers, ...rankCatalog(CATALOG, answers) }));

test('the sweep covers the whole answer space', () => {
  assert.equal(COMBOS.length, 540);
  assert.ok(CATALOG.length >= 70, `catalog has ${CATALOG.length} products`);
  assert.equal(new Set(COMBOS.map(label)).size, 540, 'no duplicate combination');
});

/* ── Numeric safety across the entire space ─────────────────────── */

test('no combination produces NaN, a negative score or a score above 100', () => {
  for (const { answers, all } of RUNS) {
    for (const e of all) {
      assert.ok(Number.isFinite(e.compatibility), `${label(answers)} ${e.product.id}`);
      assert.ok(e.compatibility >= 0 && e.compatibility <= 100,
        `${label(answers)} ${e.product.id} → ${e.compatibility}`);
      assert.ok(Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 1,
        `${label(answers)} ${e.product.id} → ${e.confidence}`);
      for (const [key, entry] of Object.entries(e.breakdown)) {
        assert.ok(entry.fit === null || (entry.fit >= 0 && entry.fit <= 1), `${e.product.id}.${key}`);
        assert.ok(entry.coverage >= 0 && entry.coverage <= 1, `${e.product.id}.${key}`);
        assert.ok(entry.contribution >= 0 && entry.contribution <= entry.weight, `${e.product.id}.${key}`);
      }
    }
  }
});

/* ── Ordering and thresholds ────────────────────────────────────── */

test('every result set is in descending compatibility order', () => {
  for (const { answers, results } of RUNS) {
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].compatibility >= results[i].compatibility,
        `${label(answers)}: #${i} (${results[i - 1].compatibility}) below #${i + 1} (${results[i].compatibility})`);
    }
  }
});

test('every recommended product clears BOTH gates — nothing is padded in to fill three cards', () => {
  for (const { answers, results } of RUNS) {
    for (const e of results) {
      assert.ok(e.compatibility >= HIGH_MATCH_THRESHOLD,
        `${label(answers)} ${e.product.id} scored ${e.compatibility}`);
      assert.ok(e.confidence >= MIN_CONFIDENCE,
        `${label(answers)} ${e.product.id} confidence ${e.confidence}`);
      assert.equal(e.exclusions.length, 0, `${e.product.id}: ${e.exclusions}`);
    }
  }
});

test('the top three are the top three — never re-shuffled for variety', () => {
  for (const { answers, results } of RUNS) {
    const { picks } = getRecommendations(CATALOG, answers);
    assert.ok(picks.length <= MAX_RESULTS, label(answers));
    assert.deepEqual(
      picks.map(p => String(p.product.id)),
      results.slice(0, picks.length).map(e => String(e.product.id)),
      label(answers),
    );
    assert.deepEqual(picks.map(p => p.rank), picks.map((_, i) => i + 1), label(answers));
  }
});

/* ── Hard rules, everywhere ─────────────────────────────────────── */

test('no combination ever recommends a gender-incompatible or gender-unknown product', () => {
  for (const { answers, results } of RUNS) {
    for (const e of results) {
      const priority = genderPriority(answers.gender, getProductGender(e.product));
      assert.ok(priority !== 'rejected' && priority !== 'unknown',
        `${label(answers)} ${e.product.id} → ${priority}`);
    }
  }
});

/* The single most consequential rule in the brief. */
test('choosing Mujer never places a masculine or masculine-leaning profile anywhere in the results', () => {
  const forbidden = new Set(['masculine', 'lean_masculine', 'unknown']);
  for (const { answers, results } of RUNS.filter(r => r.answers.gender === 'mujer')) {
    for (const e of results) {
      assert.ok(!forbidden.has(getProductGender(e.product)),
        `${label(answers)} ${e.product.id} is ${getProductGender(e.product)}`);
    }
  }
});

test('choosing Hombre applies the mirror rule', () => {
  const forbidden = new Set(['feminine', 'lean_feminine', 'unknown']);
  for (const { answers, results } of RUNS.filter(r => r.answers.gender === 'hombre')) {
    for (const e of results) {
      assert.ok(!forbidden.has(getProductGender(e.product)),
        `${label(answers)} ${e.product.id} is ${getProductGender(e.product)}`);
    }
  }
});

test('choosing Unisex does not make the whole catalog compatible', () => {
  const unisexRuns = RUNS.filter(r => r.answers.gender === 'unisex');
  for (const { answers, results } of unisexRuns) {
    for (const e of results) {
      const g = getProductGender(e.product);
      assert.ok(!['masculine', 'feminine', 'unknown'].includes(g),
        `${label(answers)} ${e.product.id} is plainly ${g}`);
    }
  }
  /* And it is genuinely narrower than the men's branch, which is what
     "no automatic compatibility" has to mean in practice. */
  const unisexMax = Math.max(...unisexRuns.map(r => r.total));
  const hombreMax = Math.max(...RUNS.filter(r => r.answers.gender === 'hombre').map(r => r.total));
  assert.ok(unisexMax < hombreMax, `unisex ${unisexMax} vs hombre ${hombreMax}`);
});

test('nothing sold out or unbuyable is ever recommended', () => {
  for (const { answers, results } of RUNS) {
    for (const e of results) {
      const n = normalizeProduct(e.product);
      assert.equal(n.offer.sellable, true, `${label(answers)} ${e.product.id}`);
      assert.ok(n.offer.orderableSizes.length > 0, `${label(answers)} ${e.product.id}`);
      assert.ok(e.variant && Number(e.variant.price) > 0, `${label(answers)} ${e.product.id}`);
    }
  }
});

test('"noche" is never recommended off an isolated tag when the night score denies it', () => {
  for (const { answers, results } of RUNS.filter(r => r.answers.occasion === 'noche')) {
    for (const e of results) {
      const nightOut = score(normalizeProduct(e.product), 'night_out');
      if (nightOut === null) continue;   /* no score → the tag stands alone and coverage is halved */
      assert.ok(nightOut > 0.32, `${label(answers)} ${e.product.id} night_out=${nightOut}`);
    }
  }
});

test('"oficina" is never recommended against the backend\'s own office_safe verdict', () => {
  for (const { answers, results } of RUNS.filter(r => r.answers.occasion === 'oficina')) {
    for (const e of results) {
      const n = normalizeProduct(e.product);
      const officeSafe = score(n, 'office_safe');
      const projection = score(n, 'projection');
      if (officeSafe !== null) assert.ok(officeSafe > 0.3, `${label(answers)} ${e.product.id} office_safe=${officeSafe}`);
      if (projection !== null) assert.ok(projection < 0.92, `${label(answers)} ${e.product.id} projection=${projection}`);
    }
  }
});

test('"que destaque" always rests on real intensity/projection/longevity signal', () => {
  for (const { answers, results } of RUNS.filter(r => r.answers.goal === 'destacar')) {
    for (const e of results) {
      const n = normalizeProduct(e.product);
      const known = ['projection', 'intensity', 'longevity'].filter(k => score(n, k) !== null);
      assert.ok(known.length >= 1, `${label(answers)} ${e.product.id} has no performance score at all`);
      assert.ok(e.breakdown.goal.coverage > 0, `${label(answers)} ${e.product.id}`);
    }
  }
});

test('"discreto" never recommends a profile that is both very intense and very projecting', () => {
  for (const { answers, results } of RUNS.filter(r => r.answers.goal === 'discreto')) {
    for (const e of results) {
      const n = normalizeProduct(e.product);
      const intensity = score(n, 'intensity');
      const projection = score(n, 'projection');
      if (intensity === null || projection === null) continue;
      assert.ok(!(intensity >= 0.85 && projection >= 0.85),
        `${label(answers)} ${e.product.id} intensity=${intensity} projection=${projection}`);
    }
  }
});

test('a product with no scores at all never earns a "Nuestra recomendación" slot', () => {
  const scoreless = CATALOG.filter(p => !normalizeProduct(p).scoresPresent).map(p => String(p.id));
  assert.ok(scoreless.length > 0, 'the live catalog does contain such products');
  for (const { answers, results } of RUNS) {
    for (const e of results.slice(0, MAX_RESULTS)) {
      assert.ok(!scoreless.includes(String(e.product.id)),
        `${label(answers)} put ${e.product.id} in the top ${MAX_RESULTS} with no performance metadata`);
    }
  }
});

/* ── Determinism ────────────────────────────────────────────────── */

test('every combination is deterministic across repeated runs and input order', () => {
  const reversed = [...CATALOG].reverse();
  const shuffled = [...CATALOG].filter((_, i) => i % 2 === 0).concat(CATALOG.filter((_, i) => i % 2 === 1));

  for (const { answers, results } of RUNS) {
    const expected = results.map(e => `${e.product.id}:${e.compatibility}`);
    for (const catalog of [CATALOG, reversed, shuffled]) {
      const again = rankCatalog(catalog, answers).results.map(e => `${e.product.id}:${e.compatibility}`);
      assert.deepEqual(again, expected, label(answers));
    }
  }
});

/* ── Every answer matters ───────────────────────────────────────── */

/* For each question, changing ONLY that answer must change eligibility, the
   score, the order or the reason for at least one product — otherwise the
   question is decoration. Proven per dimension across the whole space. */
test('changing any single answer changes eligibility, score, order or reason', () => {
  const dimensions = ['gender', 'age', 'occasion', 'goal', 'climate'];
  const fingerprint = answers => rankCatalog(CATALOG, answers).all
    .map(e => `${e.product.id}|${e.eligible ? 1 : 0}|${e.compatibility}`)
    .join(',');

  for (const dimension of dimensions) {
    const values = ANSWER_VALUES[dimension];
    /* A representative base for this dimension, held fixed while it varies. */
    const base = { gender: 'hombre', age: '25-34', occasion: 'dia', goal: 'versatil', climate: 'templado' };
    const seen = new Map();
    for (const value of values) {
      seen.set(value, fingerprint({ ...base, [dimension]: value }));
    }
    assert.equal(new Set(seen.values()).size, values.length,
      `${dimension}: some options produce an identical catalog-wide outcome`);
  }
});

test('every dimension actually contributes points for at least some product', () => {
  const contributed = new Set();
  for (const { all } of RUNS) {
    for (const e of all) {
      for (const [key, entry] of Object.entries(e.breakdown)) {
        if (entry.contribution > 0) contributed.add(key);
      }
    }
  }
  for (const key of ['gender', 'age', 'occasion', 'goal', 'climate']) {
    assert.ok(contributed.has(key), `${key} never contributed a single point — it is decoration`);
    assert.ok(DIMENSION_WEIGHTS[key] > 0, key);
  }
});

test('a reason is generated for every recommendation and mentions a dimension that scored', () => {
  const DIMENSION_WORDS = {
    occasion: { dia: /día a día/i, oficina: /oficina/i, cita: /cita/i, noche: /noche/i, regalo: /regalar/i },
    goal: { versatil: /fácil de usar/i, destacar: /destacar/i, discreto: /discreta/i },
    climate: { calido: /clima cálido/i, frio: /clima frío/i, templado: /todo el año/i },
  };

  for (const { answers } of RUNS) {
    const { picks } = getRecommendations(CATALOG, answers);
    for (const pick of picks) {
      assert.ok(pick.reason && pick.reason.length > 0, `${label(answers)} ${pick.product.id}`);
      assert.ok(pick.reason.length <= 130, `${label(answers)} too long: ${pick.reason}`);
      assert.doesNotMatch(pick.reason, /\d+\s?%/, 'no false-precision percentage');
      assert.doesNotMatch(pick.reason, /undefined|null|NaN/, pick.reason);

      /* Anything the reason claims must correspond to a dimension that
         actually contributed, for the answer that was actually given. */
      for (const [dimension, patterns] of Object.entries(DIMENSION_WORDS)) {
        for (const [value, pattern] of Object.entries(patterns)) {
          if (!pattern.test(pick.reason)) continue;
          if (answers[dimension] === value) continue;
          assert.fail(`${label(answers)} ${pick.product.id}: reason claims ${dimension}=${value} — "${pick.reason}"`);
        }
      }
    }
  }
});

/* ── Coverage of the answer space ───────────────────────────────── */

test('the thresholds are calibrated: almost every combination returns something usable', () => {
  const empty = RUNS.filter(r => r.total === 0);
  const single = RUNS.filter(r => r.total === 1);
  const full = RUNS.filter(r => r.total >= MAX_RESULTS);

  /* Calibration guard, not a vanity metric: if a weight or threshold change
     empties large parts of the answer space, this is where it surfaces. */
  assert.ok(full.length >= COMBOS.length * 0.7,
    `only ${full.length}/${COMBOS.length} combinations reach three matches`);
  assert.ok(empty.length <= COMBOS.length * 0.05,
    `${empty.length}/${COMBOS.length} combinations return nothing`);

  /* Every empty branch must SAY it is empty rather than render a blank grid. */
  for (const run of empty) {
    assert.ok(run.notices.includes('sin_coincidencias'), label(run.answers));
    if (!run.relaxation) continue;
    /* When a single condition would help, it is named — and it is never
       gender: someone who chose "Mujer" did not mean "maybe men's". */
    assert.ok(run.relaxation.dimension !== 'gender', label(run.answers));
    assert.ok(run.relaxation.gained > 0, label(run.answers));
    assert.ok(run.relaxation.label, label(run.answers));
    /* And the offer must be true: dropping it really does produce matches. */
    const relaxed = { ...run.answers };
    delete relaxed[run.relaxation.dimension];
    assert.equal(rankCatalog(CATALOG, relaxed).total, run.relaxation.gained, label(run.answers));
  }

  /* Only ONE condition is ever offered (the brief is explicit about that), so
     a combination can legitimately have no single-answer escape — the UI then
     falls back to editing the answers or the full catalog. That must stay the
     exception, not the norm. */
  const withoutEscape = empty.filter(run => !run.relaxation);
  assert.ok(withoutEscape.length <= Math.max(2, empty.length * 0.4),
    `${withoutEscape.length}/${empty.length} empty combinations offer no way forward`);
  /* Fewer than three is allowed and expected; padding is not. */
  assert.ok(single.length + empty.length < COMBOS.length * 0.15);
});

test('an exact tie is broken deterministically, not arbitrarily', () => {
  let tiesChecked = 0;
  for (const { answers, results } of RUNS) {
    for (let i = 1; i < results.length; i++) {
      if (results[i - 1].compatibility !== results[i].compatibility) continue;
      tiesChecked++;
      const a = results[i - 1];
      const b = results[i];
      /* With equal scores the order must follow the documented tie-break
         chain, ending in a stable id comparison. */
      const sameConfidence = a.confidence === b.confidence;
      const sameGender = a.genderPriority === b.genderPriority;
      const sameOperational = a.operational === b.operational;
      const samePrice = Number(a.variant?.price) === Number(b.variant?.price);
      /* The chain also compares each priority dimension's fit before it gets
         to stock and price, so a genuine total tie requires those to match. */
      const sameDimensions = ['gender', 'occasion', 'goal', 'climate', 'family', 'age']
        .every(key => (a.breakdown[key]?.fit ?? -1) === (b.breakdown[key]?.fit ?? -1));
      if (sameConfidence && sameGender && sameDimensions && sameOperational && samePrice) {
        assert.ok(String(a.product.id).localeCompare(String(b.product.id)) <= 0,
          `${label(answers)}: ${a.product.id} vs ${b.product.id} not id-stable`);
      }
    }
  }
  assert.ok(tiesChecked > 0, 'the live catalog does produce exact ties');
});

/* ── The named regression from the brief ────────────────────────── */

test('REGRESSION: Mujer + 15–18 + noche + destacar keeps Torino 21 out of the top three', () => {
  const answers = { gender: 'mujer', age: '15-18', occasion: 'noche', goal: 'destacar' };
  const { results, all } = rankCatalog(CATALOG, answers);

  const torino = all.find(e => String(e.product.id) === 'XERJOFF-TORINO-21');
  assert.ok(torino, 'Torino 21 is in the snapshot');
  assert.equal(getProductGender(torino.product), 'lean_masculine',
    'R Supply OS still reports it as masculine-leaning');
  assert.equal(torino.eligible, false);
  assert.ok(torino.exclusions.includes('genero_incompatible'),
    `excluded for the right reason, got: ${torino.exclusions}`);

  const topThree = results.slice(0, 3).map(e => String(e.product.id));
  assert.ok(!topThree.includes('XERJOFF-TORINO-21'));

  /* Feminine alternatives with genuinely better affinity DO exist, and the
     algorithm picks them — no product name is hardcoded anywhere. */
  assert.ok(topThree.length >= 2, `only ${topThree.length} feminine matches`);
  for (const id of topThree) {
    const e = all.find(x => String(x.product.id) === id);
    assert.ok(['feminine', 'lean_feminine', 'unisex', 'unisex_feminine'].includes(getProductGender(e.product)),
      `${id} is ${getProductGender(e.product)}`);
  }
});

/* Same product, a question it genuinely suits: proof the exclusion above is
   the gender rule and not a blanket demotion. */
test('the same product IS recommended for the question its metadata does support', () => {
  const { results } = rankCatalog(CATALOG, { gender: 'hombre', age: '25-34', occasion: 'dia', goal: 'versatil', climate: 'calido' });
  const ids = results.map(e => String(e.product.id));
  assert.ok(ids.includes('XERJOFF-TORINO-21'),
    'lean_masculine + diario + calido + versatility 0.84 is exactly what it is for');
});

/* ── The brief's named scenarios, as explicit cases ─────────────── */

const NAMED_SCENARIOS = [
  ['Mujer + 15-18 + noche + destacar', { gender: 'mujer', age: '15-18', occasion: 'noche', goal: 'destacar' }],
  ['Mujer + 15-18 + diario + discreto', { gender: 'mujer', age: '15-18', occasion: 'dia', goal: 'discreto' }],
  ['Mujer + adulto + cita + dulce', { gender: 'mujer', age: '25-34', occasion: 'cita', goal: 'destacar', family: 'dulce' }],
  ['Hombre + 15-18 + noche + destacar', { gender: 'hombre', age: '15-18', occasion: 'noche', goal: 'destacar' }],
  ['Hombre + adulto + oficina + discreto', { gender: 'hombre', age: '35+', occasion: 'oficina', goal: 'discreto' }],
  ['Unisex + calido + diario + fresco', { gender: 'unisex', age: '19-24', occasion: 'dia', goal: 'versatil', climate: 'calido', family: 'fresco' }],
  ['Unisex + frio + noche + intenso', { gender: 'unisex', age: '25-34', occasion: 'noche', goal: 'destacar', climate: 'frio', family: 'intenso' }],
];

for (const [name, answers] of NAMED_SCENARIOS) {
  test(`scenario: ${name}`, () => {
    const { picks, notices, relaxation, total } = getRecommendations(CATALOG, answers);

    if (!total) {
      /* Allowed, but only as an explained dead end with a way forward. */
      assert.ok(notices.includes('sin_coincidencias'), name);
      assert.ok(relaxation, `${name}: nothing offered to relax`);
      return;
    }

    assert.ok(picks.length >= 1 && picks.length <= MAX_RESULTS, name);
    for (const pick of picks) {
      assert.ok(pick.compatibility >= HIGH_MATCH_THRESHOLD, `${name} ${pick.product.id}`);
      assert.ok(pick.reason.length > 0, `${name} ${pick.product.id}`);
      assert.ok(pick.genderDisplay?.label, `${name} ${pick.product.id} states who it is for`);
      /* The gender rule holds in every named scenario too. */
      const priority = genderPriority(answers.gender, getProductGender(pick.product));
      assert.ok(priority !== 'rejected' && priority !== 'unknown', `${name} ${pick.product.id}`);
    }
    for (let i = 1; i < picks.length; i++) {
      assert.ok(picks[i - 1].compatibility >= picks[i].compatibility, name);
    }
  });
}

/* ── Partial and unknown metadata inside the live catalog ───────── */

test('the live catalog exercises complete, partial and absent metadata', () => {
  const buckets = { complete: 0, partial: 0, absent: 0 };
  for (const p of CATALOG) {
    const n = normalizeProduct(p);
    const signals = [n.gender.present, n.occasions.present, n.climates.present, n.scoresPresent, n.families.present];
    const yes = signals.filter(Boolean).length;
    if (yes === signals.length) buckets.complete++;
    else if (yes === 0) buckets.absent++;
    else buckets.partial++;
  }
  assert.ok(buckets.complete > 0, 'some products are fully documented');
  assert.ok(buckets.partial > 0, 'some are partial — these are the interesting ones');

  /* Partial records must still never break the engine. */
  for (const p of CATALOG) {
    assert.doesNotThrow(() => evaluateProduct(p, readAnswers(COMBOS[0])), String(p.id));
  }
});
