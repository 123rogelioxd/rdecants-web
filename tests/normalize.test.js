/* =============================================================
   The normalization layer: the one place an R Supply OS value becomes a
   canonical one.

   Its two hard rules, and the bugs they exist to prevent:

   1. ABSENT ≠ NON-MATCHING. A missing field must report zero coverage, not
      a zero score. Scoring "we don't know" as "doesn't fit" is unfair to
      thin records; scoring it as "fits" is what let a product with no
      metadata win.
   2. AN EMPTY ARRAY MUST NEVER HIDE A FULL ONE. `occasions: []` beside
      `recommendation_tags: ['oficina','diario']` still yields occasion
      evidence — flagged as weaker, because a tag list is not an authored
      occasion statement. Four live products are in exactly that state.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProduct, normalizeToken, score, meanScore, scoreCoverage,
  hasTag, countTags, FAMILY_GROUPS, OCCASIONS, CLIMATES,
} from '../assets/js/recommendations/normalize.js';
import { loadLiveCatalog, findProduct } from './helpers/liveCatalog.js';

const variants = [
  { size: 3, price: 180, stock: 10, availability: 10, available: true, soldOut: false, variant_id: 1 },
  { size: 5, price: 300, stock: 10, availability: 10, available: true, soldOut: false, variant_id: 2 },
  { size: 10, price: 580, stock: 5, availability: 5, available: true, soldOut: false, variant_id: 3 },
];

const product = (fragrance, extra = {}) => ({
  id: 'P', name: 'P', house: 'H', notes: [], desc: '', story: '',
  badge: 'Disponible', stock: 10, variants, fragrance, ...extra,
});

/* ── Tokens ─────────────────────────────────────────────────────── */

test('token normalization collapses case, accents, hyphens and spaces', () => {
  for (const value of ['Evento Formal', 'evento_formal', 'EVENTO-FORMAL', 'evento  formal']) {
    assert.equal(normalizeToken(value), 'evento_formal', value);
  }
  assert.equal(normalizeToken('Otoño'), 'otono');
  assert.equal(normalizeToken('  '), '');
  assert.equal(normalizeToken(null), '');
  assert.equal(normalizeToken(undefined), '');
});

/* ── Absent vs non-matching ─────────────────────────────────────── */

test('a missing dimension reports zero coverage, not a zero score', () => {
  const bare = normalizeProduct(product({ canonical_name: 'x' }));
  assert.equal(bare.occasions.present, false);
  assert.equal(bare.occasions.strength, 'none');
  assert.deepEqual(bare.occasions.values, []);
  assert.equal(bare.climates.present, false);
  assert.equal(bare.scoresPresent, false);
  assert.equal(score(bare, 'projection'), null, 'a missing score is null, never 0');
});

test('a present-but-non-matching dimension is distinguishable from an absent one', () => {
  const gymOnly = normalizeProduct(product({ occasions: ['gimnasio'] }));
  assert.equal(gymOnly.occasions.present, true, 'we DO know its occasions');
  assert.deepEqual(gymOnly.occasions.values, ['deporte']);
  assert.ok(!gymOnly.occasions.values.includes('noche'), 'and night is not one of them');
});

test('a score of exactly zero is real data, not missing data', () => {
  const zero = normalizeProduct(product({ scores: { projection: 0 } }));
  assert.equal(score(zero, 'projection'), 0);
  assert.equal(zero.scoresPresent, true);
  assert.equal(score(zero, 'longevity'), null);
});

/* ── One empty array cannot mask a populated alias ──────────────── */

test('an empty occasions array does not hide occasions living in the tag lists', () => {
  const n = normalizeProduct(product({
    occasions: [],
    recommendation_tags: ['oficina', 'diario', 'nicho_popular'],
    moods: ['nocturno'],
  }));
  assert.equal(n.occasions.present, true);
  assert.deepEqual(n.occasions.primary, [], 'nothing was authored in the dedicated field');
  assert.deepEqual(n.occasions.secondary.sort(), ['diario', 'noche', 'oficina']);
  assert.equal(n.occasions.strength, 'secondary', 'weaker evidence, and labelled as such');
});

test('the dedicated field outranks the tag lists as evidence', () => {
  const n = normalizeProduct(product({
    occasions: ['noche'],
    recommendation_tags: ['oficina'],
  }));
  assert.deepEqual(n.occasions.primary, ['noche']);
  assert.deepEqual(n.occasions.secondary, ['oficina']);
  assert.equal(n.occasions.strength, 'primary');
});

test('climate_tags, seasons and climates are unioned, never overwritten', () => {
  const n = normalizeProduct(product({ climates: [], climate_tags: ['calido'], seasons: ['invierno'] }));
  assert.equal(n.climates.present, true);
  assert.ok(n.climates.values.includes('calido'));
  assert.ok(n.climates.values.includes('frio'), 'invierno is cold-weather evidence');
});

