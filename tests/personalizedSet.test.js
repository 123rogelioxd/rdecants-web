/* =============================================================
   THE SET OFFERED INSIDE THE PERSONALIZED CATALOG

   Reported on production: the guided catalog for
   Mujer + 15–18 + Noche + Que destaque + Clima frío listed five compatible
   feminine fragrances and then, underneath them, a "Set Noches" containing
   Naxos, 9PM EDP and Stronger With You Intensely — three products the engine
   had just excluded for being masculine — with a working add-to-cart button.

   Cause: renderContextualKit picked an EDITORIAL template by intent
   (`occasion === 'noche'` → the 'noches' kit) and filled it with the top 3 by
   keyword score. It never saw gender, the compatibility threshold, the
   confidence gate or any answer other than the one it keyed off.

   The rule this file enforces: anything with a cart button inside the
   personalized catalog passes EXACTLY the gates the individual recommendations
   pass. The set is now built from the ranked rows themselves, so it cannot
   contain a product the ranking excluded — and when three of them cannot be
   bought in the starter size, there is no set rather than a fallback.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalizedSet, resolveDiscoverySets, buildCompactKitHtml,
  PERSONALIZED_SET_SIZE_ML, PERSONALIZED_SET_COUNT,
} from '../assets/js/ui/discoverySets.js';
import {
  rankCatalog, HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE,
} from '../assets/js/recommendations/engine.js';
import { rankGuidedCatalog } from '../assets/js/recommendations/assistant.js';
import { getProductGender } from '../assets/js/utils/gender.js';
import { getVariantForSize } from '../assets/js/utils/prices.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();

const variant = (size, price, stock = 10) => ({
  size, price, stock, availability: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: `v${size}-${price}`,
});

const FULL = {
  occasions: ['diario', 'oficina', 'noche'],
  climates: ['calido', 'templado', 'frio'],
  moods: ['limpio', 'moderno', 'juvenil'],
  style_tags: ['fresco', 'limpio'],
  recommendation_tags: ['diario', 'facil_de_usar'],
  accords: ['citrico'],
  scent_family_normalized: 'citrico',
  scores: {
    versatility: 85, mass_appeal: 82, blind_buy_safe: 80, beginner_friendly: 84,
    office_safe: 80, intensity: 60, projection: 62, longevity: 78,
    night_out: 72, date_night: 66, compliment: 70, elegance: 66,
    freshness: 72, summer: 70, cold_weather: 70, sweetness: 40,
  },
};

const product = (id, extra = {}) => ({
  id, name: id, house: 'House',
  gender: 'gender' in extra ? extra.gender : 'unisex',
  notes: [], desc: '', story: '', badge: 'Disponible', stock: extra.stock ?? 10,
  variants: extra.variants ?? [variant(3, 100), variant(5, 180), variant(10, 340)],
  fragrance: extra.fragrance ?? FULL,
});

/* A recommendation row as the engine emits it. */
const row = (p, over = {}) => ({
  product: p,
  compatibility: over.compatibility ?? 85,
  confidence: over.confidence ?? 1,
  ...over,
});

const ANSWERS = { gender: 'mujer', age: '15-18', occasion: 'noche', goal: 'destacar', climate: 'frio' };

/* ── The reported defect, against the real catalog ──────────────── */

test('REGRESSION: the personalized set for Mujer contains no masculine product', () => {
  const guided = rankGuidedCatalog(ANSWERS, CATALOG);
  const set = buildPersonalizedSet(guided.rows);

  assert.ok(set, 'the scenario does produce a set');
  const forbidden = new Set(['masculine', 'lean_masculine', 'unknown']);
  for (const p of set.products) {
    assert.ok(!forbidden.has(getProductGender(p)),
      `${p.name} is ${getProductGender(p)} and must not be in a Mujer set`);
  }

  /* The three products the bug shipped, named here only to prove they are
     gone — the code that excludes them names nothing. */
  const shipped = ['NAXOS', '9PM', 'STONGER WITH YOU', 'STRONGER WITH YOU'];
  const names = set.products.map(p => `${p.house} ${p.name}`.toUpperCase());
  for (const bad of shipped) {
    assert.ok(!names.some(n => n.includes(bad)), `${bad} is back in the set`);
  }
});

