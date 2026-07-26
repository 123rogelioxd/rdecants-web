/* =============================================================
   The guided finder: its questions, and the shape it hands to the UI.

   The scoring itself is covered by tests/engine.test.js and the exhaustive
   sweep in tests/answerMatrix.test.js. This file guards the contract the
   finder page depends on.

   Note on fixtures: every product here carries a `fragrance` record. That
   is not padding — the engine deliberately refuses to make a
   high-confidence recommendation from a product whose only signal is words
   in its description, so a fixture without metadata tests the exclusion
   rule rather than the ranking.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_QUESTIONS,
  questionAnswerIds,
  getAssistantRecommendations,
  resolvePreference,
  rankCatalogForAnswers,
} from '../assets/js/recommendations/assistant.js';
import { HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE } from '../assets/js/recommendations/engine.js';

const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});

const apiProduct = (id, fragrance, opts = {}) => ({
  id,
  name: id,
  house: opts.house ?? 'House',
  gender: opts.gender ?? 'unisex',
  notes: opts.notes ?? [],
  desc: opts.desc ?? '',
  story: opts.story ?? opts.desc ?? '',
  badge: opts.badge ?? 'Disponible',
  featured: opts.featured ?? false,
  active: opts.active,
  status: opts.status,
  variants: opts.variants ?? [variant(5, opts.price ?? 180, opts.stock ?? 20)],
  fragrance,
});

/* A well-documented office-friendly fresh scent, and its opposite. */
const OFFICE_FRESH = {
  occasions: ['oficina', 'diario'],
  climates: ['calido', 'templado'],
  moods: ['limpio', 'moderno'],
  style_tags: ['fresco', 'limpio'],
  recommendation_tags: ['oficina', 'diario', 'facil_de_usar'],
  accords: ['citrico', 'acuatico'],
  scent_family_normalized: 'citrico',
  scores: {
    office_safe: 90, versatility: 88, mass_appeal: 80, blind_buy_safe: 82,
    beginner_friendly: 85, freshness: 88, summer: 90, cold_weather: 40,
    intensity: 35, projection: 40, longevity: 60, night_out: 30,
    date_night: 55, compliment: 65, elegance: 65, sweetness: 20,
  },
};

const NIGHT_LOUD = {
  occasions: ['noche', 'fiesta'],
  climates: ['frio'],
  moods: ['nocturno', 'seductor', 'dulce'],
  style_tags: ['llamativo', 'gourmand'],
  recommendation_tags: ['noche', 'alto_rendimiento'],
  accords: ['vainilla', 'ambar'],
  scent_family_normalized: 'gourmand',
  scores: {
    office_safe: 12, versatility: 35, mass_appeal: 72, blind_buy_safe: 45,
    beginner_friendly: 40, freshness: 20, summer: 25, cold_weather: 90,
    intensity: 92, projection: 90, longevity: 92, night_out: 95,
    date_night: 88, compliment: 88, elegance: 60, sweetness: 90,
  },
};

const ids = (list) => list.map(r => r.product.id);

/* ── A. The questions ───────────────────────────────────────────── */

test('asks four one-tap questions, and never opens on a scent-family quiz', () => {
  assert.equal(ASSISTANT_QUESTIONS.length, 4);
  assert.deepEqual(
    ASSISTANT_QUESTIONS.map(q => q.id),
    ['audience', 'occasion', 'goal', 'climate'],
  );
  /* A beginner cannot answer "fresco / dulce / intenso" before smelling
     anything; the family stays an optional URL refinement. */
  assert.notEqual(ASSISTANT_QUESTIONS[0].id, 'family');

  for (const q of ASSISTANT_QUESTIONS) {
    assert.ok(q.id && q.label, 'every question is identified and labelled');
    const groups = q.groups ?? [{ id: q.id, options: q.options }];
    for (const group of groups) {
      assert.ok(Array.isArray(group.options) && group.options.length >= 2, `${q.id} offers a real choice`);
      for (const option of group.options) {
        assert.ok(option.value && option.label, `${q.id} options are complete`);
      }
    }
  }
});

