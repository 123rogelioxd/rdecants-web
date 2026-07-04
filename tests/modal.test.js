import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductModalGuidanceHtml } from '../assets/js/ui/modal.js';

const ninePm = {
  name: 'Afnan 9PM',
  notes: ['Manzana', 'Vainilla', 'Canela'],
  fragrance: {
    recommendation_tags: ['noche', 'cita', 'fiesta'],
    mood_tags: ['juvenil', 'seductor', 'nocturno'],
    style_tags: ['dulce', 'especiado', 'llamativo'],
    climates: ['frio'],
  },
};

test('modal guidance renders max 3 visible badges and max 2 why reasons', () => {
  const html = buildProductModalGuidanceHtml(ninePm);
  assert.equal((html.match(/<span class="guidance-chip /g) || []).length, 3);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.ok(html.includes('>Dulce<'));
  assert.ok(html.includes('>Noche<'));
  assert.ok(html.includes('>Cita<'));
  assert.ok(!html.includes('>Fiesta<'));
});

test('modal guidance does not dump notes metadata', () => {
  const html = buildProductModalGuidanceHtml(ninePm);
  assert.ok(!html.includes('Manzana'));
  assert.ok(!html.includes('Vainilla'));
  assert.ok(!html.includes('Canela'));
  assert.ok(html.includes('why-block'), 'keeps concise why guidance');
});
