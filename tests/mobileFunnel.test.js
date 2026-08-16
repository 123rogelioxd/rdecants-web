/* =============================================================
   MOBILE FUNNEL — catalog quick routes and the three-question finder.

   Static-source guards in the same style as homeSimplification /
   cacheFreshness: cheap assertions that the mobile-first decisions of the
   2026-08 redesign are still in the code, and — more importantly — that the
   shortcuts added for speed did not become a SECOND way to filter or a
   second question taxonomy. Every one of the storefront's worst past bugs
   came from two surfaces answering the same question differently.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSISTANT_QUESTIONS } from '../assets/js/recommendations/assistant.js';
import { ANSWER_VALUES } from '../assets/js/recommendations/engine.js';
import { getIntentAnswers } from '../assets/js/catalog/intents.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Line endings are normalised before matching, the same way
   redesignSystem.test.js does it. This repo checks out with core.autocrlf on
   Windows, so a source assertion that spans a line break passes in the
   working copy that wrote it and fails on a fresh clone of the same commit —
   a difference in the checkout, never in the code. */
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

/* ── A. Quick gender exploration on the catalog ──────────────── */

test('the catalog offers two large gender routes, above the grid', () => {
  const html = read('catalogo.html');

  const block = html.slice(html.indexOf('id="quick-gender"'), html.indexOf('</div>', html.indexOf('quick-gender-actions')));
  assert.match(block, /Explora rápido por género/);
  assert.match(block, /data-gender="hombre"[^>]*>Caballero|Caballero/);
  assert.match(block, /data-gender="mujer"/);
  assert.equal((block.match(/quick-gender-btn/g) ?? []).length, 2, 'two buttons, no more');

  /* Order on the page: recommender band → quick gender → grid. Someone who
     already knows the category must not have to scroll past the questions. */
  const band = html.indexOf('class="helper-band"');
  const quick = html.indexOf('id="quick-gender"');
  const grid = html.indexOf('id="products-grid"');
  assert.ok(band > -1 && quick > band && grid > quick);
});