test('step one collects who it is for and an age range on one screen', () => {
  const audience = ASSISTANT_QUESTIONS[0];
  assert.deepEqual(audience.groups.map(g => g.id), ['gender', 'age']);
  assert.deepEqual(questionAnswerIds(audience), ['gender', 'age']);

  const gender = audience.groups[0];
  /* Three real values. "Me da igual" is gone: the brief asks for
     hombre / mujer / unisex, and an opt-out was scoring nothing anyway. */
  assert.deepEqual(gender.options.map(o => o.value), ['hombre', 'mujer', 'unisex']);

  const age = audience.groups[1];
  assert.deepEqual(age.options.map(o => o.value), ['15-18', '19-24', '25-34', '35+']);
});

test('step two asks where it will be worn, in plain language', () => {
  const occasion = ASSISTANT_QUESTIONS[1];
  assert.deepEqual(
    occasion.options.map(o => o.value),
    ['dia', 'oficina', 'cita', 'noche', 'regalo'],
  );
  assert.match(occasion.options[0].label, /escuela/i, 'daily is phrased for a student too');
  assert.deepEqual(questionAnswerIds(occasion), ['occasion']);
});

test('step three offers all three outcomes, including "discreto"', () => {
  const goal = ASSISTANT_QUESTIONS[2];
  assert.deepEqual(goal.options.map(o => o.value), ['versatil', 'destacar', 'discreto']);
});

test('step four asks the climate, which is a scored dimension not decoration', () => {
  const climate = ASSISTANT_QUESTIONS[3];
  assert.deepEqual(climate.options.map(o => o.value), ['calido', 'templado', 'frio']);

  /* Proof it is not decoration: two products identical on every other
     dimension, differing only in their climate metadata. Flip the climate
     answer and the winner flips with it. */
  const base = {
    occasions: ['diario', 'oficina'],
    moods: ['limpio', 'moderno'],
    style_tags: ['limpio'],
    recommendation_tags: ['diario'],
    accords: ['citrico'],
    scent_family_normalized: 'citrico',
  };
  const shared = {
    versatility: 82, mass_appeal: 80, blind_buy_safe: 78, beginner_friendly: 80,
    office_safe: 82, intensity: 45, projection: 45, longevity: 65,
    night_out: 40, date_night: 55, compliment: 65, elegance: 65, sweetness: 30,
  };
  const warm = apiProduct('WarmWeather', {
    ...base, climates: ['calido', 'verano'],
    scores: { ...shared, freshness: 88, summer: 92, cold_weather: 30 },
  });
  const cold = apiProduct('ColdWeather', {
    ...base, climates: ['frio', 'invierno'],
    scores: { ...shared, freshness: 45, summer: 30, cold_weather: 92 },
  });
  const answers = { occasion: 'dia', goal: 'versatil' };

  assert.equal(getAssistantRecommendations({ ...answers, climate: 'calido' }, [warm, cold])[0].product.id, 'WarmWeather');
  assert.equal(getAssistantRecommendations({ ...answers, climate: 'frio' }, [warm, cold])[0].product.id, 'ColdWeather');

  /* And with no climate answered at all, the dimension contributes nothing —
     the two are indistinguishable. */
  const neutral = getAssistantRecommendations(answers, [warm, cold]);
  assert.equal(neutral[0].compatibility, neutral[1].compatibility);
});

/* ── B. Result contract ─────────────────────────────────────────── */

test('never returns more than three recommendations', () => {
  const big = Array.from({ length: 12 }, (_, i) => apiProduct(`P${i}`, OFFICE_FRESH, { price: 150 + i }));
  const res = getAssistantRecommendations({ occasion: 'oficina', goal: 'versatil', climate: 'calido' }, big);
  assert.ok(res.length <= 3, `got ${res.length}`);
});

test('returns nothing for an empty catalog', () => {
  assert.deepEqual(getAssistantRecommendations({ occasion: 'dia' }, []), []);
  assert.deepEqual(getAssistantRecommendations({ occasion: 'dia' }, null), []);
});

test('ranks the strongest match first', () => {
  const strong = apiProduct('OfficeFresh', OFFICE_FRESH, { price: 160 });
  const weak = apiProduct('NightLoud', NIGHT_LOUD, { price: 220, featured: true, badge: 'TRENDING' });
  const res = getAssistantRecommendations(
    { occasion: 'oficina', goal: 'discreto', climate: 'calido' },
    [weak, strong],
  );
  assert.equal(res[0].product.id, 'OfficeFresh');
  assert.equal(res[0].matchTier.key, 'high');
});

