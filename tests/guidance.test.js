import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGuidanceBadges } from '../assets/js/utils/guidance.js';

const keys = (product) => getGuidanceBadges(product).map(b => b.key);

test('returns nothing for empty / null products (no fake guidance)', () => {
  assert.deepEqual(getGuidanceBadges(null), []);
  assert.deepEqual(getGuidanceBadges({}), []);
  assert.deepEqual(getGuidanceBadges({ notes: [], desc: '', badge: '' }), []);
});

test('caps output at two badges to avoid clutter', () => {
  const loaded = {
    notes: ['vainilla', 'tabaco', 'oud', 'cuero', 'miel', 'tonka'],
    story: 'Nocturno dulce sensual que deja rastro, ideal para fiesta y conquista',
    badge: 'Trending',
  };
  assert.ok(getGuidanceBadges(loaded).length <= 2);
});

test('fresh citrus + versatile copy reads as Diario', () => {
  const p = {
    notes: ['bergamota', 'cedro', 'manzana'],
    desc: 'Fragancia limpia y versatil para todos los dias, discreta y atemporal',
    badge: 'Disponible',
  };
  assert.ok(keys(p).includes('diario'));
});

test('sweet nocturnal profile reads as Fiesta', () => {
  const p = {
    notes: ['vainilla', 'tonka', 'canela'],
    story: 'Dulce y nocturno, pensado para salidas y dejar rastro en la noche',
    badge: 'Disponible',
  };
  assert.ok(keys(p).includes('fiesta'));
});

test('coastal / summer profile reads as Tropical', () => {
  const p = {
    notes: ['coco', 'marino', 'citrico'],
    desc: 'Fresco de verano para el calor, vibra de playa y vacaciones',
    badge: 'Verano',
  };
  assert.ok(keys(p).includes('tropical'));
});

test('badges are returned strongest-first', () => {
  const p = {
    notes: ['vainilla', 'tabaco', 'oud'],
    story: 'Sensual y seductor, magnetico, ideal para una cita de noche',
    badge: 'Seductor',
  };
  const badges = getGuidanceBadges(p);
  assert.equal(badges[0].key, 'seductor');
  assert.ok(badges[0].label.length > 0);
});

test('a single weak signal stays below the minimum score threshold', () => {
  // one lone text hint (TEXT_WEIGHT 1) should not be enough to surface a badge
  const p = { notes: [], desc: 'algo formal', badge: 'Disponible' };
  assert.deepEqual(keys(p), []);
});

test('an operational mood badge alone is not enough without corroboration', () => {
  // badge match = BADGE_WEIGHT(2) < MIN_SCORE(3)
  const p = { notes: [], desc: '', badge: 'oficina' };
  assert.deepEqual(keys(p), []);
});
