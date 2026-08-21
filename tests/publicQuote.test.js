import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };

const { MIN_QUOTE_QUERY, QUOTE_DEBOUNCE_MS, quoteLines, upsertQuoteItem, changeQuoteQuantity } = await import('../assets/js/pages/quote.js');

test('quote search is search-first with a minimum and debounce', () => {
  assert.equal(MIN_QUOTE_QUERY, 2);
  assert.ok(QUOTE_DEBOUNCE_MS >= 250 && QUOTE_DEBOUNCE_MS <= 500);
  const html = readFileSync(new URL('../cotiza.html', import.meta.url), 'utf8');
  assert.match(html, /Buscar perfume/);
  assert.match(html, /al menos 2 letras/);
  assert.match(html, /noindex,follow/);
});

test('quote basket supports several perfumes and collapses duplicate additions', () => {
  let basket = upsertQuoteItem([], { reference: 'a'.repeat(64), name: 'Le Beau' });
  basket = upsertQuoteItem(basket, { reference: 'b'.repeat(64), name: 'Hawas Ice' });
  basket = upsertQuoteItem(basket, { reference: 'a'.repeat(64), name: 'Le Beau' });
  assert.equal(basket.length, 2);
  assert.equal(basket[0].quantity, 2);
  assert.deepEqual(quoteLines(basket), [
    { reference: 'a'.repeat(64), quantity: 2 },
    { reference: 'b'.repeat(64), quantity: 1 },
  ]);
});

test('quantity edits and removal produce server-repricing inputs only', () => {
  const seed = [{ reference: 'a'.repeat(64), name: 'Le Beau', price: 2390, quantity: 1 }];
  const changed = changeQuoteQuantity(seed, 'a'.repeat(64), 3);
  assert.deepEqual(quoteLines(changed), [{ reference: 'a'.repeat(64), quantity: 3 }]);
  assert.equal('price' in quoteLines(changed)[0], false, 'trusted price never crosses from JavaScript');
  assert.deepEqual(changeQuoteQuantity(changed, 'a'.repeat(64), 0), []);
});

test('public quote UI never renders supplier internals', () => {
  const source = [
    readFileSync(new URL('../cotiza.html', import.meta.url), 'utf8'),
    readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8'),
  ].join('\n').toLowerCase();
  for (const forbidden of ['r supply os', 'myscent', 'supplier_cost', 'provider_url', 'raw_supplier', 'margin_percent', 'shipping_allocation']) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test('successful quotes hand off through the backend WhatsApp URL with a blocked-popup fallback', () => {
  const source = readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8');

  assert.match(source, /window\.open\('', '_blank'\)/, 'reserves the popup during the submit gesture');
  assert.match(source, /response\.whatsapp_url/, 'uses the server-provided WhatsApp URL');
  assert.doesNotMatch(source, /buildWhatsAppMessage/, 'does not construct a quote message in the storefront');
  assert.match(source, /Solicitud recibida/);
  assert.match(source, /Roger recibió tu solicitud y confirmará disponibilidad contigo por WhatsApp\./);
  assert.match(source, /Referencia \$\{_escape\(response\.reference\)\}/);
  assert.match(source, /Continuar por WhatsApp/);
});

test('quote result images use the shared no-broken-image fallback', () => {
  const quote = readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8');
  const images = readFileSync(new URL('../assets/js/ui/images.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(quote, /primeImageStates\(results\)/);
  assert.match(images, /'quote-result-image'/);
  assert.match(images, /'bottle-card-image'/);
  assert.match(css, /\.quote-result-image img \{[^}]*object-fit: contain/);
  assert.match(css, /\.bottle-card-image img \{[^}]*object-fit: contain/);
});

test('submission posts references, customer data and expected total for revalidation', () => {
  const source = readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8');
  assert.match(source, /ApiClient\.submitQuote/);
  assert.match(source, /expected_total: pricedBasket\.total/);
  assert.match(source, /error\.status === 409/);
  assert.match(source, /El precio cambió/);
  assert.match(source, /Ya no disponible/);
});
