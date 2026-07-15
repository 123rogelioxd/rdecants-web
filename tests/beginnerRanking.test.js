/* =============================================================
   Beginner-safe finder ranking — the precise, approved contract:
     • Fit DOMINATES.
     • Price MAY penalize an expensive first pick when equally-suitable
       alternatives exist.
     • Price must NOT auto-exclude a genuinely superior match.
     • Operational/AOV signals only break CLOSE ties.
   Deterministic: fixed catalogs, exact expected ordering.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';

const variant = (size, price, stock = 20) => ({
  size, price, stock, availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: 5000 + size,
});

/* A well-matched "fresco + oficina" product. `strongOffice` controls whether it
   also carries office context (higher fit) or only the scent family (lower fit). */
const fresh = (id, price, { strongOffice = true, featured = false, stock = 20 } = {}) => ({
  id, name: id, house: 'House', notes: [], badge: 'Disponible', featured,
  variants: [variant(5, price, stock)],
  fragrance: {
    scent_family_normalized: 'fresh',
    style_tags: ['fresco', 'limpio'],
    mood_tags: ['fresco', 'limpio'],
    accords: ['citrus', 'marine'],
    recommended_context_tags: strongOffice ? ['office', 'oficina', 'daily'] : ['daily'],
    recommendation_tags: strongOffice ? ['oficina', 'diario'] : ['diario'],
    scores: { freshness: 80, versatility: 85, projection: 40 },
  },
});

const ids = list => list.map(r => r.product.id);
const q = { family: 'fresco', occasion: 'oficina', budget: 'any' };

test('fit dominates: a genuinely superior match outranks a cheaper weaker one', () => {
  const superiorExpensive = fresh('SuperiorExpensive', 300, { strongOffice: true });
  const weakCheap = fresh('WeakCheap', 90, { strongOffice: false });

  const res = getAssistantRecommendations(q, [weakCheap, superiorExpensive], { limit: 2 });

  assert.equal(res[0].product.id, 'SuperiorExpensive',
    'the better-fitting product leads even though it costs ~3x more');
  assert.ok(ids(res).includes('WeakCheap'),
    'price never EXCLUDES a match — the cheaper weaker one is still offered, just lower');
});

test('equally suitable: the more accessible (cheaper) option leads', () => {
  const equalCheap = fresh('EqualCheap', 150);
  const equalExpensive = fresh('EqualExpensive', 300);

  const res = getAssistantRecommendations(q, [equalExpensive, equalCheap], { limit: 2 });

  assert.equal(res[0].product.id, 'EqualCheap',
    'among equally-suitable fragrances a first-timer is led with the cheaper one');
  assert.equal(res[1].product.id, 'EqualExpensive');
});

test('operational health breaks a tie only when fit AND price are equal', () => {
  const plain = fresh('PlainEqual', 200, { featured: false });
  const featured = fresh('FeaturedEqual', 200, { featured: true });

  const res = getAssistantRecommendations(q, [plain, featured], { limit: 2 });

  assert.equal(res[0].product.id, 'FeaturedEqual',
    'with identical fit and identical price, the operationally healthier (featured) wins');
});

test('a superior expensive match is never displaced by an operational boost on a cheaper weaker one', () => {
  const superiorExpensive = fresh('SuperiorExpensive', 320, { strongOffice: true, featured: false });
  const weakCheapFeatured = fresh('WeakCheapFeatured', 80, { strongOffice: false, featured: true });

  const res = getAssistantRecommendations(q, [weakCheapFeatured, superiorExpensive], { limit: 2 });

  assert.equal(res[0].product.id, 'SuperiorExpensive',
    'fit outranks both price and operational signals — those only act inside a fit band');
});

test('ranking is deterministic across input order', () => {
  const a = fresh('Aaa', 200);
  const b = fresh('Bbb', 200);
  const c = fresh('Ccc', 200);
  const one = ids(getAssistantRecommendations(q, [a, b, c], { limit: 3 }));
  const two = ids(getAssistantRecommendations(q, [c, b, a], { limit: 3 }));
  assert.deepEqual(one, two, 'same catalog, any input order → identical ranking');
});
