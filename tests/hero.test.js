/* =============================================================
   THE DYNAMIC HERO

   Roger changes what the store opens with from R Supply OS, without a
   deploy of this repository. Everything here is about the fallback
   direction: a hero placement that is absent, empty or partial must leave
   the shipped copy standing rather than blanking the first thing a visitor
   reads.

   And one thing it must NOT change: the perfume. A hero placement used to
   print its product's brand and name under the CTAs, which in production
   put "RASASI HAWAS ICE" beneath an art-directed photograph of Dior
   Sauvage. The photograph is fixed, so no caption naming a rotating
   merchandising pick can be made correct. The hero is now value
   proposition + two CTAs + trust + image, and the tests below pin that.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveHero } from '../assets/js/ui/hero.js';

const DEFAULTS = {
  headline: 'Prueba perfumes originales sin comprar la botella completa.',
  body: 'Frascos pequeños de 3, 5 y 10 ml desde $100.',
};

const sellable = (id = 'P') => ({
  id, name: id, house: 'CASA',
  variants: [{ size: 5, price: 170, stock: 4, availability: 4, available: true, variant_id: `${id}-5` }],
});

test('no placement leaves every default in place', () => {
  assert.deepEqual(resolveHero(null, DEFAULTS), {
    headline: DEFAULTS.headline,
    body: DEFAULTS.body,
    primary: null,
    secondary: null,
  });
});

test('an empty or whitespace-only field never blanks the shipped copy', () => {
  const resolved = resolveHero({ headline: '   ', body: '' }, DEFAULTS);

  assert.equal(resolved.headline, DEFAULTS.headline);
  assert.equal(resolved.body, DEFAULTS.body);
});

test('a partial placement overrides only what it sets', () => {
  const resolved = resolveHero({ headline: 'Descubre cuál sí es para ti.' }, DEFAULTS);

  assert.equal(resolved.headline, 'Descubre cuál sí es para ti.');
  assert.equal(resolved.body, DEFAULTS.body, 'the untouched line keeps its live entry price');
});

test('a CTA needs both a label and a destination to replace the default', () => {
  assert.equal(resolveHero({ cta: { label: 'Ver la campaña' } }, DEFAULTS).primary, null);
  assert.equal(resolveHero({ cta: { url: '/catalogo.html' } }, DEFAULTS).primary, null);

  assert.deepEqual(
    resolveHero({ cta: { label: 'Ver la campaña', url: '/catalogo.html?intent=salir' } }, DEFAULTS).primary,
    { label: 'Ver la campaña', url: '/catalogo.html?intent=salir' },
  );
});

test('a hero placement never carries a product into the resolved hero', () => {
  /* The backend may still POINT the hero slot at a perfume — that pointer
     records which product the opening copy was written for, and removing the
     column would have been a schema migration for a copy problem. What must
     not happen is any of it reaching the page. */
  const resolved = resolveHero({ product: sellable('HAWAS'), headline: 'Hola' }, DEFAULTS);

  assert.equal(resolved.product, undefined, 'the hero has no product to render');
  assert.deepEqual(Object.keys(resolved).sort(), ['body', 'headline', 'primary', 'secondary']);
});

test('the hero renders no perfume name, brand or product link', () => {
  const code = readFileSync(new URL('../assets/js/ui/hero.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  /* The specific regression: a `.hero-featured` element built from
     product.house + product.name and linked to the PDP. */
  assert.doesNotMatch(code, /hero-featured/, 'the featured-product line is gone');
  assert.doesNotMatch(code, /product\.(name|house)/, 'no product identity reaches the hero');
  assert.doesNotMatch(code, /product\.html/, 'the hero does not link to a PDP');
});

test('no stylesheet still ships the removed featured-product rule', () => {
  const css = readFileSync(new URL('../assets/css/components.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  assert.doesNotMatch(css, /\.hero-featured/, 'dead CSS for a removed element');
});

test('the hero never substitutes the art-directed photograph', () => {
  /* The hero image is the LCP element: two purpose-built crops across
     AVIF/WebP/JPEG at four widths, preloaded. Swapping in a catalogue photo
     would trade a designed frame for one `object-fit` crops badly and lose
     the preload. Campaigns change words and destinations, not the picture. */
  const source = readFileSync(new URL('../assets/js/ui/hero.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\.hero-figure|<picture|srcset|\.src\s*=/,
    'hero.js must not touch the hero image');
});

test('operator copy reaches the DOM as text, never as markup', () => {
  /* Comments are stripped: the file explains why it avoids innerHTML, and
     that explanation should not trip the check it is explaining. */
  const code = readFileSync(new URL('../assets/js/ui/hero.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.doesNotMatch(code, /innerHTML/, 'hero copy is operator-authored; textContent only');
  assert.match(code, /textContent/);
});
