import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };

const {
  MIN_QUOTE_QUERY, QUOTE_DEBOUNCE_MS, quoteLines, upsertQuoteItem, changeQuoteQuantity,
  cleanDisplayName, detectCondition, groupQuoteResults, sortQuoteGroups,
} = await import('../assets/js/pages/quote.js');

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
  const html = readFileSync(new URL('../cotiza.html', import.meta.url), 'utf8');
  const combined = `${source}\n${html}`;

  assert.match(source, /window\.open\('', '_blank'\)/, 'reserves the popup during the submit gesture');
  assert.match(source, /response\.whatsapp_url/, 'uses the server-provided WhatsApp URL');
  assert.doesNotMatch(source, /buildWhatsAppMessage/, 'does not construct a quote message in the storefront');
  assert.match(source, /Solicitud recibida/);
  assert.match(source, /Roger recibió tu solicitud y confirmará disponibilidad contigo por WhatsApp\./);
  assert.doesNotMatch(source, /Referencia \$\{_escape\(response\.reference\)\}/, 'public success copy never exposes a quote folio');
  assert.match(combined, /Continuar por WhatsApp/);
  assert.match(source, /form\.reset\(\)/);
  assert.match(source, /basket = \[\]/);
  assert.doesNotMatch(source, /form\.innerHTML/);
  assert.doesNotMatch(source, /basketEl\.hidden = true/);
});

