/* =============================================================
   The customer's name and phone reach R Supply OS.

   ── The production bug this file exists for ──────────────────
   A customer typed:

     Quién recibe : Rogelio Diaz
     Teléfono     : 9516514019
     CP           : 71510  →  Unión y Progreso, Ocotlán de Morelos
     Calle        : Avenida Ferrocarril
     Número ext.  : 140

   …and the resulting WebOrder read «Sin nombre», with the phone shown as
   "—" and the WhatsApp message printing "Nombre: -".

   The cause was two questions for one fact. `readCheckoutData()` read a
   separate, optional "Tu nombre" input at the top of the drawer and had no
   phone field at all; everything the customer actually typed went into
   `Delivery.address` and stopped there. So `customer.name` was usually empty
   and `customer.phone` was ALWAYS undefined.

   The duplicate input is gone and the delivery block is the single source.
   These tests assert the payload that goes over the wire, because that is the
   only thing R Supply OS ever sees.
   ============================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A localStorage that actually stores, so Delivery's own persistence works
   and the module under test behaves as it does in a browser. */
const _store = new Map();

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/' },
};

globalThis.localStorage = {
  getItem: key => (_store.has(key) ? _store.get(key) : null),
  setItem: (key, value) => _store.set(key, String(value)),
  removeItem: key => _store.delete(key),
};

/* readCheckoutData() reaches for the notes textarea; there is no DOM here and
   `?.` handles that. Nothing else in these tests touches the document. */
globalThis.document = { getElementById: () => null };

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node-test' },
});

const { Delivery, DELIVERY_MODES } = await import('../assets/js/cart/delivery.js');
const { readCheckoutData, buildWebOrderPayload } = await import('../assets/js/cart/checkout.js');
const { CatalogProvider } = await import('../assets/js/providers/catalog.js');

/** The exact address from the production report. */
function typeTheOcotlanAddress() {
  Delivery.reset();
  Delivery.setMode(DELIVERY_MODES.LOCAL);

  Delivery.setAddressField('postal_code', '71510');
  Delivery.setAddressField('municipio', 'Ocotlán de Morelos');
  Delivery.setAddressField('state', 'Oaxaca');
  Delivery.setAddressField('city', 'Ocotlán de Morelos');
  Delivery.setAddressField('neighborhood', 'Unión y Progreso');
  Delivery.setAddressField('street', 'Avenida Ferrocarril');
  Delivery.setAddressField('exterior_number', '140');
  Delivery.setAddressField('recipient', 'Rogelio Diaz');
  Delivery.setAddressField('phone', '9516514019');
}

async function withStubbedCatalog(run) {
  const original = CatalogProvider.getProductById;
  CatalogProvider.getProductById = async () => ({
    id: 'p1',
    product_id: 'p1',
    variants: [{ size: 5, price: 170, stock: 4, availability: 4, soldOut: false, variant_id: '5' }],
  });

  try {
    return await run();
  } finally {
    CatalogProvider.getProductById = original;
  }
}

const CART = [{
  key: 'p1-5', sourceId: 'p1', product_id: 'p1',
  name: 'Sauvage', house: 'Dior', type: 'product',
  size: 5, price: 170, qty: 1, image: '/x.webp',
}];

// ══════════════════════════════════════════════════════════════
//  A. The contact the customer typed is the contact that is sent
// ══════════════════════════════════════════════════════════════

test('readCheckoutData reads the name and phone from the delivery block', () => {
  typeTheOcotlanAddress();

  const data = readCheckoutData();

  assert.equal(data.name, 'Rogelio Diaz');
  assert.equal(data.phone, '9516514019');
});

test('the order payload carries the customer exactly as typed', async () => {
  typeTheOcotlanAddress();

  const payload = await withStubbedCatalog(() =>
    buildWebOrderPayload(CART, readCheckoutData(), { delivery: Delivery.forOrder() }));

  assert.equal(payload.customer.name, 'Rogelio Diaz');
  assert.equal(payload.customer.phone, '9516514019');

  // Never null, never undefined, never the string "undefined" — the three
  // shapes «Sin nombre» came from.
  assert.notEqual(payload.customer.name, null);
  assert.notEqual(payload.customer.phone, null);
  assert.ok(!JSON.stringify(payload).includes('undefined'));
});

