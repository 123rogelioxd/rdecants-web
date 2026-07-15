/* =============================================================
   Product presentation normalization — safe, derives-nothing formatting
   applied to the raw feed: sentence-cased machine prose and
   concentration composed into the display name for disambiguation.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceCase, composeDisplayName } from '../assets/js/utils/presentation.js';

test('sentenceCase capitalizes sentence starts without lowercasing anything', () => {
  assert.equal(
    sentenceCase('fragancia masculina gourmand centrada en vainilla. perfil dulce e intenso.'),
    'Fragancia masculina gourmand centrada en vainilla. Perfil dulce e intenso.',
  );
  /* Never touches acronyms or brand casing — it only raises leading letters. */
  assert.equal(sentenceCase('EDP fresco. YSL clásico.'), 'EDP fresco. YSL clásico.');
  assert.equal(sentenceCase(''), '');
  assert.equal(sentenceCase('  ya está bien.'), 'Ya está bien.');
});

test('composeDisplayName disambiguates duplicate base names with concentration', () => {
  /* Two "SAUVAGE" become self-distinguishing, case-matched to the feed name. */
  assert.equal(composeDisplayName('SAUVAGE', 'EDT'), 'SAUVAGE EDT');
  assert.equal(composeDisplayName('SAUVAGE', 'EDP'), 'SAUVAGE EDP');
  assert.equal(composeDisplayName('Le Male', 'Elixir'), 'Le Male Elixir');
});

test('composeDisplayName never duplicates an already-present concentration', () => {
  assert.equal(composeDisplayName('BLEU DE CHANEL EDP', 'EDP'), 'BLEU DE CHANEL EDP');
  assert.equal(composeDisplayName('Sauvage Elixir', 'Elixir'), 'Sauvage Elixir');
});

test('composeDisplayName is a no-op without a concentration', () => {
  assert.equal(composeDisplayName('ONE MILLION LUCKY', ''), 'ONE MILLION LUCKY');
  assert.equal(composeDisplayName('ONE MILLION LUCKY', null), 'ONE MILLION LUCKY');
});
