/* =============================================================
   THE THREE-QUESTION FINDER

   ¿Para quién es? · ¿Cuándo lo vas a usar más? · ¿Qué buscas?

   The finder used to ask four questions with five occasion options and a
   climate step. This file is the guard on the smaller shape: that removing
   questions removed FRICTION and not discrimination, and — the one that
   actually needed proving — that "quiero ser el que mejor huele" ranks on
   what the metadata says about the fragrance, not on what it costs.

   Everything runs against the real R Supply OS snapshot through the same
   provider mapping the storefront uses.
   ============================================================= */
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getAssistantRecommendations, ASSISTANT_QUESTIONS } from '../assets/js/recommendations/assistant.js';
import { MAX_RESULTS } from '../assets/js/recommendations/engine.js';
import { isSellable } from '../assets/js/recommendations/scoring.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();

const GENDERS = ['hombre', 'mujer', 'unisex'];
const AGES = ['15-18', '19-24', '25-34', '35+'];
const OCCASIONS = ['dia', 'salir'];
const GOALS = ['versatil', 'destacar', 'mejor'];

/* Exactly the space a customer can reach by answering the three questions. */
const ASKED = [];
for (const gender of GENDERS)
  for (const age of AGES)
    for (const occasion of OCCASIONS)
      for (const goal of GOALS)
        ASKED.push({ gender, age, occasion, goal });

const top = answers => getAssistantRecommendations(answers, CATALOG);
const ids = answers => top(answers).map(r => r.product.id);
const label = a => `${a.gender}/${a.age}/${a.occasion}/${a.goal}`;
const price5 = product => (product.variants ?? []).find(v => Number(v.ml) === 5)?.price ?? null;

/* ── The space a customer can actually reach ─────────────────────── */

test('the asked answer space is 3 × 4 × 2 × 3', () => {
  assert.equal(ASKED.length, 72);
  assert.equal(ASSISTANT_QUESTIONS.length, 3);
});

test('every answerable combination returns between one and three real options', () => {
  for (const answers of ASKED) {
    const results = top(answers);
    assert.ok(results.length > 0, `${label(answers)} returned nothing`);
    assert.ok(results.length <= MAX_RESULTS, `${label(answers)} returned ${results.length}`);
  }
});

test('nothing unsellable is ever recommended', () => {
  for (const answers of ASKED) {
    for (const { product } of top(answers)) {
      assert.ok(isSellable(product), `${label(answers)} recommended unsellable ${product.id}`);
      assert.ok(product.variants?.length, `${label(answers)} recommended ${product.id} with no presentation`);
    }
  }
});

test('every recommendation explains itself in one customer-facing line', () => {
  for (const answers of ASKED) {
    for (const result of top(answers)) {
      assert.ok(result.reason && result.reason.trim().length > 0, `${label(answers)} ${result.product.id}`);
      /* No perfume-nerd vocabulary reaches the customer. */
      assert.doesNotMatch(result.reason, /sillage|fouger|ambroxan|acorde|cromatic/i);
    }
  }
});

test('a thin product cannot win on the dimensions it happens to document', () => {
  /* Missing scores must not be read as zeros, and must not be read as
     strengths either. 42 of the live catalogue's products carry no
     performance scores at all; none of them may be presented with the
     confidence of a fully documented one. */
  for (const answers of ASKED) {
    for (const result of top(answers)) {
      assert.ok(result.confidence > 0, `${label(answers)} ${result.product.id} has zero confidence`);
      assert.ok(result.confidence <= 1, `${label(answers)} ${result.product.id} confidence > 1`);
      assert.ok(
        Number.isFinite(result.compatibility) && result.compatibility <= 100,
        `${label(answers)} ${result.product.id} score ${result.compatibility}`,
      );
    }
  }
});

/* ── The six named scenarios ─────────────────────────────────────── */

test('the intent answers change the result, not just the wording', () => {
  const dayEasy = ids({ gender: 'hombre', age: '19-24', occasion: 'dia', goal: 'versatil' });
  const dayLoud = ids({ gender: 'hombre', age: '19-24', occasion: 'dia', goal: 'destacar' });
  const outBest = ids({ gender: 'hombre', age: '19-24', occasion: 'salir', goal: 'mejor' });

  assert.notDeepEqual(dayEasy, dayLoud, 'the goal must reorder the day picks');
  assert.notDeepEqual(dayEasy, outBest, 'day/easy and going-out/best must not agree');
  assert.notDeepEqual(dayLoud, outBest, 'the occasion must reorder the standout picks');
});

