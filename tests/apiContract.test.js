/* =============================================================
   THE R SUPPLY OS CONTRACT

   CI never touches the network. These tests assert the snapshot in
   tests/fixtures/rsupplyos-catalog.json still matches the contract the
   frontend consumes, so a backend outage can never turn the suite red.

   An OPTIONAL live check runs only with RDECANTS_LIVE_API=1:

     RDECANTS_LIVE_API=1 node --test tests/apiContract.test.js

   It compares the real endpoint against the snapshot and reports drift —
   a new field, a vanished field, a new enum value — so the normalizer can
   be updated deliberately instead of discovering it in production.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapApiProduct } from '../assets/js/providers/catalog.js';
import { normalizeProduct } from '../assets/js/recommendations/normalize.js';
import { getRawProductGender, normalizeGender } from '../assets/js/utils/gender.js';
import { loadRawSnapshot, loadLiveCatalog } from './helpers/liveCatalog.js';
import { PRIMARY_SIZES } from '../assets/js/utils/prices.js';

const RAW = loadRawSnapshot();

/* Fields the storefront actually reads. Losing any of these breaks a
   feature, so each is asserted present on at least the share of products
   the snapshot documented when it was captured. */
const REQUIRED_PRODUCT_FIELDS = [
  'id', 'name', 'house', 'notes', 'image', 'stock', 'prices', 'variants',
];

const REQUIRED_VARIANT_FIELDS = ['id', 'ml', 'price', 'available', 'stock'];

/* The gender taxonomy the engine gates on. A value outside this set means
   the alias table in utils/gender.js needs extending — which is exactly
   the bug that made lean_masculine normalize to 'unknown'. */
const KNOWN_GENDERS = new Set([
  'masculine', 'lean_masculine', 'unisex_masculine', 'unisex',
  'unisex_feminine', 'lean_feminine', 'feminine',
]);

/* Score keys the engine reads. Extra keys are fine; a MISSING key just
   lowers coverage. This list documents what the scoring depends on. */
const SCORED_KEYS = [
  'freshness', 'sweetness', 'elegance', 'compliment', 'projection', 'longevity',
  'versatility', 'intensity', 'mass_appeal', 'beginner_friendly', 'office_safe',
  'night_out', 'date_night', 'summer', 'cold_weather', 'blind_buy_safe',
];

/* ── Shape ──────────────────────────────────────────────────────── */

test('the snapshot is a non-trivial array of products', () => {
  assert.ok(Array.isArray(RAW), 'the endpoint returns an array');
  assert.ok(RAW.length >= 70, `only ${RAW.length} products`);
});

test('every product carries the fields the storefront reads', () => {
  for (const p of RAW) {
    for (const field of REQUIRED_PRODUCT_FIELDS) {
      assert.ok(field in p, `${p.id}: missing ${field}`);
    }
    /* A sold-out product genuinely arrives with `variants: []` — two do in
       this snapshot. That is a real state, not a contract violation; the
       auditor reports it and the engine excludes it from recommendations. */
    assert.ok(Array.isArray(p.variants), `${p.id}: variants is not an array`);
    for (const v of p.variants) {
      for (const field of REQUIRED_VARIANT_FIELDS) {
        assert.ok(field in v, `${p.id} variant: missing ${field}`);
      }
      assert.ok(Number.isFinite(Number(v.ml)) && Number(v.ml) > 0, `${p.id}: bad ml ${v.ml}`);
      assert.ok(Number.isFinite(Number(v.price)) && Number(v.price) > 0, `${p.id}: bad price ${v.price}`);
    }
  }
});

test('the variant id is the only purchasable identifier, and it is always present', () => {
  /* The cart posts variant ids to R Supply OS. A variant with stock but no
     id is a dead buy button, which the auditor reports as critical. */
  for (const p of RAW) {
    for (const v of p.variants) {
      if (!(Number(v.stock) > 0 && v.available)) continue;
      assert.ok(v.id !== null && v.id !== undefined && String(v.id).trim() !== '',
        `${p.id}: sellable ${v.ml}ml variant has no id`);
    }
  }
});

