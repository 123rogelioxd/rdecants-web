import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };

const {
  MIN_QUOTE_QUERY, QUOTE_DEBOUNCE_MS, quoteLines, upsertQuoteItem, changeQuoteQuantity,
  cleanDisplayName, detectCondition, sizeLabel, normalizePresentation,
  groupQuoteResults, sortQuoteGroups, buildWhatsAppMessage, shouldShowSort,
} = await import('../assets/js/pages/quote.js');

const quoteSource = () => readFileSync(new URL('../assets/js/pages/quote.js', import.meta.url), 'utf8');
const quoteHtml = () => readFileSync(new URL('../cotiza.html', import.meta.url), 'utf8');

test('quote search is search-first with a minimum and debounce', () => {
  assert.equal(MIN_QUOTE_QUERY, 2);
  assert.ok(QUOTE_DEBOUNCE_MS >= 250 && QUOTE_DEBOUNCE_MS <= 500);
  const html = quoteHtml();
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
  const source = [quoteHtml(), quoteSource()].join('\n').toLowerCase();
  for (const forbidden of ['r supply os', 'myscent', 'supplier_cost', 'provider_url', 'raw_supplier', 'margin_percent', 'shipping_allocation']) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

/* ── A structured RSupplyOS record, with a folio, before WhatsApp ─────── */

test('the quote panel requires a name and phone before it can be confirmed', () => {
  const html = quoteHtml();
  const source = quoteSource();

  assert.match(html, /id="quote-customer-name"/);
  assert.match(html, /id="quote-customer-phone"/);

  // The click handler must actually require them — this was the real bug:
  // the backend has always required both, but the storefront never sent
  // them, so every submission 422'd and silently fell through to a
  // locally-built, folio-less WhatsApp message.
  assert.match(source, /customer_name/);
  assert.match(source, /customer_phone/);
  assert.match(source, /customerName\.length < 2/);
});

test('the primary CTA is "Confirmar por WhatsApp", never "Solicitar cotización"', () => {
  const html = quoteHtml();
  assert.match(html, /Confirmar por WhatsApp/);
  assert.doesNotMatch(html, /Solicitar cotización/);
  assert.doesNotMatch(quoteSource(), /Solicitar cotización/);
});

test('WhatsApp handoff requires the backend to create a structured request first', () => {
  const source = quoteSource();

  assert.match(source, /window\.open\('', '_blank'\)/, 'reserves the popup during the click gesture');
  assert.match(source, /response\?\.\s*whatsapp_url/, 'uses the folio-bearing message/url the backend already built');
  assert.match(source, /reservedWindow\?\.close\?\.\(\)/, 'a failed submission closes the reserved tab rather than navigating it anywhere');

  // No swallowed-failure path: a rejected/failed submission must not still
  // reach WhatsApp on a locally-built message with no backend record.
  assert.doesNotMatch(source, /Best-effort record only/);
  assert.match(quoteHtml(), /Continuar por WhatsApp/, 'popup-blocked fallback link stays available (once a folio exists)');
});

test('a failed submission never opens WhatsApp on a locally-built message', () => {
  const source = quoteSource();
  const submitBlock = source.slice(source.indexOf("submit.addEventListener('click'"));

  // The only two `window.open` calls in the submit handler are: reserving
  // the tab before the request, and (still inside the try block) navigating
  // it to the backend's own URL. There is no second, catch-block open.
  const catchBlock = submitBlock.slice(submitBlock.indexOf('} catch'));
  assert.doesNotMatch(catchBlock.slice(0, catchBlock.indexOf('} finally')), /window\.open/);
});

test('quote result images use the shared no-broken-image fallback', () => {
  const quote = quoteSource();
  const images = readFileSync(new URL('../assets/js/ui/images.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(quote, /primeImageStates\(results\)/);
  assert.match(quote, /normalizeApiImageUrl\(item\?\.image\)/, 'legacy API storage paths are made API-absolute before rendering');
  assert.match(images, /'quote-result-image'/);
  assert.match(images, /'bottle-card-image'/);
  assert.match(css, /\.quote-result-image img \{[^}]*object-fit: contain/);
  assert.match(css, /\.bottle-card-image img \{[^}]*object-fit: contain/);
});

test('submission sends customer data and delivery, and the handoff waits on its success', () => {
  const source = quoteSource();
  assert.match(source, /ApiClient\.submitQuote\(\{/);
  assert.match(source, /customer_name: customerName/);
  assert.match(source, /customer_phone: customerPhone/);
  assert.match(source, /await ApiClient\.submitQuote/, 'the handoff waits on the backend call rather than firing WhatsApp regardless');
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

test('cleanDisplayName never strips a real fragrance-name word just because it resembles metadata (Elixir regression)', () => {
  // The regression: this house's `concentration` field is literally "Elixir"
  // — the same word is simultaneously a classification AND part of the
  // marketed name, so it must never be stripped just for matching the SKU's
  // own concentration field.
  assert.equal(cleanDisplayName('C RASASI HAWAS ELIXIR EDP 100mL', 'Elixir', '100 ml'), 'Rasasi Hawas Elixir');
  assert.match(cleanDisplayName('C RASASI HAWAS ELIXIR EDP 100mL', 'Elixir', '100 ml'), /Hawas Elixir/);
  assert.match(cleanDisplayName('DIOR SAUVAGE ELIXIR EDP 100ML', 'Elixir', '100 ml'), /Sauvage Elixir/);
  assert.match(cleanDisplayName('LE MALE ELIXIR EDP 100ML', 'Elixir', '100 ml'), /Male Elixir/);
  assert.match(cleanDisplayName('1 MILLION ELIXIR EDP 100ML', 'Elixir', '100 ml'), /Million Elixir/);
  // A representative sample of other marketed-name qualifiers that must
  // never be treated as strippable metadata noise.
  for (const word of ['Intense', 'Absolu', 'Sport', 'Extreme', 'Black', 'Ice', 'Fire', 'Chrome', 'Atlantis', 'Exotic', 'Night', 'Energy', 'Victory', 'Homme', 'Femme']) {
    const raw = `C RASASI HAWAS ${word.toUpperCase()} EDP 100mL`;
    assert.match(cleanDisplayName(raw, 'EDP', '100 ml'), new RegExp(word, 'i'), `"${word}" must survive cleaning`);
  }
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
  assert.equal(cleanDisplayName('YSL Y EDP 100mL', 'EDP', '100 ml'), 'YSL Y');
});

test('sizeLabel normalizes every raw spelling to one customer-facing format', () => {
  assert.equal(sizeLabel('100mL'), '100 ml');
  assert.equal(sizeLabel('100ML'), '100 ml');
  assert.equal(sizeLabel('100 ml'), '100 ml');
  assert.equal(sizeLabel('100ml'), '100 ml');
  assert.equal(sizeLabel(''), '');
});

test('groupQuoteResults merges same fragrance/size SKUs on an exact key, never a fuzzy guess', () => {
  // Condition markers here are the ones cleanDisplayName safely strips
  // (tester / sin caja) — "nuevo"/"sellado" are deliberately NOT used to
  // vary these fixtures, since #6 requires those words to survive cleaning
  // and would otherwise (correctly) split the group.
  const items = [
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, available: true },
    { reference: 'b'.repeat(64), name: 'C RASASI HAWAS BLACK TESTER EDP 100mL', concentration: 'EDP', size: '100 ml', price: 950, available: true },
    { reference: 'c'.repeat(64), name: 'C RASASI HAWAS BLACK TESTER SIN CAJA EDP 100mL', concentration: 'EDP', size: '100 ml', price: 900, available: true },
    { reference: 'd'.repeat(64), name: 'C RASASI HAWAS ICE EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1050, available: true },
  ];
  const groups = groupQuoteResults(items);
  assert.equal(groups.length, 2, 'Hawas Black and Hawas Ice stay two separate cards');
  const black = groups.find(g => g.name === 'Rasasi Hawas Black');
  assert.equal(black.variants.length, 3, 'all three Hawas Black SKUs land in the same card');
  // tester/tester_no_box sort ahead of an unspecified condition, regardless of input order.
  assert.deepEqual(black.variants.map(v => v.condition.key), ['tester', 'tester_no_box', 'unknown']);
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
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, available: true, image: 'img-a.jpg' },
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

test('shouldShowSort hides the sort control unless there is a real choice to make', () => {
  assert.equal(shouldShowSort(0), false);
  assert.equal(shouldShowSort(1), false);
  assert.equal(shouldShowSort(2), true);
  assert.equal(shouldShowSort(5), true);
});

/* ── Single source of truth: normalizePresentation ────────────────────── */

test('normalizePresentation feeds the same clean values to every surface and keeps the raw SKU untouched underneath', () => {
  const record = { reference: 'sku-123', name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 2, available: true, image: 'x.jpg' };
  const p = normalizePresentation(record);

  assert.equal(p.displayName, 'Rasasi Hawas Black');
  assert.equal(p.metaLabel, 'EDP · 100 ml');
  assert.equal(p.sizeLabel, '100 ml');
  assert.equal(p.condition, 'unknown');
  assert.equal(p.conditionLabel, '', 'unknown never surfaces a label');
  assert.equal(p.sku, 'sku-123');
  assert.equal(p.quantity, 2);
  assert.equal(p.lineTotal, 2200);
  // The untouched source record survives underneath for backend operations.
  assert.equal(p.originalRecord, record);
  assert.equal(p.originalRecord.name, 'C RASASI HAWAS BLACK EDP 100mL');
});

test('normalizePresentation only ever exposes a condition label for a confirmed condition', () => {
  const sealed = normalizePresentation({ reference: 'r1', name: 'X NUEVO Y SELLADO EDP 100mL', price: 100 });
  assert.equal(sealed.conditionLabel, 'Nuevo y sellado');
  const tester = normalizePresentation({ reference: 'r2', name: 'X TESTER EDP 100mL', price: 100 });
  assert.equal(tester.conditionLabel, 'Tester');
  const unknown = normalizePresentation({ reference: 'r3', name: 'X EDP 100mL', price: 100 });
  assert.equal(unknown.conditionLabel, '', 'no badge text for an unconfirmed condition');
});

test('the search-result and basket-line renderers only emit a condition badge when the label is non-empty', () => {
  const source = quoteSource();
  assert.match(source, /presentation\.conditionLabel \? `<span class="quote-condition-badge/);
  // Two call sites: the result card's variant row and the basket line.
  const matches = source.match(/presentation\.conditionLabel \? `<span class="quote-condition-badge/g) ?? [];
  assert.equal(matches.length, 2, 'both the result card and the basket line gate the badge on a known condition');
});

/* ── The WhatsApp message: exact customer output ──────────────────────── */

test('buildWhatsAppMessage matches the exact single-product template', () => {
  const record = { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 1, available: true };
  const presentation = normalizePresentation(record);
  assert.equal(presentation.displayName, 'Rasasi Hawas Black');
  assert.equal(presentation.metaLabel, 'EDP · 100 ml');

  const message = buildWhatsAppMessage([presentation], 1100, '');
  assert.equal(message, [
    'Hola, quiero confirmar disponibilidad de esta cotización en RDECANTS:',
    '',
    '• 1 × Rasasi Hawas Black — EDP · 100 ml — $1,100 MXN',
    '',
    'Subtotal: $1,100 MXN',
    'Envío: por confirmar según destino',
  ].join('\n'));
});

test('buildWhatsAppMessage matches the exact multi-product template', () => {
  const items = [
    normalizePresentation({ reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 1 }),
    normalizePresentation({ reference: 'b'.repeat(64), name: 'C RASASI HAWAS ICE EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1050, quantity: 1 }),
  ];
  const message = buildWhatsAppMessage(items, 2150, '');
  assert.equal(message, [
    'Hola, quiero confirmar disponibilidad de esta cotización en RDECANTS:',
    '',
    '• 1 × Rasasi Hawas Black — EDP · 100 ml — $1,100 MXN',
    '• 1 × Rasasi Hawas Ice — EDP · 100 ml — $1,050 MXN',
    '',
    'Subtotal: $2,150 MXN',
    'Envío: por confirmar según destino',
  ].join('\n'));
});

test('buildWhatsAppMessage includes Referencia only when a real, non-empty id exists', () => {
  const item = normalizePresentation({ reference: 'a'.repeat(64), name: 'Le Beau', concentration: 'EDP', size: '100 ml', price: 500, quantity: 1 });

  const withRef = buildWhatsAppMessage([item], 500, 'ABC123');
  assert.match(withRef, /\nReferencia: ABC123$/);

  for (const emptyRef of ['', null, undefined, '   ']) {
    const message = buildWhatsAppMessage([item], 500, emptyRef);
    assert.doesNotMatch(message, /Referencia/, `an empty reference (${JSON.stringify(emptyRef)}) must omit the whole line, never print it blank`);
  }
});

test('buildWhatsAppMessage never includes a customer name, phone number, or emoji greeting', () => {
  const item = normalizePresentation({ reference: 'a'.repeat(64), name: 'Le Beau', concentration: 'EDP', size: '100 ml', price: 500, quantity: 1 });
  const message = buildWhatsAppMessage([item], 500, '');
  assert.doesNotMatch(message, /Soy /, 'never introduces a customer name');
  assert.doesNotMatch(message, /\d{7,}/, 'never embeds a phone number');
  assert.doesNotMatch(message, /^Hola [^\x00-\x7F,]/, 'greeting carries no emoji before the comma');
  assert.match(message, /^Hola, quiero confirmar/);
});

test('buildWhatsAppMessage never uses a raw supplier name — only the same cleaned displayName the UI shows', () => {
  const record = { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 1 };
  const message = buildWhatsAppMessage([normalizePresentation(record)], 1100, '');
  assert.doesNotMatch(message, /\bC RASASI\b/i, 'no leading supplier prefix');
  assert.doesNotMatch(message, /RASASI HAWAS BLACK EDP/, 'no raw supplier product title');
  assert.match(message, /Rasasi Hawas Black/);
});

test('buildWhatsAppMessage never duplicates concentration or size', () => {
  const record = { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 1 };
  const message = buildWhatsAppMessage([normalizePresentation(record)], 1100, '');
  assert.equal((message.match(/EDP/g) ?? []).length, 1, 'EDP appears exactly once');
  assert.equal((message.match(/100 ?ml/gi) ?? []).length, 1, 'the size appears exactly once');
});

test('generated WhatsApp messages are UTF-8 safe and never contain a Unicode replacement character', () => {
  const cases = [
    { reference: 'a'.repeat(64), name: 'C RASASI HAWAS BLACK EDP 100mL', concentration: 'EDP', size: '100 ml', price: 1100, quantity: 1 },
    { reference: 'b'.repeat(64), name: 'C RASASI HAWAS ELIXIR EDP 100mL', concentration: 'Elixir', size: '100 ml', price: 1200, quantity: 3 },
    { reference: 'c'.repeat(64), name: 'D&G THE ONE EDT 100ML', concentration: 'EDT', size: '100 ml', price: 2000, quantity: 1 },
  ];
  const items = cases.map(normalizePresentation);
  const message = buildWhatsAppMessage(items, 4300, 'REF-9');

  assert.doesNotMatch(message, /�/, 'no U+FFFD replacement character anywhere in the message');
  const encoded = encodeURIComponent(message);
  assert.doesNotMatch(decodeURIComponent(encoded), /�/, 'round-trips through URL-encoding cleanly');
  // Never double-encoded: a raw "%" from encodeURIComponent's own output
  // must not itself get percent-escaped again.
  assert.doesNotMatch(encoded, /%25[0-9A-F]{2}/);
});

test('the WhatsApp handoff never reintroduces the previous encoding bug or a filled-in customer name', () => {
  const source = quoteSource();
  assert.doesNotMatch(source, /�/);
  assert.doesNotMatch(source, /Soy \$\{/);
});
