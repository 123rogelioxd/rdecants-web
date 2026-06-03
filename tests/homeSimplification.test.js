/* =============================================================
   CRO simplification — home sections after the catalog.
   Verifies the approved layout: anchor Discovery, Taste Builder
   and Smart Bundles are no longer mounted on the home page; kits
   are merged into a single "Kits para empezar" section capped at
   3 on mobile; mood rails stay capped at 3; Assistant remains.
   Static source assertions (pattern mirrors cacheFreshness/mobileCro).
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

/* ── A. Home no longer renders the removed sections ──────────── */

test('home no longer contains the "¿Conoces alguno de estos?" anchor section', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="discovery"/, 'anchor discovery section removed');
  assert.doesNotMatch(html, /ANCHOR-BASED DISCOVERY/, 'anchor discovery comment removed');
});

test('home no longer mounts Taste Builder or Smart Bundles sections', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="taste-builder"/, 'taste-builder section removed');
  assert.doesNotMatch(html, /id="smart-bundles"/, 'smart-bundles section removed');
});

/* ── B. Surviving sections + order ───────────────────────────── */

test('home keeps Assistant, mood rails and a single kits section', () => {
  const html = read('index.html');
  assert.match(html, /id="assistant"/, 'assistant present');
  assert.match(html, /id="recommendation-rails"/, 'mood rails present');
  assert.match(html, /id="discovery-sets"/, 'kits section present');
});

test('only one kits section exists in the home', () => {
  const html = read('index.html');
  const kitSections = (html.match(/id="discovery-sets"|id="smart-bundles"/g) ?? []).length;
  assert.equal(kitSections, 1, 'exactly one kit section container');
});

test('post-catalog order is Assistant -> mood rails -> kits', () => {
  const html = read('index.html');
  const a = html.indexOf('id="assistant"');
  const r = html.indexOf('id="recommendation-rails"');
  const k = html.indexOf('id="discovery-sets"');
  assert.ok(a > -1 && r > -1 && k > -1, 'all three sections present');
  assert.ok(a < r, 'assistant before mood rails');
  assert.ok(r < k, 'mood rails before kits');
});

/* ── C. Footer no longer points to a removed id ──────────────── */

test('footer Kits link points to the live kits section, not #smart-bundles', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /href="#smart-bundles"/, 'no dead #smart-bundles anchor');
  assert.match(html, /href="#discovery-sets"/, 'footer Kits -> #discovery-sets');
});

/* ── D. app.js no longer mounts/tracks the removed sections ──── */

test('app.js does not import or mount the unmounted home modules', () => {
  const app = read('assets/js/app.js');
  assert.ok(!app.includes('./ui/discovery.js'), 'anchor discovery module not imported');
  assert.ok(!app.includes('./ui/tasteBuilder.js'), 'taste builder module not imported');
  assert.ok(!app.includes('./ui/bundles.js'), 'smart bundles module not imported');
  assert.ok(!app.includes('setupBundles'), 'setupBundles not called');
  assert.ok(!app.includes('setupTasteBuilder'), 'setupTasteBuilder not called');
  assert.ok(!app.includes("setupDiscovery('discovery')"), 'anchor setupDiscovery not called');
  // surviving mounts
  assert.ok(app.includes("setupAssistant('assistant')"), 'assistant still mounted');
  assert.ok(app.includes("setupDiscoverySets('discovery-sets')"), 'kits still mounted');
  assert.ok(app.includes("Recommendations.render('recommendation-rails')"), 'mood rails still mounted');
});

test('section_viewed tracking has no dead ids (discovery / taste-builder / smart-bundles)', () => {
  const app = read('assets/js/app.js');
  const start = app.indexOf('const SECTIONS = [');
  const block = app.slice(start, app.indexOf(']', start));
  assert.ok(start > -1, 'SECTIONS array present');
  assert.ok(!block.includes("'discovery'"), 'no dead discovery id in tracking');
  assert.ok(!block.includes("'taste-builder'"), 'no dead taste-builder id in tracking');
  assert.ok(!block.includes("'smart-bundles'"), 'no dead smart-bundles id in tracking');
  assert.ok(block.includes("'assistant'"), 'assistant still tracked');
  assert.ok(block.includes("'recommendation-rails'"), 'mood rails still tracked');
  assert.ok(block.includes("'discovery-sets'"), 'kits still tracked');
});

/* ── E. Mood rails still capped at 3 ─────────────────────────── */

test('mood rails render no more than 3 collections', () => {
  const rails = read('assets/js/recommendations/index.js');
  assert.ok(rails.includes('.slice(0, 3)'), 'rails capped at 3 in _renderRails');
});

/* ── F. Merged kits section: heading + mobile "Ver más kits" ─── */

test('kits section is titled "Kits para empezar" with a "Ver más kits" affordance', () => {
  const ds = read('assets/js/ui/discoverySets.js');
  assert.ok(ds.includes('Kits para empezar'), 'section label updated');
  assert.ok(ds.includes('Ver más kits'), 'show-more control present');
  assert.ok(ds.includes('MOBILE_VISIBLE_SETS'), 'mobile cap constant present');
});

test('CSS hides kits beyond the 3rd on mobile until expanded', () => {
  const css = read('assets/css/components.css');
  assert.ok(css.includes('.ds-more'), 'show-more button styled');
  assert.ok(/\.ds-grid:not\(\.is-expanded\) \.ds-card:nth-child\(n \+ 4\)/.test(css),
    'cards beyond the 3rd hidden on mobile until expanded');
});