test('every SELLABLE product prices all three presentations the storefront promises', () => {
  const sellable = RAW.filter(p => p.variants.some(v => v.available && Number(v.stock) > 0));
  const missing = sellable.filter(p => {
    const sizes = new Set(p.variants.map(v => Number(v.ml)));
    return !PRIMARY_SIZES.every(size => sizes.has(size));
  });
  assert.deepEqual(missing.map(p => p.id), [],
    'the shop sells 3, 5 and 10 ml — every buyable product must price all three');
  assert.ok(sellable.length >= 70, `only ${sellable.length} sellable products`);
});

/* ── Gender: the contract the whole engine gates on ─────────────── */

test('every gender value the backend sends is one we can normalize', () => {
  const unmapped = [];
  for (const p of RAW) {
    const raw = p.fragrance?.gender_profile ?? p.fragrance?.gender ?? null;
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    if (!KNOWN_GENDERS.has(String(raw))) unmapped.push({ id: p.id, raw });
    assert.notEqual(normalizeGender(raw), 'unknown',
      `${p.id}: "${raw}" normalizes to unknown — extend the alias table in utils/gender.js`);
  }
  assert.deepEqual(unmapped, [], 'a new gender value appeared in the taxonomy');
});

test('the gender field is read from the same place the provider writes it', () => {
  for (const p of loadLiveCatalog()) {
    const raw = getRawProductGender(p);
    assert.equal(normalizeGender(raw), normalizeProduct(p).gender.value, String(p.id));
  }
});

/* ── Scores ─────────────────────────────────────────────────────── */

test('scores, when present, are 0–100 integers on the documented keys', () => {
  let withScores = 0;
  for (const p of RAW) {
    const scores = p.fragrance?.scores;
    if (!scores) continue;
    withScores++;
    for (const [key, value] of Object.entries(scores)) {
      const n = Number(value);
      assert.ok(Number.isFinite(n), `${p.id}.${key} = ${value}`);
      assert.ok(n >= 0 && n <= 100, `${p.id}.${key} = ${value} out of range`);
    }
  }
  assert.ok(withScores >= 50, `only ${withScores} products carry scores`);
});

/* A scores object that exists but is nearly empty is worse than no scores at
   all, because it looks documented. Exactly one product is in that state; it
   is pinned here and reported by the auditor. */
test('partial score objects are a documented anomaly, not a surprise', () => {
  const partial = RAW
    .filter(p => p.fragrance?.scores)
    .map(p => ({ id: p.id, present: SCORED_KEYS.filter(key => key in p.fragrance.scores).length }))
    .filter(row => row.present < SCORED_KEYS.length - 2);

  assert.deepEqual(partial, [{ id: 'VALENTINO-BORN-IN-ROMA-INTENSE', present: 3 }],
    'the set of products with a half-filled scores object changed');
});

/* ── Documented anomalies ───────────────────────────────────────── */

/* These are known defects in the LIVE data, pinned so a silent regression
   (or a silent fix) is visible. The numbers come from the 2026-07-26
   capture; see docs/rsupplyos-metadata-audit.md. */
test('the known metadata defects are still exactly as documented', () => {
  const noScores = RAW.filter(p => !p.fragrance?.scores);
  const emptyOccasions = RAW.filter(p => Array.isArray(p.fragrance?.occasions) && p.fragrance.occasions.length === 0);
  const climateInOccasions = RAW.filter(p =>
    (p.fragrance?.occasions ?? []).some(v => ['calor', 'frio', 'verano', 'calido', 'invierno'].includes(String(v))));
  const noGender = RAW.filter(p => !(p.fragrance?.gender_profile ?? p.fragrance?.gender));
  const soldOut = RAW.filter(p => !p.variants.some(v => v.available && Number(v.stock) > 0));

  assert.equal(noScores.length, 21, `products with no scores changed: ${noScores.map(p => p.id)}`);
  assert.equal(emptyOccasions.length, 8, `products with an empty occasions array changed: ${emptyOccasions.map(p => p.id)}`);
  assert.equal(climateInOccasions.length, 12, `climate-in-occasions count changed: ${climateInOccasions.map(p => p.id)}`);
  assert.equal(noGender.length, 1, `products with no gender changed: ${noGender.map(p => p.id)}`);
  assert.equal(soldOut.length, 2, `sold-out products changed: ${soldOut.map(p => p.id)}`);
});

