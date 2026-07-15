/* =============================================================
   Sellability enforcement — no discovery surface may ever feature a
   product the customer cannot buy (the live defect: a sold-out
   product headlining a mood collection).
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankProductsForMood } from '../assets/js/moods/engine.js';
import { buildRails } from '../assets/js/recommendations/index.js';

const variant = (size, price, stock) => ({
  size, price, stock, availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: 7000 + size,
});

const heat = (id, stock, extra = {}) => ({
  id, name: id, house: extra.house ?? 'House',
  notes: ['marino', 'citrico', 'menta'], badge: extra.badge ?? 'Disponible',
  desc: 'fresco limpio azul para calor y verano', story: 'fresco verano',
  featured: extra.featured ?? false,
  variants: [variant(5, 170, stock)],
  fragrance: {
    scent_family_normalized: 'fresh',
    style_tags: ['fresco', 'limpio'],
    mood_tags: ['fresco', 'limpio', 'cool'],
    recommended_context_tags: ['warm-weather', 'summer', 'daily'],
    accords: ['marine', 'citrus'],
    scores: { freshness: 90 },
  },
});

const heatMood = {
  slug: 'calor', title: 'Calor', match: {
    families: ['fresh'], moods: ['fresco', 'cool'],
    contexts: ['warm-weather', 'summer'], notes: ['marino', 'citrico'],
    legacyKey: 'tropical', scoreFloor: { freshness: 55 },
  },
};

test('mood ranking never returns a sold-out product', () => {
  const soldOut = heat('SoldOutHeat', 0, { featured: true }); // even featured must be dropped
  const inStock = heat('InStockHeat', 12);

  const ranked = rankProductsForMood([soldOut, inStock], heatMood, { limit: 12 });
  const ids = ranked.map(p => p.id);

  assert.ok(!ids.includes('SoldOutHeat'), 'sold-out product excluded from the collection');
  assert.equal(ids[0], 'InStockHeat', 'the first featured card is always purchasable');
});

test('rails never feature a sold-out product', () => {
  const soldOut = heat('SoldOutRail', 0, { badge: 'ULTIMAS UNIDADES' });
  const a = heat('RailA', 10);
  const b = heat('RailB', 8);
  const c = heat('RailC', 6);

  const rails = buildRails([soldOut, a, b, c]);
  const featuredIds = rails.flatMap(r => r.items.map(i => i.id));

  assert.ok(!featuredIds.includes('SoldOutRail'), 'sold-out product never appears in any rail');
  assert.ok(featuredIds.length > 0, 'sellable products still build rails');
});
