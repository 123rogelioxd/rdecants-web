import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canConsumeSharedMl,
  clampToSharedAvailability,
  findSharedAvailabilityViolation,
  requestedMlForProduct,
  sharedAvailableMl,
} from '../assets/js/cart/availability.js';

const item = (key, size, qty, availableMl = 10, productId = 77) => ({
  key,
  type: 'product',
  product_id: productId,
  size,
  qty,
  available_ml: availableMl,
});

test('mixed presentations consume one canonical milliliter pool', () => {
  const cart = [item('afnan-10', 10, 1)];

  assert.equal(requestedMlForProduct(cart, '77'), 10);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 5), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), false);
});

test('two 5ml units also exhaust the pool and block every other presentation', () => {
  const cart = [item('afnan-5', 5, 2)];

  assert.equal(canConsumeSharedMl(cart, '77', 10, 10), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), false);
});

test('mixed presentations are allowed when their aggregate is within the pool', () => {
  const cart = [item('afnan-5', 5, 1), item('afnan-3', 3, 1)];

  assert.equal(canConsumeSharedMl(cart, '77', 10, 2), true);
  assert.equal(canConsumeSharedMl(cart, '77', 10, 3), false);
});

test('availability is grouped by physical product and never across products', () => {
  const cart = [item('afnan-10', 10, 1, 10, 77)];

  assert.equal(canConsumeSharedMl(cart, '88', 10, 10), true);
});

test('legacy oversold persisted cart is clamped to shared availability', () => {
  const cart = [item('afnan-10', 10, 1), item('afnan-5', 5, 2)];
  const violation = findSharedAvailabilityViolation(cart);

  assert.deepEqual(
    { requestedMl: violation.requestedMl, availableMl: violation.availableMl },
    { requestedMl: 20, availableMl: 10 },
  );

  const repaired = clampToSharedAvailability(cart);
  assert.deepEqual(repaired.items.map(({ key, qty }) => ({ key, qty })), [
    { key: 'afnan-10', qty: 1 },
  ]);
  assert.deepEqual(repaired.removed.map(entry => entry.key), ['afnan-5']);
});

test('older catalog fallback derives one conservative pool instead of summing variants', () => {
  const product = {
    variants: [
      { ml: 10, stock: 1 },
      { ml: 5, stock: 2 },
      { ml: 3, stock: 3 },
      { ml: 2, stock: 5 },
    ],
  };

  assert.equal(sharedAvailableMl(product), 10);
});

test('explicit canonical available_ml wins over presentation-derived fallback', () => {
  const product = {
    available_ml: 11,
    variants: [{ ml: 10, stock: 1 }, { ml: 5, stock: 2 }],
  };

  assert.equal(sharedAvailableMl(product), 11);
});

/* ── Reconciliation must never mistake an outage for a sold-out catalog ──
   Cart.reconcile() drops any line it cannot resolve against the catalog.
   That is correct when a variant really went away, and destructive when the
   catalog request itself failed: before this guard, loading any page while
   the API was down silently emptied the customer's cart. */
test('an unreachable catalog leaves the cart untouched instead of emptying it', async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };

  const stored = JSON.stringify([{
    key: 'lemale-5', type: 'product', sourceId: 'lemale-elixir', product_id: 'lemale-elixir',
    name: 'Le Male Elixir', house: 'JEAN PAUL GAULTIER', size: 5, qty: 1,
    price: 170, variant_id: 900, stock: 4, available_ml: 20,
  }]);

  const store = new Map([['rdecants_cart', stored]]);
  globalThis.localStorage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  globalThis.window = { location: { hostname: 'rdecants.com', pathname: '/' }, addEventListener() {} };
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };

  try {
    const { Cart } = await import('../assets/js/cart/cart.js');
    const { CatalogProvider } = await import('../assets/js/providers/catalog.js');

    /* Production with the API down returns an empty catalog (demo SKUs are
       gated off), which is exactly the state that used to wipe the cart. */
    const realGetProducts = CatalogProvider.getProducts;
    CatalogProvider.getProducts = async () => [];

    try {
      assert.equal(Cart.items.length, 1, 'cart loaded from storage');
      await Cart.reconcile({ silent: true });
      assert.equal(Cart.items.length, 1, 'the line survives an unreachable catalog');
      assert.equal(JSON.parse(store.get('rdecants_cart')).length, 1, 'storage is not rewritten');
    } finally {
      CatalogProvider.getProducts = realGetProducts;
      Cart.clear();
    }
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.localStorage = previous.localStorage;
  }
});
