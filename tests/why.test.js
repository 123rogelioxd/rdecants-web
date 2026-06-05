import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhyHtml } from '../assets/js/ui/why.js';

test('returns empty string when there is nothing meaningful to say', () => {
  assert.equal(buildWhyHtml({ notes: [], desc: '', story: '' }), '');
  assert.equal(buildWhyHtml(null), '');
});

test('renders a reasons list from curated fragrance metadata', () => {
  const html = buildWhyHtml({
    fragrance: {
      recommendation_tags: ['noche', 'fiesta'],
      mood_tags: ['juvenil', 'seductor'],
      style_tags: ['dulce'],
      climates: ['frio'],
    },
  });
  assert.match(html, /why-block/);
  assert.match(html, /¿Por qué esta fragancia\?/);
  assert.match(html, /Ideal para la noche, fiestas y salidas/);
  assert.doesNotMatch(html, /limpios y frescos/);
});

test('respects a custom heading and is deterministic', () => {
  const product = {
    fragrance: {
      recommendation_tags: ['cita'],
      mood_tags: ['juvenil'],
      style_tags: ['dulce'],
    },
  };
  const a = buildWhyHtml(product, { heading: 'Por qué te gustará' });
  const b = buildWhyHtml(product, { heading: 'Por qué te gustará' });
  assert.match(a, /Por qué te gustará/);
  assert.equal(a, b);
});