test('the set members are exactly the top three of the ranking', () => {
  const guided = rankGuidedCatalog(ANSWERS, CATALOG);
  const set = buildPersonalizedSet(guided.rows);
  assert.deepEqual(
    set.products.map(p => String(p.id)),
    guided.rows.slice(0, 3).map(r => String(r.product.id)),
  );
});

test('Hombre gets the mirror rule', () => {
  const answers = { ...ANSWERS, gender: 'hombre' };
  const guided = rankGuidedCatalog(answers, CATALOG);
  const set = buildPersonalizedSet(guided.rows);
  assert.ok(set);
  const forbidden = new Set(['feminine', 'lean_feminine', 'unknown']);
  for (const p of set.products) {
    assert.ok(!forbidden.has(getProductGender(p)), `${p.name} is ${getProductGender(p)}`);
  }
});

test('Unisex does not accept everything automatically', () => {
  const answers = { gender: 'unisex', age: '19-24', occasion: 'dia', goal: 'versatil', climate: 'calido' };
  const guided = rankGuidedCatalog(answers, CATALOG);
  const set = buildPersonalizedSet(guided.rows);
  if (!set) return;   /* no set is a valid outcome; a wrong one is not */
  for (const p of set.products) {
    const gender = getProductGender(p);
    assert.ok(!['masculine', 'feminine', 'unknown'].includes(gender),
      `${p.name} is plainly ${gender}`);
  }
});

/* Every combination in the answer space, not just the reported one. */
test('no combination can produce a set containing a product the engine excluded', () => {
  const values = {
    gender: ['hombre', 'mujer', 'unisex'],
    occasion: ['dia', 'oficina', 'cita', 'noche', 'regalo'],
    goal: ['versatil', 'destacar', 'discreto'],
  };
  let built = 0;
  for (const gender of values.gender) {
    for (const occasion of values.occasion) {
      for (const goal of values.goal) {
        const answers = { gender, age: '25-34', occasion, goal, climate: 'templado' };
        const { results } = rankCatalog(CATALOG, answers);
        const eligibleIds = new Set(results.map(e => String(e.product.id)));
        const set = buildPersonalizedSet(rankGuidedCatalog(answers, CATALOG).rows);
        if (!set) continue;
        built++;
        for (const p of set.products) {
          assert.ok(eligibleIds.has(String(p.id)),
            `${gender}/${occasion}/${goal}: ${p.name} is in the set but not in the results`);
        }
      }
    }
  }
  assert.ok(built > 20, `only ${built} combinations produced a set`);
});

/* ── The gates, one at a time ───────────────────────────────────── */

test('all three members must clear the compatibility threshold', () => {
  const rows = [
    row(product('A')),
    row(product('B')),
    row(product('C'), { compatibility: HIGH_MATCH_THRESHOLD - 0.1 }),
  ];
  assert.equal(buildPersonalizedSet(rows), null, 'a below-threshold member kills the set');

  rows[2].compatibility = HIGH_MATCH_THRESHOLD;
  assert.ok(buildPersonalizedSet(rows), 'exactly at the threshold is in');
});

test('all three members must clear the confidence gate', () => {
  const rows = [row(product('A')), row(product('B')), row(product('C'), { confidence: MIN_CONFIDENCE - 0.01 })];
  assert.equal(buildPersonalizedSet(rows), null);
  rows[2].confidence = MIN_CONFIDENCE;
  assert.ok(buildPersonalizedSet(rows));
});

test('all three members must have stock and a purchasable variant', () => {
  const soldOut = product('SoldOut', {
    stock: 0,
    variants: [variant(3, 100, 0), variant(5, 180, 0)],
  });
  assert.equal(buildPersonalizedSet([row(product('A')), row(product('B')), row(soldOut)]), null,
    'sold out cannot be in a set');

  const noId = product('NoId', { variants: [{ ...variant(3, 100), variant_id: null }] });
  assert.equal(buildPersonalizedSet([row(product('A')), row(product('B')), row(noId)]), null,
    'a variant with no id is a dead buy button');

  const noStarter = product('NoStarter', { variants: [variant(5, 180), variant(10, 340)] });
  assert.equal(buildPersonalizedSet([row(product('A')), row(product('B')), row(noStarter)]), null,
    `no ${PERSONALIZED_SET_SIZE_ML} ml variant means the set cannot be assembled`);
});