/* ── Aliases and vocabulary ─────────────────────────────────────── */

test('occasion aliases in both languages map to one canonical value', () => {
  const cases = {
    diario: ['diario', 'uso_diario', 'daily', 'everyday'],
    oficina: ['oficina', 'office', 'trabajo', 'profesional'],
    noche: ['noche', 'nocturno', 'night', 'eventos_nocturnos'],
    fiesta: ['fiesta', 'antro', 'party', 'club'],
    cita: ['cita', 'citas', 'date_night', 'romantico'],
    formal: ['evento_formal', 'gala', 'black tie'],
    deporte: ['gimnasio', 'gym', 'sport'],
    regalo: ['regalo', 'gift'],
  };
  for (const [canonical, aliases] of Object.entries(cases)) {
    for (const alias of aliases) {
      const n = normalizeProduct(product({ occasions: [alias] }));
      assert.deepEqual(n.occasions.primary, [canonical], `${alias} → ${canonical}`);
    }
  }
});

/* The live `occasions` array contains climate values on 12 products. Scoring
   `calor` as an occasion would be nonsense, so it is routed to climate and
   reported as a backend defect. */
test('climate values misfiled inside occasions are routed to climate and reported', () => {
  const n = normalizeProduct(product({ occasions: ['cita', 'noche', 'frio'], climates: [] }));
  assert.deepEqual(n.occasions.primary.sort(), ['cita', 'noche'], 'frio is not an occasion');
  assert.deepEqual(n.occasions.misfiled, ['frio'], 'and the misfiling is reported');
  assert.ok(n.climates.values.includes('frio'), 'the information is not lost');
  assert.equal(n.climates.strength, 'secondary', 'but it counts as weaker evidence');
});

test('a compound or free-text family contributes every recognised part', () => {
  const n = normalizeProduct(product({
    scent_family_normalized: 'aromatico_dulce',
    family: 'aromatico citrico verde',
    accords: ['almizclado'],
  }));
  for (const expected of ['aromatico', 'dulce', 'citrico', 'verde', 'almizclado']) {
    assert.ok(n.families.values.includes(expected), expected);
  }
});

test('the answerable family options all map onto canonical families', () => {
  for (const [answer, group] of Object.entries(FAMILY_GROUPS)) {
    assert.ok(group.length > 0, answer);
    for (const family of group) {
      const n = normalizeProduct(product({ accords: [family] }));
      assert.ok(n.families.values.includes(family), `${answer} → ${family}`);
    }
  }
});

test('unrecognised values are reported, never guessed at and never silently dropped', () => {
  const n = normalizeProduct(product({ occasions: ['submarinismo'], climates: ['estratosferico'] }));
  assert.deepEqual(n.occasions.unmapped, ['submarinismo']);
  assert.deepEqual(n.climates.unmapped, ['estratosferico']);
  assert.deepEqual(n.occasions.primary, [], 'and they contribute nothing');
});

/* ── Score handling ─────────────────────────────────────────────── */

test('scores arrive as 0–100 and are normalized to 0–1', () => {
  const n = normalizeProduct(product({ scores: { projection: 76, intensity: 0.7 } }));
  assert.equal(score(n, 'projection'), 0.76);
  assert.equal(score(n, 'intensity'), 0.7, 'an already-unit value is left alone');
});

test('out-of-range and non-numeric scores are DROPPED, not clamped into a lie', () => {
  const n = normalizeProduct(product({ scores: { projection: 250, intensity: 'alto', longevity: -5, summer: 80 } }));
  assert.equal(score(n, 'projection'), null);
  assert.equal(score(n, 'intensity'), null);
  assert.equal(score(n, 'longevity'), null);
  assert.equal(score(n, 'summer'), 0.8);
  assert.deepEqual(n.invalidScores.map(i => i.key).sort(), ['intensity', 'longevity', 'projection']);
});

test('mass_appeal and crowdpleaser are read as one another, never invented', () => {
  const legacy = normalizeProduct(product({ scores: { crowdpleaser: 80 } }));
  assert.equal(score(legacy, 'mass_appeal'), 0.8);
  const current = normalizeProduct(product({ scores: { mass_appeal: 80 } }));
  assert.equal(score(current, 'crowdpleaser'), 0.8);
  const neither = normalizeProduct(product({ scores: { projection: 50 } }));
  assert.equal(score(neither, 'mass_appeal'), null);
});

