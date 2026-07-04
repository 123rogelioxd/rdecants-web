import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayBadges, getGuidanceBadges } from '../assets/js/utils/guidance.js';

const keys = (product) => getGuidanceBadges(product).map(b => b.key);
const displayLabels = (product, opts) => getDisplayBadges(product, opts).map(b => b.label);

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

test('display badges prefer curated mood tags over legacy guidance', () => {
  const product = {
    notes: ['vainilla', 'azucar'],
    desc: 'extremadamente dulce',
    story: 'extremadamente dulce',
    fragrance: { mood_tags: ['dulce', 'juvenil', 'social'] },
  };

  assert.deepEqual(getDisplayBadges(product).map(b => b.label), ['Dulce', 'Juvenil']);
  assert.deepEqual(getDisplayBadges(product).map(b => b.key), ['dulce', 'juvenil']);
});

test('display badges support catalog and detail limits', () => {
  const product = {
    fragrance: { mood_tags: ['dulce', 'juvenil', 'social'] },
  };

  assert.deepEqual(getDisplayBadges(product, { limit: 1 }).map(b => b.label), ['Dulce']);
  assert.deepEqual(getDisplayBadges(product, { limit: 2 }).map(b => b.label), ['Dulce', 'Juvenil']);
});

test('display badges use recommendation tags when mood tags are absent', () => {
  const product = {
    fragrance: {
      recommendation_tags: ['cita_casual', 'oficina'],
      style_tags: ['gourmand'],
    },
  };

  assert.deepEqual(getDisplayBadges(product).map(b => b.label), ['Cita', 'Oficina']);
});

test('display badges do not fall back to legacy guidance when curated metadata is absent', () => {
  const product = {
    notes: ['vainilla', 'tonka', 'canela'],
    story: 'Dulce y nocturno, pensado para salidas y dejar rastro en la noche',
    badge: 'Disponible',
  };

  assert.deepEqual(getDisplayBadges(product), []);
});

test('display badges dedupe across curated metadata sources', () => {
  const product = {
    fragrance: {
      mood_tags: ['dulce', 'juvenil'],
      recommendation_tags: ['dulce', 'cita_casual'],
      style_tags: ['juvenil', 'gourmand'],
    },
  };

  assert.deepEqual(
    getDisplayBadges(product, { limit: 10 }).map(b => b.label),
    ['Dulce', 'Cita', 'Juvenil', 'Gourmand'],
  );
});

test('Tubees notes do not generate Fiesta/Seductor when mood tags exist', () => {
  const tubees = {
    notes: ['mantequilla', 'azucar', 'leche', 'chocolate con leche', 'vainilla', 'almizcle blanco'],
    desc: 'fragancia gourmand unisex centrada en acordes lactonicos, azucarados y de chocolate. perfil extremadamente dulce orientado a consumidores que buscan aromas de postre y reposteria.',
    story: 'fragancia gourmand unisex centrada en acordes lactonicos, azucarados y de chocolate. perfil extremadamente dulce orientado a consumidores que buscan aromas de postre y reposteria.',
    fragrance: { mood_tags: ['dulce', 'juvenil', 'social'] },
  };

  const labels = getDisplayBadges(tubees).map(b => b.label);
  assert.deepEqual(labels, ['Dulce', 'Juvenil']);
  assert.ok(!labels.includes('Fiesta'));
  assert.ok(!labels.includes('Seductor'));
});

test('9PM can show Nocturno/Seductor when those are curated mood tags', () => {
  const ninePm = {
    notes: ['manzana', 'canela', 'vainilla'],
    fragrance: { mood_tags: ['nocturno', 'seductor'] },
  };

  assert.deepEqual(getDisplayBadges(ninePm).map(b => b.label), ['Noche', 'Seductor']);
});

test('catalog_card caps at 2 useful badges', () => {
  const product = {
    fragrance: {
      mood_tags: ['dulce', 'fresco', 'juvenil'],
      recommendation_tags: ['noche', 'cita'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'catalog_card' }), ['Dulce', 'Noche']);
});

test('quick_view caps at 3 useful badges', () => {
  const product = {
    fragrance: {
      mood_tags: ['dulce', 'fresco', 'juvenil'],
      recommendation_tags: ['noche', 'cita'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'quick_view' }), ['Dulce', 'Noche', 'Cita']);
});

test('product_detail can surface normalized performance labels', () => {
  const product = {
    fragrance: {
      mood_tags: ['dulce'],
      recommendation_tags: ['noche'],
      style_tags: ['Duraci\u00f3n excepcional'],
      commercial_roles: ['M\u00e1xima proyecci\u00f3n'],
    },
  };

  assert.deepEqual(
    displayLabels(product, { context: 'product_detail', limit: 6 }),
    ['Dulce', 'Noche', 'Buen rendimiento', 'Buena proyecci\u00f3n'],
  );
});

test('buyer-useful tags outrank hype and performance tags', () => {
  const product = {
    badge: 'Premium',
    fragrance: {
      mood_tags: ['Duraci\u00f3n excepcional', 'Dulce'],
      recommendation_tags: ['Recomendado', 'Noche'],
      commercial_roles: ['M\u00e1xima proyecci\u00f3n'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'product_detail', limit: 4 }), [
    'Dulce',
    'Noche',
    'Buen rendimiento',
    'Buena proyecci\u00f3n',
  ]);
});

test('compact views hide hype and performance badges', () => {
  const product = {
    badge: 'Recomendado',
    fragrance: {
      mood_tags: ['Dulce', 'Duraci\u00f3n excepcional'],
      recommendation_tags: ['Noche', 'Premium'],
      commercial_roles: ['M\u00e1xima proyecci\u00f3n'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'catalog_card' }), ['Dulce', 'Noche']);
  assert.deepEqual(displayLabels(product, { context: 'quick_view' }), ['Dulce', 'Noche']);
});

test('audience tags do not consume slots when audience is already displayed elsewhere', () => {
  const product = {
    gender: 'female',
    fragrance: {
      mood_tags: ['Mujer', 'Dulce'],
      recommendation_tags: ['Noche', 'Cita'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'catalog_card' }), ['Dulce', 'Noche']);
});

test('duplicate display tags from multiple metadata fields render once', () => {
  const product = {
    badge: 'DULCE',
    fragrance: {
      mood_tags: ['dulce', 'fresco'],
      recommendation_tags: ['Dulce', 'diario'],
      recommended_context_tags: ['daily'],
      occasions: ['Diario'],
      style_tags: ['fresh'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'quick_view', limit: 10 }), ['Dulce', 'Diario', 'Fresco']);
});

test('casing and accent variants normalize correctly', () => {
  const product = {
    fragrance: {
      mood_tags: ['DULC\u00c9'],
      recommendation_tags: ['NOCTURNO'],
      style_tags: ['duracion excepcional'],
      commercial_roles: ['maxima proyeccion'],
    },
  };

  assert.deepEqual(displayLabels(product, { context: 'product_detail', limit: 6 }), [
    'Dulce',
    'Noche',
    'Buen rendimiento',
    'Buena proyecci\u00f3n',
  ]);
});
