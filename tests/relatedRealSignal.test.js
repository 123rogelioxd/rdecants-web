/* =============================================================
   PDP "Si te gusta esto..." — upgraded with the real recommendation engine.

   getRelatedProducts() (recommendations/upsells.js) already renders this
   rail from tag/scent-family overlap over the locally-fetched catalog — real
   metadata, already tested, unchanged here. What it cannot see is PURCHASE
   BEHAVIOUR, which only R Supply OS's engine has. upgradeRelatedWithRealSignal()
   is the bridge: fire-and-forget, and it must never leave the rail worse off
   than the synchronous local render already made it.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeElement(tag = 'div') {
  const attrs = new Map();
  return {
    tagName: tag,
    hidden: false,
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    querySelectorAll() { return []; }, // click-wiring is a no-op on an empty stub
  };
}

function stubRoot() {
  const slot = makeElement('section');
  const row = makeElement('div');
  return {
    slot,
    row,
    querySelector(selector) {
      if (selector === '#pdp-related') return slot;
      if (selector === '#pdp-related-row') return row;
      return null;
    },
  };
}

const seed = { id: 'sauvage', product_id: 42, name: 'SAUVAGE' };

const localProducts = [
  seed,
  { id: 'other-1', product_id: 1, name: 'LOCAL HEURISTIC PICK' },
  { id: 'other-2', product_id: 2, name: 'REAL ENGINE PICK A' },
  { id: 'other-3', product_id: 3, name: 'REAL ENGINE PICK B' },
];

async function withFakeApi(similarResponse) {
  const { ApiClient } = await import('../assets/js/api/client.js');
  const calls = [];
  ApiClient.getSimilarProducts = async (productId, limit) => {
    calls.push({ productId, limit });
    if (similarResponse instanceof Error) throw similarResponse;
    return similarResponse;
  };

  const mod = await import('../assets/js/ui/productPage.js');
  return { upgradeRelatedWithRealSignal: mod.upgradeRelatedWithRealSignal, calls };
}

test('calls the real endpoint with the seed product\'s numeric id', async () => {
  const { upgradeRelatedWithRealSignal, calls } = await withFakeApi({ ok: true, similar: [] });
  const root = stubRoot();

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].productId, 42, 'must use product_id, not the SKU-based public id');
});

test('paints the rail with the real engine\'s picks, matched to the local catalog', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi({
    ok: true,
    similar: [{ id: 'other-3' }, { id: 'other-2' }],
  });
  const root = stubRoot();

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  assert.match(root.row.innerHTML, /REAL ENGINE PICK A/);
  assert.match(root.row.innerHTML, /REAL ENGINE PICK B/);
  assert.doesNotMatch(root.row.innerHTML, /LOCAL HEURISTIC PICK/, 'the local-only pick must not appear once the real rail wins');
  assert.equal(root.slot.hidden, false);
});

test('preserves the engine\'s ranked order, not catalog order', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi({
    ok: true,
    similar: [{ id: 'other-3' }, { id: 'other-2' }], // 3 before 2
  });
  const root = stubRoot();

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  const posB = root.row.innerHTML.indexOf('REAL ENGINE PICK B');
  const posA = root.row.innerHTML.indexOf('REAL ENGINE PICK A');
  assert.ok(posB < posA, 'engine order (B before A) must survive into the rendered rail');
});

/* ── Never regress the section the local heuristic already painted ────── */

test('an empty engine result leaves the rail untouched', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi({ ok: true, similar: [] });
  const root = stubRoot();
  root.row.innerHTML = 'LOCAL HEURISTIC ALREADY RENDERED THIS';

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  assert.equal(root.row.innerHTML, 'LOCAL HEURISTIC ALREADY RENDERED THIS');
});

test('a network/engine failure leaves the rail untouched, never throws', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi(new Error('network down'));
  const root = stubRoot();
  root.row.innerHTML = 'LOCAL HEURISTIC ALREADY RENDERED THIS';

  await assert.doesNotReject(() => upgradeRelatedWithRealSignal(root, seed, localProducts));
  assert.equal(root.row.innerHTML, 'LOCAL HEURISTIC ALREADY RENDERED THIS');
});

/**
 * The regression this specifically guards: the engine returning an id the
 * local catalog does not currently have (stale cache, a product that just
 * went out of stock in this browser's copy) must not render a half-broken
 * card built from a raw, un-normalized API shape.
 */
test('a candidate id absent from the local catalog is silently dropped, never rendered raw', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi({
    ok: true,
    similar: [{ id: 'unknown-id-not-in-local-catalog' }, { id: 'other-2' }],
  });
  const root = stubRoot();

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  assert.match(root.row.innerHTML, /REAL ENGINE PICK A/);
  assert.doesNotMatch(root.row.innerHTML, /unknown-id-not-in-local-catalog/);
});

test('every candidate missing from the local catalog leaves the rail untouched', async () => {
  const { upgradeRelatedWithRealSignal } = await withFakeApi({
    ok: true,
    similar: [{ id: 'ghost-1' }, { id: 'ghost-2' }],
  });
  const root = stubRoot();
  root.row.innerHTML = 'LOCAL HEURISTIC ALREADY RENDERED THIS';

  await upgradeRelatedWithRealSignal(root, seed, localProducts);

  assert.equal(root.row.innerHTML, 'LOCAL HEURISTIC ALREADY RENDERED THIS');
});

test('does nothing when the page has no related-rail slots at all', async () => {
  const { upgradeRelatedWithRealSignal, calls } = await withFakeApi({ ok: true, similar: [{ id: 'other-2' }] });

  await assert.doesNotReject(() => upgradeRelatedWithRealSignal({ querySelector: () => null }, seed, localProducts));
  assert.equal(calls.length, 0, 'must not call the network when there is nowhere to render the result');
});

test('does nothing when the seed carries no identifiable product id', async () => {
  const { upgradeRelatedWithRealSignal, calls } = await withFakeApi({ ok: true, similar: [] });
  const root = stubRoot();

  await upgradeRelatedWithRealSignal(root, { name: 'no id at all' }, localProducts);

  assert.equal(calls.length, 0);
});