test('score helpers ignore missing keys instead of treating them as zero', () => {
  const n = normalizeProduct(product({ scores: { projection: 80, longevity: 60 } }));
  assert.equal(meanScore(n, ['projection', 'longevity']), 0.7);
  assert.equal(meanScore(n, ['projection', 'intensity']), 0.8, 'the absent key is skipped, not averaged in as 0');
  assert.equal(meanScore(n, ['intensity']), null);
  assert.equal(scoreCoverage(n, ['projection', 'longevity', 'intensity', 'summer']), 0.5);
});

/* ── Tags and offer ────────────────────────────────────────────── */

test('tag lookups search style, recommendation, commercial and mood tokens', () => {
  const n = normalizeProduct(product({
    style_tags: ['Versátil'], recommendation_tags: ['alto_rendimiento'],
    commercial_roles: ['premium'], moods: ['juvenil'],
  }));
  assert.equal(hasTag(n, ['versatil']), true, 'accents normalized');
  assert.equal(hasTag(n, ['alto rendimiento']), true, 'spaces normalized');
  assert.equal(hasTag(n, ['juvenil']), true, 'moods are in the pool');
  assert.equal(hasTag(n, ['inexistente']), false);
  assert.equal(countTags(n, ['versatil', 'premium', 'inexistente']), 2);
});

test('the offer reflects what can actually be bought right now', () => {
  const full = normalizeProduct(product({}));
  assert.equal(full.offer.sellable, true);
  assert.deepEqual(full.offer.orderableSizes, [3, 5, 10]);
  assert.equal(full.offer.hasAllCoreSizes, true);

  const partial = normalizeProduct(product({}, {
    variants: [variants[1], { ...variants[2], stock: 0, availability: 0, available: false, soldOut: true }],
  }));
  assert.deepEqual(partial.offer.coreSizes, [5]);
  assert.equal(partial.offer.hasAllCoreSizes, false);

  const gone = normalizeProduct(product({}, {
    stock: 0,
    variants: variants.map(v => ({ ...v, stock: 0, availability: 0, available: false, soldOut: true })),
  }));
  assert.equal(gone.offer.sellable, false);
  assert.deepEqual(gone.offer.orderableSizes, []);
});

test('normalizing a null or non-object product never throws', () => {
  for (const value of [null, undefined, 'x', 42, []]) {
    const n = normalizeProduct(value);
    assert.equal(n.gender.value, 'unknown');
    assert.equal(n.occasions.present, false);
    assert.equal(n.offer.sellable, false);
  }
});

/* ── Against the real snapshot ──────────────────────────────────── */

test('every product in the live snapshot normalizes without throwing or inventing', () => {
  const products = loadLiveCatalog();
  assert.ok(products.length >= 70, `snapshot has ${products.length} products`);

  for (const p of products) {
    const n = normalizeProduct(p);
    assert.equal(typeof n.id, 'string');
    for (const value of n.occasions.values) assert.ok(OCCASIONS.includes(value), `${n.id}: ${value}`);
    for (const value of n.climates.values) assert.ok(CLIMATES.includes(value), `${n.id}: ${value}`);
    for (const [key, value] of Object.entries(n.scores)) {
      assert.ok(value >= 0 && value <= 1, `${n.id}.${key} = ${value}`);
    }
    /* `present` must always agree with the values it summarises. */
    assert.equal(n.occasions.present, n.occasions.values.length > 0, n.id);
    assert.equal(n.climates.present, n.climates.values.length > 0, n.id);
  }
});

/* The live catalog's own worked example: Torino 21 has an EMPTY occasions
   array, a `cita` tag, and a lean_masculine gender profile. */
test('the live Torino 21 record normalizes exactly as its metadata says', () => {
  const products = loadLiveCatalog();
  const n = normalizeProduct(findProduct(products, 'XERJOFF-TORINO-21'));

  assert.equal(n.gender.value, 'lean_masculine', 'not unknown — this was the root cause');
  assert.equal(n.gender.present, true);
  assert.deepEqual(n.occasions.primary, [], 'the authored occasions array really is empty');
  assert.equal(n.occasions.strength, 'secondary', 'so its occasions are tag-strength only');
  assert.ok(!n.occasions.primary.includes('noche'));
  assert.ok(n.occasions.secondary.includes('cita'), 'the cita tag is read as cita…');
  assert.ok(!n.occasions.values.includes('noche'), '…and never promoted to noche');
  assert.equal(score(n, 'night_out'), 0.85, 'its numeric night signal is high, and that is separate');
});

test('the one live product with no gender at all normalizes to unknown, not to a guess', () => {
  const products = loadLiveCatalog();
  const n = normalizeProduct(findProduct(products, 'XERJOFF-NAXOS'));
  assert.equal(n.gender.value, 'unknown');
  assert.equal(n.gender.present, false, 'the canonical string "unknown" is not evidence');
  assert.equal(n.gender.unrecognized, false, 'the field is empty, not mistyped');
});
