/* =============================================================
   STARTER PACKS — the home's first commercial offer.

   ── What changed, and why these tests changed with it ──────────────
   This file used to verify that packs were ASSEMBLED correctly: filled
   from the live catalog through the guided finder's ranking engine, with a
   hard gender gate and a re-checked 3 ml variant. Those were the right
   assertions for that design and they passed.

   The design was wrong. Ranking optimises for FIT, and the best fit for
   "quiero que se note" is routinely a niche flanker — so a pack that exists
   for someone who cannot name a single fragrance was free to fill itself
   with Torino 21 and Sauvage Elixir. No re-weighting fixes that, because
   the problem is not the weights: choosing what goes in a commercial
   product is a commercial decision.

   Roger now chooses, in R Supply OS, and R Supply OS prices it. So the
   assertions here move from "did the algorithm pick well" to:
     • the storefront renders exactly what the backend sent, in order;
     • it prices nothing itself;
     • it never invents, substitutes or reconstructs a pack;
     • it disappears cleanly when there is nothing to sell.

   The composition and pricing guarantees themselves are tested where they
   now live — StorefrontPackTest and StorefrontPackOrderTest in r-supply-os.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STARTER_PACK_SIZE_ML,
  STARTER_PACK_COUNT,
  normalizePack,
  normalizePacks,
  normalizePackPricing,
  hasRealSavings,
} from '../assets/js/recommendations/starterPacks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Normalised for the same reason as redesignSystem / mobileFunnel: a source
   assertion must not depend on how git materialised the line endings. */
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

/* Comments stripped, same convention as hero.test.js: these files explain at
   length why they no longer rank a catalog or name a perfume, and that
   explanation must not trip the check it is explaining. */
const readCode = path => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* A pack exactly as GET /api/web/packs sends it, at the brief's own numbers:
   120 + 150 + 180 = 450, ten percent off. */
const product = (id, price) => ({
  id,
  product_id: Number(id.replace(/\D/g, '')) || 1,
  name: `Perfume ${id}`,
  house: 'CASA',
  image: `/img/${id}.jpg`,
  variants: [{ id: `${id}-3`, variant_id: `${id}-3`, ml: 3, size: 3, price, stock: 5, availability: 5, available: true }],
});

const apiPack = (overrides = {}) => ({
  id: 7,
  slug: 'pack-todo-terreno',
  name: 'Pack Todo Terreno',
  description: 'Uno fresco, uno que va con todo y uno para salir.',
  badge: null,
  position: 0,
  presentation_ml: 3,
  item_count: 3,
  pricing: {
    normal_total: 450,
    discount_type: 'percent',
    discount_value: 10,
    discount_amount: 45,
    final_total: 405,
    savings_percentage: 10,
  },
  items: [
    { position: 0, role_label: 'Fresco', product: product('A', 120), variant: { id: 'A-3', ml: 3, price: 120, stock: 5 } },
    { position: 1, role_label: 'Va con todo', product: product('B', 150), variant: { id: 'B-3', ml: 3, price: 150, stock: 5 } },
    { position: 2, role_label: 'Para salir', product: product('C', 180), variant: { id: 'C-3', ml: 3, price: 180, stock: 5 } },
  ],
  ...overrides,
});

/* ── A. Shape ────────────────────────────────────────────────── */

test('a pack is three decants of three millilitres', () => {
  assert.equal(STARTER_PACK_SIZE_ML, 3);
  assert.equal(STARTER_PACK_COUNT, 3);

  const pack = normalizePack(apiPack());
  assert.equal(pack.count, 3);
  assert.equal(pack.itemSize, 3);
});

test('the products are the ones the backend configured, in the backend order', () => {
  const pack = normalizePack(apiPack());

  assert.deepEqual(pack.items.map(i => i.product.id), ['A', 'B', 'C']);
  assert.deepEqual(pack.items.map(i => i.label), ['Fresco', 'Va con todo', 'Para salir']);
  assert.deepEqual(pack.products.map(p => p.id), ['A', 'B', 'C']);
});

/* ── B. The storefront prices nothing ────────────────────────── */

test('the totals are read from the server, never recomputed', () => {
  const pack = normalizePack(apiPack());

  assert.equal(pack.pricing.normalTotal, 450);
  assert.equal(pack.pricing.finalTotal, 405);
  assert.equal(pack.pricing.savings, 45);
  assert.equal(pack.pricing.savingsPercentage, 10);
});

test('the saving is the server\'s discount_amount, not a local subtraction', () => {
  /* If the two ever disagree, the server's number is the one the customer is
     charged by — so that is the one shown. A locally derived
     (normal − final) would quietly diverge on a rounding difference. */
  const pack = normalizePack(apiPack({
    pricing: { normal_total: 450, final_total: 405, discount_amount: 45, discount_type: 'percent', discount_value: 10, savings_percentage: 10 },
  }));

  assert.equal(pack.pricing.savings, 45);
});

