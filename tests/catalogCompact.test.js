/* =============================================================
   CRO — compact mobile catalog + smart commercial order.

   Two layers, mirroring the project's test conventions:
     • Pure-logic: the default "trending" sort ranks the full catalog
       commercially (available → featured → trending badge → gender
       tiebreak), and featured/trending women are never buried.
     • Static-source: the renderer caps the mobile browse view at 8,
       exposes "Ver más perfumes" / "Mostrar menos" + a "Mostrando X
       de Y" counter, never caps active search/filter views, and emits
       catalog_expanded / catalog_collapsed.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterProducts } from '../assets/js/catalog/search.js';
import {
  getInitialVisible,
  getCatalogStep,
  getVisibleProducts,
  getCatalogShown,
  hasMoreToShow,
  normalizeCatalogProducts,
} from '../assets/js/catalog/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

/* Minimal sellable product for sort assertions */
const P = (id, o = {}) => ({
  id,
  name: o.name ?? id,
  house: o.house ?? 'House',
  notes: [],
  badge: o.badge ?? 'Disponible',
  featured: !!o.featured,
  hero: !!o.hero,
  commercial_role: o.commercial_role ?? null,
  gender: o.gender ?? null,
  stock: o.stock ?? 10,
  variants: [{
    size: 3, price: 100,
    stock: o.stock ?? 10, availability: o.stock ?? 10,
    available: (o.stock ?? 10) > 0, variant_id: id,
  }],
});

const order = (list, state = {}) =>
  filterProducts(list, { sort: 'trending', ...state }).map(p => p.id);

/* ── A. Smart commercial order (default "trending" sort) ──────── */

test('available products rank above sold-out ones', () => {
  const list = [P('out', { stock: 0 }), P('live', { stock: 5 })];
  assert.deepEqual(order(list), ['live', 'out']);
});

test('featured products surface above non-featured', () => {
  const list = [P('plain'), P('star', { featured: true })];
  assert.deepEqual(order(list), ['star', 'plain']);
});

test('trending badge beats a plain product', () => {
  const list = [P('plain'), P('hot', { badge: 'TRENDING' })];
  assert.deepEqual(order(list), ['hot', 'plain']);
});

test('default order prioritizes accessible designer/mainstream over available niche', () => {
  const list = [
    P('xerjoff-naxos', { house: 'Xerjoff', name: 'Naxos' }),
    P('creed-aventus', { house: 'Creed', name: 'Aventus' }),
    P('dior-sauvage', { house: 'Dior', name: 'Sauvage' }),
    P('bleu-de-chanel', { house: 'Chanel', name: 'Bleu de Chanel' }),
    P('ysl-y', { house: 'Yves Saint Laurent', name: 'Y EDP' }),
  ];

  assert.deepEqual(order(list).slice(0, 3), ['dior-sauvage', 'bleu-de-chanel', 'ysl-y']);
});

test('niche featured alone does not beat accessible mainstream launch products', () => {
  const list = [
    P('xerjoff-star', { house: 'Xerjoff', name: 'Naxos', featured: true }),
    P('montblanc-explorer', { house: 'Montblanc', name: 'Explorer' }),
  ];

  assert.deepEqual(order(list), ['montblanc-explorer', 'xerjoff-star']);
});

test('niche can rise when it has a real hero or bestseller signal', () => {
  const list = [
    P('dior-plain', { house: 'Dior', name: 'Homme' }),
    P('xerjoff-hero', { house: 'Xerjoff', name: 'Naxos', badge: 'BEST SELLER' }),
  ];

  assert.deepEqual(order(list), ['xerjoff-hero', 'dior-plain']);
});

test('men/unisex rank before women as a tiebreaker only', () => {
  const list = [P('she', { gender: 'female' }), P('he', { gender: 'male' }), P('uni', { gender: 'unisex' })];
  assert.deepEqual(order(list), ['he', 'uni', 'she']);
});

