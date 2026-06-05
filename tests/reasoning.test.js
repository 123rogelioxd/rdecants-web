import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getReasons, getMatchTier } from '../assets/js/recommendations/reasoning.js';

test('no reasons for an empty / null product or missing curated metadata', () => {
  assert.deepEqual(getReasons(null), []);
  assert.deepEqual(getReasons({ notes: [], desc: '', story: '' }), []);
  assert.deepEqual(getReasons({
    notes: ['manzana', 'vainilla', 'canela'],
    desc: 'dulce juvenil llamativo',
    story: 'noche y salidas',
  }), []);
});

test('9PM guidance is driven by curated recommendation, mood, style and climate tags', () => {
  const ninePm = {
    notes: ['manzana', 'vainilla', 'canela'],
    fragrance: {
      mood_tags: ['juvenil', 'nocturno', 'seductor'],
      style_tags: ['dulce', 'moderno', 'nocturno', 'frutal'],
      recommendation_tags: ['noche', 'cita', 'fiesta', 'evento formal', 'fragancia firma', 'alto rendimiento', 'antro', 'social'],
      climates: ['frio', 'templado'],
    },
  };

  const reasons = getReasons(ninePm, { limit: 4 });
  assert.deepEqual(reasons, [
    'Ideal para la noche, fiestas y salidas',
    'Vibra juvenil y seductora',
    'Perfecto si te gustan aromas dulces, especiados y llamativos',
    'Mejor en clima fresco o templado',
  ]);
  assert.ok(!reasons.some(r => /limpios|frescos|oficina/i.test(r)));
});

test('style and climate reasons appear after higher-priority tags when limit allows', () => {
  const p = {
    fragrance: {
      recommendation_tags: ['noche'],
      mood_tags: ['juvenil', 'seductor'],
      style_tags: ['dulce'],
      climates: ['frio', 'templado'],
    },
  };

  assert.deepEqual(getReasons(p, { limit: 4 }), [
    'Ideal para la noche, fiestas y salidas',
    'Vibra juvenil y seductora',
    'Perfecto si te gustan aromas dulces, especiados y llamativos',
    'Mejor en clima fresco o templado',
  ]);
});

test('respects the limit and is deterministic', () => {
  const p = {
    fragrance: {
      recommendation_tags: ['noche', 'cita', 'alto rendimiento'],
      mood_tags: ['juvenil'],
      style_tags: ['dulce'],
      climates: ['frio'],
    },
  };
  const a = getReasons(p, { limit: 2 });
  const b = getReasons(p, { limit: 2 });
  assert.equal(a.length, 2);
  assert.deepEqual(a, b);
});

test('match tier thresholds', () => {
  assert.equal(getMatchTier(9, 10).key, 'high');
  assert.equal(getMatchTier(5, 10).key, 'good');
  assert.equal(getMatchTier(1, 10).key, 'fair');
});

test('match tier is safe with invalid inputs', () => {
  assert.equal(getMatchTier(5, 0).key, 'fair');
  assert.equal(getMatchTier(NaN, 10).key, 'fair');
});
