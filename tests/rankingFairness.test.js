/* =============================================================
   RDECANTS — RANKING FAIRNESS & FIT DOMINANCE
   Deterministic guarantees for the guided finder / guided-catalog engine
   (assets/js/recommendations/assistant.js):

     • FIT (context + olfactive + performance fit) decides the order.
     • Price, operational health (stock/demand) and "featured" status may
       ONLY break a true near-tie (same FIT_BAND) — they can never bury a
       genuinely better match, and a top pick is never the most expensive
       product merely because it is more commercially convenient.
     • Sold-out and unpriced products never appear.
     • Reasons differentiate across the result set.
     • Ranking is fully deterministic (stable across repeated runs).

   These tests exercise the real engine end-to-end (not the internal score
   functions) so they keep validating the customer-visible contract even if
   the scoring internals change.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAssistantRecommendations, rankCatalogForAnswers } from '../assets/js/recommendations/assistant.js';

const variant = (size, price, stock = 20) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});

const product = (id, fragrance, { price = 180, stock = 20, featured = false, badge = 'Disponible', variants = null } = {}) => ({
  id, name: id, house: 'House', notes: [], desc: '', story: '',
  badge, featured, stock,
  variants: variants ?? [variant(5, price, stock)],
  fragrance,
});

const ids = list => list.map(r => r.product.id);
const ANSWERS = { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'any' };

/* A precise fit signal set for "fresco / oficina / calido" — every wanted tag
   the engine's CONTEXT_RULES / FAMILY_RULES look for. */
const STRONG_FIT = {
  scent_family_normalized: 'fresh',
  recommendation_tags: ['oficina', 'trabajo', 'diario'],
  recommended_context_tags: ['office', 'daily'],
  climates: ['calido'],
  style_tags: ['fresco', 'limpio', 'discreto'],
  accords: ['citrico', 'acuatico'],
  scores: { freshness: 0.8, versatility: 0.8, projection: 0.3 },
};

/* No overlap at all with the wanted tags above — fit === 0, so the engine's
   own `.filter(entry => entry.fit > 0)` excludes it regardless of price. */
const NO_FIT = {
  scent_family_normalized: 'oriental',
  recommendation_tags: ['antro', 'club'],
  recommended_context_tags: ['night'],
  climates: ['frio'],
  style_tags: ['intenso', 'llamativo'],
  accords: ['oud', 'cuero'],
  scores: { freshness: 0.05, versatility: 0.1, projection: 0.95 },
};

/* A weaker but genuinely non-zero fit for "fresco / oficina / calido": one
   overlapping tag ("limpio" hits both the oficina context rule and the
   fresco family rule) with none of STRONG_FIT's other supporting signals —
   clearly weaker, but not filtered out as fit === 0. */
const WEAK_FIT = {
  scent_family_normalized: 'woody',
  recommendation_tags: ['diario'],
  recommended_context_tags: [],
  climates: [],
  style_tags: ['limpio'],
  accords: ['madera'],
  scores: { freshness: 0.4, versatility: 0.4, projection: 0.5 },
};

/* ── Fit beats price ─────────────────────────────────────────── */

test('a strong-fit cheap product outranks a weak-fit expensive product', () => {
  const cheap = product('CheapStrongFit', STRONG_FIT, { price: 120 });
  const pricey = product('PriceyWeakFit', WEAK_FIT, { price: 500 });
  const res = getAssistantRecommendations(ANSWERS, [cheap, pricey]);
  assert.equal(res[0].product.id, 'CheapStrongFit', 'better fit wins even though it is far cheaper');
});

test('a strong-fit product outranks a weak-fit product even when the weak one is far more expensive AND has higher stock/demand', () => {
  const cheap = product('CheapStrongFit', STRONG_FIT, { price: 120, stock: 3 });
  const pricey = product('PriceyWeakFitHighStock', WEAK_FIT, { price: 600, stock: 200, featured: true, badge: 'Más pedido' });
  const res = getAssistantRecommendations(ANSWERS, [cheap, pricey]);
  assert.equal(res[0].product.id, 'CheapStrongFit',
    'operational/commercial signals (stock, featured, demand badge) cannot outrank a clearly better fit');
});

/* ── The literal "AOV bias" guard ────────────────────────────── */

test('the top recommendation is never the most expensive product merely because it improves AOV', () => {
  const strongCheap  = product('StrongCheap',  STRONG_FIT, { price: 100 });
  const noFitLuxury  = product('NoFitLuxury',  NO_FIT,     { price: 900, featured: true, badge: 'Más pedido' });
  const weakMid       = product('WeakMid',      WEAK_FIT,   { price: 300 });

  const res = getAssistantRecommendations(ANSWERS, [strongCheap, noFitLuxury, weakMid]);

  assert.equal(res[0].product.id, 'StrongCheap', 'top pick is the best FIT, not the highest price');
  assert.ok(!ids(res).includes('NoFitLuxury'),
    'a product with zero fit signal is excluded outright, however expensive or "featured" it is');
});

/* ── Price/operational health ONLY break a true near-tie ───────── */

test('within a near-tie in fit, the cheaper option is recommended first', () => {
  /* Two products with the SAME fit profile (same tags/scores) — only price
     should distinguish them. */
  const cheaper = product('TieCheaper', STRONG_FIT, { price: 130 });
  const pricier = product('TiePricier', STRONG_FIT, { price: 310 });
  const res = getAssistantRecommendations(ANSWERS, [cheaper, pricier]);
  assert.equal(res[0].product.id, 'TieCheaper', 'a true near-tie in fit is broken toward the more accessible price');
});

