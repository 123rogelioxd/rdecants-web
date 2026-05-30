import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVERY_SET_TEMPLATES,
  resolveDiscoverySets,
  buildDiscoverySetsHtml,
} from '../assets/js/ui/discoverySets.js';

import { EVENTS, Tracker, shouldEmitEvent } from '../assets/js/tracking/tracker.js';

/* ── Shared test fixtures ───────────────────────────────────────── */

const variant = (size, price, stock = 20) => ({
  size, ml_size: size, price, retail_price: price,
  availability: stock, stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: String(900 + size),
});

const product = (id, house, notes, desc, opts = {}) => ({
  id, slug: id, name: id, house, notes,
  desc, story: desc, badge: 'Disponible',
  featured: opts.featured ?? false,
  stock: opts.stock ?? 20,
  variants: [
    variant(3, opts.price3 ?? opts.price ?? 120),
    variant(5, opts.price5 ?? (opts.price ? opts.price + 40 : 160)),
  ],
});

/* Catalog large enough that most templates can resolve to ≥2 products */
const catalog = [
  product('Fresco1', 'Dior',    ['citrico','bergamota','mineral'], 'fresco limpio diario verano acuatico', { price: 120 }),
  product('Fresco2', 'Creed',   ['menta','citrico','marino'],      'fresco diario tropical acuatico',      { price: 130 }),
  product('Fresco3', 'BDC',     ['bergamota','cedro','lavanda'],   'fresco diario oficina discreto',       { price: 110 }),
  product('Office1', 'Versace', ['vetiver','cedro','iris'],        'oficina trabajo profesional sobrio',   { price: 150 }),
  product('Office2', 'Armani',  ['salvia','bergamota','cedro'],    'formal oficina discreto limpio',       { price: 140 }),
  product('Sedu1',   'YSL',     ['vainilla','tonka','cuero'],      'seductor cita noche sensual',          { price: 200, featured: true }),
  product('Sedu2',   'Lattafa', ['oud','ambar','especias'],        'seductor noche intenso misterioso',    { price: 180 }),
  product('Fiesta1', 'Paco',    ['vainilla','miel','caramelo'],    'dulce noche fiesta rastro salidas',    { price: 170 }),
  product('Fiesta2', 'Givenchy',['ron','tonka','canela'],          'dulce nocturno fiesta antro',          { price: 160 }),
  product('Trop1',   'Acqua',   ['coco','pina','citrico'],         'tropical verano playa calor fresco',   { price: 115 }),
  product('Trop2',   'Davidoff',['marino','mineral','menta'],      'tropical verano fresco acuatico',      { price: 105 }),
  product('Best1',   'BDC',     ['bergamota','ambroxan'],          'versatil atemporal clasico popular',   { price: 190, featured: true, stock: 50 }),
  product('Best2',   'Sauvage', ['pimienta','bergamota'],          'popular diario versatil',              { price: 175, featured: true, stock: 40 }),
];

/* ── resolveDiscoverySets — pure logic ─────────────────────────── */

test('resolveDiscoverySets returns empty for empty catalog', () => {
  assert.deepEqual(resolveDiscoverySets([]), []);
});

test('resolveDiscoverySets returns empty for null/undefined', () => {
  assert.deepEqual(resolveDiscoverySets(null), []);
  assert.deepEqual(resolveDiscoverySets(undefined), []);
});

test('resolveDiscoverySets excludes sold-out products from all sets', () => {
  const allSoldOut = catalog.map(p => ({
    ...p,
    stock: 0,
    variants: p.variants.map(v => ({ ...v, stock: 0, availability: 0, soldOut: true, available: false })),
  }));
  assert.deepEqual(resolveDiscoverySets(allSoldOut), []);
});

