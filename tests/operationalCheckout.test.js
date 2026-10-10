import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Delivery } from '../assets/js/cart/delivery.js';
import { Account } from '../assets/js/account/account.js';
import { ApiClient } from '../assets/js/api/client.js';
import { CatalogProvider, mapApiProduct } from '../assets/js/providers/catalog.js';
import * as Checkout from '../assets/js/cart/checkout.js';
import { Cart } from '../assets/js/cart/cart.js';
import { Discount } from '../assets/js/cart/discount.js';

const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
beforeEach(() => { store.clear(); Delivery.reset(); Account._reset(); });

test('API capability controls remembering, and an old or disabled API never claims to save', async () => {
  for (const [capabilities, expected] of [[undefined, false], [{ saved_addresses: false }, false], [{ saved_addresses: true }, true]]) {
    ApiClient.getDeliveryOptions = async () => ({ capabilities });
    await Delivery.refreshWindows();
    assert.equal(Delivery.canSaveAddress, expected);
  }
});

test('failed forget keeps private state visible until the backend confirms revocation', async () => {
  Delivery.setAddressField('street', 'Current private address');
  ApiClient.forgetAddress = async () => { throw new Error('offline'); };
  await assert.rejects(Account.forgetAddress(), /offline/);
  assert.equal(Delivery.address.street, 'Current private address');
  ApiClient.forgetAddress = async () => ({ ok: true });
  await Account.forgetAddress();
  assert.deepEqual(Delivery.address, {});
});

test('delivery keeps private address in memory and removes legacy persisted personal data', () => {
  Delivery.setMode('local');
  Delivery.setAddressField('recipient', 'Private buyer');
  Delivery.setAddressField('street', 'Private street');
  assert.equal(Delivery.address.street, 'Private street');
  assert.doesNotMatch(JSON.stringify([...store.values()]), /Private/);
  Delivery.reset();
  store.set('rdecants_delivery_choice', JSON.stringify({ mode: 'local', address: { street: 'Previous customer' } }));
  Delivery.init();
  assert.deepEqual(Delivery.address, {});
  assert.equal(store.has('rdecants_delivery_choice'), false);
});

test('saved address is offered only for authenticated explicit backend consent, including legacy APIs', async () => {
  for (const [authenticated, addressSaved, expected] of [[true, undefined, null], [true, false, null], [false, true, null], [true, true, 'Centro']]) {
    Account._reset();
    ApiClient.getAccount = async () => ({ ok: true, status: 200, data: { authenticated, customer: { name: 'Buyer', phone: '9511234567' }, delivery: { mode: 'local', address_saved: addressSaved, address: { street: 'Centro' } } } });
    const saved = await Account.prefill({ refresh: true });
    assert.equal(saved?.address?.street ?? null, expected);
  }
});

test('unavailable selected delivery window remains visible and requires a new explicit choice', () => {
  Delivery.setMode('local');
  Delivery.setWindows({ enabled: true, days: [{ date: '2026-10-10', windows: [{ key: '13_16' }] }] });
  Delivery.setPreference('2026-10-10', '13_16');
  Delivery.setWindows({ enabled: true, days: [{ date: '2026-10-10', windows: [{ key: '16_19' }] }] });
  assert.deepEqual(Delivery.preference, { date: '2026-10-10', window: '13_16' });
  assert.equal(Delivery.preferenceNeedsReselection, true);
  Delivery.setPreference('2026-10-10', '16_19');
  assert.equal(Delivery.preferenceNeedsReselection, false);
});

test('legacy price-only catalog cannot invent stock or an orderable presentation', () => {
  const product = mapApiProduct({ id: 1, name: 'Legacy price', prices: { 5: 100 } });
  assert.equal(product.stock, 0);
  assert.equal(product.purchase.mode, 'sold_out');
});

test('catalog, curated placements and packs exclude unavailable offers while detail retains them', async () => {
  const unavailable = { id: 1, name: 'Unavailable', variants: [{ id: 5, ml: 5, price: 100, stock: 0 }] };
  const available = { id: 2, name: 'Available bottle', variants: [], bottles: [{ offer_key: 'sealed:2', price: 1000, stock: 1, ml: 100 }] };
  ApiClient.getCatalog = async () => [unavailable, available];
  ApiClient.getFeatured = async () => [unavailable];
  ApiClient.getMerchandising = async () => ({ hero: [{ product: unavailable }, { product: available }] });
  assert.deepEqual((await CatalogProvider.getProducts()).map(p => p.id), ['2']);
  assert.equal((await CatalogProvider.getProductById(1))?.id, '1');
  assert.equal((await CatalogProvider.getFeatured())?.id, '2');
  assert.deepEqual((await CatalogProvider.getMerchandising('hero')).map(e => e.product.id), ['2']);
});