test('fewer than three compatible products means no set at all', () => {
  assert.equal(buildPersonalizedSet([]), null);
  assert.equal(buildPersonalizedSet([row(product('A'))]), null);
  assert.equal(buildPersonalizedSet([row(product('A')), row(product('B'))]), null);
  assert.ok(buildPersonalizedSet([row(product('A')), row(product('B')), row(product('C'))]));
});

test('the set never repeats a product', () => {
  const a = product('A');
  const set = buildPersonalizedSet([row(a), row(a), row(a), row(product('B')), row(product('C'))]);
  assert.ok(set);
  assert.equal(new Set(set.products.map(p => String(p.id))).size, PERSONALIZED_SET_COUNT);
});

test('junk input never throws and never yields a set', () => {
  for (const input of [null, undefined, 'nope', [null, undefined], [{}, {}, {}], [{ product: null }]]) {
    assert.doesNotThrow(() => buildPersonalizedSet(input), JSON.stringify(input));
    assert.equal(buildPersonalizedSet(input), null, JSON.stringify(input));
  }
});

/* ── The price shown is the price charged ──────────────────────── */

test('the set total is the sum of the exact variants the cart will add', () => {
  const rows = [
    row(product('A', { variants: [variant(3, 111), variant(5, 222)] })),
    row(product('B', { variants: [variant(3, 133), variant(5, 244)] })),
    row(product('C', { variants: [variant(3, 155), variant(5, 266)] })),
  ];
  const set = buildPersonalizedSet(rows);

  assert.equal(set.itemSize, PERSONALIZED_SET_SIZE_ML);
  assert.equal(set.total, 111 + 133 + 155, 'total is built from the starter-size prices');
  assert.notEqual(set.total, 222 + 244 + 266, 'not the display size');

  /* Cart.addBundle re-resolves getVariantForSize(product, bundle.itemSize) and,
     with total === originalTotal, charges each line that variant's price. So
     recomputing the same way must reproduce the displayed total exactly. */
  const cartTotal = set.products.reduce(
    (sum, p) => sum + Number(getVariantForSize(p, set.itemSize).price), 0);
  assert.equal(cartTotal, set.total);
});

test('the live-catalog set total also matches what the cart would charge', () => {
  const set = buildPersonalizedSet(rankGuidedCatalog(ANSWERS, CATALOG).rows);
  const cartTotal = set.products.reduce(
    (sum, p) => sum + Number(getVariantForSize(p, set.itemSize).price), 0);
  assert.equal(cartTotal, set.total);
  assert.ok(set.total > 0);
  assert.equal(set.variants.length, PERSONALIZED_SET_COUNT);
  for (const v of set.variants) assert.equal(Number(v.size), PERSONALIZED_SET_SIZE_ML);
});

