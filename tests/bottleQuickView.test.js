/* =============================================================
   Bottle Quick View — static-source checks.

   Matching this repo's existing convention for markup/behaviour shape that
   is impractical to drive through a real DOM in a plain Node test (see
   rogerRail.test.js's "badge restraint" tests, catalogDemandBadge.test.js):
   the module manipulates document.createElement/appendChild/querySelector
   extensively and there is no jsdom in this toolchain. The properties that
   matter — real data only, no invented fields, honest sold-out handling,
   Cart.addBottle as the single add mechanism, XSS-safe interpolation — are
   asserted directly on the source.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'assets/js/ui/bottleQuickView.js'), 'utf8');
const perfumesSource = readFileSync(join(root, 'assets/js/pages/perfumes.js'), 'utf8');

test('renders only real offer fields — no invented "has_box" or per-unit rating', () => {
  for (const field of ['condition_label', 'remaining_percent', 'price', 'stock', 'size_label']) {
    assert.match(source, new RegExp(`offer\\.${field}`), `expected to read the real field offer.${field}`);
  }
  // Fields from the brief's CONCEPTUAL schema that do not exist in the actual
  // data model (providers/catalog.js:_mapBottleOffer) must never be invented
  // here — the master brief is explicit that fabricated detail is worse than
  // omitting it.
  assert.doesNotMatch(source, /has_box|aggregateRating|\breview\b/i);
});

test('the fill-level bar only renders when the backend actually sent a percentage', () => {
  assert.match(source, /remaining_percent !== null/);
  // Never a bar drawn from an assumed/estimated percentage.
  assert.doesNotMatch(source, /remaining_percent\s*\?\?\s*\d/);
});

test('the fill bar width is clamped so a bad value cannot escape the track visually', () => {
  assert.match(source, /Math\.max\(0, Math\.min\(100, offer\.remaining_percent\)\)/);
});

test('adding to cart goes through the single shared Cart.addBottle mechanism', () => {
  assert.match(source, /Cart\.addBottle\(_product\.id, _offerKey\)/);
  // Cart.addBottle already raises its own toast for "unavailable" / "already
  // in cart" — a second toast for the same outcomes would just repeat it.
  assert.doesNotMatch(source, /showToast\(['"]Esa botella ya no est/);
});

test('a sold-out offer disables the Add button rather than hiding the price', () => {
  assert.match(source, /canAdd = \(offer\.stock \?\? 0\) > 0/);
  assert.match(source, /\$\{canAdd \? '' : 'disabled aria-disabled="true"'\}/);
});

test('every interpolated user-adjacent string is escaped before reaching innerHTML', () => {
  // Every product/offer field written into the template goes through
  // _escape(...) — condition_label and size_label are operator-authored text
  // and must never be trusted raw in a script-context string.
  assert.match(source, /_escape\(offer\.condition_label\)/);
  assert.match(source, /_escape\(offer\.size_label\)/);
  assert.match(source, /_escape\(p\.name\)/);
});

test('supports switching between sibling offers (sealed/tester/partial) without leaving the sheet', () => {
  assert.match(source, /bqv-sibling-btn/);
  assert.match(source, /_offerKey = btn\.dataset\.offerKey/);
});

test('is a real accessible dialog: focus trap, Escape to close, restores focus on close', () => {
  assert.match(source, /role.*dialog|setAttribute\('role', 'dialog'\)/);
  assert.match(source, /aria-modal/);
  assert.match(source, /e\.key === 'Escape'/);
  assert.match(source, /_prevFocus\?\.focus\?\.\(\)/);
});

test('locks and restores page scroll around the open dialog', () => {
  assert.match(source, /lockBodyScroll\(\)/);
  assert.match(source, /unlockBodyScroll\(\)/);
});

test('does nothing for a product with no bottle offers, rather than opening an empty sheet', () => {
  assert.match(source, /if \(!product \|\| !offers\.length\) return;/);
});

/* ── Wiring into the bottle catalog page ─────────────────────────────── */

test('the quick-view trigger is separate from the existing buy/choose button and page-navigation link', () => {
  assert.match(perfumesSource, /data-quick-view/);
  // The deliberate, already-documented design (see the comment above _card())
  // keeps the image/name link navigating to the full PDP and the CTA button
  // buying/choosing — this trigger must be a THIRD, additive element, not a
  // replacement for either.
  assert.match(perfumesSource, /bottle-card-link/);
  assert.match(perfumesSource, /data-add-offer/);
});

test('the trigger opens the quick view for the exact card that was clicked', () => {
  assert.match(perfumesSource, /openBottleQuickView\(product\)/);
  assert.match(perfumesSource, /quickViewBtn\.closest\('\.bottle-card'\)/);
});
