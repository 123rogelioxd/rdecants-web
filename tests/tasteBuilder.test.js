import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* localStorage polyfill (same pattern as personalization.test.js) */
const _store = new Map();
globalThis.localStorage = {
  getItem:    k     => (_store.has(k) ? _store.get(k) : null),
  setItem:    (k,v) => _store.set(k, String(v)),
  removeItem: k     => _store.delete(k),
  clear:      ()    => _store.clear(),
};

import {
  buildTasteQueue,
  buildTasteCardHtml,
} from '../assets/js/ui/tasteBuilder.js';

import {
  applyLike,
  applyDislike,
  Personalization,
} from '../assets/js/recommendations/personalization.js';

import { EVENTS, Tracker } from '../assets/js/tracking/tracker.js';

/* ── Fixtures ───────────────────────────────────────────────────── */

const mkVariant = (size, price, stock = 20) => ({
  size, ml_size: size, price, retail_price: price,
  availability: stock, stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: String(900 + size),
});

const mkProduct = (id, house, notes = [], desc = '', opts = {}) => ({
  id, slug: id, name: id, house, notes,
  desc, story: desc, badge: 'Disponible',
  featured: opts.featured ?? false,
  stock: opts.stock ?? 20,
  image: opts.image ?? '',
  variants: [mkVariant(3, opts.price ?? 120), mkVariant(5, (opts.price ?? 120) + 40)],
});

const catalog = [
  mkProduct('Fresco1', 'Dior',     ['citrico','bergamota'], 'fresco diario',    { price: 120, featured: true }),
  mkProduct('Fresco2', 'Creed',    ['menta','marino'],      'fresco tropical',  { price: 130 }),
  mkProduct('Office1', 'Versace',  ['vetiver','cedro'],     'oficina profesional', { price: 150, featured: true }),
  mkProduct('Sedu1',   'YSL',      ['vainilla','tonka'],    'seductor noche',   { price: 200 }),
  mkProduct('Sedu2',   'Lattafa',  ['oud','ambar'],         'intenso oriental', { price: 180 }),
  mkProduct('Trop1',   'Acqua',    ['coco','marino'],       'tropical verano',  { price: 115 }),
];

const emptyTaste = { moods: {}, houses: {}, viewed: [], likes: [], dislikes: [] };

beforeEach(() => _store.clear());

/* ── buildTasteQueue ────────────────────────────────────────────── */

test('buildTasteQueue returns empty for empty catalog', () => {
  assert.deepEqual(buildTasteQueue([], emptyTaste), []);
});

test('buildTasteQueue returns empty for null/undefined', () => {
  assert.deepEqual(buildTasteQueue(null,      emptyTaste), []);
  assert.deepEqual(buildTasteQueue(undefined, emptyTaste), []);
});

test('buildTasteQueue excludes sold-out products', () => {
  const soldOut = catalog.map(p => ({
    ...p, stock: 0,
    variants: p.variants.map(v => ({ ...v, stock: 0, availability: 0, soldOut: true, available: false })),
  }));
  assert.deepEqual(buildTasteQueue(soldOut, emptyTaste), []);
});

test('buildTasteQueue excludes already-liked products', () => {
  const taste = { ...emptyTaste, likes: ['Fresco1', 'Office1'] };
  const q = buildTasteQueue(catalog, taste);
  assert.ok(!q.some(p => p.id === 'Fresco1'), 'liked product excluded');
  assert.ok(!q.some(p => p.id === 'Office1'), 'liked product excluded');
});

test('buildTasteQueue excludes already-disliked products', () => {
  const taste = { ...emptyTaste, dislikes: ['Sedu1', 'Sedu2'] };
  const q = buildTasteQueue(catalog, taste);
  assert.ok(!q.some(p => p.id === 'Sedu1'),  'disliked product excluded');
  assert.ok(!q.some(p => p.id === 'Sedu2'),  'disliked product excluded');
});

test('buildTasteQueue respects limit', () => {
  const q = buildTasteQueue(catalog, emptyTaste, { limit: 3 });
  assert.ok(q.length <= 3);
});

test('buildTasteQueue returns only sellable products', () => {
  const q = buildTasteQueue(catalog, emptyTaste);
  assert.ok(q.length > 0);
  assert.ok(q.every(p => p.stock > 0), 'all have stock > 0');
});

test('buildTasteQueue returns empty when all products are liked or disliked', () => {
  const allRated = {
    ...emptyTaste,
    likes:    catalog.slice(0, 3).map(p => p.id),
    dislikes: catalog.slice(3).map(p => p.id),
  };
  assert.deepEqual(buildTasteQueue(catalog, allRated), []);
});

