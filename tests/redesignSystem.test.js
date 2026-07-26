/* =============================================================
   Design-system guards for the 2026-07 redesign.

   Two classes of regression these catch, both of which happened while
   the redesign was being built:

   1. A stale rule further down components.css silently winning the
      cascade over the new component block (the product card's price
      went back to accent serif and its action back to a full-width
      block button, hundreds of lines below where the card is defined).
   2. The dark/gold palette creeping back in as a raw literal instead
      of a token.

   Cheap source assertions — no DOM, same pattern as cacheFreshness.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

const tokens = read('assets/css/tokens.css');
const components = read('assets/css/components.css');
const styles = read('assets/css/styles.css');

/* ── A. Palette ──────────────────────────────────────────────── */

test('tokens declare the redesign palette', () => {
  const expected = {
    '--bg': '#f4f1ea',
    '--surface': '#fffefa',
    '--ink': '#191816',
    '--ink-soft': '#68645e',
    '--line': '#ded9d0',
    '--wine': '#7a2432',
    '--wine-hover': '#5c1823',
    '--dark': '#171614',
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.match(
      tokens,
      new RegExp(`${name}:\\s*${value};`),
      `${name} must be ${value}`,
    );
  }
});

test('the gold-on-black palette is gone from the component sheet', () => {
  /* The old accent and page bases, as raw literals. Tokens are the only
     place a colour value belongs now. */
  for (const dead of ['#c9a96e', '#d9bd85', '201, 169, 110', '#030303', '#0c0c0c']) {
    assert.ok(!components.includes(dead), `component sheet still contains ${dead}`);
  }
  assert.ok(!components.includes('rgba(255, 255, 255, 0.'), 'white-on-dark alphas remain');
});

test('the legacy token names are repointed, not left describing a dark theme', () => {
  assert.match(tokens, /--white:\s*var\(--ink\)/, '--white was the strong foreground');
  assert.match(tokens, /--accent:\s*var\(--wine\)/, '--accent is the wine accent');
  assert.match(tokens, /--muted:\s*var\(--ink-soft\)/);
});

/* ── B. Layout rhythm from the brief ─────────────────────────── */

test('layout tokens follow the specified rhythm', () => {
  assert.match(tokens, /--container:\s*1280px/, 'content width 1200–1280');
  assert.match(tokens, /--gutter:\s*20px/, 'mobile gutter');
  assert.match(tokens, /--gutter:\s*32px/, 'tablet gutter');
  assert.match(tokens, /--gutter:\s*48px/, 'desktop gutter');
  assert.match(tokens, /--section-y:\s*64px/, 'mobile section gap');
  assert.match(tokens, /--section-y:\s*(88|96)px/, 'desktop section gap');

  /* Moderate radii (10–14px) and 150–220ms transitions. */
  for (const [name, value] of [['--radius-sm', 10], ['--radius-md', 12], ['--radius-lg', 14]]) {
    assert.match(tokens, new RegExp(`${name}:\\s*${value}px`), `${name} stays moderate`);
  }
  const durations = [...tokens.matchAll(/--dur(?:-fast|-slow)?:\s*(\d+)ms/g)]
    .map(m => Number(m[1])).filter(ms => ms > 0);
  assert.ok(durations.length >= 3, 'motion scale present');
  for (const ms of durations) {
    assert.ok(ms >= 150 && ms <= 220, `transition ${ms}ms is outside 150–220ms`);
  }
});

test('primary actions clear the 48px minimum height', () => {
  const primary = components.slice(components.indexOf('.btn-primary {'));
  assert.match(primary.slice(0, 400), /min-height:\s*48px/, 'primary button is at least 48px tall');
});

/* ── C. Product card: defined once, never re-overridden ──────── */

test('the product card is not re-styled by a later rule in the sheet', () => {
  /* Each of these was a real override that outranked the card block. */
  assert.doesNotMatch(
    components,
    /\.card-action\s*\{[^}]*width:\s*100%/s,
    'the card action must stay compact, not a full-width block button',
  );
  assert.doesNotMatch(
    components,
    /\.card-price\s*\{[^}]*color:\s*var\(--accent\)/s,
    'the price is ink, not accent-coloured',
  );
  assert.doesNotMatch(
    components,
    /\.card-img-wrap\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s,
    'the photo tile stays 4:5 at every viewport',
  );
  assert.doesNotMatch(
    components,
    /\.card-img-wrap img\s*\{[^}]*padding:\s*[1-9]/s,
    'the photo fills its tile instead of being letterboxed',
  );
});

test('the card photo reserves its space and covers the tile', () => {
  const block = components.slice(
    components.indexOf('.card-img-wrap {'),
    components.indexOf('.card-body {'),
  );
  assert.match(block, /aspect-ratio:\s*4\s*\/\s*5/, 'consistent 4:5 proportion');
  assert.match(block, /object-fit:\s*cover/, 'proper object-fit');
});

test('no product surface prints a decorative overlay on the photograph', () => {
  assert.doesNotMatch(components, /\.card-img-wrap::after\s*\{[^}]*content:\s*'Ver detalle'/s);
});

/* ── D. Things the brief rules out ───────────────────────────── */

test('the sheet carries no gradients or glow on the redesigned surfaces', () => {
  for (const selector of ['.hero {', '.product-card {', '.header {', '.intent-tile {', '.step-card {']) {
    const start = components.indexOf(selector);
    assert.ok(start > -1, `${selector} exists`);
    const block = components.slice(start, components.indexOf('}', start));
    assert.ok(!/gradient\(/.test(block), `${selector} must not use a gradient`);
    assert.ok(!/box-shadow:\s*0 \d\dpx/.test(block), `${selector} must not carry a heavy shadow`);
  }
});

/* ── E. The [hidden] contract ────────────────────────────────── */

test('[hidden] is honoured globally, not patched per component', () => {
  assert.match(
    styles,
    /\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    'a component setting display must not be able to un-hide an element',
  );
});

/* ── F. Accessibility affordances ────────────────────────────── */

test('keyboard focus is visible and never communicated by colour alone', () => {
  assert.match(components, /:focus-visible\s*\{[^}]*outline:\s*2px solid/s, 'a real focus ring');

  /* The finder's selected answer carries a glyph as well as the accent fill. */
  assert.match(
    components,
    /\.finder-option\[aria-pressed="true"\]::after\s*\{\s*content:/,
    'selected state is not colour-only',
  );
});
