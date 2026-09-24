/* «Cotiza tu perfume» joins «Mis pedidos» (2026-09-24).
 *
 * The backend (r-supply-os #152) links a quote to the customer, answers it with
 * the session cookie and returns quote rows in the same shape as web orders,
 * tagged `kind: 'cotizacion'`. The storefront's job is small and must stay
 * small: accept the cookie, tell the customer where to follow the quote, and
 * render one history without inventing a second status vocabulary.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };

const { quoteAccountUrl } = await import('../assets/js/pages/quote.js');
const { orderCardHtml, orderDetailHtml, whatsappText } = await import('../assets/js/pages/account.js');
const { isQuote, paymentTone, statusTone } = await import('../assets/js/account/account.js');

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const quoteRow = {
  kind: 'cotizacion',
  folio: 'RD-00003',
  created_at: '2026-09-24T02:00:00+00:00',
  status: {
    progress: 'confirmado',
    progress_label: 'Pedido al proveedor',
    progress_detail: 'Ya pedimos tu perfume. Te avisamos cuando venga en camino.',
    is_open: true,
    payment: 'apartado',
    payment_label: 'Apartado: $1,000 de $2,980',
  },
  item_count: 2,
  preview: [{ name: 'VERSACE DYLAN BLUE EDT', brand: null, image: null }],
  summary_line: '2 perfumes por encargo',
  delivery: { mode: 'local', shipping_cost: 45, requires_manual_quote: false, preference_label: null },
  merchandise_total: 2980,
  total: 3025,
};

test('the quote asks the API to set the customer session', () => {
  const client = read('assets/js/api/client.js');

  assert.match(client, /submitQuote:\s+\(payload\) => _post\('\/api\/web\/quote', payload, \{ credentials: 'include' \}\)/);
  /* Searching and pricing stay anonymous: they must answer the same for anyone. */
  assert.match(client, /searchQuoteCatalog:[^\n]*_get\(/);
  assert.match(client, /priceQuoteBasket:\s+\(items\) => _post\('\/api\/web\/quote\/price', \{ items \}\)/);
});

test('the follow-up link stays on this site', () => {
  assert.equal(quoteAccountUrl({ account_url: '/cuenta.html?folio=RD-00003' }), '/cuenta.html?folio=RD-00003');
  /* An absolute or protocol-relative URL from a response is never followed. */
  assert.equal(quoteAccountUrl({ account_url: 'https://evil.example/x' }, 'RD-00003'), '/cuenta.html?folio=RD-00003');
  assert.equal(quoteAccountUrl({ account_url: '//evil.example/x' }, 'RD-00003'), '/cuenta.html?folio=RD-00003');
  /* An older API that does not name it still gets the folio deep link. */
  assert.equal(quoteAccountUrl({ reference: 'RD-00004' }), '/cuenta.html?folio=RD-00004');
  assert.equal(quoteAccountUrl({}), '/cuenta.html');
});

test('the success panel lives outside the block that hides with an empty basket', () => {
  const html = read('cotiza.html');
  const cta = html.indexOf('id="quote-cta-block"');
  const success = html.indexOf('id="quote-success"');

  assert.ok(success > 0, 'the success panel exists');
  assert.ok(success < cta, 'it is not inside the CTA block, which hides when the basket clears');
  assert.match(html, /data-quote-success-whatsapp/);
  assert.match(html, /data-quote-success-account/);
});

test('a quote row reads as part of the same history, tagged, never re-labelled', () => {
  assert.equal(isQuote(quoteRow), true);
  assert.equal(isQuote({ folio: 'WEB-1' }), false, 'a row without kind is an order');

  const card = orderCardHtml(quoteRow);
  assert.match(card, /RD-00003/);
  assert.match(card, /Por encargo/);
  assert.match(card, /Pedido al proveedor/, 'the label is the API\'s, verbatim');
  assert.match(card, /href="\/cuenta\.html\?folio=RD-00003"/);
});

test('a partial payment is a positive fact short of paid, and only «pagado» is done', () => {
  assert.equal(paymentTone({ payment: 'apartado' }), 'progress');
  assert.equal(paymentTone({ payment: 'pagado' }), 'done');
  assert.equal(paymentTone({ payment: 'por_confirmar' }), 'pending');
  assert.equal(statusTone({ progress: 'confirmado' }), 'progress');
});

test('the quote detail shows each perfume with its own state', () => {
  const html = orderDetailHtml({
    ...quoteRow,
    items: [
      { name: 'VERSACE DYLAN BLUE EDT', brand: null, image: null, ml: 100, quantity: 1, unit_price: 1490, line_total: 1490, item_status: 'En camino a RDECANTS' },
      { name: 'RASASI HAWAS ICE', brand: null, image: null, ml: 100, quantity: 1, unit_price: 1490, line_total: 1490, item_status: 'Pedido al proveedor' },
    ],
    subtotal: 2980,
    discount: 0,
  });

  assert.match(html, /100 ml · Cantidad 1 · En camino a RDECANTS/);
  assert.match(html, /Apartado: \$1,000 de \$2,980/);
});

test('WhatsApp from «Mis pedidos» names a quote as a quote, in plain ASCII', () => {
  assert.equal(whatsappText(quoteRow), 'Hola, quiero confirmar mi cotizacion RD-00003.');
  assert.equal(whatsappText({ folio: 'WEB-20260924-0001' }), 'Hola, quiero confirmar mi pedido WEB-20260924-0001.');
  assert.match(whatsappText(quoteRow), /^[\x20-\x7E]+$/);
});

test('the storefront still never touches the session token', () => {
  for (const path of ['assets/js/pages/quote.js', 'assets/js/api/client.js']) {
    const source = read(path);
    assert.doesNotMatch(source, /rd_customer/);
    assert.doesNotMatch(source, /document\.cookie/);
  }
});