test('resolveDiscoverySets resolves themed sets from catalog', () => {
  const sets = resolveDiscoverySets(catalog);
  assert.ok(sets.length >= 2, 'at least 2 sets should resolve with a diverse catalog');
  for (const set of sets) {
    assert.ok(set.products.length >= 2, `${set.id}: set needs ≥2 products`);
    assert.ok(set.products.length <= 3, `${set.id}: set capped at 3`);
    assert.ok(typeof set.id === 'string' && set.id.length > 0, 'set has id');
    assert.ok(typeof set.name === 'string' && set.name.length > 0, 'set has name');
    assert.ok(typeof set.copy === 'string' && set.copy.length > 0, 'set has copy');
    assert.ok(typeof set.total === 'number', 'set has numeric total');
    assert.equal(set.itemSize, 3, 'item size is always 3ml');
  }
});

test('resolveDiscoverySets computes total as sum of 3ml prices', () => {
  const sets = resolveDiscoverySets(catalog);
  for (const set of sets) {
    const expectedTotal = set.products.reduce((sum, p) => {
      const v = p.variants.find(v => v.size === 3);
      return sum + (v?.price ?? 0);
    }, 0);
    assert.equal(set.total, expectedTotal, `${set.id}: total = sum of 3ml prices`);
  }
});

test('resolveDiscoverySets includes a bestsellers set resolved by operational score', () => {
  const sets = resolveDiscoverySets(catalog);
  const bs = sets.find(s => s.id === 'bestsellers');
  assert.ok(bs, 'bestsellers set exists');
  assert.ok(bs.products.some(p => p.featured), 'bestsellers prefers featured products');
});

test('resolveDiscoverySets respects limit option', () => {
  const sets = resolveDiscoverySets(catalog, { limit: 2 });
  assert.ok(sets.length <= 2);
});

test('resolveDiscoverySets returns fewer sets when catalog is too thin', () => {
  const tiny = catalog.slice(0, 3); // only 3 products — many themed sets won't get ≥2 matches
  const sets = resolveDiscoverySets(tiny);
  // Don't assert a specific count — just that it doesn't crash and every set has ≥2 products
  for (const set of sets) {
    assert.ok(set.products.length >= 2, `${set.id}: still ≥2 products`);
  }
});

test('DISCOVERY_SET_TEMPLATES has 6 sets, each with required fields', () => {
  assert.equal(DISCOVERY_SET_TEMPLATES.length, 6);
  for (const t of DISCOVERY_SET_TEMPLATES) {
    assert.ok(t.id, 'template has id');
    assert.ok(t.name, 'template has name');
    assert.ok(t.copy, 'template has copy');
    assert.ok(t.bestsellers || ((t.families ?? []).length + (t.useCases ?? []).length) > 0,
      `${t.id}: themed template has families or useCases`);
  }
});

/* ── buildDiscoverySetsHtml — pure rendering ────────────────────── */

test('buildDiscoverySetsHtml returns empty string for empty array', () => {
  assert.equal(buildDiscoverySetsHtml([]), '');
});

test('buildDiscoverySetsHtml renders set name, copy, products, price and CTA', () => {
  const sets = resolveDiscoverySets(catalog).slice(0, 1);
  assert.ok(sets.length, 'need at least one set');
  const [set] = sets;
  const html = buildDiscoverySetsHtml([set]);

  assert.ok(html.includes(set.name), 'set name in HTML');
  assert.ok(html.includes(set.theme), 'theme label in HTML');
  assert.ok(html.includes(set.copy), 'copy in HTML');
  assert.ok(html.includes('ds-card-add'), 'CTA button present');
  assert.ok(html.includes('Probar los 3'), 'CTA text present');
  assert.ok(html.includes('3 decants · 3ml c/u'), 'size/quantity label');
  assert.ok(html.includes(`data-set-id="${set.id}"`), 'set-id wired on card and button');

  for (const p of set.products) {
    assert.ok(html.includes(p.name), `product name "${p.name}" in HTML`);
    assert.ok(html.includes(p.house), `house "${p.house}" in HTML`);
  }
});