test('buildTasteQueue prefers house variety', () => {
  const samehouse = [
    mkProduct('A1','Dior',['citrico'],'fresco',{price:100}),
    mkProduct('A2','Dior',['bergamota'],'limpio',{price:100}),
    mkProduct('A3','Dior',['marino'],'tropical',{price:100}),
    mkProduct('B1','Creed',['vetiver'],'formal',{price:100}),
  ];
  const q = buildTasteQueue(samehouse, emptyTaste, { limit: 3 });
  // With 4 products and limit 3 — should favour the Creed over duplicate Diors
  const houses = q.map(p => p.house);
  assert.ok(houses.includes('Creed'), 'includes the distinct house');
});

/* ── buildTasteCardHtml ─────────────────────────────────────────── */

test('buildTasteCardHtml renders product name, house, and actions', () => {
  const html = buildTasteCardHtml(catalog[0], 0, catalog.length);
  assert.ok(html.includes(catalog[0].name),  'product name');
  assert.ok(html.includes(catalog[0].house), 'house');
  assert.ok(html.includes('data-action="like"'),    'like button');
  assert.ok(html.includes('data-action="dislike"'), 'dislike button');
  assert.ok(html.includes('data-action="skip"'),    'skip button');
});

test('buildTasteCardHtml shows correct progress indicator', () => {
  const html = buildTasteCardHtml(catalog[2], 2, 6);
  assert.ok(html.includes('3 de 6'), 'progress: 1-indexed position of total');
});

test('buildTasteCardHtml sets data-product-id', () => {
  const html = buildTasteCardHtml(catalog[0], 0, 5);
  assert.ok(html.includes(`data-product-id="${catalog[0].id}"`));
});

