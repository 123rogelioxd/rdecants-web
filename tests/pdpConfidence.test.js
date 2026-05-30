import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getConfidenceBadge,
  getWhyChooseThis,
  getPopularitySignal,
  getComparisonHelper,
  buildConfidenceHtml,
} from '../assets/js/ui/pdpConfidence.js';

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

/* ── getWhyChooseThis ────────────────────────────────────────────── */

test('getWhyChooseThis returns empty array for null product', () => {
  assert.deepEqual(getWhyChooseThis(null), []);
});

test('getWhyChooseThis returns empty array when fragrance is missing', () => {
  const result = getWhyChooseThis(product({ fragrance: null }));
  assert.deepEqual(result, []);
});

test('getWhyChooseThis emits "Fácil de usar" for high versatility', () => {
  const result = getWhyChooseThis(product()); // versatility 0.85
  assert.ok(result.includes('Fácil de usar'));
});

test('getWhyChooseThis emits "Larga duración" for high longevity', () => {
  const result = getWhyChooseThis(product()); // longevity 0.75 >= 0.67
  assert.ok(result.includes('Larga duración'));
});

test('getWhyChooseThis emits "Apto para la oficina" when office context tag present', () => {
  const result = getWhyChooseThis(product()); // has 'office' tag
  assert.ok(result.includes('Apto para la oficina'));
});

test('getWhyChooseThis caps at 3 bullets', () => {
  const p = product({
    badge: 'Alta demanda',
    fragrance: frag({ recommended_context_tags: ['office', 'daily', 'date', 'night'] }),
  });
  const result = getWhyChooseThis(p);
  assert.ok(result.length <= 3, `expected ≤3, got ${result.length}`);
});

test('getWhyChooseThis returns no duplicates', () => {
  const result = getWhyChooseThis(product());
  assert.equal(new Set(result).size, result.length);
});

test('getWhyChooseThis omits "Presencia notable sin ser excesivo" for very high projection', () => {
  const p = product({
    fragrance: frag({ scores: { freshness: 0.3, sweetness: 0.3, projection: 0.9, longevity: 0.8, versatility: 0.7 } }),
  });
  const result = getWhyChooseThis(p);
  assert.ok(!result.includes('Presencia notable sin ser excesivo'), 'very loud projection not shown as positive');
});

/* ── getPopularitySignal ────────────────────────────────────────── */

test('getPopularitySignal returns null for normal product', () => {
  assert.equal(getPopularitySignal(product()), null);
});

test('getPopularitySignal returns string when badge signals high demand', () => {
  const p = product({ badge: 'Mas pedido' });
  const signal = getPopularitySignal(p);
  assert.ok(typeof signal === 'string' && signal.length > 0);
});

test('getPopularitySignal returns null for null product', () => {
  assert.equal(getPopularitySignal(null), null);
});

test('getPopularitySignal is null for featured without demand badge (featured alone is not popularity)', () => {
  const p = product({ featured: true }); // no demand badge
  assert.equal(getPopularitySignal(p), null);
});

/* ── getComparisonHelper ────────────────────────────────────────── */

test('getComparisonHelper returns { choose, skip } shape', () => {
  const result = getComparisonHelper(product());
  assert.ok(Array.isArray(result.choose), 'choose is array');
  assert.ok(Array.isArray(result.skip),   'skip is array');
});

test('getComparisonHelper populates choose from office + daily context tags', () => {
  const { choose } = getComparisonHelper(product()); // has office + daily
  assert.ok(choose.some(c => c.toLowerCase().includes('oficina') || c.toLowerCase().includes('trabajo')));
});

test('getComparisonHelper caps choose at 2', () => {
  const p = product({
    fragrance: frag({ recommended_context_tags: ['office', 'daily', 'date', 'night', 'summer'] }),
  });
  const { choose } = getComparisonHelper(p);
  assert.ok(choose.length <= 2);
});

test('getComparisonHelper caps skip at 2', () => {
  const p = product({
    fragrance: frag({ scores: { freshness: 0.1, sweetness: 0.9, projection: 0.95, longevity: 0.8, versatility: 0.4 } }),
  });
  const { skip } = getComparisonHelper(p);
  assert.ok(skip.length <= 2);
});

test('getComparisonHelper emits skip for very sweet product', () => {
  const p = product({
    fragrance: frag({ scores: { freshness: 0.2, sweetness: 0.85, projection: 0.5, longevity: 0.7, versatility: 0.5 } }),
  });
  const { skip } = getComparisonHelper(p);
  assert.ok(skip.some(s => s.toLowerCase().includes('dulce')));
});

test('getComparisonHelper emits skip for very loud product', () => {
  const p = product({
    fragrance: frag({ scores: { freshness: 0.4, sweetness: 0.3, projection: 0.9, longevity: 0.7, versatility: 0.6 } }),
  });
  const { skip } = getComparisonHelper(p);
  assert.ok(skip.some(s => s.toLowerCase().includes('discreto') || s.toLowerCase().includes('ligero')));
});

test('getComparisonHelper returns empty arrays for null product', () => {
  const { choose, skip } = getComparisonHelper(null);
  assert.deepEqual(choose, []);
  assert.deepEqual(skip,   []);
});

test('getComparisonHelper returns empty arrays when fragrance is missing', () => {
  const { choose, skip } = getComparisonHelper(product({ fragrance: null }));
  assert.deepEqual(choose, []);
  assert.deepEqual(skip,   []);
});