test('buildDiscoverySetsHtml wraps multiple sets in a ds-grid', () => {
  const sets = resolveDiscoverySets(catalog).slice(0, 3);
  const html = buildDiscoverySetsHtml(sets);
  assert.ok(html.includes('class="ds-grid"'), 'grid wrapper present');
  const cardCount = (html.match(/class="ds-card"/g) ?? []).length;
  assert.equal(cardCount, sets.length, 'one card per set');
});

test('buildDiscoverySetsHtml escapes product names and houses', () => {
  const xssSet = {
    id: 'xss-test',
    name: 'Set <script>',
    theme: 'Theme & "quotes"',
    copy: 'Copy & copy',
    products: [
      { id: 'x1', name: '<b>Bold</b>', house: 'House & Co', variants: [{ size: 3, price: 100 }] },
    ],
    total: 100,
    itemSize: 3,
  };
  const html = buildDiscoverySetsHtml([xssSet]);
  assert.ok(!html.includes('<script>'), 'script tag escaped');
  assert.ok(!html.includes('<b>Bold</b>'), 'HTML tags in name escaped');
  assert.ok(html.includes('&lt;b&gt;'), 'name HTML-escaped correctly');
  assert.ok(html.includes('&amp;'), 'ampersand escaped');
});

/* ── Tracking ───────────────────────────────────────────────────── */

test('EVENTS includes the three discovery_set_* constants', () => {
  assert.equal(EVENTS.DISCOVERY_SET_VIEWED,  'discovery_set_viewed');
  assert.equal(EVENTS.DISCOVERY_SET_CLICKED, 'discovery_set_clicked');
  assert.equal(EVENTS.DISCOVERY_SET_ADDED,   'discovery_set_added');
});

test('Tracker.discoverySetViewed emits discovery_set_viewed with setId and ids', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'discovery_set_viewed') received.push(payload);
  });

  const set = resolveDiscoverySets(catalog)[0];
  Tracker.discoverySetViewed(set);

  assert.ok(received.length >= 1, 'event emitted');
  const p = received[0];
  assert.equal(p.setId, set.id);
  assert.equal(p.name, set.name);
  assert.ok(Array.isArray(p.ids), 'ids array present');
  assert.equal(p.ids.length, set.products.length);
  assert.equal(typeof p.total, 'number');
});

test('Tracker.discoverySetClicked emits discovery_set_clicked with source', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'discovery_set_clicked') received.push(payload);
  });

  const set = resolveDiscoverySets(catalog)[0];
  Tracker.discoverySetClicked(set, 'card');

  const p = received.find(x => x.setId === set.id);
  assert.ok(p, 'event emitted for correct set');
  assert.equal(p.source, 'card');
});

test('Tracker.discoverySetAdded emits discovery_set_added', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'discovery_set_added') received.push(payload);
  });

  const set = resolveDiscoverySets(catalog)[0];
  Tracker.discoverySetAdded(set);

  const p = received.find(x => x.setId === set.id);
  assert.ok(p, 'event emitted');
  assert.deepEqual(p.ids, set.products.map(pr => pr.id));
});

test('discovery_set_viewed uses long dedupe window (view-like event)', () => {
  const recent = new Map();
  const payload = { setId: 'frescos', ids: ['a','b','c'] };
  // first emission: allowed
  assert.ok(shouldEmitEvent('discovery_set_viewed', payload, 1000, recent));
  // immediate repeat: suppressed
  assert.ok(!shouldEmitEvent('discovery_set_viewed', payload, 2000, recent));
  // different setId: allowed (distinct key)
  assert.ok(shouldEmitEvent('discovery_set_viewed', { setId: 'oficina', ids: [] }, 2000, recent));
});

test('discovery_set_viewed and discovery_set_clicked are distinct dedupe keys', () => {
  const recent = new Map();
  const payload = { setId: 'frescos' };
  assert.ok(shouldEmitEvent('discovery_set_viewed', payload, 1000, recent));
  // viewed is now suppressed (view window), but clicked is a different key
  assert.ok(shouldEmitEvent('discovery_set_clicked', payload, 1500, recent));
});