test('every result carries a bounded score, a tier, a one-line reason and a breakdown', () => {
  const res = getAssistantRecommendations(
    { gender: 'unisex', age: '25-34', occasion: 'oficina', goal: 'versatil', climate: 'calido' },
    [apiProduct('A', OFFICE_FRESH), apiProduct('B', OFFICE_FRESH, { price: 200 })],
  );
  assert.ok(res.length >= 1);
  for (const r of res) {
    assert.ok(r.compatibility >= HIGH_MATCH_THRESHOLD && r.compatibility <= 100, `score ${r.compatibility}`);
    assert.ok(r.confidence >= MIN_CONFIDENCE && r.confidence <= 1, `confidence ${r.confidence}`);
    assert.ok(r.matchTier && r.matchTier.label);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0 && r.reason.length <= 130, r.reason);
    assert.doesNotMatch(r.reason, /\d+\s?%/, 'no false-precision percentage');
    assert.equal(typeof r.useCase, 'string');
    /* The full breakdown is kept for debugging, not shown on the card. */
    for (const [key, entry] of Object.entries(r.scoreBreakdown)) {
      assert.ok(entry.weight > 0, key);
      assert.ok(entry.coverage >= 0 && entry.coverage <= 1, key);
      assert.ok(entry.fit === null || (entry.fit >= 0 && entry.fit <= 1), key);
    }
  }
});

test('never recommends a sold-out or inactive product, however good its metadata', () => {
  const active = apiProduct('ActiveOffice', OFFICE_FRESH);
  const inactive = apiProduct('InactiveOffice', OFFICE_FRESH, { active: false });
  const outOfStock = apiProduct('OutOfStockOffice', OFFICE_FRESH, { stock: 0, variants: [variant(5, 180, 0)] });
  const noVariantId = apiProduct('NoVariantId', OFFICE_FRESH, {
    variants: [{ ...variant(5, 180, 10), variant_id: null }],
  });

  const res = getAssistantRecommendations(
    { occasion: 'oficina', goal: 'versatil', climate: 'calido' },
    [inactive, outOfStock, noVariantId, active],
    { limit: 4 },
  );
  assert.deepEqual(ids(res), ['ActiveOffice']);
});

test('among equally-fitting options, healthier stock and the featured flag break the tie', () => {
  const plain = apiProduct('Plain', OFFICE_FRESH, { stock: 4 });
  const featured = apiProduct('Featured', OFFICE_FRESH, { stock: 30, featured: true });
  const res = getAssistantRecommendations(
    { occasion: 'oficina', goal: 'versatil', climate: 'calido' },
    [plain, featured],
  );
  assert.equal(res[0].compatibility, res[1].compatibility, 'the two are genuinely equally suitable');
  assert.equal(res[0].product.id, 'Featured');
});

/* ── C. Budget is a constraint on what can be bought ───────────── */

test('budget excludes products whose only purchasable variants are out of band', () => {
  const cheap = apiProduct('Cheap', OFFICE_FRESH, { price: 120 });
  const pricey = apiProduct('Pricey', OFFICE_FRESH, { price: 400 });
  const answers = { occasion: 'oficina', goal: 'versatil', climate: 'calido' };

  assert.deepEqual(ids(getAssistantRecommendations({ ...answers, budget: 'low' }, [cheap, pricey])), ['Cheap']);
  assert.deepEqual(ids(getAssistantRecommendations({ ...answers, budget: 'high' }, [cheap, pricey])), ['Pricey']);
  assert.deepEqual(ids(getAssistantRecommendations({ ...answers, budget: 'mid' }, [cheap, pricey])), []);
});

test('budget picks the exact purchasable variant inside the band', () => {
  const split = apiProduct('SplitPrice', OFFICE_FRESH, {
    variants: [variant(3, 200, 10), variant(5, 400, 10)],
  });
  const res = getAssistantRecommendations(
    { occasion: 'oficina', goal: 'versatil', climate: 'calido', budget: 'mid' },
    [split],
  );
  assert.equal(res.length, 1);
  assert.equal(res[0].variant.size, 3);
  assert.ok(res[0].variant.price >= 150 && res[0].variant.price <= 250);
});