test('the rendered kit shows the same three products and the same total', () => {
  const set = buildPersonalizedSet(rankGuidedCatalog(ANSWERS, CATALOG).rows);
  const html = buildCompactKitHtml(set);
  for (const p of set.products) assert.ok(html.includes(p.name), `${p.name} missing from the markup`);
  assert.ok(html.includes(String(set.total).replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
    'the printed total is the computed one');
  assert.match(html, /data-set-id="recomendado"/);
});

/* ── The editorial kits survive where they belong ──────────────── */

test('the general catalog keeps its editorial sets', () => {
  const sets = resolveDiscoverySets(CATALOG);
  assert.ok(sets.length >= 3, 'the home page still has kits to show');
  assert.ok(sets.some(s => s.id === 'noches'), 'including the themed ones');
});

test('an editorial set is NOT a personalized set and can never be used as one', () => {
  const editorial = resolveDiscoverySets(CATALOG).find(s => s.id === 'noches');
  assert.ok(editorial);
  assert.notEqual(editorial.personalized, true);

  /* Feeding an editorial set's products through the personalized builder as if
     they were recommendations must still be judged by the gates — the builder
     is the authority, not the caller. */
  const smuggled = editorial.products.map(p => ({ product: p }));   /* no scores at all */
  assert.equal(buildPersonalizedSet(smuggled), null,
    'rows without a compatibility/confidence reading cannot form a set');
});

test('the contextual kit renderer takes recommendations, never raw answers', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../assets/js/ui/discoverySets.js', import.meta.url), 'utf8');
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, ' ');

  assert.match(executable, /renderContextualKit\(slot,\s*\{\s*recommendations/);
  assert.ok(!executable.includes('_pickSetForAnswers'), 'the intent→template map is gone');
  /* No path from the personalized renderer back into the editorial templates. */
  const fnStart = executable.indexOf('export async function renderContextualKit');
  const fnEnd = executable.indexOf('\nfunction _bindCompactKitActions');
  const body = executable.slice(fnStart, fnEnd);
  assert.ok(!body.includes('resolveDiscoverySets'),
    'the personalized kit must not fall back to an editorial template');
});

/* =============================================================
   NO DESCRIPTION MAY CONTRADICT THE EXPLANATION

   Also reported on production: Cloud EDP was recommended for the night and
   the line directly underneath read "Buena opción para el día a día".
   describeForBeginner() appends a use case derived from the product's own
   notes, with no knowledge of what was asked, so on a personalized surface it
   is free to disagree with the recommender. Personalized surfaces now use
   describeScent(), which makes no context claim at all.
   ============================================================= */

test('describeScent says what it smells like and never when to wear it', async () => {
  const { describeScent, describeForBeginner } = await import('../assets/js/recommendations/describe.js');

  const sweet = {
    name: 'X', house: 'H',
    notes: ['Vainilla', 'Miel', 'Tonka'],
    desc: 'Dulce y envolvente',
    fragrance: { scores: { crowdpleaser: 0.8, longevity: 0.9 } },
  };

  const scent = describeScent(sweet);
  assert.match(scent, /^Dulce/, 'the family still comes from the notes');
  assert.match(scent, /atractivo/);
  assert.match(scent, /duradero/);
  assert.doesNotMatch(scent, /para (el|la|una|un) /i, 'no use-case claim');

  /* The old helper is still there for non-personalized surfaces, and this is
     exactly the sentence that could contradict a recommendation. */
  assert.match(describeForBeginner(sweet), /Buena opción para/);

  /* Nothing honest to say → say nothing, never a use case as a fallback. */
  assert.equal(describeScent({ name: 'Y', notes: [], desc: '', fragrance: null }), '');
  assert.equal(describeScent(null), '');
});

test('no finder pick describes a use case that its own reason contradicts', async () => {
  const { getFinderResult } = await import('../assets/js/recommendations/assistant.js');

  /* Every occasion, so a blurb cannot quietly disagree with any of them. */
  const OCCASION_WORDS = {
    dia: /día a día|diario/i,
    oficina: /oficina/i,
    cita: /cita/i,
    noche: /noche|fiesta/i,
    regalo: /regalar/i,
  };

  for (const occasion of Object.keys(OCCASION_WORDS)) {
    for (const gender of ['mujer', 'hombre']) {
      const answers = { gender, age: '19-24', occasion, goal: 'destacar', climate: 'templado' };
      const { picks } = getFinderResult(answers, CATALOG);
      for (const pick of picks) {
        assert.ok(!/buena opción para/i.test(pick.blurb ?? ''),
          `${gender}/${occasion} — ${pick.product.name} blurb makes a use-case claim: "${pick.blurb}"`);

        /* And no blurb may name a DIFFERENT occasion than the one asked. */
        for (const [other, pattern] of Object.entries(OCCASION_WORDS)) {
          if (other === occasion) continue;
          assert.ok(!pattern.test(pick.blurb ?? ''),
            `${gender}/${occasion} — ${pick.product.name} blurb mentions "${other}": "${pick.blurb}"`);
        }
      }
    }
  }
});

test('the guided catalog card drops the guidance chip when it carries a reason', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../assets/js/catalog/render.js', import.meta.url), 'utf8');
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, ' ');

  assert.match(executable, /const showGuidanceChip = !whyHtml;/);
  assert.match(executable, /guidanceBadge && showGuidanceChip/);
  /* Declared before it is used. */
  assert.ok(executable.indexOf('const showGuidanceChip') < executable.indexOf('guidanceBadge && showGuidanceChip'));
});

test('the personalized surfaces do not import the use-case description at all', async () => {
  const { readFileSync } = await import('node:fs');
  const assistant = readFileSync(new URL('../assets/js/recommendations/assistant.js', import.meta.url), 'utf8');
  const executable = assistant.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(executable.includes('describeScent'), 'picks use the scent-only description');
  assert.ok(!executable.includes('describeForBeginner'),
    'the use-case description must not reach the picks');
});