test('a featured women\'s fragrance is never buried below plain men\'s', () => {
  const list = [
    P('m1', { gender: 'male' }),
    P('m2', { gender: 'male' }),
    P('sheStar', { gender: 'female', featured: true }),
  ];
  assert.equal(order(list)[0], 'sheStar', 'featured female stays on top');
});

test('full commercial ranking composes all keys in priority order', () => {
  const list = [
    P('f1', { gender: 'female' }),
    P('m1', { gender: 'male' }),
    P('u1', { gender: 'unisex' }),
    P('ffeat', { gender: 'female', featured: true }),
    P('mtrend', { gender: 'male', badge: 'TRENDING' }),
    P('out', { gender: 'male', stock: 0 }),
  ];
  assert.deepEqual(order(list), ['ffeat', 'mtrend', 'm1', 'u1', 'f1', 'out']);
});

test('a search query still returns every matching result (no cap in logic)', () => {
  const list = Array.from({ length: 20 }, (_, i) =>
    ({ ...P(`sauvage-${i}`), name: `Sauvage ${i}` }));
  assert.equal(order(list, { query: 'sauvage' }).length, 20);
});

/* ── B. Renderer: incremental load-more (every viewport) ─────── */

test('render.js renders an initial batch and appends more incrementally', () => {
  const r = read('assets/js/catalog/render.js');
  assert.match(r, /CATALOG_INITIAL_MOBILE\s*=\s*8/, 'mobile initial batch is 8');
  assert.match(r, /CATALOG_INITIAL_DESKTOP\s*=\s*12/, 'desktop initial batch is 12');
  assert.ok(r.includes('Ver más perfumes'), 'load-more label present');
  assert.ok(r.includes('function _loadMore'), 'incremental append function present');
  assert.ok(r.includes('_visibleCount'), 'visible-count model present');
  assert.match(r, /Mostrando \$\{shown\} de \$\{total\} perfumes/, 'counter present');
  /* Only visible cards are ever in the DOM — no CSS nth-child cap hiding. */
  assert.ok(!/products-grid--capped/.test(r), 'no cap class — only rendered cards exist');
});

test('initial visible batch and step are viewport-aware (mobile 8, desktop 12)', () => {
  assert.equal(getInitialVisible(true), 8, 'mobile initial batch');
  assert.equal(getInitialVisible(false), 12, 'desktop initial batch');
  assert.equal(getCatalogStep(true), 8, 'mobile step');
  assert.equal(getCatalogStep(false), 12, 'desktop step');
});

test('getVisibleProducts slices to the visible count and never exceeds the list', () => {
  const list = Array.from({ length: 50 }, (_, i) => P(`p${i + 1}`));
  assert.equal(getVisibleProducts(list, 12).length, 12);
  assert.deepEqual(getVisibleProducts(list, 8).map(p => p.id).slice(0, 3), ['p1', 'p2', 'p3']);
  assert.equal(getVisibleProducts(list, 100).length, 50, 'clamped to the list length');
  assert.deepEqual(getVisibleProducts(undefined, 8), []);
});

test('getCatalogShown / hasMoreToShow drive the load-more control', () => {
  assert.equal(getCatalogShown(50, 12), 12);
  assert.equal(getCatalogShown(50, 60), 50, 'never shows more than the total');
  assert.equal(hasMoreToShow(50, 12), true);
  assert.equal(hasMoreToShow(50, 50), false);
  assert.equal(hasMoreToShow(8, 12), false, 'short lists need no load-more');
});

test('incremental append reaches the full list in viewport-sized steps', () => {
  const total = 50;
  // desktop: 12 → 24 → 36 → 48 → 50
  let v = getInitialVisible(false);
  const desktopSteps = [v];
  while (hasMoreToShow(total, v)) { v = Math.min(v + getCatalogStep(false), total); desktopSteps.push(v); }
  assert.deepEqual(desktopSteps, [12, 24, 36, 48, 50]);

  // mobile: 8 → 16 → 24 → 32 → 40 → 48 → 50
  let m = getInitialVisible(true);
  const mobileSteps = [m];
  while (hasMoreToShow(total, m)) { m = Math.min(m + getCatalogStep(true), total); mobileSteps.push(m); }
  assert.deepEqual(mobileSteps, [8, 16, 24, 32, 40, 48, 50]);
});

