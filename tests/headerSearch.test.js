import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const PAGES = [
  'index.html', 'catalogo.html', 'elegir.html',
  'ayuda.html', 'product.html', 'mood.html',
];

test('header search imports the same SearchBar module instance as the catalog', () => {
  const page = read('assets/js/pages/catalog.js');
  const render = read('assets/js/catalog/render.js');

  /* Single module identity: both import searchbar.js with the SAME bare
     specifier (no ?v= query). A divergent query string would load a second,
     un-initialised SearchBar instance — the exact duplicate-state bug the
     guided-catalog Phase 0 dedup removed. */
  assert.match(page, /from '\.\.\/ui\/searchbar\.js'/);
  assert.match(render, /from '\.\.\/ui\/searchbar\.js'/);
  assert.doesNotMatch(page, /searchbar\.js\?v=/);
  assert.doesNotMatch(render, /searchbar\.js\?v=/);
});

test('the storefront ships exactly one search input, on the catalog page', () => {
  for (const page of PAGES) {
    const html = read(page);
    const inputs = (html.match(/type="search"/g) ?? []).length;
    const expected = page === 'catalogo.html' ? 1 : 0;
    assert.equal(inputs, expected, `${page}: ${expected} search input(s)`);
    assert.doesNotMatch(html, /hs-wrap|id="hs-input"/, `${page}: no legacy search overlay`);
  }

  const catalog = read('catalogo.html');
  assert.match(catalog, /id="catalog-search-input"/);
  assert.match(catalog, /id="catalog-search-x"/, 'the field carries its own clear button');
});

test('the magnifier focuses the catalog field, or navigates there and focuses on arrival', () => {
  const header = read('assets/js/ui/header.js');
  const page = read('assets/js/pages/catalog.js');

  /* In place when the field is on this page… */
  assert.match(header, /getElementById\(CATALOG_INPUT_ID\)/);
  assert.match(header, /input\.focus/);
  /* …otherwise straight to the catalog, with the focus request in the URL. */
  assert.match(header, /CATALOG_URL = '\/catalogo\.html'/);
  assert.match(header, /\$\{CATALOG_URL\}\?focus=search/);
  /* Never a query typed into a header field first: there is no header field. */
  assert.doesNotMatch(header, /applyQuery/);

  /* The catalog honours the request and then cleans the flag out of the URL. */
  assert.match(page, /focusCatalogSearch\(\)/);
  assert.match(page, /params\.get\('focus'\) !== 'search'/);
  assert.match(page, /params\.delete\('focus'\)/);
});

test('the catalog filters live from the first character, with a ~200ms debounce', () => {
  const page = read('assets/js/pages/catalog.js');

  assert.match(page, /const SEARCH_DEBOUNCE_MS = 200/);
  assert.match(page, /input\.addEventListener\('input'/);
  assert.match(page, /setTimeout\(\(\) => SearchBar\.applyQuery\(query\), SEARCH_DEBOUNCE_MS\)/);

  /* Enter is accepted but is never what makes results appear — by the time it
     is pressed the grid is already filtered; it only flushes and dismisses
     the mobile keyboard. */
  assert.match(page, /event\.key === 'Enter'/);
  assert.match(page, /input\.blur\(\)/);
});

test('an active query is mirrored to ?q= with replaceState, never pushState', () => {
  const src = read('assets/js/ui/searchbar.js');

  assert.match(src, /url\.searchParams\.set\('q', next\)/);
  assert.match(src, /url\.searchParams\.delete\('q'\)/);
  assert.match(src, /history\.replaceState\(/);
  assert.doesNotMatch(src, /history\.pushState/, 'one history entry per keystroke would break Back');
});

test('a ?q= deep link fills the visible field and runs the search', () => {
  const page = read('assets/js/pages/catalog.js');

  /* The URL is the contract for a shared search: the field has to show the
     query it is filtering by, or the customer sees results with an empty
     search box and no way to tell what produced them. */
  assert.match(page, /const query = readQueryFromQuery\(search\)/);
  assert.match(page, /getElementById\('catalog-search-input'\)[\s\S]{0,80}input\.value = query/);
  assert.match(page, /getElementById\('catalog-search-x'\)[\s\S]{0,80}clearBtn\.hidden = false/);
  assert.match(page, /SearchBar\.applyQuery\(query\)/);
});

test('clearing the query restores the field, the URL and the full catalog', () => {
  const src = read('assets/js/ui/searchbar.js');

  /* Chip removal and "Limpiar todo" both push the empty query back into the
     visible field, which is what re-renders the whole grid. */
  assert.match(src, /_syncSearchInput\(''\)/);
  assert.match(src, /getElementById\('catalog-search-input'\)/);
  assert.match(src, /getElementById\('catalog-search-x'\)/);
});

test('a live search suppresses the catalog browse band instead of stacking under it', () => {
  const src = read('assets/js/ui/searchbar.js');
  const css = read('assets/css/components.css');

  assert.match(src, /classList\?\.toggle\?\.\('rd-searching'/);
  assert.match(css, /body\.rd-searching \.helper-band \{ display: none; \}/);
});

test('an active query shows Relevancia and clearing it restores the saved sort', () => {
  const src = read('assets/js/ui/searchbar.js');

  assert.match(src, /<option value="relevance" hidden>Relevancia<\/option>/);
  assert.match(
    src,
    /s\.value = _state\.query\?\.trim\(\) \? 'relevance' : _state\.sort/,
    'the visible sort must follow the effective search order without overwriting the saved sort',
  );
  assert.match(
    src,
    /_state\.sort === 'for_you' && !_state\.query\?\.trim\(\)/,
    'personalization must not replace relevance while a query is active',
  );
});

test('search never pins the document body — results stay scrollable while typing', () => {
  const header = read('assets/js/ui/header.js');
  const page = read('assets/js/pages/catalog.js');

  for (const [name, src] of [['header.js', header], ['pages/catalog.js', page]]) {
    assert.doesNotMatch(src, /scrollLock\.js/, `${name} takes no scroll lock`);
    assert.doesNotMatch(src, /lockBodyScroll|unlockBodyScroll/, `${name} takes no scroll lock`);
  }
});

test('the search engine matches name, brand, concentration and notes, accent-insensitive', async () => {
  const { scoreSearchResult } = await import('../assets/js/catalog/search.js');

  const product = {
    name: 'Sauvage Élixir',
    house: 'Dior',
    concentration: 'EDP',
    notes: ['Bergamota', 'Cítrico'],
    desc: 'Fresco y especiado.',
    fragrance: { accords: ['ambroxan'] },
  };

  for (const query of ['sauvage', 'SAUVAGE', 'sauvage elixir', 'dior', '  dior sauvage  ']) {
    assert.ok(scoreSearchResult(product, query) > 0, `matches "${query}"`);
  }
  /* Concentration and notes participate through the same scorer. */
  assert.ok(scoreSearchResult(product, 'sauvage elixir edp') > 0, 'concentration');
  assert.ok(scoreSearchResult({ ...product, name: 'Sauvage' }, 'sauvage') > 0, 'plain name');
  assert.equal(scoreSearchResult(product, 'zzzz'), 0, 'no accidental matches');
});