test('WhatsApp uses the canonical server URL and rejects unsafe destinations', () => {
  assert.equal(typeof Checkout.orderWhatsAppUrl, 'function');
  const url = 'https://wa.me/529511234567?text=Hola%2C%20Total%20%24350';
  assert.equal(Checkout.orderWhatsAppUrl({ whatsapp_url: url }), url);
  for (const value of ['javascript:alert(1)', 'https://evil.test/?text=x', 'https://wa.me.evil.test/529511234567', 'http://wa.me/529511234567']) {
    assert.equal(Checkout.orderWhatsAppUrl({ whatsapp_url: value }), null);
  }
});

test('checkout does not manufacture a WhatsApp order from browser prices or internal folio', () => {
  const source = readFileSync(new URL('../assets/js/ui/checkoutFlow.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /buildWhatsAppMessage\(order\.folio/);
  assert.match(source, /orderWhatsAppUrl\(order\)/);
});

test('actual checkout 422 preserves cart, coupons, address and signed quote until explicit reselection', async () => {
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.sessionStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const item = { key: '1-5', sourceId: '1', product_id: 1, variant_id: 11, type: 'product', name: 'Fixture', size: 5, qty: 1, stock: 10, price: 150 };
  const originalItems = Object.getOwnPropertyDescriptor(Cart, 'items');
  const originalCoupons = Object.getOwnPropertyDescriptor(Discount, 'applied');
  const originalClear = Cart.clear;
  let clears = 0, submitted;
  Object.defineProperty(Cart, 'items', { configurable: true, get: () => [item] });
  Object.defineProperty(Discount, 'applied', { configurable: true, get: () => [{ code: 'FIXTURE', amount: 10 }] });
  Cart.clear = () => { clears++; };
  try {
    Delivery.setMode('local');
    for (const [field, value] of Object.entries({ recipient: 'Buyer', phone: '9511234567', street: 'Private street', exterior_number: '10', neighborhood: 'Centro', city: 'Oaxaca', state: 'Oaxaca', postal_code: '68000' })) Delivery.setAddressField(field, value);
    Delivery.setWindows({ enabled: true, days: [{ date: '2026-10-10', windows: [{ key: 'tarde' }] }] });
    Delivery.setPreference('2026-10-10', 'tarde');
    ApiClient.quoteDelivery = async () => ({ ok: true, data: { delivery: { options: [{ token: 'signed-fixture', amount: 40 }] } } });
    await Delivery.quote({ items: [] });
    CatalogProvider.getProductById = async () => ({ id: '1', product_id: 1, variants: [{ variant_id: 11, size: 5, price: 150, availability: 10, soldOut: false }] });
    ApiClient.getDeliveryOptions = async () => ({ delivery_windows: { enabled: true, days: [] } });
    ApiClient.createWebOrder = async payload => { submitted = payload; throw Object.assign(new Error('closed'), { status: 422, data: { errors: { 'delivery.preference': ['closed'] } } }); };
    await assert.rejects(Checkout.registerWebOrder(), error => error.code === 'DELIVERY_PREFERENCE_UNAVAILABLE');
    assert.equal(clears, 0);
    assert.equal(Cart.items[0].qty, 1);
    assert.equal(Discount.applied[0].code, 'FIXTURE');
    assert.equal(submitted.coupon_codes[0], 'FIXTURE');
    assert.equal(Delivery.address.street, 'Private street');
    assert.equal(Delivery.selectedToken, 'signed-fixture');
    assert.deepEqual(Delivery.preference, { date: '2026-10-10', window: 'tarde' });
    assert.equal(Delivery.preferenceNeedsReselection, true);
  } finally {
    Object.defineProperty(Cart, 'items', originalItems);
    Object.defineProperty(Discount, 'applied', originalCoupons);
    Cart.clear = originalClear;
  }
});