test('catalog fallback normalizes empty or invalid product lists safely', () => {
  assert.deepEqual(normalizeCatalogProducts(undefined), []);
  assert.deepEqual(normalizeCatalogProducts(null), []);
  assert.deepEqual(normalizeCatalogProducts([P('p1'), null, undefined, P('p2')]).map(p => p.id), ['p1', 'p2']);
});

test('render.js emits catalog_expanded on load-more', () => {
  const r = read('assets/js/catalog/render.js');
  assert.ok(r.includes('Tracker.catalogExpanded'), 'each load-more is tracked');
});

test('SearchBar exposes hasActiveFilters() reusing its private check', () => {
  const s = read('assets/js/ui/searchbar.js');
  assert.ok(/hasActiveFilters\(\)\s*\{[\s\S]*?_hasActiveFilters\(\)/.test(s),
    'public hasActiveFilters delegates to existing logic');
});

/* ── C. CSS: incremental control + no nth-child hiding ───────── */

test('catalog does not rely on nth-child CSS hiding and shows load-more on all viewports', () => {
  const css = read('assets/css/components.css');
  assert.ok(!/\.products-grid\.products-grid--capped > \.product-card:nth-of-type\(n \+ 9\)/.test(css),
    'no old nth-child cap rule');
  assert.ok(css.includes('.products-grid > .product-card[hidden]'), 'explicit hidden attributes still respected');
  assert.ok(/\.catalog-more\s*\{\s*display:\s*flex;/.test(css),
    '"Ver más" control is visible on every viewport (incremental on desktop too)');
  assert.ok(css.includes('.catalog-more-btn'), 'load-more button styled');
  assert.ok(css.includes('.catalog-more-count'), 'counter styled');
});

test('catalog cards render visible by default instead of waiting on IntersectionObserver', () => {
  const r = read('assets/js/catalog/render.js');
  /* Cards carry `fade-up visible` at creation (never opacity:0 waiting on an
     observer). The class is now built in a template literal so a guided top
     pick can append product-card--top. */
  assert.match(r, /card\.className\s*=\s*`product-card product-card--clickable fade-up visible/,
    'product cards include visible at creation time');
});

test('catalog show-more control uses premium panel/count/button classes', () => {
  const r = read('assets/js/catalog/render.js');
  assert.ok(r.includes('catalog-more catalog-more-panel'), 'panel class emitted');
  assert.ok(r.includes('catalog-more-count catalog-count'), 'count class emitted');
  assert.match(r, /<button type="button" class="catalog-more-btn" id="catalog-more-btn"/,
    'show-more text is rendered inside the styled button');

  const css = read('assets/css/components.css');
  assert.ok(css.includes('.catalog-more-panel'), 'panel styled');
  assert.ok(css.includes('.catalog-more .catalog-count'), 'mobile count styled');
  assert.ok(css.includes('border-radius: 999px'), 'premium pill button radius');
  assert.ok(css.includes('-webkit-appearance: none'), 'native button appearance removed');
});

test('catalog bar has no duplicate search input — the header owns search', () => {
  const css = read('assets/css/components.css');
  const s = read('assets/js/ui/searchbar.js');
  const header = read('assets/js/ui/header.js');

  /* Native WebKit search cancel stays hidden for the (single) header input. */
  assert.ok(css.includes('input[type="search"]::-webkit-search-cancel-button'),
    'native WebKit search cancel hidden');
  /* The catalog bar no longer renders its own search box. */
  assert.ok(!s.includes('id="sf-input"'), 'catalog bar renders no duplicate search input');
  /* The header delegates the one global search to SearchBar. */
  assert.match(header, /SearchBar\.applyQuery/);
  /* An active search is surfaced in the catalog as a removable chip instead. */
  assert.match(s, /key:\s*'query'/);
  assert.match(s, /data-clear="all"/);
});

test('secondary filters (gender/house/price/scent) live behind one Filtrar panel', () => {
  const s = read('assets/js/ui/searchbar.js');
  /* One progressive-disclosure control opens the panel (shared mobile+desktop). */
  assert.ok(s.includes('id="sf-filter-btn"'), 'single Filtrar button present');
  /* Gender / house / price / mood pills live inside the drawer panel. */
  assert.match(s, /data-t="gender"/);
  assert.match(s, /_dp\('house'/);
  assert.match(s, /_dp\('price'/);
  assert.match(s, /_dp\('mood'/);
  /* Each active filter is individually removable via a chip. */
  assert.match(s, /key:\s*'gender'/);
  assert.match(s, /key:\s*'house'/);
  assert.match(s, /key:\s*'price'/);
});

/* ── D. Guided catalog: guidance arrives from its own page ────────
   The finder now lives at /elegir.html and the home's intent tiles deep-link
   into the catalog. Both hand a preset answer set to the SAME ranking engine,
   which re-ranks the grid in place — there is no separate results view. */

test('the catalog page accepts guidance from the URL and ranks in place', () => {
  const page = read('assets/js/pages/catalog.js');
  assert.ok(page.includes('readGuideFromQuery'), 'intent / answers are read from the URL');
  assert.ok(page.includes('SearchBar.applyGuide'), 'guidance re-ranks the grid in place');

  const s = read('assets/js/ui/searchbar.js');
  assert.ok(/applyGuide\(answers\)/.test(s), 'SearchBar exposes applyGuide for the finder ranking');
});

test('intents are one preset answer set shared by the tiles, the URL and the finder', async () => {
  const { getIntentAnswers, getIntentHref, readGuideFromQuery, buildCatalogUrl } =
    await import('../assets/js/catalog/intents.js');

  /* An intent is nothing but preset finder answers — never a second taxonomy. */
  assert.deepEqual(getIntentAnswers('noche'), { occasion: 'noche' });
  assert.deepEqual(getIntentAnswers('diario'), { occasion: 'dia' });

  /* "Para regalar" carries no scent signal of its own, so it must open the
     guided flow instead of pretending to filter. */
  assert.equal(getIntentAnswers('regalo'), null);
  assert.equal(getIntentHref('regalo'), '/elegir.html');
  assert.equal(getIntentHref('noche'), '/catalogo.html?intent=noche');

  /* The URL contract round-trips through the same answer shape. */
  assert.deepEqual(readGuideFromQuery('?intent=citas'), { occasion: 'cita' });
  assert.deepEqual(
    readGuideFromQuery('?family=fresco&occasion=dia&gender=hombre'),
    { family: 'fresco', occasion: 'dia', gender: 'hombre' },
  );
  assert.equal(readGuideFromQuery('?utm_source=ig'), null, 'unrelated params never fabricate guidance');
  assert.equal(readGuideFromQuery(''), null);

  assert.equal(
    buildCatalogUrl({ family: 'dulce', occasion: 'noche' }),
    '/catalogo.html?family=dulce&occasion=noche',
  );
  assert.equal(buildCatalogUrl({}), '/catalogo.html');
});

test('the home rail never advertises a sold-out product', async () => {
  const { selectBestsellers, BESTSELLER_LIMIT } =
    await import('../assets/js/ui/bestsellers.js');

  const list = [
    P('out', { stock: 0, featured: true }),
    P('live', { stock: 5, featured: true }),
    P('plain'),
  ];
  const picks = selectBestsellers(list).map(p => p.id);
  assert.ok(!picks.includes('out'), 'sold-out SKUs are excluded, not shown as dead cards');
  assert.equal(picks[0], 'live', 'the commercial order still applies to what remains');

  const many = Array.from({ length: 30 }, (_, i) => P(`p${i}`));
  assert.equal(selectBestsellers(many).length, BESTSELLER_LIMIT, 'the home caps at eight');
  assert.deepEqual(selectBestsellers(undefined), []);
});
