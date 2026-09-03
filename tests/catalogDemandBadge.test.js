/* =============================================================
   Catalog card — "Más vendido" demand badge.

   hasHighDemand()/getScarcityDisplay() (utils/scarcity.js) already compute
   a real, backend-sourced demand signal and were already fully tested in
   scarcity.test.js — that logic is untouched here. What was missing was
   anywhere in the UI that actually READ stockState.demand; this is the
   first surface that renders it.

   Static-source, matching this repo's existing convention for markup shape
   (see rogerRail.test.js's "badge restraint" tests): the card builder is a
   private, unexported function, so the property under test — a real signal
   never competing with the urgency badge for the same corner — is asserted
   on the template's own structure.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'assets/js/catalog/render.js'), 'utf8');

test('the demand badge exists and uses the real backend-sourced signal', () => {
  assert.match(source, /stockState\.demand/, 'must read the real signal, not invent one');
  assert.match(source, /card-badge--demand/);
  assert.match(source, />Más vendido</);
});

test('the demand badge never renders while the urgency badge does', () => {
  // Both branches are gated on isUrgent, from opposite sides, so at most one
  // <span class="card-badge ...> can ever exist in the emitted markup.
  assert.match(source, /isUrgent \? `<span class="card-badge \$\{stockState\.badgeClass\}/);
  assert.match(source, /!isUrgent \? demandHtml/);
});

test('the demand badge never renders alongside a guided-mode rank flag', () => {
  // rankHtml (the numbered "Nuestra recomendación #N" flag) and the demand
  // badge occupy the same visual corner; both slots are gated on !rankHtml.
  const demandLine = source.split('\n').find(line => line.includes('!isUrgent ? demandHtml'));
  assert.ok(demandLine, 'expected to find the demand-badge line');
  assert.match(demandLine, /!rankHtml/);
});

/* One occurrence of the literal class name is expected in the template
   (the conditional expression); the CSS rule itself lives in components.css
   and is out of scope for a JS source test. */
test('exactly one place decides whether the demand badge renders', () => {
  const occurrences = source.match(/stockState\.demand/g) ?? [];
  assert.equal(occurrences.length, 1, 'the decision must not be duplicated/diverge across two checks');
});