test('a fixed-amount discount survives normalization unchanged', () => {
  const pricing = normalizePackPricing({
    normal_total: 450, final_total: 399, discount_amount: 51,
    discount_type: 'fixed', discount_value: 51, savings_percentage: 11.33,
  });

  assert.equal(pricing.normalTotal, 450);
  assert.equal(pricing.finalTotal, 399);
  assert.equal(pricing.savings, 51);
  assert.equal(pricing.discountType, 'fixed');
});

test('a pack with no configured discount claims no saving', () => {
  const pack = normalizePack(apiPack({
    pricing: { normal_total: 450, final_total: 450, discount_amount: 0, discount_type: 'none', discount_value: 0, savings_percentage: 0 },
  }));

  assert.equal(hasRealSavings(pack), false, 'a curation is not a deal');
});

test('a pack with a real discount is flagged as one', () => {
  assert.equal(hasRealSavings(normalizePack(apiPack())), true);
});

/* ── C. Degradation ──────────────────────────────────────────── */

test('an empty or unreachable payload yields no packs', () => {
  assert.deepEqual(normalizePacks([]), []);
  assert.deepEqual(normalizePacks(null), []);
  assert.deepEqual(normalizePacks(undefined), []);
});

test('a malformed pack is dropped rather than half-rendered', () => {
  assert.equal(normalizePack(null), null);
  assert.equal(normalizePack(apiPack({ items: [] })), null, 'no contents');
  assert.equal(normalizePack(apiPack({ pricing: null })), null, 'no price');
  assert.equal(normalizePack(apiPack({ id: null })), null, 'nothing to order');
});

test('one bad pack in a payload does not take the good ones with it', () => {
  const packs = normalizePacks([apiPack(), apiPack({ id: 8, slug: 'roto', pricing: null })]);

  assert.equal(packs.length, 1);
  assert.equal(packs[0].slug, 'pack-todo-terreno');
});

/* ── D. No algorithmic resurrection ──────────────────────────── */

test('nothing in the pack path can assemble a pack from the catalog', () => {
  /* The one fallback worth refusing. An API outage would otherwise show a
     $900 beginner pack nobody approved, on exactly the day nobody is
     watching — and it would look identical to the bug this release fixes. */
  const logic = readCode('assets/js/recommendations/starterPacks.js');
  const ui = readCode('assets/js/ui/starterPacks.js');

  for (const [file, source] of [['recommendations', logic], ['ui', ui]]) {
    assert.doesNotMatch(source, /rankCatalog/, `${file}: no ranking-driven pack assembly`);
    assert.doesNotMatch(source, /STARTER_PACK_TEMPLATES/, `${file}: no hardcoded pack definitions`);
    assert.doesNotMatch(source, /answers:/, `${file}: no finder answer sets`);
  }
});

test('no perfume is named in the storefront pack source', () => {
  /* "Do not hardcode beginner pack products in rdecants-web." */
  const source = readCode('assets/js/recommendations/starterPacks.js') + readCode('assets/js/ui/starterPacks.js');

  for (const name of ['Sauvage', 'Hawas', 'Bleu de Chanel', 'Torino', 'Le Male', 'Scandal']) {
    assert.ok(!source.includes(name), `${name} is hardcoded in the storefront`);
  }
});

test('the demo pack fixture can no longer reach a customer', () => {
  /* data/products.js PACKS carry invented prices. A pack is a priced offer,
     so unlike the product catalog there is no dev-only fallback for it. */
  const provider = readCode('assets/js/providers/catalog.js');

  assert.doesNotMatch(provider, /_packsCache = PACKS/);
  assert.doesNotMatch(provider, /import \{ PRODUCTS, PACKS \}/);
});

/* ── E. Wiring ───────────────────────────────────────────────── */

test('the home mounts the packs and the renderer owns the markup', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const ui = read('assets/js/ui/starterPacks.js');

  assert.match(html, /id="packs-rail"/, 'mount point on the page');
  assert.match(app, /renderStarterPacks\('packs-rail'\)/, 'the entry point mounts it');

  /* The section removes itself instead of standing empty. */
  assert.match(ui, /rail\.closest\('section'\)\?\.remove\(\)/);

  /* Pack events now have their own names in the backend allowlist — see
     backendAllowlistParity for why all three places move together. */
  for (const call of ['packViewed', 'packAdded', 'packSelected']) {
    assert.ok(ui.includes(`Tracker.${call}`), `${call} is emitted`);
  }
  assert.doesNotMatch(ui, /Tracker\.emit\(/, 'no ad-hoc event names from this surface');
});

test('the thumbnails are the canonical catalog photos, never a second image source', () => {
  const ui = readCode('assets/js/ui/starterPacks.js');

  assert.match(ui, /product\?\.image/, 'reads the same field the catalog card reads');
  assert.doesNotMatch(ui, /pack\.image_url|pack\.thumbnail/, 'no pack-owned image');
});

test('adding a pack sends identity, and the price treatment stays restrained', () => {
  const ui = readCode('assets/js/ui/starterPacks.js');

  assert.match(ui, /cart\?\.addPack\?\.\(pack\)/, 'one cart entry point, identity only');
  /* No red, no urgency, no shouting — the RDECANTS price treatment. */
  assert.doesNotMatch(ui, /OFERTÓN|¡|!!|urgen|Últimas horas/i);
});