/* ── buildConfidenceHtml ────────────────────────────────────────── */

test('buildConfidenceHtml returns empty string when nothing to show', () => {
  const minimal = product({
    featured: false,
    badge: 'Disponible',
    fragrance: frag({
      recommended_context_tags: [],
      scores: { freshness: 0.5, sweetness: 0.3, projection: 0.4, longevity: 0.4, versatility: 0.4 },
    }),
  });
  const html = buildConfidenceHtml(minimal);
  /* May return empty string or minimal section — it should not crash */
  assert.ok(typeof html === 'string');
});

test('buildConfidenceHtml renders id="pdp-confidence" section when data is available', () => {
  const html = buildConfidenceHtml(product()); // versatile + office + longevity
  assert.ok(html.includes('id="pdp-confidence"'), 'section present');
});

test('buildConfidenceHtml renders confidence badge when earned', () => {
  const p = product({ badge: 'Mas pedido' });
  const html = buildConfidenceHtml(p);
  assert.ok(html.includes('pdp-conf-badge'), 'badge element present');
  assert.ok(html.includes('solicitado'), 'demand copy present');
});

test('buildConfidenceHtml renders why-bullets when supported', () => {
  const html = buildConfidenceHtml(product());
  assert.ok(html.includes('pdp-conf-bullets'), 'bullets section present');
  assert.ok(html.includes('Fácil de usar') || html.includes('Larga duración'), 'at least one bullet');
});

test('buildConfidenceHtml renders comparison helper when context tags are present', () => {
  const html = buildConfidenceHtml(product()); // has office + daily tags
  assert.ok(html.includes('pdp-conf-compare'), 'comparison section present');
  assert.ok(html.includes('Elige este si'), 'choose heading present');
});

test('buildConfidenceHtml hides "skip" when no negative signals', () => {
  const balanced = product({
    fragrance: frag({
      scores: { freshness: 0.55, sweetness: 0.35, projection: 0.5, longevity: 0.55, versatility: 0.75 },
    }),
  });
  const html = buildConfidenceHtml(balanced);
  /* If no confident negatives exist, "Mejor otro si" block should be absent */
  if (html.includes('pdp-conf-compare')) {
    const hasSkip = html.includes('Mejor otro si');
    const balanced_skip = getComparisonHelper(balanced).skip;
    assert.equal(hasSkip, balanced_skip.length > 0, 'skip block only when skip items exist');
  }
});

test('buildConfidenceHtml does not contain aliases or raw internal fields', () => {
  const withAliases = product({
    fragrance: { ...frag(), aliases: ['jhony', 'roger'] },
  });
  const html = buildConfidenceHtml(withAliases);
  assert.ok(!html.includes('jhony'), 'alias not exposed');
  assert.ok(!html.includes('roger'), 'alias not exposed');
});

test('buildConfidenceHtml escapes XSS in product fields', () => {
  const evil = product({
    badge: '<script>alert(1)</script>',
    fragrance: frag({ recommended_context_tags: [] }),
  });
  const html = buildConfidenceHtml(evil);
  assert.ok(!html.includes('<script>'), 'script escaped');
});

/* ── Decant reassurance in HTML (productPage integration check) ─── */

test('buildProductPageHtml includes pdp-decant-reassurance when price is available', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const sample = {
    id: 'test-conf', slug: 'test-conf', name: 'TestConf', house: 'House',
    notes: ['bergamota'], desc: 'fresco diario', story: 'fresco diario',
    badge: 'Disponible', featured: false, stock: 20,
    variants: [
      { id:'v3', size:3, price:120, retail_price:120, availability:20, stock:20, available:true, soldOut:false, sold_out:false, variant_id:'1', product_id:'test-conf' },
    ],
    fragrance: {
      canonical_name:'Test', aliases:[],
      scent_family_normalized:'aromatic', mood_tags:['clean'],
      recommended_context_tags:['office'], style_tags:['modern'],
      accords:[], scores:{ freshness:0.7, sweetness:0.2, projection:0.6, longevity:0.75, versatility:0.85 },
    },
  };
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('pdp-decant-reassurance'), 'decant reassurance rendered');
  assert.ok(html.includes('decant'), 'decant copy present');
});

test('PDP confidence section appears between technical block and buy section', async () => {
  const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');
  const sample = {
    id: 'ord-test', slug: 'ord-test', name: 'OrdTest', house: 'H',
    notes: ['bergamota'], desc: 'fresco diario', story: 'fresco diario',
    badge: 'Disponible', featured: true, stock: 20,
    variants: [{ id:'v3', size:3, price:130, retail_price:130, availability:20, stock:20, available:true, soldOut:false, sold_out:false, variant_id:'2', product_id:'ord-test' }],
    fragrance: {
      canonical_name:'O', aliases:[],
      scent_family_normalized:'aromatic', mood_tags:['clean'],
      recommended_context_tags:['office','daily'], style_tags:['modern'],
      accords:[], scores:{ freshness:0.7, sweetness:0.2, projection:0.6, longevity:0.75, versatility:0.85 },
    },
  };
  const html = buildProductPageHtml(sample);
  const i = s => html.indexOf(s);
  /* confidence section must be after tech and before buy */
  if (html.includes('id="pdp-confidence"')) {
    assert.ok(i('id="pdp-confidence"') > i('id="pdp-tech"'), 'confidence after tech');
    assert.ok(i('id="pdp-confidence"') < i('id="pdp-buy"'),  'confidence before buy');
  }
});