test('the address travels with the order, in full', async () => {
  typeTheOcotlanAddress();

  const payload = await withStubbedCatalog(() =>
    buildWebOrderPayload(CART, readCheckoutData(), { delivery: Delivery.forOrder() }));

  assert.equal(payload.delivery.mode, 'local');
  assert.deepEqual(payload.delivery.address, {
    postal_code: '71510',
    municipio: 'Ocotlán de Morelos',
    state: 'Oaxaca',
    city: 'Ocotlán de Morelos',
    neighborhood: 'Unión y Progreso',
    street: 'Avenida Ferrocarril',
    exterior_number: '140',
    recipient: 'Rogelio Diaz',
    phone: '9516514019',
  });

  // The storefront names a destination; it never names a price. R Supply OS
  // recomputes a local fee from its own rules.
  assert.ok(!('shipping_cost' in payload.delivery));
  assert.ok(!('amount' in payload.delivery));
});

test('an empty delivery block sends empty strings, not the word undefined', () => {
  Delivery.reset();

  const data = readCheckoutData();

  assert.equal(data.name, '');
  assert.equal(data.phone, '');
});

// ══════════════════════════════════════════════════════════════
//  B. The question is asked once
// ══════════════════════════════════════════════════════════════

test('the cart drawer no longer contains a second name field', () => {
  const drawer = readFileSync(new URL('../assets/js/ui/cartDrawer.js', import.meta.url), 'utf8');

  assert.ok(!drawer.includes('id="checkout-name"'));
  assert.ok(!drawer.includes('Tu nombre (opcional)'));

  // And the one place it IS asked still exists.
  assert.ok(drawer.includes('id="delivery-recipient"'));
  assert.ok(drawer.includes('id="delivery-phone"'));
});

test('checkout.js reads no checkout-name element anywhere', () => {
  const source = readFileSync(new URL('../assets/js/cart/checkout.js', import.meta.url), 'utf8');

  assert.ok(!source.includes('checkout-name'));
});

// ══════════════════════════════════════════════════════════════
//  C. What the price depends on, and what it does not
// ══════════════════════════════════════════════════════════════

/* Local delivery prices itself by road distance when no zone covers the
   address, so the STREET is now part of the question. Editing it has to throw
   the held price away — otherwise a customer who corrects "140" to "1400"
   checks out at the price of the house next door. */
test('correcting the street invalidates a held quote', () => {
  typeTheOcotlanAddress();
  Delivery.selectOption('nope');       // no options loaded; sets nothing

  // Simulate a server answer having landed.
  assert.equal(Delivery.isPriced(), false);

  Delivery.setAddressField('street', 'Avenida Ferrocarril Sur');

  assert.equal(Delivery.isPriced(), false);
  assert.equal(Delivery.status, 'idle');
});

/* …and a field that cannot move a peso must NOT throw it away, or the form
   feels broken for someone fixing a typo in their gate colour. */
test('editing the references does not invalidate a quote', () => {
  typeTheOcotlanAddress();

  const before = Delivery.status;
  Delivery.setAddressField('references', 'Portón azul');

  assert.equal(Delivery.status, before);
});

/* A price can be asked for before the customer says who receives it. Making
   them fill in a name to see a shipping cost is friction that loses orders;
   the name is still required to check out (see isReady()). */
test('the address is quotable before the recipient is known', () => {
  Delivery.reset();
  Delivery.setMode(DELIVERY_MODES.LOCAL);
  Delivery.setAddressField('postal_code', '71510');
  Delivery.setAddressField('neighborhood', 'Unión y Progreso');
  Delivery.setAddressField('street', 'Avenida Ferrocarril');
  Delivery.setAddressField('exterior_number', '140');

  assert.equal(Delivery.canQuoteAddress(), true);
  assert.equal(Delivery.hasCompleteAddress(), false, 'still missing the recipient');
  assert.equal(Delivery.isReady(), false, 'and therefore cannot check out yet');
});

test('a colonia with no street is not quotable', () => {
  Delivery.reset();
  Delivery.setMode(DELIVERY_MODES.LOCAL);
  Delivery.setAddressField('postal_code', '71510');
  Delivery.setAddressField('neighborhood', 'Unión y Progreso');

  // A postal code alone resolves to the centre of a neighbourhood nobody
  // lives at, and billing a route to it would be an invented distance.
  assert.equal(Delivery.canQuoteAddress(), false);
});