test('the gender buttons reuse the catalog filter instead of adding a second one', () => {
  const bar = read('assets/js/ui/searchbar.js');
  const page = read('assets/js/pages/catalog.js');

  assert.match(bar, /applyGender\(gender\)/, 'SearchBar owns the state change');
  assert.match(bar, /_state\.gender = next/, 'the same field the drawer pill sets');
  assert.match(bar, /_syncDrawer\(\)/, 'the drawer pill follows');

  assert.match(page, /SearchBar\.applyGender\(btn\.dataset\.gender\)/);
  /* The page must not filter products itself — that is the whole point. */
  assert.doesNotMatch(page, /filterProducts\(/, 'the page never runs its own filter');
});

test('a quick gender route is measurable, with a name the backend accepts', () => {
  const page = read('assets/js/pages/catalog.js');
  /* gender_filter_applied and filter_cleared are both on the backend
     allowlist; inventing a name here would 422 and lose the event entirely.
     See tests/backendAllowlistParity.test.js. */
  assert.match(page, /Tracker\.genderFilterApplied\(active, 'catalog_quick'\)/);
  assert.match(page, /Tracker\.filterCleared\(\)/, 'un-pressing is measured too');
});

test('the buttons carry a pressed state that is not colour alone', () => {
  const html = read('catalogo.html');
  const css = read('assets/css/components.css');

  assert.match(html, /class="quick-gender-btn" data-gender="hombre" aria-pressed="false"/);
  assert.match(css, /\.quick-gender-btn\[aria-pressed="true"\]::after \{ content:/,
    'selected state carries a glyph as well as the fill');
  assert.match(css, /\.quick-gender-btn \{[^}]*min-height: 52px/s, 'a real touch target');
});

/* ── B. The catalog header stays tight on a phone ────────────── */

test('the catalog header keeps the title, one line of copy and the search field', () => {
  const html = read('catalogo.html');
  const head = html.slice(html.indexOf('class="page-head'), html.indexOf('</section>', html.indexOf('class="page-head')));

  assert.match(head, /page-head--tight/, 'tighter vertical rhythm on mobile');
  assert.match(head, /<h1 class="page-title">Catálogo<\/h1>/);
  assert.match(head, /Fragancias originales en decants de 3, 5 y 10 ml/);
  assert.equal((head.match(/<p class="page-lede">/g) ?? []).length, 1, 'one supporting line, not a paragraph');

  assert.equal((html.match(/type="search"/g) ?? []).length, 1, 'the one search input is still here');
});

test('filters and sort get real tap targets on a phone', () => {
  const css = read('assets/css/components.css');
  const mobile = css.slice(css.indexOf('/* ── Catalog filters + sort on a phone'));

  assert.match(mobile, /\.sf-sel \{[^}]*min-height: 44px/s, 'the sort control is tappable');
  assert.match(mobile, /\.sf-filter-btn \{[^}]*min-height: 44px/s, 'so is Filtrar');
  assert.match(mobile, /\.sf-tools \{ display: grid; grid-template-columns: 1fr 1fr/,
    'the two controls share a row instead of crowding the count');
});

test('the personalized "Para ti" state reads top to bottom on a phone', () => {
  const render = read('assets/js/catalog/render.js');
  const css = read('assets/css/components.css');

  /* Kicker → what was asked → how many matched → the two ways out. */
  const header = render.slice(render.indexOf('el.innerHTML = `'), render.indexOf('_productsContainer.insertAdjacentElement'));
  assert.ok(header.indexOf('cgs-kicker') < header.indexOf('cgs-answers'));
  assert.ok(header.indexOf('cgs-answers') < header.indexOf('cgs-count'));
  assert.ok(header.indexOf('cgs-count') < header.indexOf('cgs-adjust'));
  assert.match(header, /Cambiar respuestas/);
  assert.match(header, /Ver todo el catálogo/);

  const mobile = css.slice(css.indexOf('/* ── "Para ti" state on a phone'));
  assert.match(mobile, /\.catalog-guide-state \{[^}]*flex-direction: column/s, 'stacked, not squeezed');
  assert.match(mobile, /\.cgs-adjust, \.cgs-clear \{ width: 100%; min-height: 44px/);
});

/* ── C. The finder ───────────────────────────────────────────── */

test('the usage question asks when, and offers exactly two answers', () => {
  const occasion = ASSISTANT_QUESTIONS.find(q => q.id === 'occasion');
  assert.ok(occasion, 'the question exists');
  assert.equal(occasion.label, '¿Cuándo lo vas a usar más?');
  assert.deepEqual(occasion.options.map(o => o.label), ['De día', 'Salidas nocturnas']);

  /* The wording changed; the ANSWER did not. `salir` is what the home tiles,
     the ?intent= contract and every occasion rule already use, so relabelling
     could not fork the taxonomy. */
  assert.deepEqual(occasion.options.map(o => o.value), ['dia', 'salir']);
  for (const option of occasion.options) {
    assert.ok(ANSWER_VALUES.occasion.includes(option.value), `${option.value} is a real answer`);
    assert.ok(option.hint?.trim(), 'each option says what it covers');
  }

  assert.deepEqual(getIntentAnswers('salir'), { occasion: 'salir' },
    'the home tile and the finder still resolve to the same answer');
});

test('the finder stays at three questions', () => {
  assert.equal(ASSISTANT_QUESTIONS.length, 3);
});

test('an option renders its hint, so nothing has to be interpreted', () => {
  const finder = read('assets/js/pages/finder.js');
  assert.match(finder, /finder-option-label/);
  assert.match(finder, /option\.hint \? `<span class="finder-option-hint">/);

  const css = read('assets/css/components.css');
  assert.match(css, /\.finder-option-copy \{[^}]*flex-direction: column/s);
});

test('the finder keeps progress, back navigation and the way out', () => {
  const finder = read('assets/js/pages/finder.js');
  assert.match(finder, /Paso \$\{_step \+ 1\} de \$\{total\}/, 'visible progress');
  assert.match(finder, /role="progressbar"/);
  assert.match(finder, /id="finder-back"/, 'back navigation');
  assert.match(finder, /Prefiero ver todo el catálogo/, 'the subtle way out');
  assert.match(finder, /aria-pressed="\$\{_answers\[question\.id\] === option\.value\}"/, 'selected state');
});

/* ── C bis. Scan speed: a mark, a direction, one action ──────── */

test('each home route reads as a row: mark, label, direction', () => {
  const html = read('index.html');
  const grid = html.slice(html.indexOf('id="intent-grid"'), html.indexOf('</ul>', html.indexOf('id="intent-grid"')));

  assert.equal((grid.match(/class="intent-tile-icon"/g) ?? []).length, 3, 'every route carries its mark');
  assert.equal((grid.match(/class="intent-tile-go"/g) ?? []).length, 3, 'and says it leads somewhere');
  /* The marks are decoration on top of a real label — never the label. */
  assert.equal((grid.match(/aria-hidden="true"/g) ?? []).length, 6);

  const css = read('assets/css/components.css');
  assert.match(css, /\.intent-tile \{[^}]*min-height: 76px/s, 'a full-row touch target');

  /* Two paired routes, then the third full width: one line of vertical page
     instead of three, and "De día / Para salir" is the comparison the
     customer is actually making. */
  assert.match(css, /\.intent-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s,
    'two per row on mobile');
  assert.match(css, /\.intent-grid--three > li:nth-child\(3\) \{ grid-column: 1 \/ -1; \}/,
    'the third spans the row');
  assert.match(css, /li:nth-child\(-n \+ 2\) \.intent-tile \{[^}]*flex-direction: column/s,
    'the paired cells stack their parts so the label is not squeezed');
});

test('pack thumbnails are the canonical catalog photos, never a second image source', () => {
  const ui = read('assets/js/ui/starterPacks.js');
  const executable = ui.replace(/\/\*[\s\S]*?\*\//g, ' ');

  /* The only image a pack may show is the one the catalog already serves for
     that product — the same field the card, the modal and the PDP read. */
  assert.match(executable, /const image = String\(product\.image \?\? ''\)\.trim\(\)/);
  assert.match(executable, /<img src="\$\{_escape\(image\)\}"/);

  /* No bundled artwork, no generated pack photography, no second store of
     image truth. Any literal asset path here would be exactly that. */
  assert.doesNotMatch(executable, /\.jpg|\.png|\.avif|\.webp|background-image|\/assets\//,
    'no image source other than the product itself');

  /* Degradation, in both directions: a product with no photo falls back to
     the shared monogram treatment, and a pack where NOT ONE product has a
     photo drops the row and keeps the icon-only card. */
  assert.match(executable, /if \(!pack\.slots\.some\(slot => String\(slot\.product\.image \?\? ''\)\.trim\(\)\)\) return ''/);
  assert.match(executable, /img-shell img-failed/);
  assert.match(executable, /--img-initial/);
  assert.match(read('assets/js/ui/images.js'), /'pack-thumb'/,
    'load/error states are handled by the shared image module');
});

test('the packs and steps carry line marks for the pack itself', () => {
  const ui = read('assets/js/ui/starterPacks.js');
  const html = read('index.html');

  assert.match(ui, /const PACK_ICONS = \{/, 'the pack mark is an inline line icon');

  assert.equal((html.match(/class="step-icon"/g) ?? []).length, 3, 'one mark per step');

  const css = read('assets/css/components.css');
  for (const selector of ['.pack-icon', '.intent-tile-icon', '.step-icon']) {
    /* The base declaration, at the start of a line — not one of the
       viewport overrides that also mention the class. */
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start > -1, `${selector} is declared`);
    const block = css.slice(start, css.indexOf('}', start));
    assert.match(block, /border-radius: var\(--radius-pill\)/, `${selector} is a round chip`);
    assert.ok(!/gradient|#[0-9a-f]{3,6}/i.test(block), `${selector} uses tokens, not literals`);
  }
});

test('the FAQ reads as something you can open, on both pages that use it', () => {
  const css = read('assets/css/components.css');
  const block = css.slice(css.lastIndexOf('.faq-item {'), css.lastIndexOf('.faq-item {') + 220);
  assert.match(block, /border: 1px solid var\(--line\)/, 'panelled, not a hairline list');
  assert.match(block, /border-radius: var\(--radius-md\)/);

  /* Both the home FAQ and the help page share the component. */
  for (const page of ['index.html', 'ayuda.html']) {
    assert.match(read(page), /class="faq-item"/, `${page} uses the shared FAQ component`);
  }
});

/* ── D. Horizontal scroll is contained, never the page ───────── */

test('the horizontal rails scroll inside themselves', () => {
  const css = read('assets/css/components.css');

  const packs = css.slice(css.indexOf('.packs-rail {'), css.indexOf('.packs-rail::-webkit-scrollbar'));
  assert.match(packs, /overflow-x: auto/, 'the rail scrolls, not the document');
  assert.match(packs, /scroll-snap-type: x mandatory/, 'cards snap');
  assert.match(packs, /overscroll-behavior-x: contain/, 'the gesture does not chain to the page');

  /* The bleed is exactly one gutter on each side and is paid back as
     padding, so the rail's content box still lines up with the container. */
  assert.match(packs, /margin: 0 calc\(var\(--gutter\) \* -1\)/);
  assert.match(packs, /padding: 2px var\(--gutter\) 8px/);

  const newest = css.slice(css.indexOf('.rail-grid--scroll {'), css.indexOf('.rail-grid--scroll::-webkit-scrollbar'));
  assert.match(newest, /overflow-x: auto/);
  assert.match(newest, /overscroll-behavior-x: contain/);
});

test('the packs stop scrolling and become a plain grid on desktop', () => {
  const css = read('assets/css/components.css');
  const desktop = css.slice(css.indexOf('@media (min-width: 768px) {\n  .packs-rail {'));
  assert.match(desktop.slice(0, 400), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(desktop.slice(0, 400), /overflow: visible/);
});
