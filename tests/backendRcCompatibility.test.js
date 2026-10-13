import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderCardHtml, orderDetailHtml } from '../assets/js/pages/account.js';
import { registeredFactsHtml } from '../assets/js/ui/checkoutFlow.js';

const contract = JSON.parse(readFileSync(new URL('./fixtures/backend-rc-checkout-contract.json', import.meta.url), 'utf8'));

test('real Laravel RC checkout/account responses keep canonical prices and pending payment', () => {
  assert.equal(contract.backend_head, 'f4ada811e50e32dee16185fdda1205d196811ff9');
  for (const { created, summary, detail } of Object.values(contract.cases)) {
    assert.equal(created.order.total, 150); // Client sent unit_price=1; Pricing selected 150.
    assert.equal(detail.items[0].unit_price, 150);
    for (const html of [orderCardHtml(summary), orderDetailHtml(detail), registeredFactsHtml(created.order)]) {
      assert.doesNotMatch(html, /Tu pago está confirmado|Entrega confirmada:|Salida a reparto confirmada:/);
    }
    assert.match(orderDetailHtml(detail), /Pago por confirmar/);
    assert.match(orderDetailHtml(detail), /Perfume QA ficticio|PERFUME QA FICTICIO/);
    for (const privateField of ['token_hash', 'idempotency_key', 'operational_notes', 'shipping_quote', 'cliente_id']) {
      assert.equal(Object.hasOwn(summary, privateField), false);
    }
  }
});

test('unpriced real RC delivery keeps total unknown instead of displaying free delivery', () => {
  const { created, summary, detail } = contract.cases.local_unknown;
  assert.equal(summary.total, null);
  assert.equal(summary.delivery.shipping_cost, null);
  assert.match(orderCardHtml(summary), /Total por confirmar/);
  assert.match(orderDetailHtml(detail), /Costo de entrega por confirmar/);
  assert.match(registeredFactsHtml(created.order), /El costo de entrega se confirma por WhatsApp/);
});

test('a priced QA pickup does not turn an order into a verified payment', () => {
  const { summary, detail } = contract.cases.pickup;
  assert.equal(summary.delivery.shipping_cost, 0);
  assert.equal(summary.total, 150);
  assert.match(orderCardHtml(summary), /150/);
  assert.match(orderDetailHtml(detail), /Recoger/);
  assert.match(orderDetailHtml(detail), /Pago por confirmar/);
});
