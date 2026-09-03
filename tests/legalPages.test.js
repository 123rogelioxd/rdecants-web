/* =============================================================
   Privacy + Terms pages — honesty and wiring checks.

   These two pages make claims about what the site does with data and how
   an order is confirmed. Unlike marketing copy, a wrong claim here is a
   real liability, not just an inaccuracy — so this file locks the two
   things most likely to drift silently: the page matching what the code
   actually does (checked against the real modules, not just self-consistency),
   and every page on the site actually linking to both.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

const ENTRY_POINTS = [
  'index.html', 'catalogo.html', 'elegir.html', 'ayuda.html',
  'product.html', 'mood.html', 'perfumes.html', 'cotiza.html',
  'privacidad.html', 'terminos.html',
];

test('every page on the site links to both privacidad.html and terminos.html', () => {
  for (const filename of ENTRY_POINTS) {
    const html = read(filename);
    assert.match(html, /href="\/privacidad\.html"/, `${filename} must link to /privacidad.html`);
    assert.match(html, /href="\/terminos\.html"/, `${filename} must link to /terminos.html`);
  }
});

test('the privacy page never claims a payment method is collected on-site', () => {
  const html = read('privacidad.html');
  // Checkout hands off to WhatsApp — checkout.js never posts a card number
  // or bank account anywhere. The page must say so plainly, not imply the
  // opposite by omission.
  assert.match(html, /no (procesa|cobra)/i);
  assert.doesNotMatch(html, /tarjeta.*(guardamos|almacenamos|procesamos)/i);
});

test('the privacy page names the real storage mechanism, not a cookie banner it does not have', () => {
  const html = read('privacidad.html');
  assert.match(html, /localStorage/);
  // No consent-banner language for a mechanism the site does not use.
  assert.doesNotMatch(html, /banner de cookies|aceptar cookies/i);
});

test('the privacy page points to the real, working "borrar mis preferencias" control', () => {
  const html = read('privacidad.html');
  const tasteBuilder = read('assets/js/ui/tasteBuilder.js');
  assert.match(html, /Borrar mis preferencias/);
  // Fails loudly if that control is ever renamed or removed, instead of the
  // policy quietly pointing at a button that no longer exists.
  assert.match(tasteBuilder, /Borrar mis preferencias/);
});

test('the privacy page does not claim third-party trackers are absent while one is wired in', () => {
  const html = read('privacidad.html');
  assert.match(html, /No usamos rastreadores de terceros/);
  // If a third-party analytics/ads snippet is ever added to a page, this
  // claim becomes false — catch that here rather than leaving the policy
  // to rot silently.
  for (const filename of ENTRY_POINTS) {
    const page = read(filename);
    assert.doesNotMatch(
      page,
      /googletagmanager\.com|google-analytics\.com|facebook\.net\/.*\/fbevents|hotjar|segment\.com|mixpanel/i,
      `${filename} must not load a third-party tracker while privacidad.html claims none exist`,
    );
  }
});

test('the terms page does not invent a fixed return window the process does not have', () => {
  const html = read('terminos.html');
  // The real process (ayuda.html, checkout.js) is case-by-case over
  // WhatsApp — there is no "N días para devolución" policy anywhere in the
  // codebase, so the page must not assert one.
  assert.doesNotMatch(html, /\d+\s*d[ií]as (para|de) (devoluci|reembols|garant)/i);
  assert.match(html, /se revisa de forma personal|caso.*concreto|no hay una pol[ií]tica autom[aá]tica/i);
});

test('the terms page states an order is not final until WhatsApp confirms it', () => {
  const html = read('terminos.html');
  assert.match(html, /no genera un cargo autom[aá]tico/i);
});