/* ── The provider mapping ───────────────────────────────────────── */

test('the provider maps every snapshot product without losing a field the engine needs', () => {
  const mapped = loadLiveCatalog();
  assert.equal(mapped.length, RAW.length);

  for (const [i, product] of mapped.entries()) {
    const raw = RAW[i];
    assert.equal(String(product.id), String(raw.id));
    assert.equal(product.variants.length > 0, raw.variants.length > 0, String(product.id));

    if (!raw.fragrance) continue;
    /* Lossless for the fields the engine and auditor read. */
    assert.equal(product.fragrance.gender_raw, raw.fragrance.gender_profile ?? raw.fragrance.gender ?? null);
    assert.deepEqual(product.fragrance.occasions, (raw.fragrance.occasions ?? []).filter(Boolean));
    assert.deepEqual(product.fragrance.moods, (raw.fragrance.moods ?? raw.fragrance.mood_tags ?? []).filter(Boolean));
    assert.equal(product.fragrance.family, raw.fragrance.family ?? null);
    assert.equal(product.fragrance.summary, raw.fragrance.summary ?? raw.fragrance.scent_profile_short ?? null);
    if (raw.fragrance.scores) {
      assert.deepEqual(product.fragrance.scores_raw, raw.fragrance.scores,
        'the untouched payload is kept for the audit report');
    }
  }
});

test('mapApiProduct is defensive about junk without inventing data', () => {
  assert.equal(mapApiProduct(null), null);
  const empty = mapApiProduct({ id: 'x' });
  assert.equal(empty.id, 'x');
  assert.deepEqual(empty.variants, [], 'no priced variant is invented');
  assert.equal(empty.gender, 'unknown');
  assert.equal(empty.fragrance, null);
});

/* ── Optional live check ────────────────────────────────────────── */

const LIVE = process.env.RDECANTS_LIVE_API === '1';

test('live API still matches the snapshot contract', { skip: !LIVE && 'set RDECANTS_LIVE_API=1 to run' }, async () => {
  const response = await fetch('https://api.rdecants.com/api/web/catalog', {
    headers: { Accept: 'application/json' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const live = Array.isArray(body?.data) ? body.data : body;

  assert.ok(Array.isArray(live) && live.length > 0);

  const fieldsOf = list => new Set(list.flatMap(p => [
    ...Object.keys(p),
    ...Object.keys(p.fragrance ?? {}).map(k => `fragrance.${k}`),
    ...Object.keys(p.fragrance?.scores ?? {}).map(k => `scores.${k}`),
  ]));

  const snapshotFields = fieldsOf(RAW);
  const liveFields = fieldsOf(live);
  const gone = [...snapshotFields].filter(f => !liveFields.has(f));
  const added = [...liveFields].filter(f => !snapshotFields.has(f));

  if (added.length) console.log('[contract] NEW fields in the live API:', added);
  assert.deepEqual(gone, [], 'a field the snapshot documents disappeared from the live API');

  const liveGenders = new Set(live
    .map(p => p.fragrance?.gender_profile ?? p.fragrance?.gender)
    .filter(Boolean).map(String));
  const unknownGenders = [...liveGenders].filter(g => !KNOWN_GENDERS.has(g));
  assert.deepEqual(unknownGenders, [], 'a new gender value needs adding to utils/gender.js');

  for (const p of live) {
    assert.doesNotThrow(() => normalizeProduct(mapApiProduct(p)), String(p.id));
  }
});
