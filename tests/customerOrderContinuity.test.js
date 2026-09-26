/* Regressions for the customer-continuity release.
 *
 * Three properties run through everything here, and each one is a bug that
 * would be expensive and quiet if it came back:
 *
 *   1. NOTHING IS INVENTED. Chips and vibe copy render only what R Supply OS
 *      sent. A perfume with no metadata gets silence, not filler.
 *   2. NOTHING IS PROMISED. A requested delivery window is a preference, an
 *      unpriced delivery has no total, and a registered order is not a paid one.
 *   3. NOTHING IS GUESSED. Identity comes from a cookie the page cannot read;
 *      no folio, phone number or id in this code can ask about anyone else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getContextChips, getVibeCopy } from '../assets/js/ui/scentNotes.js';
import { buildProductModalGuidanceHtml } from '../assets/js/ui/modal.js';
import { buildWhatsAppMessage } from '../assets/js/cart/checkout.js';
import { registeredFactsHtml } from '../assets/js/ui/checkoutFlow.js';
import {
  orderCardHtml, orderDetailHtml, orderThumbHtml, whatsappText, deliveryModeLabel,
  greetingName, itemDisplayName,
} from '../assets/js/pages/account.js';
import { statusTone, paymentTone, formatOrderTotal, formatOrderDate } from '../assets/js/account/account.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const perfume = {
  name: 'BLEU DE CHANEL EDT',
  house: 'CHANEL',
  scent_profile: {
    context_chips: ['Diario', 'Fresco', 'Oficina'],
    vibe: 'Quiero algo fresco y amaderado para usar todos los días cuando hace calor.',
    short_description: 'Social, aromático y elegante. Ideal para diario, oficina, citas y eventos formales.',
    main_notes: [{ id: 'lemon', label: 'Limón', icon: 'lemon' }],
  },
};

/* ── PERFUME: what it is for, what it feels like ─────────────────────────── */

test('context chips render exactly what the backend chose, capped at three', () => {
  assert.deepEqual(getContextChips(perfume), ['Diario', 'Fresco', 'Oficina']);

  const overflowing = { scent_profile: { context_chips: ['A', 'B', 'C', 'D', 'E'] } };
  assert.equal(getContextChips(overflowing).length, 3);
});

test('duplicate chips are collapsed rather than repeated', () => {
  const noisy = { scent_profile: { context_chips: ['Noche', 'noche', 'Cita'] } };
  assert.deepEqual(getContextChips(noisy), ['Noche', 'Cita']);
});

test('a perfume with no canonical chips falls back without inventing labels', () => {
  const bare = { scent_profile: { context_chips: [] }, fragrance: {} };
  assert.deepEqual(getContextChips(bare), []);
  assert.equal(buildProductModalGuidanceHtml(bare), '');
});

test('the quick view renders at most three chips and escapes backend text', () => {
  const html = buildProductModalGuidanceHtml({
    scent_profile: { context_chips: ['Noche & Cita', '<b>Dulce</b>', 'Frío', 'Extra'] },
  });

  assert.equal((html.match(/<span class="guidance-chip"/g) || []).length, 3);
  assert.match(html, /Noche &amp; Cita/);
  assert.match(html, /&lt;b&gt;Dulce&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Dulce<\/b>/);
  assert.doesNotMatch(html, />Extra</);
});

test('vibe copy is first person, short, and never fabricated', () => {
  const vibe = getVibeCopy(perfume);
  assert.match(vibe, /^Quiero algo /);

  const words = vibe.trim().split(/\s+/).length;
  assert.ok(words >= 8 && words <= 15, `vibe should read in one breath, got ${words} words`);

  /* The backend returns null precisely when metadata cannot support a phrase.
     Filling that silence here would reintroduce the invented copy it refuses
     to write. */
  assert.equal(getVibeCopy({ scent_profile: { vibe: null, short_description: 'Algo bonito.' } }), '');
  assert.equal(getVibeCopy({ desc: 'Legacy' }), '');
});

test('the quick view leads with chips and vibe, and keeps the trust line below the CTA', () => {
  const source = read('assets/js/ui/modal.js');

  /* Indexed on the TEMPLATE call, not the bare identifier: `buildScentNotesHtml`
     also appears in the import line at the top of the file, which would make
     this assertion pass for the wrong reason. */
  const notes = source.indexOf('${buildScentNotesHtml(p)}');

  assert.ok(source.indexOf('${guidanceHtml}') < source.indexOf('pdm-vibe'), 'chips come before the vibe');
  assert.ok(source.indexOf('pdm-vibe') < notes, 'the vibe comes before the notes');
  assert.ok(notes < source.indexOf('pdm-story'), 'the technical paragraph is demoted');
  assert.ok(source.indexOf('id="pdm-btn-add"') < source.indexOf('pdm-trust'), 'trust copy sits below the buy action');
});

