import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = { __RDECANTS_API_BASE__: '', location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = globalThis.document ?? { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, body: { classList: { add() {}, remove() {} } } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-test' } });

const { registeredFactsHtml, commerceFactsHtml, holdLabel, registeredOrderTotals } = await import('../assets/js/ui/checkoutFlow.js');
const { paymentRowsHtml, paymentLabel } = await import('../assets/js/pages/account.js');

/* ══════════════════════════════════════════════════════════════════════
   rdecants.com inside R Supply OS's commerce engine (COMMERCE_WEB_INTAKE).

   The registered screen and the account read what the SERVER says about the
   order's money — total due by component, paid, balance, the hold's end, the
   payment link. Nothing is computed here, and «pagado» appears only when the
   server's confirmed money says so.
   ══════════════════════════════════════════════════════════════════════ */

const commerce = {
  folio: 'WEB-20261004-0003',
  payment_terms: 'prepaid',
  merchandise_amount: 300,
  shipping_amount: 189.5,
  shipping_quote_pending: false,
  total_due: 489.5,
  paid_amount: 0,
  balance_due: 489.5,
  status: 'awaiting_payment',
  reservation_expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
  payment_link: null,
  next_action: 'pay_or_confirm_by_whatsapp',
};

test('without the commerce block the screen says exactly what it always said', () => {
  const html = registeredFactsHtml({ delivery: { shipping_cost: 189.5 } });

  assert.match(html, /Tu inventario quedó apartado/);
  assert.match(html, /Confirmaremos los detalles de entrega y pago por WhatsApp/);
});

test('the server\'s figures: held until when, and what is owed by component', () => {
  const html = registeredFactsHtml({ commerce, delivery: {} });

  assert.match(html, /Tu pedido quedó apartado hasta (mañana|hoy|el)/);
  assert.match(html, /Total a pagar: \$489\.50 MXN \(productos \$300\.00 MXN \+ envío \$189\.50 MXN\)/);
  assert.doesNotMatch(html, /pagado|confirmado/i, 'Registering an order never charges anything.');
  assert.match(html, /Confirma por WhatsApp para recibir los datos de pago/);
});

test('a verified payment link is a dedicated primary action, not buried inside the facts list', () => {
  const linked = commerceFactsHtml({}, { ...commerce, payment_link: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1' });
  assert.match(linked, /Puedes pagar ahora con Mercado Pago/);
  assert.doesNotMatch(linked, /checkout-pay-link/);

  const markup = readFileSync(new URL('../assets/js/ui/checkoutMarkup.js', import.meta.url), 'utf8');
  const flow = readFileSync(new URL('../assets/js/ui/checkoutFlow.js', import.meta.url), 'utf8');

  assert.match(markup, /id="checkout-pay-now"[^>]*hidden>Pagar con Mercado Pago/);
  assert.ok(markup.indexOf('checkout-pay-now') < markup.indexOf('checkout-registered-whatsapp'));
  assert.match(flow, /\^https:\\\/\\\//, 'only https payment links become actionable');
  assert.match(flow, /mercado_pago_checkout_clicked/);
  assert.match(flow, /Prefiero transferencia \/ necesito ayuda/);
});

test('paid money is reported only as the server confirms it', () => {
  assert.match(commerceFactsHtml({}, { ...commerce, paid_amount: 200, balance_due: 289.5 }), /Recibimos \$200\.00 MXN; faltan \$289\.50 MXN/);
  assert.match(commerceFactsHtml({}, { ...commerce, paid_amount: 489.5, balance_due: 0 }), /Tu pago está confirmado/);
});

test('an unpriced delivery is never presented as payable in full', () => {
  const html = commerceFactsHtml({}, { ...commerce, shipping_quote_pending: true, shipping_amount: 0, total_due: 300, balance_due: 300 });

  assert.match(html, /El costo de entrega se confirma por WhatsApp/);
  assert.doesNotMatch(html, /Total a pagar/);
});

test('the hold reads as a day the customer understands', () => {
  const now = new Date('2026-10-04T15:00:00');
  assert.match(holdLabel('2026-10-04T18:30:00', now), /^hoy a las/);
  assert.match(holdLabel('2026-10-05T09:10:00', now), /^mañana a las/);
  assert.match(holdLabel('2026-10-07T09:10:00', now), /^el 07\/10 a las/);
  assert.equal(holdLabel('not a date', now), '');
});

test('the registered total is the server\'s total due when the engine says it', () => {
  const totals = registeredOrderTotals({ subtotal: 300, discount: 0, total: 300, grand_total: 489.5, delivery: { shipping_cost: 189.5 }, commerce }, { subtotal: 300, discount: 0 });
  assert.equal(totals.total, 489.5);
});

test('the account shows paid and owed from confirmed money only', () => {
  assert.equal(paymentRowsHtml(null), '');
  assert.equal(paymentLabel(null), null);
  assert.equal(paymentLabel(commerce), 'Pendiente de pago');
  assert.equal(paymentLabel({ ...commerce, paid_amount: 100, balance_due: 389.5 }), 'Pago parcial');
  assert.equal(paymentLabel({ ...commerce, paid_amount: 489.5, balance_due: 0 }), 'Pagado');
  assert.match(paymentRowsHtml({ ...commerce, paid_amount: 100, balance_due: 389.5 }), /Pagado[\s\S]*Por pagar/);
});