test('quote result images use the shared no-broken-image fallback', () => {
  const quote = readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8');
  const images = readFileSync(new URL('../assets/js/ui/images.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(quote, /primeImageStates\(results\)/);
  assert.match(quote, /normalizeApiImageUrl\(item\?\.image\)/, 'legacy API storage paths are made API-absolute before rendering');
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

/* ── Grouped result cards: cleaning, condition detection, grouping ──── */

test('cleanDisplayName strips supplier codes and duplicate metadata, title-cases the rest', () => {
  assert.equal(cleanDisplayName('C RASASI HAWAS BLACK EDP 100mL', 'EDP', '100 ml'), 'Rasasi Hawas Black');
  assert.equal(cleanDisplayName('C RASASI HAWAS BLACK TESTER EDP 100mL', 'EDP', '100 ml'), 'Rasasi Hawas Black');
  assert.equal(cleanDisplayName('C RASASI HAWAS BLACK TESTER SIN CAJA EDP 100mL', 'EDP', '100 ml'), 'Rasasi Hawas Black');
  // A real single-letter name and a real brand acronym both survive title-casing.
  assert.equal(cleanDisplayName('YSL Y EDP 100mL', 'EDP', '100 ml'), 'YSL Y');
  // An ordinary short word must NOT be mistaken for an acronym and stay shouting.
  assert.equal(cleanDisplayName('C RASASI HAWAS ICE EDP 100mL', 'EDP', '100 ml'), 'Rasasi Hawas Ice');
  // Never returns an empty name even if every token happens to strip away.
  assert.ok(cleanDisplayName('TESTER EDP', 'EDP', '') .length > 0);
});

test('detectCondition never defaults an unspecified SKU to "Nuevo y sellado"', () => {
  const unspecified = detectCondition('C RASASI HAWAS BLACK EDP 100mL');
  assert.equal(unspecified.key, 'unknown');
  assert.equal(unspecified.label, 'Condición por confirmar');
  assert.notEqual(unspecified.label, 'Nuevo y sellado', 'an unverified SKU must never read as sealed');

  const empty = detectCondition('');
  assert.equal(empty.key, 'unknown');
  assert.notEqual(empty.label, 'Nuevo y sellado');
});

test('detectCondition recognizes an explicit new/sealed claim', () => {
  assert.equal(detectCondition('C RASASI HAWAS BLACK NUEVO Y SELLADO EDP 100mL').key, 'sealed');
  assert.equal(detectCondition('C RASASI HAWAS BLACK NUEVO Y SELLADO EDP 100mL').label, 'Nuevo y sellado');
  assert.equal(detectCondition('DIOR SAUVAGE NEW SEALED EDT 100mL').key, 'sealed');
  assert.equal(detectCondition('LE BEAU SELLADO EDP 100mL').key, 'sealed');
});

test('detectCondition recognizes tester', () => {
  const condition = detectCondition('C RASASI HAWAS BLACK TESTER EDP 100mL');
  assert.equal(condition.key, 'tester');
  assert.equal(condition.label, 'Tester');
});

test('detectCondition recognizes tester without box', () => {
  const condition = detectCondition('C RASASI HAWAS BLACK TESTER SIN CAJA EDP 100mL');
  assert.equal(condition.key, 'tester_no_box');
  assert.equal(condition.label, 'Tester sin caja');
  assert.equal(detectCondition('LE BEAU TESTER NO BOX EDP 100mL').key, 'tester_no_box');
});

test('cleanDisplayName preserves unusual uppercase fragrance names and legitimate acronyms', () => {
  // No known prefix ("K" is not a listed supplier code) — a real short name survives whole.
  assert.equal(cleanDisplayName('K DOLCE GABBANA EDT 100ML', 'EDT', '100 ml'), 'K Dolce Gabbana');
  assert.equal(cleanDisplayName('ARMANI CODE PROFUMO EDP 100ML', 'EDP', '100 ml'), 'Armani Code Profumo');
  // Real brand acronyms stay uppercase; ordinary words around them still title-case.
  assert.equal(cleanDisplayName('D&G THE ONE EDT 100ML', 'EDT', '100 ml'), 'D&G The One');
  assert.equal(cleanDisplayName('CK ONE EDT 100ML', 'EDT', '100 ml'), 'CK One');
});

test('groupQuoteResults merges same fragrance/size SKUs on an exact key, never a fuzzy guess', () => {
  const items = [
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK NUEVO Y SELLADO EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, available: true },
    { reference: 'b'.repeat(64), name: 'C RASASI HAWAS BLACK TESTER EDP 100mL', concentration: 'EDP', size: '100 ml', price: 950, available: true },
    { reference: 'c'.repeat(64), name: 'C RASASI HAWAS ICE NUEVO Y SELLADO EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1050, available: true },
  ];
  const groups = groupQuoteResults(items);
  assert.equal(groups.length, 2, 'Hawas Black and Hawas Ice stay two separate cards');
  const black = groups.find(g => g.name === 'Rasasi Hawas Black');
  assert.equal(black.variants.length, 2, 'both Hawas Black SKUs land in the same card');
  // Sealed sorts ahead of tester within a card, regardless of input order.
  assert.deepEqual(black.variants.map(v => v.condition.key), ['sealed', 'tester']);
});

test('groupQuoteResults ranks an unspecified condition after every confirmed one', () => {
  const items = [
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK TESTER EDP 100mL', concentration: 'EDP', size: '100 ml', price: 950, available: true },
    { reference: 'b'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, available: true },
  ];
  const [group] = groupQuoteResults(items);
  assert.deepEqual(group.variants.map(v => v.condition.key), ['tester', 'unknown']);
});

test('groupQuoteResults is presentation-only: every original SKU and its full source data survives underneath the card', () => {
  const items = [
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK NUEVO Y SELLADO EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, available: true, image: 'img-a.jpg' },
    { reference: 'b'.repeat(64), name: 'C RASASI HAWAS BLACK TESTER EDP 100mL', concentration: 'EDP', size: '100 ml', price: 950, available: true, image: '' },
  ];
  const groups = groupQuoteResults(items);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.variants.length, items.length, 'no SKU is merged away or discarded');
  for (const item of items) {
    const variant = group.variants.find(v => v.reference === item.reference);
    assert.ok(variant, `SKU ${item.reference} must still be present under the group`);
    for (const [field, value] of Object.entries(item)) {
      assert.deepEqual(variant[field], value, `variant.${field} must match the original source record`);
    }
  }
});

test('sortQuoteGroups orders by each card\'s lowest price without mutating the input array', () => {
  const groups = [
    { name: 'A', variants: [{ price: 2000 }] },
    { name: 'B', variants: [{ price: 500 }, { price: 300 }] },
    { name: 'C', variants: [{ price: 1000 }] },
  ];
  const original = [...groups];
  assert.deepEqual(sortQuoteGroups(groups, 'price_asc').map(g => g.name), ['B', 'C', 'A']);
  assert.deepEqual(sortQuoteGroups(groups, 'price_desc').map(g => g.name), ['A', 'C', 'B']);
  assert.deepEqual(sortQuoteGroups(groups, 'relevance'), groups, 'relevance keeps the backend-given order');
  assert.deepEqual(groups, original, 'sorting never mutates the caller\'s array');
});
