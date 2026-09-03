/* =============================================================
   Delivery state — mode, destination and the price R Supply OS put on it.

   The invariant these tests defend: the storefront never computes or invents a
   shipping price, and an unpriced delivery is never rendered as zero.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/' },
};

const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};

const { ApiClient } = await import('../assets/js/api/client.js');
const { Delivery, DELIVERY_MODES } = await import('../assets/js/cart/delivery.js');

function stubQuote(response) {
  ApiClient.quoteDelivery = async () => response;
}

/* A priced national answer with two carriers, cheapest first (the server
   sorts). */
function pricedResponse() {
  return {
    ok: true,
    status: 200,
    data: {
      ok: true,
      delivery: {
        mode: 'national',
        requires_manual_quote: false,
        reason: null,
        options: [
          { token: 'tok-cheap', mode: 'national', label: 'Estafeta', amount: 139, carrier: 'Estafeta' },
          { token: 'tok-fast', mode: 'national', label: 'FedEx', amount: 219, carrier: 'FedEx' },
        ],
      },
      pricing: { subtotal: 340, discount: 0, merchandise_total: 340 },
    },
  };
}

function manualResponse(reason = 'Confirmamos el costo de envio por WhatsApp antes de cobrar.') {
  return {
    ok: true,
    status: 200,
    data: {
      ok: true,
      delivery: { mode: 'national', requires_manual_quote: true, reason, options: [] },
      pricing: { subtotal: 340, discount: 0, merchandise_total: 340 },
    },
  };
}

const cart = { items: [{ product_id: 1, variant_id: 2, quantity: 1 }] };

function fullAddress() {
  return {
    recipient: 'Roger Diaz',
    phone: '9511111111',
    street: 'Calle Independencia',
    exterior_number: '101',
    neighborhood: 'Centro',
    city: 'Oaxaca de Juarez',
    state: 'Oaxaca',
    postal_code: '68000',
  };
}

function applyAddress(address = fullAddress()) {
  Object.entries(address).forEach(([field, value]) => Delivery.setAddressField(field, value));
}

test.beforeEach(() => {
  _store.clear();
  Delivery.reset();
});

// ── Pricing authority ───────────────────────────────────────────────────────

test('a quoted option carries the amount the server sent', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();

  const result = await Delivery.quote(cart);

  assert.equal(result.ok, true);
  assert.equal(result.manual, false);
  assert.equal(Delivery.isPriced(), true);
  /* Cheapest preselected. */
  assert.equal(Delivery.cost, 139);
  assert.equal(Delivery.selectedToken, 'tok-cheap');
});

test('the customer can choose a more expensive, faster service', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  assert.equal(Delivery.selectOption('tok-fast'), true);
  assert.equal(Delivery.cost, 219);
});

test('an unknown token is refused rather than silently accepted', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  assert.equal(Delivery.selectOption('tok-invented'), false);
  assert.equal(Delivery.cost, 139, 'the previous valid selection stands');
});

/* The central regression: no credentials, no measured box, carrier down — all
   arrive here as "manual", and none of them may become a price. */
test('a manual quote leaves the cost null, never zero', async () => {
  stubQuote(manualResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();

  const result = await Delivery.quote(cart);

  assert.equal(result.manual, true);
  assert.equal(Delivery.isPriced(), false);
  assert.equal(Delivery.cost, null);
  assert.notEqual(Delivery.cost, 0);
  assert.equal(Delivery.requiresManualQuote(), true);
});

test('a manual quote is still a checkout-ready state', async () => {
  stubQuote(manualResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  /* Blocking here would lose the order over a number nobody can produce. */
  assert.equal(Delivery.isReady(), true);
});

// ── Invalidation ────────────────────────────────────────────────────────────

test('changing the postal code throws away the price', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);
  assert.equal(Delivery.isPriced(), true);

  Delivery.setAddressField('postal_code', '06700');

  assert.equal(Delivery.isPriced(), false);
  assert.equal(Delivery.selectedToken, null);
  assert.equal(Delivery.isReady(), false, 'a new destination needs a new quote');
});

test('editing a non-pricing field keeps a valid quote', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  Delivery.setAddressField('references', 'Porton azul');

  assert.equal(Delivery.isPriced(), true, 'a typo fix must not discard the carrier rate');
  assert.equal(Delivery.cost, 139);
});

