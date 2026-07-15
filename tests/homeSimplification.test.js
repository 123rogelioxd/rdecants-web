/* =============================================================
   Guided-catalog information architecture (Phase 1).

   The home page is ONE guided catalog: a compact hero, a guide bar
   (intent chips + opt-in stepper finder) that re-ranks the SAME catalog
   grid in place directly below it, then a concrete how-it-works/trust
   strip, and the FAQ. The standalone finder, mood rails and kit
   sections are gone; their engines are reused contextually (finder
   ranking drives the grid; kits appear only after a recommendation;
   mood pages survive as /mood/{slug} landing pages).

   Static source assertions (pattern mirrors cacheFreshness/mobileCro).
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

/* ── A. Removed competing discovery surfaces ─────────────────── */

test('home no longer contains standalone finder / mood-rails / kit sections', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="assistant"/, 'standalone finder section removed');
  assert.doesNotMatch(html, /id="recommendation-rails"/, 'mood rails section removed');
  assert.doesNotMatch(html, /id="discovery-sets"/, 'standalone kits section removed');
  assert.doesNotMatch(html, /id="discovery"/, 'anchor discovery section removed');
  assert.doesNotMatch(html, /id="taste-builder"/, 'taste-builder section removed');
  assert.doesNotMatch(html, /id="smart-bundles"/, 'smart-bundles section removed');
});

test('home no longer contains the separate how-it-works / authenticity sections', () => {
  const html = read('index.html');
  /* Their concrete content is folded into the trust strip + FAQ, near the
     first commercial decision. */
  assert.doesNotMatch(html, /id="how-it-works"/, 'standalone how-it-works removed');
  assert.doesNotMatch(html, /id="authenticity"/, 'standalone authenticity removed');
});

/* ── B. Surviving guided-catalog surfaces + order ────────────── */

test('home has the guide bar, trust strip, catalog and FAQ', () => {
  const html = read('index.html');
  assert.match(html, /id="guide"/, 'guide bar present');
  assert.match(html, /class="trust-strip"/, 'trust strip present');
  assert.match(html, /id="catalog"/, 'catalog present');
  assert.match(html, /id="faq"/, 'FAQ present');
});

test('order is hero -> guide bar -> catalog -> trust strip -> faq', () => {
  const html = read('index.html');
  /* Guidance and browsing must read as ONE surface, so the guide bar sits
     DIRECTLY above the catalog with nothing between them. The trust/how-it-works
     strip moves below the collection (reassurance is also placed at the actual
     decision points — cart and product detail). */
  const hero = html.indexOf('class="hero"');
  const guide = html.indexOf('id="guide"');
  const catalog = html.indexOf('id="catalog"');
  const trust = html.indexOf('class="trust-strip"');
  const faq = html.indexOf('id="faq"');
  assert.ok(hero > -1 && guide > -1 && trust > -1 && catalog > -1 && faq > -1, 'all present');
  assert.ok(hero < guide, 'hero before guide bar');
  assert.ok(guide < catalog, 'guide bar directly before catalog');
  assert.ok(catalog < trust, 'catalog before trust strip');
  assert.ok(trust < faq, 'trust strip before faq');
});

test('trust strip makes concrete, process-backed claims (not a generic icon strip)', () => {
  const html = read('index.html');
  assert.match(html, /frascos? originales/i, 'authenticity claim');
  assert.match(html, /momento/i, 'prepared-to-order claim');
  assert.match(html, /5 ml/i, 'try-then-upgrade claim');
  assert.match(html, /WhatsApp/i, 'payment/shipping via WhatsApp claim');
});

/* ── C. Footer no longer points at removed sections ──────────── */

test('footer links point to live sections only (no dead #assistant / #discovery-sets)', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /href="#assistant"/, 'no dead #assistant anchor');
  assert.doesNotMatch(html, /href="#discovery-sets"/, 'no dead #discovery-sets anchor');
  assert.doesNotMatch(html, /href="#smart-bundles"/, 'no dead #smart-bundles anchor');
  assert.match(html, /href="#guide"/, 'footer/nav points to the guide bar');
  assert.match(html, /href="#catalog"/, 'footer points to the catalog');
});

/* ── D. app.js mounts the guided catalog, not the removed modules ─ */

test('app.js mounts the guide bar and no longer mounts removed home modules', () => {
  const app = read('assets/js/app.js');
  assert.ok(app.includes("setupGuide('guide')"), 'guide bar mounted');
  assert.ok(!app.includes('setupAssistant('), 'standalone finder not mounted');
  assert.ok(!app.includes("Recommendations.render('recommendation-rails')"), 'mood rails not mounted');
  assert.ok(!app.includes("setupDiscoverySets('discovery-sets')"), 'standalone kits not mounted');
  assert.ok(!app.includes('./ui/tasteBuilder.js'), 'taste builder not imported');
  assert.ok(!app.includes('./ui/bundles.js'), 'smart bundles not imported');
});

test('section_viewed tracking targets the guided-catalog sections, no dead ids', () => {
  const app = read('assets/js/app.js');
  const start = app.indexOf('const SECTIONS = [');
  const block = app.slice(start, app.indexOf(']', start));
  assert.ok(start > -1, 'SECTIONS array present');
  assert.ok(block.includes("'guide'"), 'guide bar tracked');
  assert.ok(block.includes("'catalog'"), 'catalog tracked');
  assert.ok(!block.includes("'recommendation-rails'"), 'no dead mood-rails id');
  assert.ok(!block.includes("'discovery-sets'"), 'no dead kit-section id');
  assert.ok(!block.includes("'taste-builder'"), 'no dead taste-builder id');
});

/* ── E. Kits are contextual (post-recommendation), never a standing section ─ */

test('kits are rendered contextually after a guided recommendation', () => {
  const render = read('assets/js/catalog/render.js');
  const kits = read('assets/js/ui/discoverySets.js');
  assert.ok(render.includes('renderContextualKit'), 'catalog renders the contextual kit after guided results');
  assert.ok(kits.includes('export async function renderContextualKit'), 'kits module exposes the contextual entry');
  assert.ok(kits.includes('_pickSetForAnswers'), 'the kit shown matches the finder answers');
});