test('a clearly better fit is never displaced by price, even when the better-fit product costs more', () => {
  const expensiveButBetterFit = product('ExpensiveBetterFit', STRONG_FIT, { price: 400 });
  const cheapButWeakerFit = product('CheapWeakerFit', WEAK_FIT, { price: 90 });
  const res = getAssistantRecommendations(ANSWERS, [expensiveButBetterFit, cheapButWeakerFit]);
  assert.equal(res[0].product.id, 'ExpensiveBetterFit',
    'a genuinely superior match wins regardless of price when the fit gap exceeds a near-tie band');
});

/* ── Sold-out / unpriced products never appear ──────────────────── */

test('a sold-out product is never recommended, regardless of fit quality', () => {
  const soldOut = product('SoldOutPerfectFit', STRONG_FIT, {
    price: 100,
    variants: [{ ...variant(5, 100, 0), soldOut: true, available: false }],
  });
  const fallback = product('Fallback', WEAK_FIT, { price: 200 });
  const res = getAssistantRecommendations(ANSWERS, [soldOut, fallback]);
  assert.ok(!ids(res).includes('SoldOutPerfectFit'));
});

test('a product with no valid priced variant is never recommended', () => {
  const unpriced = product('NoPricePerfectFit', STRONG_FIT, {
    price: 0,
    variants: [{ ...variant(5, 0, 20) }],
  });
  const fallback = product('Fallback2', WEAK_FIT, { price: 200 });
  const res = getAssistantRecommendations(ANSWERS, [unpriced, fallback]);
  assert.ok(!ids(res).includes('NoPricePerfectFit'));
});

/* ── Reasons differentiate the result set ───────────────────────── */

/* The old version of this test asserted the top results never share a reason
   string. That is the wrong contract: two fragrances with genuinely the same
   affinity on the same dimensions SHOULD read the same, and forcing variety
   would mean writing copy the metadata does not support. What must hold is
   that a reason names the dimensions that actually scored, and that changing
   which dimensions score changes the reason. */
test('a reason names only the dimensions that actually contributed points', () => {
  const officeFresh = product('OfficeFresh', STRONG_FIT, { price: 130 });
  const res = getAssistantRecommendations(ANSWERS, [officeFresh]);
  assert.equal(res.length, 1);

  const reason = res[0].reason;
  const contributed = Object.entries(res[0].scoreBreakdown)
    .filter(([, entry]) => entry.contribution > 0)
    .map(([key]) => key);

  assert.ok(contributed.includes('occasion') && contributed.includes('climate'),
    'the answered dimensions with metadata contributed');
  assert.match(reason, /oficina/i, 'and the reason says so');
  assert.doesNotMatch(reason, /noche|fiesta|cita/i, 'never a dimension that scored nothing');
  assert.doesNotMatch(reason, /\d+\s?%/, 'no false-precision percentage on the card');
  assert.ok(reason.length <= 120, `one line, got ${reason.length} chars: ${reason}`);
});

test('a different set of contributing dimensions produces a different reason', () => {
  const office = product('OfficeOnly', STRONG_FIT, { price: 130 });
  const res = getAssistantRecommendations(ANSWERS, [office]);

  /* Same product, a different question: the reason must follow the answers,
     not the product. */
  const nightAnswers = { occasion: 'noche', goal: 'destacar' };
  const nightReady = product('NightReady', {
    ...STRONG_FIT,
    occasions: ['noche', 'fiesta'],
    scores: { night_out: 0.9, projection: 0.85, intensity: 0.8, longevity: 0.85, compliment: 0.8 },
  }, { price: 130 });
  const nightRes = getAssistantRecommendations(nightAnswers, [nightReady]);

  assert.equal(nightRes.length, 1);
  assert.notEqual(res[0].reason, nightRes[0].reason);
  assert.match(nightRes[0].reason, /noche/i);
  assert.match(nightRes[0].reason, /destacar/i);
});

test('a product with no usable metadata is excluded rather than given filler copy', () => {
  const bare = product('NoMetadata', null, { price: 100 });
  const res = getAssistantRecommendations(ANSWERS, [bare, product('Real', STRONG_FIT)]);
  assert.deepEqual(ids(res), ['Real']);
});

/* ── The full guided-catalog re-rank (rankCatalogForAnswers) shares the
   same fairness contract — it powers the "guided catalog" view, not just
   the capped finder. ───────────────────────────────────────────── */

test('rankCatalogForAnswers: fit dominance holds for the uncapped guided-catalog ranking too', () => {
  const strongCheap = product('CatalogStrongCheap', STRONG_FIT, { price: 110 });
  const noFitLuxury = product('CatalogNoFitLuxury', NO_FIT, { price: 800, featured: true });
  const res = rankCatalogForAnswers(ANSWERS, [strongCheap, noFitLuxury]);
  assert.equal(res[0].product.id, 'CatalogStrongCheap');
  assert.equal(res[0].isTop, true);
  assert.ok(!ids(res).includes('CatalogNoFitLuxury'), 'zero-fit product excluded from the re-ranked catalog too');
});

/* ── Determinism ─────────────────────────────────────────────────── */

test('ranking is fully deterministic across repeated runs with identical input', () => {
  const catalog = [
    product('Det1', STRONG_FIT, { price: 130 }),
    product('Det2', STRONG_FIT, { price: 130 }),   // exact tie on fit AND price
    product('Det3', WEAK_FIT, { price: 200 }),
  ];
  const run1 = ids(getAssistantRecommendations(ANSWERS, catalog));
  const run2 = ids(getAssistantRecommendations(ANSWERS, catalog));
  const run3 = ids(getAssistantRecommendations(ANSWERS, catalog));
  assert.deepEqual(run1, run2);
  assert.deepEqual(run2, run3);
});
