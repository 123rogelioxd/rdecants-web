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
  getCatalogCapShown,
  getCatalogCapVisibility,
  getCatalogRenderProducts,
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

/* ── B. Renderer: compact cap + counter + tracking ───────────── */

test('render.js caps the mobile browse view and offers show more/less', () => {
  const r = read('assets/js/catalog/render.js');
  assert.match(r, /MOBILE_CATALOG_CAP\s*=\s*8/, 'cap constant is 8');
  assert.ok(r.includes('Ver más perfumes'), 'expand label present');
  assert.ok(r.includes('Mostrar menos'), 'collapse label present');
  assert.ok(r.includes('products-grid--capped'), 'cap class toggled');
  assert.match(r, /Mostrando \$\{shown\} de \$\{total\} perfumes/, 'counter present');
});

test('mobile collapsed catalog exposes only 8 visible cards', () => {
  const visible = getCatalogCapVisibility(36, { isMobile: true, expanded: false });
  assert.equal(visible.length, 8);
  assert.deepEqual(visible, [true, true, true, true, true, true, true, true]);
});

test('_renderGrid mobile browse mode renders only the first 8 cards', () => {
  const list = Array.from({ length: 36 }, (_, idx) => P(`p${idx + 1}`));
  const rendered = getCatalogRenderProducts(list, { isMobile: true, expanded: false });
  assert.equal(rendered.length, 8);
  assert.deepEqual(rendered.map(p => p.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
});

test('mobile collapsed counter matches visible cards', () => {
  const total = 36;
  const shown = getCatalogCapShown(total, { isMobile: true, expanded: false });
  const visibleCount = getCatalogCapVisibility(total, { isMobile: true, expanded: false }).filter(Boolean).length;
  assert.equal(shown, visibleCount);
  assert.equal(shown, 8);
});

test('expanding the mobile catalog shows every card', () => {
  const visible = getCatalogCapVisibility(36, { isMobile: true, expanded: true });
  assert.equal(visible.filter(Boolean).length, 36);
  assert.equal(getCatalogCapShown(36, { isMobile: true, expanded: true }), 36);
});

test('collapsing the mobile catalog returns to 8 cards', () => {
  const expanded = getCatalogCapVisibility(36, { isMobile: true, expanded: true });
  const collapsed = getCatalogCapVisibility(expanded.length, { isMobile: true, expanded: false });
  assert.equal(collapsed.filter(Boolean).length, 8);
});

test('search disables the mobile cap', () => {
  const visible = getCatalogCapVisibility(20, { isMobile: true, filtersActive: true });
  assert.equal(visible.length, 20);
  assert.equal(getCatalogCapShown(20, { isMobile: true, filtersActive: true }), 20);
});

test('filter disables the mobile cap', () => {
  const visible = getCatalogCapVisibility(14, { isMobile: true, filtersActive: true });
  assert.equal(visible.length, 14);
});

test('catalog fallback normalizes empty or invalid product lists safely', () => {
  assert.deepEqual(normalizeCatalogProducts(undefined), []);
  assert.deepEqual(normalizeCatalogProducts(null), []);
  assert.deepEqual(normalizeCatalogProducts([P('p1'), null, undefined, P('p2')]).map(p => p.id), ['p1', 'p2']);
  assert.deepEqual(getCatalogRenderProducts(undefined, { isMobile: true, expanded: true }), []);
});

test('search results render without the compact limit', () => {
  const list = Array.from({ length: 20 }, (_, idx) => P(`search-${idx + 1}`));
  const rendered = getCatalogRenderProducts(list, {
    isMobile: true,
    filtersActive: true,
    expanded: false,
  });
  assert.equal(rendered.length, 20);
});

test('filtered results render without the compact limit', () => {
  const list = Array.from({ length: 14 }, (_, idx) => P(`filter-${idx + 1}`));
  const rendered = getCatalogRenderProducts(list, {
    isMobile: true,
    filtersActive: true,
    expanded: false,
  });
  assert.equal(rendered.length, 14);
});

test('desktop catalog always shows every card', () => {
  const visible = getCatalogCapVisibility(36, { isMobile: false, expanded: false });
  assert.equal(visible.length, 36);
  assert.equal(getCatalogCapShown(36, { isMobile: false, expanded: false }), 36);
});

test('render.js disables the cap whenever a filter/search is active', () => {
  const r = read('assets/js/catalog/render.js');
  assert.ok(r.includes('SearchBar.hasActiveFilters'), 'cap is gated on active filters');
});

test('render.js emits catalog_expanded / catalog_collapsed', () => {
  const r = read('assets/js/catalog/render.js');
  assert.ok(r.includes('Tracker.catalogExpanded'), 'expand tracked');
  assert.ok(r.includes('Tracker.catalogCollapsed'), 'collapse tracked');
});

test('tracker exposes the catalog expand/collapse events + methods', () => {
  const t = read('assets/js/tracking/tracker.js');
  assert.ok(t.includes("CATALOG_EXPANDED:      'catalog_expanded'"), 'expanded event');
  assert.ok(t.includes("CATALOG_COLLAPSED:     'catalog_collapsed'"), 'collapsed event');
  assert.ok(/catalogExpanded\(total, visibleBefore\)/.test(t), 'expanded method');
  assert.ok(/catalogCollapsed\(total\)/.test(t), 'collapsed method');
});

test('SearchBar exposes hasActiveFilters() reusing its private check', () => {
  const s = read('assets/js/ui/searchbar.js');
  assert.ok(/hasActiveFilters\(\)\s*\{[\s\S]*?_hasActiveFilters\(\)/.test(s),
    'public hasActiveFilters delegates to existing logic');
});

/* ── C. CSS: cap is mobile-only, desktop unaffected ──────────── */

test('compact catalog does not rely on nth-child CSS hiding', () => {
  const css = read('assets/css/components.css');
  assert.ok(!/\.products-grid\.products-grid--capped > \.product-card:nth-of-type\(n \+ 9\)/.test(css),
    'rendered catalog cards are not hidden by old mobile nth-child rules');
  assert.ok(css.includes('.products-grid > .product-card[hidden]'), 'explicit hidden attributes are still respected');
  assert.ok(/\.catalog-more\s*\{\s*display:\s*none;/.test(css),
    '"Ver más" control hidden by default (desktop)');
  assert.ok(css.includes('.catalog-more-btn'), 'show-more button styled');
  assert.ok(css.includes('.catalog-more-count'), 'counter styled');
});

test('catalog cards render visible by default instead of waiting on IntersectionObserver', () => {
  const r = read('assets/js/catalog/render.js');
  assert.match(r, /card\.className\s*=\s*'product-card product-card--clickable fade-up visible'/,
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

test('search input hides native clear control and keeps custom clear button', () => {
  const css = read('assets/css/components.css');
  const s = read('assets/js/ui/searchbar.js');

  assert.ok(css.includes('input[type="search"]::-webkit-search-cancel-button'),
    'native WebKit search cancel hidden');
  assert.ok(css.includes('appearance: none'), 'native search/button appearance removed');
  assert.ok(s.includes('type="search"'), 'main search input remains type=search');
  assert.ok(s.includes('class="sf-x" id="sf-x"'), 'custom clear button remains');
  assert.ok(s.includes('aria-label="Limpiar'), 'custom clear button remains accessible');
});

test('gender quick-chips stay visible (scrollable) on mobile instead of display:none', () => {
  const css = read('assets/css/components.css');
  const start = css.indexOf('.sf-row-gender {');
  assert.ok(start > -1, 'gender row rule present');
  /* the old "drawer handles mobile" display:none rule must be gone */
  assert.ok(!/\.sf-row-gender \{ display: none; \}/.test(css),
    'gender row no longer hidden on mobile');
});

/* ── D. Catalog still leads into the recommendation sections ──── */

test('Assistant remains reachable right after the catalog', () => {
  const html = read('index.html');
  const catalog = html.indexOf('id="catalog"');
  const assistant = html.indexOf('id="assistant"');
  assert.ok(catalog > -1 && assistant > -1, 'both sections present');
  assert.ok(catalog < assistant, 'assistant follows the catalog');
});