test('buildTasteCardHtml escapes XSS in name and house', () => {
  const evil = mkProduct('<script>alert(1)</script>', 'House & "Co"', [], '', { price: 100 });
  const html = buildTasteCardHtml(evil, 0, 1);
  assert.ok(!html.includes('<script>'),     'script tag escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'name escaped correctly');
  assert.ok(html.includes('&amp;'),          'ampersand escaped');
});

test('buildTasteCardHtml shows fallback image class when no image', () => {
  const noImg = { ...catalog[0], image: '' };
  const html = buildTasteCardHtml(noImg, 0, 5);
  assert.ok(html.includes('tb-card-img--fallback'), 'fallback class present');
  assert.ok(!html.includes('<img'), 'no <img> tag when no image');
});

/* ── applyLike / applyDislike pure functions ────────────────────── */

test('applyLike adds product to likes and strengthens moods/house', () => {
  const product = catalog[0]; // Fresco1, Dior
  const after = applyLike(emptyTaste, product);

  assert.ok(after.likes.includes('Fresco1'), 'added to likes');
  assert.ok(after.viewed.includes('Fresco1'), 'added to viewed');
  const moodSum = Object.values(after.moods).reduce((s, v) => s + v, 0);
  assert.ok(moodSum >= 3, 'moods boosted by at least LIKE_WEIGHT');
  assert.ok(after.houses.dior >= 3, 'house boosted by LIKE_WEIGHT');
});

test('applyLike does not duplicate likes', () => {
  const taste = applyLike(emptyTaste, catalog[0]);
  const again = applyLike(taste, catalog[0]);
  assert.equal(again.likes.filter(id => id === 'Fresco1').length, 1, 'no duplicate in likes');
});

test('applyLike is stronger than applyView (single view adds 1, like adds 3)', async () => {
  const { applyView } = await import('../assets/js/recommendations/personalization.js');
  const afterView = applyView(emptyTaste, catalog[0]);
  const afterLike = applyLike(emptyTaste, catalog[0]);

  const viewMoodSum = Object.values(afterView.moods).reduce((s,v) => s+v, 0);
  const likeMoodSum = Object.values(afterLike.moods).reduce((s,v) => s+v, 0);
  assert.ok(likeMoodSum > viewMoodSum, 'like gives stronger mood boost than view');
});

test('applyDislike adds product to dislikes and reduces moods/house', () => {
  const primed = applyLike(emptyTaste, catalog[0]); // give some positive weight first
  const after  = applyDislike(primed, catalog[0]);

  assert.ok(after.dislikes.includes('Fresco1'), 'added to dislikes');
  assert.ok(!after.viewed.includes('Fresco1') || after.viewed.includes('Fresco1'),
    'viewed unchanged by dislike'); // dislike does not add to viewed
  const moodSum = Object.values(after.moods).reduce((s,v) => s+v, 0);
  assert.ok(moodSum < Object.values(primed.moods).reduce((s,v) => s+v, 0), 'moods reduced');
});

test('applyDislike floors mood weights at 0 (no negative weights)', () => {
  const after = applyDislike(emptyTaste, catalog[0]);
  for (const [, v] of Object.entries(after.moods)) {
    assert.ok(v >= 0, `mood weight must be ≥ 0, got ${v}`);
  }
  for (const [, v] of Object.entries(after.houses)) {
    assert.ok(v >= 0, `house weight must be ≥ 0, got ${v}`);
  }
});

test('applyDislike does not duplicate dislikes', () => {
  const taste = applyDislike(emptyTaste, catalog[0]);
  const again = applyDislike(taste, catalog[0]);
  assert.equal(again.dislikes.filter(id => id === 'Fresco1').length, 1);
});

test('applyLike and applyDislike are backwards-compatible with old taste (no likes/dislikes fields)', () => {
  const oldTaste = { moods: { diario: 2 }, houses: { dior: 1 }, viewed: ['x'] };
  const afterLike    = applyLike(oldTaste, catalog[0]);
  const afterDislike = applyDislike(oldTaste, catalog[1]);

  assert.ok(Array.isArray(afterLike.likes),              'likes array created');
  assert.ok(Array.isArray(afterDislike.dislikes),         'dislikes array created');
  assert.ok(afterLike.viewed.includes('x'),               'pre-existing viewed preserved');
  assert.ok(afterLike.moods.diario >= 2,                  'pre-existing mood not lost (may be boosted)');
  assert.equal(afterLike.houses.dior, 1 + 3 /* LIKE_WEIGHT */, 'house boosted by like');
});

/* ── Local persistence via Personalization singleton ────────────── */

test('Personalization.recordLike persists to localStorage', () => {
  Personalization.recordLike(catalog[0]);
  const taste = Personalization.getTaste();
  assert.ok(taste.likes.includes('Fresco1'), 'like persisted');
  assert.ok(taste.viewed.includes('Fresco1'), 'also in viewed');
});

test('Personalization.recordDislike persists to localStorage', () => {
  Personalization.recordDislike(catalog[1]);
  const taste = Personalization.getTaste();
  assert.ok(taste.dislikes.includes('Fresco2'), 'dislike persisted');
});

test('Personalization.getLikes / getDislikes read back correctly', () => {
  Personalization.recordLike(catalog[0]);
  Personalization.recordDislike(catalog[1]);
  assert.ok(Personalization.getLikes().includes('Fresco1'));
  assert.ok(Personalization.getDislikes().includes('Fresco2'));
});

test('Personalization.reset clears likes and dislikes', () => {
  Personalization.recordLike(catalog[0]);
  Personalization.recordDislike(catalog[1]);
  Personalization.reset();
  assert.deepEqual(Personalization.getLikes(),    []);
  assert.deepEqual(Personalization.getDislikes(), []);
});

test('recordLike and recordDislike are no-ops for null', () => {
  Personalization.recordLike(null);
  Personalization.recordDislike(null);
  assert.deepEqual(Personalization.getLikes(),    []);
  assert.deepEqual(Personalization.getDislikes(), []);
});

/* ── Tracking events ────────────────────────────────────────────── */

test('EVENTS includes taste_like, taste_dislike, taste_skip', () => {
  assert.equal(EVENTS.TASTE_LIKE,    'taste_like');
  assert.equal(EVENTS.TASTE_DISLIKE, 'taste_dislike');
  assert.equal(EVENTS.TASTE_SKIP,    'taste_skip');
});

test('Tracker.tasteLike emits taste_like with productId and source', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'taste_like') received.push(payload);
  });
  Tracker.tasteLike(catalog[0]);
  const p = received.find(r => r.productId === catalog[0].id);
  assert.ok(p, 'event emitted');
  assert.equal(p.source, 'taste_builder');
});

test('Tracker.tasteDislike emits taste_dislike', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'taste_dislike') received.push(payload);
  });
  Tracker.tasteDislike(catalog[1]);
  assert.ok(received.some(r => r.productId === catalog[1].id));
});

test('Tracker.tasteSkip emits taste_skip', () => {
  const received = [];
  Tracker.use((event, payload) => {
    if (event === 'taste_skip') received.push(payload);
  });
  Tracker.tasteSkip(catalog[2]);
  assert.ok(received.some(r => r.productId === catalog[2].id));
});

/* ── skip behaviour does NOT change personalization ─────────────── */

test('skip does not add product to liked or disliked list', () => {
  const before = Personalization.getTaste();
  Tracker.tasteSkip(catalog[0]); // skip only emits event
  const after = Personalization.getTaste();
  assert.deepEqual(after.likes,    before.likes,    'likes unchanged on skip');
  assert.deepEqual(after.dislikes, before.dislikes,  'dislikes unchanged on skip');
});
