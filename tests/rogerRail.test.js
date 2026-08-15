/* =============================================================
   THE "ROGER RECOMIENDA" RAIL

   The home's one commercial surface. It used to be headed "Más vendidos"
   while sorting by availability and `factor_hype`, which was a claim nobody
   produced. It is now Roger's own picks, served by /api/web/merchandising.

   What has to hold: curation is ADDITIVE. The endpoint can be switched off,
   un-migrated, unreachable or simply empty, and the rail must still show four
   sellable products — because an empty homepage is a worse outcome than an
   uncurated one.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRogerPicks, selectNewest, BESTSELLER_LIMIT } from '../assets/js/ui/bestsellers.js';

let seq = 0;
const product = (id, overrides = {}) => ({
  id,
  product_id: overrides.product_id ?? ++seq,
  name: id,
  house: 'CASA',
  notes: [],
  stock: 5,
  variants: [{ size: 5, price: 170, stock: 5, availability: 5, available: true, variant_id: `${id}-5` }],
  ...overrides,
});

const soldOut = id => product(id, {
  stock: 0,
  variants: [{ size: 5, price: 170, stock: 0, availability: 0, available: false, variant_id: `${id}-5` }],
});

/* ── Curation wins when it exists ────────────────────────────────── */

test('curated picks are shown in the order Roger set', () => {
  const placements = [
    { label: 'Roger recomienda', reason: 'Fresco.', product: product('A') },
    { label: null, reason: null, product: product('B') },
  ];

  const picks = selectRogerPicks(placements, [product('Z')]);

  assert.deepEqual(picks.map(p => p.product.id), ['A', 'B']);
  assert.equal(picks[0].label, 'Roger recomienda');
  assert.equal(picks[0].reason, 'Fresco.');
});

test('a curated pick that sold out since the payload was cached is dropped', () => {
  /* The backend already excludes unsellable products, but both sides cache
     for up to a minute. The storefront re-checks rather than trusting a
     payload that may be a minute old. */
  const placements = [
    { product: soldOut('GONE') },
    { product: product('HERE') },
  ];

  assert.deepEqual(
    selectRogerPicks(placements, []).map(p => p.product.id),
    ['HERE'],
  );
});

test('the rail is capped at four however many are curated', () => {
  const placements = Array.from({ length: 9 }, (_, i) => ({ product: product(`P${i}`) }));
  assert.equal(selectRogerPicks(placements, []).length, BESTSELLER_LIMIT);
});

/* ── Fallback when there is no curation ──────────────────────────── */

test('with no curation the rail falls back to the derived order', () => {
  const catalog = [product('A'), product('B'), product('C')];
  const picks = selectRogerPicks([], catalog);

  assert.equal(picks.length, 3);
  for (const pick of picks) {
    assert.equal(pick.label, null, 'a derived pick carries no editorial label');
    assert.equal(pick.reason, null);
  }
});

test('an unreachable or switched-off endpoint is indistinguishable from no curation', () => {
  /* CatalogProvider.getMerchandising() returns [] for every failure mode, so
     this single case covers "off", "not migrated" and "API down". */
  const catalog = [product('A'), product('B')];
  assert.deepEqual(
    selectRogerPicks([], catalog).map(p => p.product.id),
    selectRogerPicks(undefined, catalog).map(p => p.product.id),
  );
});

test('a rail is never half curated and half automatic', () => {
  /* Topping up two curated picks with two derived ones would make
     "Roger recomienda" partly untrue, and the customer cannot tell which
     halves are which. Two honest picks beat four mixed ones. */
  const placements = [{ product: product('CURATED') }];
  const catalog = [product('DERIVED_1'), product('DERIVED_2'), product('DERIVED_3')];

  const picks = selectRogerPicks(placements, catalog);

  assert.equal(picks.length, 1);
  assert.deepEqual(picks.map(p => p.product.id), ['CURATED']);
});

test('when every curated pick is unsellable the rail falls back whole', () => {
  const catalog = [product('LIVE_1'), product('LIVE_2')];
  const picks = selectRogerPicks([{ product: soldOut('DEAD') }], catalog);

  assert.deepEqual(picks.map(p => p.product.id), ['LIVE_1', 'LIVE_2']);
});

/* ── New arrivals ────────────────────────────────────────────────── */

test('new arrivals are the highest product_ids that can actually be sold', () => {
  const catalog = [
    product('OLD', { product_id: 2 }),
    product('NEW', { product_id: 99 }),
    { ...soldOut('NEWEST_BUT_GONE'), product_id: 120 },
    product('MID', { product_id: 40 }),
  ];

  assert.deepEqual(
    selectNewest(catalog).map(p => p.id),
    ['NEW', 'MID', 'OLD'],
  );
});

test('new arrivals are capped and tolerate a missing product_id', () => {
  const catalog = Array.from({ length: 10 }, (_, i) => product(`P${i}`, { product_id: i + 1 }));
  catalog.push(product('NO_ID', { product_id: null }));

  const picks = selectNewest(catalog);

  assert.equal(picks.length, BESTSELLER_LIMIT);
  assert.ok(!picks.some(p => p.id === 'NO_ID'), 'a product with no id cannot claim to be newest');
});

/* ── Badge restraint ─────────────────────────────────────────────── */

test('scarcity outranks an editorial label, and they never stack', async () => {
  const source = await import('node:fs')
    .then(fs => fs.readFileSync(new URL('../assets/js/ui/bestsellers.js', import.meta.url), 'utf8'));

  /* One `badgeText`, chosen by precedence — not two badge slots. */
  assert.match(source, /const badgeText = stock\.state === 'last_units'/);
  assert.equal((source.match(/class="card-badge/g) ?? []).length, 1, 'one badge slot on the card');
});

test('operator-authored copy is escaped before it reaches innerHTML', async () => {
  const source = await import('node:fs')
    .then(fs => fs.readFileSync(new URL('../assets/js/ui/bestsellers.js', import.meta.url), 'utf8'));

  assert.match(source, /_escape\(badgeText\)/);
  assert.match(source, /_escape\(reason\)/);
});
