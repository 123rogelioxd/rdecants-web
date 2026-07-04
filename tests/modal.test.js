import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('modal guidance renders max 3 visible badges without the PDP why box', () => {
  const html = buildProductModalGuidanceHtml(ninePm);
  assert.equal((html.match(/<span class="guidance-chip /g) || []).length, 3);
  assert.equal((html.match(/<li>/g) || []).length, 0);
  assert.ok(html.includes('>Dulce<'));
  assert.ok(html.includes('>Noche<'));
  assert.ok(html.includes('>Cita<'));
  assert.ok(!html.includes('>Fiesta<'));
  assert.ok(!html.includes('why-block'));
});

test('modal guidance does not dump notes metadata', () => {
  const html = buildProductModalGuidanceHtml(ninePm);
  assert.ok(!html.includes('Manzana'));
  assert.ok(!html.includes('Vainilla'));
  assert.ok(!html.includes('Canela'));
  assert.ok(!html.includes('why-block'), 'why guidance belongs on the PDP');
});

test('quick view keeps full profile link subtle and below the primary CTA', () => {
  const source = fs.readFileSync('assets/js/ui/modal.js', 'utf8');
  assert.ok(source.includes('Ver perfil completo'));
  assert.ok(source.includes('pdm-secondary-actions'));
  assert.ok(source.indexOf('id="pdm-btn-add"') < source.indexOf('Ver perfil completo'));
  assert.ok(!source.includes('Una botella completa cuesta miles'));
});
