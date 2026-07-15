/* =============================================================
   Computed commercial labels — "Mejor valor" / a 10 ml upgrade nudge is
   an HONEST claim: it only appears when 10 ml is genuinely cheaper per ml
   than 5 ml. When 10 ml costs exactly 2x the 5 ml price it saves nothing,
   so no value language is shown.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBetterValuePerMl, getSizeLabel } from '../assets/js/utils/prices.js';

const variant = (size, price) => ({
  size, price, availability: 10, stock: 10, public_stock: 10,
  available: true, soldOut: false, variant_id: 6000 + size,
});

/* 10 ml at exactly 2x the 5 ml price → no per-ml saving (the Le Male Elixir case). */
const noSaving = { id: 'NoSaving', name: 'No Saving', variants: [variant(5, 170), variant(10, 340)] };
/* 10 ml cheaper per ml than 5 ml → a real upgrade. */
const realSaving = { id: 'RealSaving', name: 'Real Saving', variants: [variant(5, 170), variant(10, 300)] };

test('isBetterValuePerMl is false when 10 ml is exactly double the 5 ml price', () => {
  assert.equal(isBetterValuePerMl(noSaving, 10, 5), false);
});

test('isBetterValuePerMl is true only when 10 ml is cheaper per ml', () => {
  assert.equal(isBetterValuePerMl(realSaving, 10, 5), true);
});

test('getSizeLabel shows "Mejor valor" only for genuine per-ml savings', () => {
  assert.equal(getSizeLabel(10, noSaving), '', 'no false value claim when 10 ml saves nothing');
  assert.equal(getSizeLabel(10, realSaving), 'Mejor valor');
  assert.equal(getSizeLabel(5, realSaving), 'Uso frecuente');
  assert.equal(getSizeLabel(3, realSaving), 'Ideal para probar');
});

test('getSizeLabel makes no 10 ml value claim without product context', () => {
  assert.equal(getSizeLabel(10), '', 'legacy single-arg call never asserts unverified value');
});