test('budget boundaries are inclusive on both edges', () => {
  const lowEdge = apiProduct('LowEdge', OFFICE_FRESH, { price: 150 });
  const midEdge = apiProduct('MidEdge', OFFICE_FRESH, { price: 250 });
  const answers = { occasion: 'oficina', goal: 'versatil', climate: 'calido' };
  assert.deepEqual(ids(getAssistantRecommendations({ ...answers, budget: 'low' }, [lowEdge, midEdge])), ['LowEdge']);
  assert.deepEqual(
    ids(getAssistantRecommendations({ ...answers, budget: 'mid' }, [lowEdge, midEdge])).sort(),
    ['LowEdge', 'MidEdge'],
  );
});

/* ── D. The dimension rules, each on its own ────────────────────── */

test('Diario prefers wearable daytime versatility over a night-only profile', () => {
  const daytimeSweet = apiProduct('DaySweet', {
    occasions: ['diario', 'escuela'],
    climates: ['calido', 'templado'],
    moods: ['dulce', 'limpio'],
    style_tags: ['dulce', 'versatil'],
    recommendation_tags: ['diario', 'facil_de_usar'],
    scent_family_normalized: 'gourmand',
    scores: { sweetness: 55, freshness: 70, versatility: 90, mass_appeal: 88, blind_buy_safe: 80, beginner_friendly: 85, intensity: 40, projection: 45, office_safe: 75, summer: 80, cold_weather: 50, night_out: 30, longevity: 60 },
  });
  const nightSweet = apiProduct('NightSweet', NIGHT_LOUD, { featured: true, badge: 'TRENDING' });

  const res = getAssistantRecommendations({ family: 'dulce', occasion: 'dia', goal: 'versatil' }, [nightSweet, daytimeSweet], { limit: 2 });
  assert.equal(res[0].product.id, 'DaySweet');
  assert.match(res[0].reason, /día a día/i);
  assert.doesNotMatch(res[0].reason, /noche|fiesta/i, 'does not invent unrelated night reasons');
});

test('Clima cálido prefers real warm-weather metadata over a cold heavy profile', () => {
  const hotFresh = apiProduct('HotFresh', OFFICE_FRESH);
  const coldHeavy = apiProduct('ColdHeavy', { ...NIGHT_LOUD, occasions: ['diario'] });

  const res = getAssistantRecommendations({ family: 'fresco', climate: 'calido', occasion: 'dia' }, [coldHeavy, hotFresh], { limit: 2 });
  assert.equal(res[0].product.id, 'HotFresh');
  assert.match(res[0].reason, /clima cálido/i);
});

test('Oficina + discreto prefers office-safe restraint and excludes an intrusive profile', () => {
  const officeLong = apiProduct('OfficeLong', {
    ...OFFICE_FRESH,
    scores: { ...OFFICE_FRESH.scores, longevity: 88, projection: 45, office_safe: 92 },
  });
  const intrusiveLong = apiProduct('IntrusiveLong', NIGHT_LOUD, { featured: true, badge: 'TRENDING' });

  const res = getAssistantRecommendations(
    { occasion: 'oficina', goal: 'discreto', climate: 'templado' },
    [intrusiveLong, officeLong],
    { limit: 2 },
  );
  assert.equal(res[0].product.id, 'OfficeLong');
  assert.match(res[0].reason, /oficina/i);

  /* office_safe 0.12 is the backend saying "not for the office". That is a
     hard contradiction, not a penalty to be out-scored by a TRENDING badge. */
  assert.ok(!ids(res).includes('IntrusiveLong'));
});

test('Noche needs night metadata, not one isolated tag', () => {
  /* The Torino-21 shape: no `occasions` at all, a `cita` tag in
     recommendation_tags, and no night performance. It must not read as a
     night fragrance just because a related tag exists. */
  const tagOnly = apiProduct('TagOnly', {
    occasions: [],
    climates: ['templado'],
    moods: ['social', 'limpio'],
    style_tags: ['fresco'],
    recommendation_tags: ['cita', 'social', 'oficina'],
    scent_family_normalized: 'citrico',
    scores: { night_out: 30, projection: 35, intensity: 30, longevity: 45, versatility: 80, office_safe: 85, mass_appeal: 70, blind_buy_safe: 70, beginner_friendly: 70, summer: 80, cold_weather: 40, freshness: 80, sweetness: 20, compliment: 55, date_night: 50, elegance: 55 },
  });
  const genuineNight = apiProduct('GenuineNight', NIGHT_LOUD);

  const res = getAssistantRecommendations({ occasion: 'noche', goal: 'destacar' }, [tagOnly, genuineNight], { limit: 2 });
  assert.equal(res[0].product.id, 'GenuineNight');
  assert.ok(!ids(res).includes('TagOnly'), 'night_out 0.30 contradicts a night recommendation');
});

