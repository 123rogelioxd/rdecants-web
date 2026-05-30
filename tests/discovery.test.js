import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAnchorProducts, getDiscoveryRecommendations } from '../assets/js/recommendations/discovery.js';

/* ── Fixtures ─────────────────────────────────────────────── */
const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});

const mkProduct = (id, notes = ['marino'], opts = {}) => ({
  id,
  name: `Fragrance ${id}`,
  house: opts.house ?? 'House A',
  desc:  opts.desc  ?? 'fresco limpio test',
  story: opts.story ?? 'fresco limpio test story',
  notes,
  badge:    opts.badge    ?? 'Disponible',
  featured: opts.featured ?? false,
  fragrance: opts.fragrance ?? null,
  variants: [variant(5, 180, opts.stock ?? 10)],
});

const soldOut  = (id, notes = ['marino']) => mkProduct(id, notes, { stock: 0 });
const featured = (id, notes = ['marino']) => mkProduct(id, notes, { featured: true, stock: 10 });

/* ── getAnchorProducts ────────────────────────────────────── */

test('getAnchorProducts returns empty array for empty catalog', () => {
  assert.deepEqual(getAnchorProducts([]), []);
});

test('getAnchorProducts is defensive against null / undefined', () => {
  assert.deepEqual(getAnchorProducts(null),      []);
  assert.deepEqual(getAnchorProducts(undefined), []);
});

test('getAnchorProducts excludes sold-out products', () => {
  const catalog = [soldOut('A'), soldOut('B'), mkProduct('C', ['citrico'])];
  const anchors = getAnchorProducts(catalog);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].id, 'C');
});

test('getAnchorProducts returns empty when all products are sold out', () => {
  assert.deepEqual(getAnchorProducts([soldOut('A'), soldOut('B')]), []);
});

test('getAnchorProducts respects the limit', () => {
  const catalog = Array.from({ length: 10 }, (_, i) => mkProduct(`p${i}`));
  assert.equal(getAnchorProducts(catalog, { limit: 3 }).length, 3);
  assert.equal(getAnchorProducts(catalog, { limit: 1 }).length, 1);
});

test('getAnchorProducts never exceeds actual catalog size', () => {
  const catalog = [mkProduct('A'), mkProduct('B')];
  assert.equal(getAnchorProducts(catalog, { limit: 10 }).length, 2);
});

test('getAnchorProducts surfaces featured products first', () => {
  const plain = mkProduct('plain', ['marino'], { featured: false });
  const feat  = featured('feat', ['marino']);
  assert.equal(getAnchorProducts([plain, feat])[0].id, 'feat');
});

/* ── getDiscoveryRecommendations ──────────────────────────── */

test('getDiscoveryRecommendations returns empty for null / undefined anchor', () => {
  const catalog = [mkProduct('A'), mkProduct('B')];
  assert.deepEqual(getDiscoveryRecommendations(null,      catalog), []);
  assert.deepEqual(getDiscoveryRecommendations(undefined, catalog), []);
});

test('getDiscoveryRecommendations returns empty for empty or null catalog', () => {
  const anchor = mkProduct('anchor', ['marino', 'citrico']);
  assert.deepEqual(getDiscoveryRecommendations(anchor, []),   []);
  assert.deepEqual(getDiscoveryRecommendations(anchor, null), []);
});

test('getDiscoveryRecommendations never returns the anchor itself', () => {
  const anchor = mkProduct('anchor', ['marino', 'citrico']);
  const other  = mkProduct('other',  ['marino', 'citrico']);
  const recs   = getDiscoveryRecommendations(anchor, [anchor, other]);
  assert.ok(!recs.map(p => p.id).includes('anchor'),
    'anchor must not appear in its own recommendations');
});

test('getDiscoveryRecommendations excludes sold-out products', () => {
  const anchor = mkProduct('anchor', ['marino', 'citrico']);
  const out    = soldOut('sold', ['marino', 'citrico']);
  const avail  = mkProduct('avail', ['marino', 'citrico']);
  const recs   = getDiscoveryRecommendations(anchor, [anchor, out, avail]);
  assert.ok(!recs.map(p => p.id).includes('sold'),
    'sold-out product must be excluded');
});

test('getDiscoveryRecommendations respects the limit', () => {
  const anchor = mkProduct('anchor', ['marino', 'citrico', 'vetiver']);
  const others = Array.from({ length: 10 }, (_, i) =>
    mkProduct(`p${i}`, ['marino', 'citrico']));
  const recs = getDiscoveryRecommendations(anchor, [anchor, ...others], { limit: 3 });
  assert.ok(recs.length <= 3, `expected ≤ 3 but got ${recs.length}`);
});

test('getDiscoveryRecommendations surfaces same-house products first', () => {
  const anchor    = mkProduct('anchor',   ['marino'], { house: 'CHANEL' });
  const sameHouse = mkProduct('same',     ['vainilla'], { house: 'CHANEL' });
  const diffHouse = mkProduct('diff',     ['oud', 'tabaco'], { house: 'OTHER' });
  const recs = getDiscoveryRecommendations(anchor, [anchor, sameHouse, diffHouse]);
  if (recs.length > 0) {
    assert.equal(recs[0].id, 'same',
      'product from same house should rank first due to SAME_HOUSE_WEIGHT');
  }
});