test('switching mode throws away the price', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  Delivery.setMode(DELIVERY_MODES.LOCAL);

  assert.equal(Delivery.isPriced(), false);
  assert.equal(Delivery.cost, null);
});

test('switching zone throws away the price', async () => {
  stubQuote({
    ok: true,
    status: 200,
    data: {
      ok: true,
      delivery: {
        mode: 'local',
        requires_manual_quote: false,
        options: [{ token: 'tok-local', mode: 'local', label: 'San Dionisio', amount: 30 }],
      },
    },
  });

  Delivery.setMode(DELIVERY_MODES.LOCAL);
  Delivery.setZone('san_dionisio');
  await Delivery.quote(cart);
  assert.equal(Delivery.cost, 30);

  Delivery.setZone('valle');

  assert.equal(Delivery.isPriced(), false);
});

// ── Readiness ───────────────────────────────────────────────────────────────

test('pickup is ready with nothing else', () => {
  Delivery.setMode(DELIVERY_MODES.PICKUP);
  assert.equal(Delivery.isReady(), true);
});

test('national is not ready without a complete address', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  Delivery.setAddressField('postal_code', '68000');

  await Delivery.quote(cart);

  assert.equal(Delivery.isReady(), false);
  assert.deepEqual(
    Delivery.missingAddressFields().sort(),
    ['city', 'exterior_number', 'neighborhood', 'phone', 'recipient', 'state', 'street'],
  );
});

test('national is not ready before a quote has been answered', () => {
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();

  assert.equal(Delivery.isReady(), false, 'an unanswered quote is not a delivery');
});

test('local is not ready without a zone', () => {
  Delivery.setMode(DELIVERY_MODES.LOCAL);
  assert.equal(Delivery.isReady(), false);
});

test('no mode chosen is never ready', () => {
  assert.equal(Delivery.isReady(), false);
});

// ── Order payload ───────────────────────────────────────────────────────────

test('the order block carries identity and the token, never an amount', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  const payload = Delivery.forOrder();

  assert.equal(payload.mode, 'national');
  assert.equal(payload.option_token, 'tok-cheap');
  assert.equal(payload.address.postal_code, '68000');

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /139/, 'a storefront that could state a price could state any price');
  assert.equal('amount' in payload, false);
  assert.equal('shipping_cost' in payload, false);
});

test('a manual national order sends no token at all', async () => {
  stubQuote(manualResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  const payload = Delivery.forOrder();

  /* Absent token + mode is exactly how the server recognises "could not be
     priced" and records an open question rather than a free shipment. */
  assert.equal(payload.option_token, undefined);
  assert.equal(payload.mode, 'national');
});

test('a local order sends the zone key, not the label', async () => {
  Delivery.setMode(DELIVERY_MODES.LOCAL);
  Delivery.setZone('san_dionisio');

  assert.equal(Delivery.forOrder().zone_key, 'san_dionisio');
  assert.equal('address' in Delivery.forOrder(), false);
});

test('no mode produces no delivery block', () => {
  assert.equal(Delivery.forOrder(), null);
});

// ── Failure ─────────────────────────────────────────────────────────────────

test('a rejected quote surfaces the message and stays unpriced', async () => {
  stubQuote({ ok: false, status: 422, data: { message: 'Escribe un codigo postal de 5 digitos.' } });
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();

  const result = await Delivery.quote(cart);

  assert.equal(result.ok, false);
  assert.match(result.message, /codigo postal/);
  assert.equal(Delivery.isPriced(), false);
  assert.equal(Delivery.isReady(), false);
});

// ── Persistence ─────────────────────────────────────────────────────────────

test('the address is remembered but the price is not', async () => {
  stubQuote(pricedResponse());
  Delivery.setMode(DELIVERY_MODES.NATIONAL);
  applyAddress();
  await Delivery.quote(cart);

  const saved = JSON.parse(_store.get('rdecants_delivery_choice'));

  assert.equal(saved.address.postal_code, '68000');
  assert.equal(saved.mode, 'national');
  /* A restored price would be a rate the carrier is no longer offering. */
  assert.equal('cost' in saved, false);
  assert.equal('selectedToken' in saved, false);
  assert.equal('options' in saved, false);
});
