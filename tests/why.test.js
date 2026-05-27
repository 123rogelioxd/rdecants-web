import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhyHtml } from '../assets/js/ui/why.js';

test('returns empty string when there is nothing meaningful to say', () => {
  assert.equal(buildWhyHtml({ notes: [], desc: '', story: '' }), '');
  assert.equal(buildWhyHtml(null), '');
});

test('renders a reasons list for a product with clear metadata', () => {
  const html = buildWhyHtml({
    notes: ['marino', 'citrico', 'vetiver', 'bergamota'],
    desc: 'fresco limpio para la oficina y el calor de verano',
    story: 'versatil para todos los dias',
  });
  assert.match(html, /why-block/);
  assert.match(html, /¿Por qué esta fragancia\?/);
  assert.match(html, /<li>/);
});

test('respects a custom heading and is deterministic', () => {
  const product = {
    notes: ['vainilla', 'tonka', 'canela'],
    desc: 'dulce nocturno para fiesta',
    story: '',
  };
  const a = buildWhyHtml(product, { heading: 'Por qué te gustará' });
  const b = buildWhyHtml(product, { heading: 'Por qué te gustará' });
  assert.match(a, /Por qué te gustará/);
  assert.equal(a, b);
});
