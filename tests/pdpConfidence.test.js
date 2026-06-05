import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getConfidenceBadge } from '../assets/js/ui/pdpConfidence.js';

/* ── Fixtures ─────────────────────────────────────────────────── */

const frag = (overrides = {}) => ({
  scent_family_normalized: 'aromatic',
  mood_tags: ['clean', 'confident'],
  recommended_context_tags: ['office', 'daily'],
  style_tags: ['modern'],
  scores: {
    freshness: 0.7, sweetness: 0.2, projection: 0.6,
    longevity: 0.75, versatility: 0.85,
  },
  ...overrides,
});

const product = (overrides = {}) => ({
  id: 'test',
  name: 'Test',
  house: 'Test House',
  notes: ['bergamota', 'cedro'],
  desc: 'fresco diario',
  badge: 'Disponible',
  featured: false,
  stock: 20,
  variants: [{ size: 3, price: 120, availability: 20, soldOut: false, available: true, variant_id: '1' }],
  fragrance: frag(),
  ...overrides,
});

/* ── getConfidenceBadge ──────────────────────────────────────────── */

test('getConfidenceBadge returns null when no strong signals', () => {
  const p = product({ fragrance: frag({ scores: { freshness: 0.5, sweetness: 0.3, projection: 0.4, longevity: 0.4, versatility: 0.4 } }) });
  assert.equal(getConfidenceBadge(p), null);
});

test('getConfidenceBadge returns "Muy solicitado" when badge signals high demand', () => {
  const p = product({ badge: 'Alta demanda' });
  const badge = getConfidenceBadge(p);
  assert.ok(badge !== null, 'badge present');
  assert.ok(badge.label.includes('solicitado') || badge.key === 'demand', 'demand badge returned');
});

test('getConfidenceBadge returns "De los más pedidos" when both demand and featured', () => {
  const p = product({ badge: 'Mas pedido', featured: true });
  const badge = getConfidenceBadge(p);
  assert.ok(badge !== null);
  assert.equal(badge.key, 'top');
});

test('getConfidenceBadge returns "Elección popular" when featured + versatile', () => {
  const p = product({ featured: true }); // fragrance has versatility 0.85 by default
  const badge = getConfidenceBadge(p);
  assert.ok(badge !== null);
  assert.ok(['popular', 'safe', 'beginner', 'top'].includes(badge.key));
});

test('getConfidenceBadge returns "Compra segura" for highly versatile product', () => {
  const p = product({
    fragrance: frag({ scores: { freshness: 0.6, sweetness: 0.2, projection: 0.5, longevity: 0.6, versatility: 0.90 } }),
  });
  const badge = getConfidenceBadge(p);
  assert.ok(badge !== null);
  assert.equal(badge.key, 'safe');
});

test('getConfidenceBadge returns null when fragrance is missing', () => {
  assert.equal(getConfidenceBadge(product({ fragrance: null })), null);
});

test('getConfidenceBadge returns null for null product', () => {
  assert.equal(getConfidenceBadge(null), null);
});

/* ── PDP integration: badge surfaces in the hero, no confidence block ─ */

test('buildProductPageHtml surfaces the confidence badge in the hero', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const sample = {
    id: 'ord-test', slug: 'ord-test', name: 'OrdTest', house: 'H',
    notes: ['bergamota'], desc: 'fresco diario', story: 'fresco diario',
    badge: 'Alta demanda', featured: true, stock: 20,
    variants: [{ id: 'v3', size: 3, price: 130, retail_price: 130, availability: 20, stock: 20, available: true, soldOut: false, sold_out: false, variant_id: '2', product_id: 'ord-test' }],
    fragrance: {
      canonical_name: 'O', aliases: [],
      scent_family_normalized: 'aromatic', mood_tags: ['clean'],
      recommended_context_tags: ['office', 'daily'], style_tags: ['modern'],
      accords: [], scores: { freshness: 0.7, sweetness: 0.2, projection: 0.6, longevity: 0.75, versatility: 0.85 },
    },
  };
  const html = buildProductPageHtml(sample);
  const i = s => html.indexOf(s);
  /* Badge lives in the hero, above the buy section. */
  assert.ok(html.includes('pdp-conf-badge'), 'badge element present');
  assert.ok(i('pdp-conf-badge') < i('id="pdp-buy"'), 'badge sits in the hero, before buy');
  /* The old standalone confidence layer is gone. */
  assert.ok(!html.includes('id="pdp-confidence"'), 'no standalone confidence section');
  assert.ok(!html.includes('pdp-conf-compare'), 'no choose/skip comparison block');
});

test('buildProductPageHtml shows a single value-prop line (no duplicate reassurance) when price is available', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const sample = {
    id: 'test-conf', slug: 'test-conf', name: 'TestConf', house: 'House',
    notes: ['bergamota'], desc: 'fresco diario', story: 'fresco diario',
    badge: 'Disponible', featured: false, stock: 20,
    variants: [
      { id: 'v3', size: 3, price: 120, retail_price: 120, availability: 20, stock: 20, available: true, soldOut: false, sold_out: false, variant_id: '1', product_id: 'test-conf' },
    ],
    fragrance: {
      canonical_name: 'Test', aliases: [],
      scent_family_normalized: 'aromatic', mood_tags: ['clean'],
      recommended_context_tags: ['office'], style_tags: ['modern'],
      accords: [], scores: { freshness: 0.7, sweetness: 0.2, projection: 0.6, longevity: 0.75, versatility: 0.85 },
    },
  };
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('pdp-value-prop'), 'value-prop line rendered');
  assert.ok(html.includes('pruébalo desde'), 'value-prop copy present');
  assert.ok(!html.includes('pdp-decant-reassurance'), 'duplicate reassurance line removed');
});
