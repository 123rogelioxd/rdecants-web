/* =============================================================
   STARTER PACKS — the home's first commercial offer.

   Three packs of 3 × 3 ml, filled from the live catalog through the SAME
   ranking engine the guided finder uses. The reason that matters is the
   defect it prevents: the storefront's previous themed kits ("Set Citas",
   "Set Noches") were filled by keyword score with no gender rule and no
   stock re-check, which is how three masculine fragrances once appeared
   under a "Mujer" result with an add-to-cart button, and how two different
   kits resolved to identical contents.

   Everything here runs against the real R Supply OS snapshot through the
   provider mapping production uses.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STARTER_PACK_TEMPLATES,
  STARTER_PACK_SIZE_ML,
  resolveStarterPacks,
  resolveStarterPack,
  isOrderablePackVariant,
} from '../assets/js/recommendations/starterPacks.js';
import { evaluateProduct } from '../assets/js/recommendations/engine.js';
import { isSellable } from '../assets/js/recommendations/scoring.js';
import { getVariantForSize } from '../assets/js/utils/prices.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Normalised for the same reason as redesignSystem / mobileFunnel: a source
   assertion must not depend on how git materialised the line endings. */
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

const CATALOG = loadLiveCatalog();
const PACKS = resolveStarterPacks(CATALOG);

/* ── A. Shape ────────────────────────────────────────────────── */

test('the three packs the brief asks for are the three that exist', () => {
  assert.deepEqual(
    STARTER_PACK_TEMPLATES.map(t => t.name),
    ['Pack Todo Terreno', 'Pack Para Salir', 'Pack Para Ella'],
  );
  for (const template of STARTER_PACK_TEMPLATES) {
    assert.equal(template.slots.length, 3, `${template.name} is 3 × 3 ml`);
  }
  assert.equal(STARTER_PACK_SIZE_ML, 3);
});

test('every pack fills completely against the live catalog', () => {
  assert.equal(PACKS.length, 3, 'all three resolve');
  for (const pack of PACKS) {
    assert.equal(pack.products.length, 3, `${pack.name} has three fragrances`);
    assert.equal(pack.itemSize, 3);
    assert.ok(pack.copy.trim().length > 0, `${pack.name} explains itself`);
  }
});

test('a pack never repeats a fragrance inside itself', () => {
  for (const pack of PACKS) {
    const ids = pack.products.map(p => String(p.id));
    assert.equal(new Set(ids).size, 3, `${pack.name}: ${ids.join(', ')}`);
  }
});

test('two packs are not the same box under two names', () => {
  /* "Set Citas" and "Set Noches" used to resolve to identical contents at an
     identical price. Overlap is legitimate — the catalog is 73 products and
     "fiesta" and "cita" are neighbours — but three-for-three is not. */
  for (let i = 0; i < PACKS.length; i++) {
    for (let j = i + 1; j < PACKS.length; j++) {
      const a = PACKS[i].products.map(p => String(p.id));
      const b = new Set(PACKS[j].products.map(p => String(p.id)));
      const shared = a.filter(id => b.has(id)).length;
      assert.ok(shared < 3, `${PACKS[i].name} and ${PACKS[j].name} are the same three products`);
    }
  }
});

/* ── B. Nothing unsellable, nothing incompatible ─────────────── */

test('every fragrance in every pack can actually be bought in 3 ml', () => {
  for (const pack of PACKS) {
    for (const slot of pack.slots) {
      assert.ok(isSellable(slot.product), `${pack.name}/${slot.label}: ${slot.product.id} is not sellable`);
      assert.equal(Number(slot.variant.size), 3, 'the pack size is the size quoted');
      assert.ok(isOrderablePackVariant(slot.variant),
        `${pack.name}/${slot.label}: ${slot.product.id} has no orderable 3 ml variant`);
    }
  }
});