test('the PDP uses the same canonical hierarchy as the quick view', () => {
  const source = read('assets/js/ui/productPage.js');

  assert.match(source, /getContextChips\(product, 3\)/);
  assert.ok(source.indexOf('pdp-guidance') < source.indexOf('pdp-vibe'));
  assert.ok(source.indexOf('pdp-vibe') < source.indexOf('buildScentNotesHtml(product)'));
});

/* ── CART AND CONFIRMATION: recognise what you are buying ─────────────────── */

test('cart and confirmation lines both render a thumbnail with the same fallback', () => {
  for (const path of ['assets/js/cart/render.js', 'assets/js/ui/checkoutFlow.js']) {
    const source = read(path);
    assert.match(source, /cart-item-thumb/, `${path} renders a thumbnail`);
    assert.match(source, /data-fallback=/, `${path} carries the monogram initial`);
    assert.match(source, /cart-item-thumb--empty/, `${path} handles a failed image`);
    assert.match(source, /loading="lazy"/, `${path} defers offscreen images`);
  }
});

test('checkout edit actions are brand-styled, never browser-default links', () => {
  const css = read('assets/css/checkout-flow.css');

  assert.match(css, /\.checkout-section-title button \{[^}]*color:#171714/);
  assert.doesNotMatch(css, /\.checkout-section-title button \{[^}]*color:\s*(blue|#00f)/i);
});

/* ── DELIVERY PREFERENCE: requested, never booked ─────────────────────────── */

test('the storefront never hardcodes delivery days or windows', () => {
  const panel = read('assets/js/ui/deliveryPanel.js');
  const delivery = read('assets/js/cart/delivery.js');

  assert.match(delivery, /deliveryWindows/, 'windows come from the API');
  assert.match(panel, /Delivery\.windows/, 'the panel renders what the API published');
  /* An hour literal here would be a slot the business never confirmed. */
  assert.doesNotMatch(panel, /\b(10|13|16|19):00\b/, 'no hardcoded window hours');
});

test('a delivery preference is only ever offered for local delivery', () => {
  const panel = read('assets/js/ui/deliveryPanel.js');
  const delivery = read('assets/js/cart/delivery.js');

  assert.match(panel, /mode === DELIVERY_MODES\.LOCAL && offer\?\.enabled === true/);
  assert.match(delivery, /if \(_state\.mode !== DELIVERY_MODES\.LOCAL\) _state\.preference = null;/);
  assert.match(delivery, /_state\.mode === DELIVERY_MODES\.LOCAL && _state\.preference/);
});

test('the preference travels as identity only — never a label or an hour', () => {
  const delivery = read('assets/js/cart/delivery.js');

  assert.match(delivery, /payload\.preference = \{ \.\.\._state\.preference \}/);
  assert.match(delivery, /\{ date: String\(date\), window: String\(windowKey\) \}/);
  assert.doesNotMatch(delivery, /payload\.preference\.label/);
});

test('the customer is told a window is preferred, not confirmed', () => {
  const markup = read('assets/js/ui/checkoutMarkup.js');
  const panel = read('assets/js/ui/deliveryPanel.js');

  assert.match(markup, /Horario preferido/i);
  assert.match(markup, /Es tu horario preferido\. Lo confirmamos por WhatsApp\./);
  /* The chip is rendered by the panel, not baked into the markup — it sits
     alongside the published windows so it is always the last, equal option. */
  assert.match(panel, /Lo coordinamos por WhatsApp/, 'the zero-friction answer is a first-class choice');
  for (const source of [markup, panel]) {
    assert.doesNotMatch(source, /garantizad/i, 'nothing here guarantees a delivery time');
  }
});

test('a stale remembered day is dropped rather than resubmitted', () => {
  const delivery = read('assets/js/cart/delivery.js');

  assert.match(delivery, /if \(_state\.preference && !this\.isPreferenceOffered\(_state\.preference\)\)/);
});

/* ── WHATSAPP: a folio, and at most one more fact ─────────────────────────── */

test('the WhatsApp message carries the folio and never rebuilds the order', () => {
  const message = buildWhatsAppMessage('WEB-20260909-0001');

  assert.equal(message, 'Hola, quiero confirmar mi pedido WEB-20260909-0001 de RDECANTS.');
  for (const forbidden of ['$', 'Total', 'MXN', 'pagado', 'disponibilidad']) {
    assert.ok(!message.includes(forbidden), `${forbidden} must not appear in the handoff`);
  }
});

test('a chosen window is added as an explicit date, in plain ASCII', () => {
  const message = buildWhatsAppMessage('WEB-1', { date: '2026-09-10', window_label: '4 - 7 pm' });

  assert.match(message, /Horario preferido: 10\/09, 4 - 7 pm\./);
  /* "Mañana" would carry an ñ into a channel that has already been seen
     mangling multi-byte characters, and a message read the next morning has no
     idea which day "hoy" was. */
  assert.equal(message, Buffer.from(message, 'utf8').toString('ascii'));
});

test('a malformed or absent preference simply omits the line', () => {
  assert.doesNotMatch(buildWhatsAppMessage('WEB-1', null), /Horario/);
  assert.doesNotMatch(buildWhatsAppMessage('WEB-1', { date: 'mañana', window_label: '4 - 7 pm' }), /Horario/);
  assert.doesNotMatch(buildWhatsAppMessage('WEB-1', { date: '2026-09-10', window_label: '' }), /Horario/);
});

/* ── REGISTERED SCREEN ────────────────────────────────────────────────────── */

test('the registered screen states reservation and delivery without claiming payment', () => {
  const html = registeredFactsHtml({ delivery: { shipping_cost: 30 } });

  assert.match(html, /inventario quedó apartado/);
  assert.match(html, /entrega ya está calculada/);
  assert.doesNotMatch(html, /pagad|cobrad/i);
});

test('an unpriced delivery says so instead of implying it is free', () => {
  const html = registeredFactsHtml({ delivery: { shipping_cost: null } });

  assert.match(html, /costo de entrega se confirma/i);
  assert.doesNotMatch(html, /\$0|sin costo/i);
});

test('a chosen window is echoed as preferred, from the server snapshot', () => {
  const html = registeredFactsHtml({ delivery: { shipping_cost: 30, preference: { label: 'Hoy · 4 - 7 pm' } } });

  assert.match(html, /Horario preferido: Hoy · 4 - 7 pm/);
  assert.match(html, /Lo confirmamos por WhatsApp/);
});

test('the registered screen links straight to this order, not to a login', () => {
  const flow = read('assets/js/ui/checkoutFlow.js');
  const markup = read('assets/js/ui/checkoutMarkup.js');

  assert.match(markup, /id="checkout-view-order"/);
  assert.match(markup, />Ver mi pedido</);
  assert.match(flow, /\/cuenta\.html\?folio=\$\{encodeURIComponent\(order\.folio\)\}/);
});

/* ── MIS PEDIDOS ──────────────────────────────────────────────────────────── */

const order = {
  folio: 'WEB-20260909-0001',
  created_at: '2026-09-09T18:00:00+00:00',
  summary_line: '2 productos',
  merchandise_total: 420,
  total: 450,
  discount: 0,
  status: {
    progress: 'en_preparacion',
    progress_label: 'En preparación',
    progress_detail: 'Estamos preparando tus decants.',
    payment: 'por_confirmar',
    payment_label: 'Pago por confirmar',
    is_open: true,
  },
  preview: [{ name: 'HAWAS FIRE', brand: 'RASASI', image: '/storage/a.jpg' }],
  delivery: { mode: 'local', shipping_cost: 30, preference_label: 'Hoy · 4 - 7 pm', destination: 'Independencia 140 · Centro' },
  items: [{ name: 'HAWAS FIRE', brand: 'RASASI', image: '/storage/a.jpg', ml: 5, quantity: 2, unit_price: 210, line_total: 420 }],
};

test('an order row shows folio, status and a recognisable thumbnail', () => {
  const html = orderCardHtml(order);

  assert.match(html, /WEB-20260909-0001/);
  assert.match(html, /En preparación/);
  assert.match(html, /cart-item-thumb/);
  assert.match(html, /cuenta\.html\?folio=WEB-20260909-0001/);
});

test('the storefront renders the backend status label rather than deciding one', () => {
  const source = read('assets/js/pages/account.js');

  assert.match(source, /status\.progress_label/);
  assert.match(source, /status\.payment_label/);
  /* A literal Spanish status string here would be a second vocabulary, free to
     disagree with the operator's board. */
  for (const invented of ['En ruta<', 'Entregado<', 'Confirmado<']) {
    assert.ok(!source.includes(invented), `${invented} must come from the API`);
  }
});

test('progress and payment are separate, and payment is never inferred', () => {
  assert.equal(statusTone({ progress: 'entregado' }), 'done');
  assert.equal(statusTone({ progress: 'cancelado' }), 'cancelled');
  /* Delivered says where the perfume is. It says nothing about the money. */
  assert.equal(paymentTone({ progress: 'entregado', payment: 'por_confirmar' }), 'pending');
  assert.equal(paymentTone({ payment: 'pagado' }), 'done');
});

test('an unpriced order shows no final total and never a zero', () => {
  const html = orderCardHtml({ ...order, total: null });

  assert.match(html, /Total por confirmar/);
  assert.doesNotMatch(html, /\$0/);
  assert.equal(formatOrderTotal(null), null);
  assert.equal(formatOrderTotal(undefined), null);
});

test('the order detail shows products, delivery and the real payment state', () => {
  const html = orderDetailHtml(order);

  assert.match(html, /HAWAS FIRE/);
  assert.match(html, /5 ml · Cantidad 2/);
  assert.match(html, /Entrega local/);
  assert.match(html, /Independencia 140 · Centro/);
  assert.match(html, /Horario preferido: Hoy · 4 - 7 pm · lo confirmamos por WhatsApp/);
  assert.match(html, /Pago por confirmar/);
  assert.doesNotMatch(html, /Pagado/);
});

test('the order detail offers WhatsApp with the folio and nothing rebuilt', () => {
  assert.equal(whatsappText(order), 'Hola, quiero confirmar mi pedido WEB-20260909-0001.');

  const html = orderDetailHtml(order);
  assert.match(html, /wa\.me\/529513446211/);
  assert.doesNotMatch(html, /wa\.me[^"]*420/, 'no totals in the handoff link');
});

test('order copy escapes backend text and survives a missing image', () => {
  const html = orderThumbHtml({ name: '<script>x</script>', brand: '', image: '' });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-fallback="&lt;"/);
  assert.doesNotMatch(html, /<img/, 'no image element when there is no image');
});

test('an unknown delivery mode is described honestly', () => {
  assert.equal(deliveryModeLabel(null), 'Entrega por confirmar');
  assert.equal(deliveryModeLabel('local'), 'Entrega local');
  assert.equal(deliveryModeLabel('national'), 'Envío nacional');
});

test('a missing or malformed date renders nothing rather than "Invalid Date"', () => {
  assert.equal(formatOrderDate(null), '');
  assert.equal(formatOrderDate('not-a-date'), '');
  assert.match(formatOrderDate('2026-09-09T18:00:00+00:00'), /2026/);
});

test('the order snapshot is not made to say the brand twice', () => {
  /* WebOrderItem stores `nombre_completo`, which already begins with the house.
     Presentation only — the snapshot itself is never rewritten. */
  assert.equal(itemDisplayName({ name: 'AFNAN 9PM ELIXIR', brand: 'AFNAN' }), '9PM ELIXIR');
  assert.equal(itemDisplayName({ name: '9PM ELIXIR', brand: 'AFNAN' }), '9PM ELIXIR');
  /* A name that is ONLY the brand must not become an empty line. */
  assert.equal(itemDisplayName({ name: 'AFNAN', brand: 'AFNAN' }), 'AFNAN');
  assert.equal(itemDisplayName({ name: 'HAWAS', brand: '' }), 'HAWAS');
});

test('a customer is greeted by name, not shouted at', () => {
  /* Cliente stores names upper-cased for the operator's lists. */
  assert.equal(greetingName('ROGER QA'), 'Roger Qa');
  assert.equal(greetingName('MARÍA JOSÉ'), 'María José');
  assert.equal(greetingName("O'BRIEN"), "O'Brien");
  /* A name the customer typed with their own capitalisation keeps it. */
  assert.equal(greetingName('Roger Díaz'), 'Roger Díaz');
  assert.equal(greetingName(''), '');
});

test('the day picker offers two days and hides the rest of the week', () => {
  const panel = read('assets/js/ui/deliveryPanel.js');

  /* Seven date chips wrapping across a phone is a list to read rather than a
     choice to make. */
  assert.match(panel, /days\.slice\(0, 2\)/);
  assert.match(panel, /data-when-more/);
  /* A day already chosen from later in the week must still be visible. */
  assert.match(panel, /_showAllDays \|\| isFar\(activeDate\)/);
});

test('the account page is reachable by a clean URL that keeps the folio', () => {
  const htaccess = read('.htaccess');

  assert.match(htaccess, /RewriteRule \^cuenta\/\?\$\s+cuenta\.html\s+\[L,QSA\]/);
  /* QSA matters more here than anywhere else on the site: dropping the query
     would send a customer following a link to their own order to a list. */
  assert.doesNotMatch(htaccess, /cuenta\.html\s+\[L,QSD\]/);
});

/* ── IDENTITY: never guessable, never readable by script ──────────────────── */

test('account calls carry credentials, and public reads deliberately do not', () => {
  const client = read('assets/js/api/client.js');

  for (const call of ['getAccount', 'getAccountOrders', 'getAccountOrder']) {
    assert.match(client, new RegExp(`${call}:\\s+\\(.*?\\) => _getWithCredentials`), `${call} must send the session`);
  }
  assert.match(client, /createWebOrder:\s+\(payload\) => _post\('\/api\/web\/orders', payload, \{ credentials: 'include' \}\)/);
  /* The catalogue must behave identically for a customer and a stranger. */
  assert.match(client, /getCatalog:\s+\(\) => _get\('\/api\/web\/catalog'\)/);
});

test('nothing in the storefront reads, stores or sends a session token', () => {
  for (const path of ['assets/js/account/account.js', 'assets/js/pages/account.js', 'assets/js/api/client.js']) {
    const source = read(path);
    assert.doesNotMatch(source, /rd_customer/, `${path} must not know the cookie name`);
    assert.doesNotMatch(source, /document\.cookie/, `${path} must not touch cookies`);
    assert.doesNotMatch(source, /Authorization/i, `${path} must not build a bearer header`);
  }
});

test('the account API is never asked about a customer the browser names', () => {
  const source = read('assets/js/account/account.js');

  /* The only parameter any account call takes is a folio, and the server
     matches it inside the caller's own orders. There is no customer id, phone
     number or email in this module's requests. */
  assert.doesNotMatch(source, /cliente_id|customer_id|telefono|phone=/);
  assert.match(source, /getAccountOrder\(folio\)/);
});

test('the account page ships all four states, not just the happy one', () => {
  const source = read('assets/js/pages/account.js');

  assert.match(source, /Cargando tus pedidos/, 'loading');
  assert.match(source, /Aún no tienes pedidos aquí/, 'guest');
  assert.match(source, /Todavía no hay pedidos/, 'recognised but empty');
  assert.match(source, /No pudimos cargar tus pedidos/, 'transport failure');
  assert.match(source, /data-account-retry/, 'the failure state offers a retry');

  /* A network failure must NOT read as "you have no orders". Account.identity()
     marks it `offline`, and this is the branch that keeps the two apart. */
  assert.match(source, /identity\.offline \? errorHtml\(\) : guestHtml\(\)/);
});

test('a guest is an ordinary state, not an error or a login wall', () => {
  const source = read('assets/js/pages/account.js');

  assert.match(source, /Aún no tienes pedidos aquí/);
  assert.match(source, /No necesitas crear una cuenta/);
  for (const banned of ['Iniciar sesión', 'Contraseña', 'Regístrate', 'password']) {
    assert.ok(!source.includes(banned), `${banned} has no place in this flow`);
  }
});

test('prefill fills blanks and never overwrites what the customer typed', () => {
  const panel = read('assets/js/ui/deliveryPanel.js');

  assert.match(panel, /if \(!value \|\| current\[field\]\) continue;/);
  assert.match(panel, /if \(!Delivery\.mode && saved\.mode\)/);
});

/* ── NAVIGATION ───────────────────────────────────────────────────────────── */

test('every entry point offers Mis pedidos, and the page stays out of search', () => {
  const pages = [
    'index.html', 'catalogo.html', 'perfumes.html', 'cotiza.html', 'elegir.html',
    'ayuda.html', 'mood.html', 'product.html', 'privacidad.html', 'terminos.html', 'cuenta.html',
  ];

  for (const page of pages) {
    assert.match(read(page), /href="\/cuenta\.html"/, `${page} links to Mis pedidos`);
  }

  /* The page is empty for everyone but its owner; a search result for it would
     only ever be a dead end. */
  assert.match(read('cuenta.html'), /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(read('sitemap.xml'), /cuenta\.html/);
});
