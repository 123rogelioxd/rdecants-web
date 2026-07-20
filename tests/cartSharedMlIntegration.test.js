import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
globalThis.window = {
  __RDECANTS_API_BASE__: 'https://inventory.test',
  location: { hostname: 'inventory.test', pathname: '/' },
};
globalThis.document = { getElementById() { return null; } };

globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return [{
      id: 'AFNAN-9PM',
      product_id: 77,
      sku: 'AFNAN-9PM',
      name: 'Afnan 9PM Night Out',
      house: 'Afnan',
      available_ml: 10,
      variants: [
        { id: 7710, ml: 10, price: 500, stock: 1, available: true },
        { id: 775, ml: 5, price: 270, stock: 2, available: true },
        { id: 773, ml: 3, price: 180, stock: 3, available: true },
        { id: 772, ml: 2, price: 130, stock: 5, available: true },
      ],
    }];
  },
});

const { Cart } = await import('../assets/js/cart/cart.js');

test('Cart.add blocks the confirmed 10ml plus 5ml overselling reproduction', async () => {
  await Cart.add('AFNAN-9PM', 10);
  await Cart.add('AFNAN-9PM', 5);
  await Cart.add('AFNAN-9PM', 3);
  await Cart.add('AFNAN-9PM', 2);

  assert.deepEqual(Cart.items.map(({ size, qty }) => ({ size, qty })), [
    { size: 10, qty: 1 },
  ]);
  assert.equal(Cart.availabilityError(), null);
});

test('Cart.changeQty blocks a third 5ml unit once two units exhaust the pool', async () => {
  Cart.clear();
  await Cart.add('AFNAN-9PM', 5);
  const key = Cart.items[0].key;

  await Cart.changeQty(key, 1);
  await Cart.changeQty(key, 1);

  assert.equal(Cart.items[0].qty, 2);
  assert.equal(Cart.canIncrement(key), false);
  assert.equal(Cart.availabilityError(), null);
});