test('"Pack Para Ella" contains only fragrances the engine accepts for mujer', () => {
  /* The hard gender constraint, verified independently of how the pack was
     built: each product is re-evaluated with `gender: 'mujer'` and must come
     back eligible. This is the assertion the old kits would have failed. */
  const pack = PACKS.find(p => p.id === 'para-ella');
  assert.ok(pack, 'the pack resolved');

  for (const product of pack.products) {
    const { eligible, exclusions } = evaluateProduct(product, { gender: 'mujer' });
    assert.ok(eligible, `${product.name} is not eligible for mujer (${exclusions.join(', ')})`);
  }
});

test('a sold-out product is never placed in a pack', () => {
  const soldOut = CATALOG.map(product => ({
    ...product,
    stock: 0,
    variants: (product.variants ?? []).map(v => ({
      ...v, stock: 0, availability: 0, available: false, soldOut: true, sold_out: true,
    })),
  }));
  assert.deepEqual(resolveStarterPacks(soldOut), [], 'nothing sellable → no packs at all');
});

/* ── C. Price is the sum of its parts ────────────────────────── */

test('the total is exactly the three 3 ml prices added up', () => {
  for (const pack of PACKS) {
    const expected = pack.products.reduce(
      (sum, product) => sum + Number(getVariantForSize(product, 3).price), 0);
    assert.equal(pack.total, expected, `${pack.name} quotes a total it did not compute`);
    assert.ok(pack.total > 0);
  }
});

test('no pack claims a saving, because there is no pack discount upstream', () => {
  /* Cart.addBundle prorates line prices by total/originalTotal. Passing a
     total below the sum would charge less than R Supply OS agreed to; passing
     one above would be a markup. Zero savings keeps that ratio at 1. */
  for (const pack of PACKS) {
    assert.equal(pack.savings, 0, `${pack.name} invented a discount`);
  }
});

/* ── D. Degradation ──────────────────────────────────────────── */

test('an unreachable or thin catalog yields no pack rather than a broken one', () => {
  assert.deepEqual(resolveStarterPacks([]), []);
  assert.deepEqual(resolveStarterPacks(null), []);
  assert.deepEqual(resolveStarterPacks(undefined), []);

  /* Two products cannot fill three slots: the pack is dropped, not padded. */
  assert.equal(resolveStarterPack(STARTER_PACK_TEMPLATES[0], CATALOG.slice(0, 2)), null);
});

test('a pack is dropped when one slot cannot be filled, not shipped short', () => {
  const template = {
    id: 'impossible',
    name: 'Impossible',
    copy: 'x',
    slots: [
      ...STARTER_PACK_TEMPLATES[0].slots,
      /* An answer set nothing in the catalog can satisfy. */
      { key: 'ghost', label: 'Ghost', answers: { gender: 'mujer', family: 'fresco', occasion: 'oficina', goal: 'discreto', climate: 'frio', age: '35+' } },
    ],
  };
  const resolved = resolveStarterPack(template, CATALOG);
  assert.ok(resolved === null || resolved.slots.length === template.slots.length,
    'either every slot is filled or the pack does not exist');
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

  /* Tracking reuses names the backend allowlist accepts — a new event name
     would be 422'd and lost (see backendAllowlistParity). */
  for (const call of ['discoverySetViewed', 'discoverySetAdded', 'discoverySetClicked']) {
    assert.ok(ui.includes(`Tracker.${call}`), `${call} is emitted`);
  }
  assert.doesNotMatch(ui, /Tracker\.emit\(/, 'no ad-hoc event names from this surface');
});

test('adding a pack goes through the cart, which re-resolves the products', () => {
  const ui = read('assets/js/ui/starterPacks.js');
  assert.match(ui, /cart\?\.addBundle/, 'the existing bundle path, not a second add implementation');
  assert.match(ui, /originalTotal: pack\.total/);
  assert.match(ui, /total: pack\.total/, 'ratio 1 — the price shown is the price charged');
});