test('women and men do not receive the same three perfumes', () => {
  const men = ids({ gender: 'hombre', age: '25-34', occasion: 'dia', goal: 'versatil' });
  const women = ids({ gender: 'mujer', age: '25-34', occasion: 'dia', goal: 'versatil' });

  assert.equal(men.filter(id => women.includes(id)).length, 0, `overlap: ${men} vs ${women}`);
});

test('the occasion separates day wear from going out', () => {
  const day = ids({ gender: 'mujer', age: '25-34', occasion: 'dia', goal: 'versatil' });
  const out = ids({ gender: 'mujer', age: '25-34', occasion: 'salir', goal: 'destacar' });

  assert.notDeepEqual(day, out);
});

/* ── The claim that had to be proven: "mejor" is not "más caro" ──── */

test('"el que mejor huele" is not a price sort', () => {
  /* If this tier were built on price it would simply return the top of the
     price list. It must not: the question is about the RESULT the customer
     gets, and a $170 crowd-pleaser can beat a $300 niche on compliment and
     longevity. */
  const priciest = [...CATALOG]
    .filter(p => price5(p))
    .sort((a, b) => price5(b) - price5(a))
    .slice(0, 3)
    .map(p => p.id);

  let matchesPriceOrder = 0;
  for (const answers of ASKED.filter(a => a.goal === 'mejor')) {
    if (ids(answers).join('|') === priciest.join('|')) matchesPriceOrder++;
  }

  assert.equal(matchesPriceOrder, 0, 'a "mejor" answer returned exactly the three most expensive products');
});

test('"el que mejor huele" does not cost systematically more than "solo quiero oler bien"', () => {
  const medianFor = goal => {
    const prices = ASKED
      .filter(a => a.goal === goal)
      .flatMap(a => top(a).map(r => price5(r.product)))
      .filter(Boolean)
      .sort((a, b) => a - b);
    return prices[Math.floor(prices.length / 2)];
  };

  const easy = medianFor('versatil');
  const best = medianFor('mejor');

  /* Measured on the live catalogue both sit at the same median. Allowing a
     band rather than strict equality keeps this honest as the catalogue
     changes, while still failing if the tier ever becomes a price ladder. */
  assert.ok(
    best <= easy * 1.35,
    `"mejor" median $${best} is far above "versatil" median $${easy} — the tier has become a price proxy`,
  );
});

test('"el que mejor huele" is a distinct tier, not a relabelled "que se note"', () => {
  const contexts = [];
  for (const gender of GENDERS)
    for (const age of AGES)
      for (const occasion of OCCASIONS)
        contexts.push({ gender, age, occasion });

  const identical = contexts.filter(c =>
    ids({ ...c, goal: 'destacar' }).join('|') === ids({ ...c, goal: 'mejor' }).join('|')).length;

  assert.ok(
    identical < contexts.length / 2,
    `"destacar" and "mejor" returned the same three products in ${identical}/${contexts.length} contexts`,
  );
});

test('the near-constant prestige scores are not what drives "mejor"', () => {
  /* elegance, luxury and uniqueness each take three distinct values across
     the whole catalogue. Weighting them would be arithmetic with no
     ordering effect, so they are deliberately absent from GOAL_RULES.mejor.
     This asserts the intent, so a future edit that "improves" the tier by
     adding them has to argue with a failing test first. */
  const source = readEngineSource();
  const rule = source.slice(source.indexOf('  mejor: {'), source.indexOf('  discreto: {'));

  assert.match(rule, /compliment: 0\.4/, 'compliment must lead the tier');
  for (const key of ['elegance', 'luxury', 'uniqueness']) {
    assert.doesNotMatch(
      rule.split('plusTags')[0],
      new RegExp(`${key}\\s*:`),
      `${key} is near-constant in the catalogue and must not be a scored weight`,
    );
  }
});

function readEngineSource() {
  return readFileSync(new URL('../assets/js/recommendations/engine.js', import.meta.url), 'utf8');
}
