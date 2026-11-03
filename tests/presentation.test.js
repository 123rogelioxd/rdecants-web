/* =============================================================
   Product presentation normalization — safe, derives-nothing formatting
   applied to the raw feed: sentence-cased machine prose and
   concentration composed into the display name for disambiguation.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceCase, composeDisplayName, stripPictographs, titleCaseName } from '../assets/js/utils/presentation.js';

test('stripPictographs removes emoji and keeps the words', () => {
  /* The exact strings R Supply OS serves for the three starter packs. */
  assert.equal(stripPictographs('🌎 PACK TODOTERRENO'), 'PACK TODOTERRENO');
  assert.equal(stripPictographs('💕 Pack Para Ella'), 'Pack Para Ella');
  assert.equal(
    stripPictographs('🌊 Fresco para el día, impecable en cualquier plan. Tres perfumes. 🔥'),
    'Fresco para el día, impecable en cualquier plan. Tres perfumes.',
  );
  assert.equal(stripPictographs('✨ Fresca de día ❤️ y de noche'), 'Fresca de día y de noche');
  /* Digits, accents, ampersands and prices are not pictographs. */
  assert.equal(stripPictographs('212 VIP · D&G · $289 · Giò'), '212 VIP · D&G · $289 · Giò');
  assert.equal(stripPictographs(null), '');
});

test('titleCaseName softens an all-caps feed name without breaking shorthand', () => {
  assert.equal(titleCaseName('PACK TODOTERRENO'), 'Pack Todoterreno');
  assert.equal(titleCaseName('PACK PARA SALIR'), 'Pack Para Salir');
  assert.equal(titleCaseName('BORN IN ROMA EDT'), 'Born in Roma EDT');
  assert.equal(titleCaseName('BORN IN ROMA CORAL FANTASY EDP'), 'Born in Roma Coral Fantasy EDP');
  assert.equal(titleCaseName('9PM EDP'), '9PM EDP', 'a word with digits is left alone');
  assert.equal(titleCaseName('212 VIP BLACK EDP'), '212 VIP Black EDP');
  assert.equal(titleCaseName('LE MALE ELIXIR EDP'), 'Le Male Elixir EDP', 'a connector still capitalizes first');
  assert.equal(titleCaseName('SCANDAL EDP WOMAN'), 'Scandal EDP Woman');
  /* Real catalog names with special casing. */
  assert.equal(titleCaseName("TERRE D'HERMES"), "Terre d'Hermes");
  assert.equal(titleCaseName("L'EAU D'ISSEY POUR HOMME"), "L'Eau d'Issey Pour Homme");
  assert.equal(titleCaseName("L'IMMENSITE"), "L'Immensite");
  assert.equal(titleCaseName('KENIA OS MUSE EDP'), 'Kenia OS Muse EDP');
  assert.equal(titleCaseName('MYSLF LE PARFUM'), 'MYSLF Le Parfum');
  assert.equal(titleCaseName('CLUB DE NUIT ICONIC'), 'Club de Nuit Iconic');
  assert.equal(titleCaseName('212 NYC MEN EDT'), '212 NYC Men EDT');
  assert.equal(titleCaseName('9AM DIVE EDP'), '9AM Dive EDP');
  assert.equal(titleCaseName('Y EDP'), 'Y EDP');
  /* Mixed case is somebody's decision — returned untouched. */
  assert.equal(titleCaseName('Pack Para Ella'), 'Pack Para Ella');
  assert.equal(titleCaseName('Acqua di Giò Profondo'), 'Acqua di Giò Profondo');
  assert.equal(titleCaseName(''), '');
});

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