test('Cita rewards real date metadata and does not borrow party reasons', () => {
  const dateElegant = apiProduct('DateElegant', {
    occasions: ['cita', 'formal'],
    climates: ['templado'],
    moods: ['elegante', 'seductor'],
    style_tags: ['elegante', 'premium'],
    recommendation_tags: ['cita', 'evento_formal'],
    accords: ['sandalo', 'almizcle'],
    scent_family_normalized: 'amaderado',
    scores: { date_night: 90, compliment: 82, longevity: 80, versatility: 70, mass_appeal: 74, projection: 65, intensity: 60, office_safe: 60, summer: 55, cold_weather: 60, elegance: 88, blind_buy_safe: 65, beginner_friendly: 65 },
  });
  const partyLoud = apiProduct('PartyLoud', { ...NIGHT_LOUD, occasions: ['fiesta', 'antro'], scores: { ...NIGHT_LOUD.scores, date_night: 40 } }, { featured: true });

  const res = getAssistantRecommendations({ family: 'elegante', occasion: 'cita', goal: 'destacar' }, [partyLoud, dateElegant], { limit: 2 });
  assert.equal(res[0].product.id, 'DateElegant');
  assert.match(res[0].reason, /cita/i);
  assert.doesNotMatch(res[0].reason, /fiesta|antro/i, 'does not invent party reasons');
});

test('Regalo scores off mass appeal and blind-buy safety, and is no longer inert', () => {
  const safeGift = apiProduct('SafeGift', {
    ...OFFICE_FRESH,
    occasions: ['regalo', 'diario'],
    scores: { ...OFFICE_FRESH.scores, mass_appeal: 92, blind_buy_safe: 90, beginner_friendly: 90 },
  });
  const riskyGift = apiProduct('RiskyGift', {
    ...NIGHT_LOUD,
    occasions: ['regalo'],
    scores: { ...NIGHT_LOUD.scores, mass_appeal: 40, blind_buy_safe: 20 },
  });

  const res = getAssistantRecommendations({ occasion: 'regalo' }, [riskyGift, safeGift], { limit: 2 });
  assert.equal(res[0].product.id, 'SafeGift');
  assert.match(res[0].reason, /regalar/i);
  /* blind_buy_safe 0.20 contradicts "safe to gift". */
  assert.ok(!ids(res).includes('RiskyGift'));
});

test('a gift with no stated goal is treated as the safe option', () => {
  assert.equal(resolvePreference({ occasion: 'regalo' }), 'versatil');
  assert.equal(resolvePreference({ occasion: 'regalo', preference: 'destacar' }), 'destacar');
  assert.equal(resolvePreference({ occasion: 'regalo', goal: 'discreto' }), 'discreto');
  assert.equal(resolvePreference({ occasion: 'dia' }), null, 'no preference is not a preference');
});

/* ── E. The guided catalog uses the same order ─────────────────── */

test('the guided catalog ranking is the finder ranking, uncapped', () => {
  const catalog = [
    apiProduct('A', OFFICE_FRESH, { price: 150 }),
    apiProduct('B', OFFICE_FRESH, { price: 160, stock: 30, featured: true }),
    apiProduct('C', { ...OFFICE_FRESH, scores: { ...OFFICE_FRESH.scores, office_safe: 80, versatility: 80 } }, { price: 170 }),
    apiProduct('E', { ...OFFICE_FRESH, scores: { ...OFFICE_FRESH.scores, office_safe: 74, versatility: 74 } }, { price: 175 }),
    apiProduct('D', NIGHT_LOUD, { price: 180 }),
  ];
  const answers = { occasion: 'oficina', goal: 'versatil', climate: 'calido' };

  const full = rankCatalogForAnswers(answers, catalog);
  const capped = getAssistantRecommendations(answers, catalog);

  assert.ok(full.length > capped.length, 'uncapped is longer');
  assert.deepEqual(
    full.slice(0, capped.length).map(r => r.product.id),
    capped.map(r => r.product.id),
    'the grid and the three picks can never disagree about the order',
  );
  assert.equal(full[0].isTop, true);
  assert.deepEqual(full.map(r => r.rank), full.map((_, i) => i + 1));
  assert.ok(!full.map(r => r.product.id).includes('D'), 'only high-compatibility matches are in guided mode');
});
