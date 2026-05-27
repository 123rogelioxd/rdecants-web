import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getReasons, getMatchTier } from '../assets/js/recommendations/reasoning.js';

test('no reasons for an empty / null product', () => {
  assert.deepEqual(getReasons(null), []);
  assert.deepEqual(getReasons({ notes: [], desc: '', story: '' }), []);
});

test('combines the top two use-cases into one phrase', () => {
  const p = {
    notes: ['marino', 'citrico', 'vetiver', 'bergamota'],
    desc: 'fresco limpio para la oficina y el calor de verano',
    story: 'versatil para todos los dias',
  };
  const reasons = getReasons(p);
  assert.ok(reasons.some(r => /Ideal para .+ y /.test(r)));
});

test('adds a scent-family phrase', () => {
  const p = {
    notes: ['vainilla', 'tonka', 'canela', 'caramelo'],
    desc: 'dulce goloso gourmand para la noche',
    story: '',
  };
  const reasons = getReasons(p);
  assert.ok(reasons.some(r => /dulces/.test(r)));
});

test('respects the limit and is deterministic', () => {
  const p = {
    notes: ['oud', 'cuero', 'tabaco', 'ambar', 'incienso'],
    desc: 'intenso oriental potente seductor para la noche y ocasiones especiales',
    story: 'elegante sofisticado refinado',
  };
  const a = getReasons(p, { limit: 2 });
  const b = getReasons(p, { limit: 2 });
  assert.ok(a.length <= 2);
  assert.deepEqual(a, b); // deterministic
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
