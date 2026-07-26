/* =============================================================
   Progressive-disclosure information architecture (2026-07 redesign).

   The old home was one page that tried to do everything at once:
   brand, guided search, six intents, a questionnaire, the full 73-SKU
   catalog with search/sort/filters, four trust blocks and a six-item
   FAQ. The problem was never the amount of information — it was that
   every decision arrived on the same screen.

   The storefront is now three surfaces:
     • /                discovery: hero, best sellers, four intents,
                        how it works, authenticity, four questions
     • /catalogo.html   the store: search, filters, sort, all products
     • /elegir.html     the guided three-question finder

   These are static source assertions (same pattern as
   cacheFreshness / mobileCro): cheap guards that the split holds.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

/* ── A. The three surfaces exist and are separate ────────────── */

test('the storefront is split into home, catalog and finder pages', () => {
  for (const page of ['index.html', 'catalogo.html', 'elegir.html']) {
    assert.ok(existsSync(join(root, page)), `${page} exists`);
  }
});

test('the home carries no catalog grid and none of its controls', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="products-grid"/, 'catalog grid is not on the home');
  assert.doesNotMatch(html, /id="sf-bar"/, 'filter bar is not on the home');
  assert.doesNotMatch(html, /id="sf-sort"/, 'sort control is not on the home');
  assert.doesNotMatch(html, /id="sf-filter-btn"/, 'filter button is not on the home');
});

test('the catalog page owns the grid, and the finder page owns the questions', () => {
  const catalog = read('catalogo.html');
  assert.match(catalog, /id="products-grid"/, 'catalog page has the grid');
  assert.match(catalog, /id="catalog"/, 'catalog page has the scroll target');

  const finder = read('elegir.html');
  assert.match(finder, /id="finder-root"/, 'finder page has the stepper mount');
  assert.doesNotMatch(finder, /id="products-grid"/, 'finder page is not a second catalog');
});

/* ── B. Home section order and content ───────────────────────── */

test('home order is hero -> bestsellers -> intents -> how it works -> authenticity -> faq', () => {
  const html = read('index.html');
  const at = needle => html.indexOf(needle);

  const hero          = at('class="hero"');
  const bestsellers   = at('id="mas-vendidos"');
  const intents       = at('id="intenciones"');
  const howItWorks    = at('id="como-funciona"');
  const authenticity  = at('id="autenticidad"');
  const faq           = at('id="faq"');

  for (const [name, index] of Object.entries({ hero, bestsellers, intents, howItWorks, authenticity, faq })) {
    assert.ok(index > -1, `${name} present`);
  }

  assert.ok(hero < bestsellers, 'hero before best sellers');
  assert.ok(bestsellers < intents, 'best sellers is the first commercial section');
  assert.ok(intents < howItWorks, 'intents before how it works');
  assert.ok(howItWorks < authenticity, 'how it works before authenticity');
  assert.ok(authenticity < faq, 'authenticity before the FAQ');
});

test('the hero states what is sold, the sizes and the entry price', () => {
  const html = read('index.html');
  assert.match(html, /Prueba perfumes originales sin comprar la botella completa\./);
  assert.match(html, /Frascos pequeños de 3, 5 y 10 ml desde/);
  assert.match(html, /data-entry-price/, 'the entry price is a live value, not a frozen string');
});

test('the trust line is stated once, with the explanation strip', () => {
  const html = read('index.html');
  const strip = html.slice(html.indexOf('class="trust-line"'), html.indexOf('</ul>', html.indexOf('class="trust-line"')));
  assert.match(strip, /100% originales/);
  assert.match(strip, /Preparados al momento/);
  assert.match(strip, /Envíos a todo México/);

  /* Repeating the same three promises in four places is what made the old
     page feel padded. One occurrence each. */
  for (const promise of ['100% originales', 'Preparados al momento']) {
    assert.equal(
      (html.match(new RegExp(promise, 'g')) ?? []).length, 1,
      `"${promise}" is claimed exactly once on the home`,
    );
  }
});

test('the best-seller rail links to the full catalog instead of inlining it', () => {
  const html = read('index.html');
  assert.match(html, /id="bestsellers-grid"/, 'rail mount present');
  assert.match(html, /Ver catálogo completo/, 'explicit path to the whole catalog');
  assert.match(html, /href="\/catalogo\.html"/, 'the link is a real route');
});

test('exactly four shopping intents are offered, each with a destination', () => {
  const html = read('index.html');
  const grid = html.slice(html.indexOf('id="intent-grid"'), html.indexOf('</ul>', html.indexOf('id="intent-grid"')));

  assert.equal((grid.match(/class="intent-tile"/g) ?? []).length, 4, 'four tiles, no more');
  assert.match(grid, /Para diario/);
  assert.match(grid, /Para citas/);
  assert.match(grid, /Para la noche/);
  assert.match(grid, /Para regalar/);

  /* Every tile leads somewhere real: a pre-filtered catalog or the finder. */
  const hrefs = [...grid.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(hrefs.length, 4, 'every tile is a link');
  for (const href of hrefs) {
    assert.ok(
      href.startsWith('/catalogo.html?') || href === '/elegir.html',
      `intent destination "${href}" is filtered results or the guided flow`,
    );
  }
});

test('the guided flow is offered once more, as a quiet secondary prompt', () => {
  const html = read('index.html');
  assert.match(html, /¿No sabes cuál elegir\? Responde cuatro preguntas\./);
});

test('how it works is three short steps', () => {
  const html = read('index.html');
  const steps = html.slice(html.indexOf('steps-grid'), html.indexOf('</ol>', html.indexOf('steps-grid')));
  assert.equal((steps.match(/class="step-card"/g) ?? []).length, 3, 'exactly three steps');
  assert.match(steps, /Elige tu perfume/);
  assert.match(steps, /Selecciona 3, 5 o 10 ml/);
  assert.match(steps, /Envía tu pedido por WhatsApp/);
});

test('authenticity is stated once, in one compact section', () => {
  const html = read('index.html');
  assert.equal((html.match(/id="autenticidad"/g) ?? []).length, 1);
  assert.match(html, /frasco original/i, 'the actual claim');
  assert.match(html, /lote/i, 'the customer can ask for lot evidence');
  /* The old page repeated the same promise in a four-item trust strip
     as well as a separate authenticity block. */
  assert.doesNotMatch(html, /class="trust-strip"/, 'no duplicate trust strip on the home');
});

test('the home FAQ keeps only the four questions that block a first order', () => {
  const html = read('index.html');
  const list = html.slice(html.indexOf('class="faq-list'), html.indexOf('</div>', html.indexOf('class="faq-list')));
  assert.equal((list.match(/class="faq-item"/g) ?? []).length, 4, 'four questions, no more');
  assert.match(list, /¿Los perfumes son originales\?/);
  assert.match(list, /¿Qué tamaño me conviene\?/);
  assert.match(list, /¿Cómo pago y recibo mi pedido\?/);
  assert.match(list, /¿Qué pasa si algo llega mal\?/);

  /* The rest moved to a dedicated help page rather than disappearing. */
  assert.ok(existsSync(join(root, 'ayuda.html')), 'help page exists');
  assert.match(html, /href="\/ayuda\.html"/, 'the home points at it');
});

/* ── C. Header and footer ────────────────────────────────────── */

test('the header holds only the logo, two destinations, search and cart', () => {
  const html = read('index.html');
  const header = html.slice(html.indexOf('<header class="header">'), html.indexOf('</header>'));

  assert.match(header, /class="header-logo"/);
  assert.match(header, /href="\/catalogo\.html"/);
  assert.match(header, /href="\/elegir\.html"/);
  assert.match(header, /id="btn-hs-mobile"/, 'search is an icon');
  assert.match(header, /id="cart-count"/, 'cart shows a quantity');

  /* Two destinations: the catalog as a plain link, the finder as the
     highlighted action. */
  assert.equal((header.match(/class="header-nav-link"/g) ?? []).length, 1, 'one plain nav link');
  assert.equal((header.match(/class="nav-cta"/g) ?? []).length, 1, 'one highlighted action');

  /* The permanently visible search field is gone; the input lives in the
     overlay panel outside the header. */
  assert.doesNotMatch(header, /id="hs-input"/, 'no always-on search field in the header');
  assert.match(html, /class="hs-wrap"[^>]*id="hs-wrap"/, 'search overlay exists');
});

test('footer links point to live routes only', () => {
  const html = read('index.html');
  const footer = html.slice(html.indexOf('<footer class="footer">'));

  assert.match(footer, /wa\.me\/5219516513018/, 'WhatsApp');
  assert.match(footer, /href="\/catalogo\.html"/, 'Catálogo');
  assert.match(footer, /href="\/elegir\.html"/, 'Ayúdame a elegir');
  assert.match(footer, /R Supply/, 'legal line kept');

  for (const dead of ['#assistant', '#discovery-sets', '#smart-bundles', '#taste-builder', '#guide']) {
    assert.ok(!footer.includes(`href="${dead}"`), `no dead ${dead} anchor`);
  }
});

/* ── D. Entry points mount the right things ──────────────────── */

test('app.js is the discovery entry point and mounts no catalog machinery', () => {
  const app = read('assets/js/app.js');
  assert.ok(app.includes('renderBestsellers'), 'home renders the best-seller rail');
  assert.ok(!app.includes('renderProducts'), 'home does not render the catalog grid');
  assert.ok(!app.includes('setupGuide('), 'the guide bar is gone with the merged page');
  assert.ok(!app.includes('./ui/tasteBuilder.js'), 'taste builder not imported');
  assert.ok(!app.includes('./ui/bundles.js'), 'smart bundles not imported');
});

test('the catalog page mounts the full catalog and honours URL guidance', () => {
  const page = read('assets/js/pages/catalog.js');
  assert.ok(page.includes('renderProducts'), 'grid rendered');
  assert.ok(page.includes('readGuideFromQuery'), 'intent / answers read from the URL');
  assert.ok(page.includes('SearchBar.applyGuide'), 'guidance re-ranks the grid in place');
  assert.ok(page.includes('SearchBar.applyQuery'), 'a shared search link lands filtered');
});

test('the finder page reuses the shared questions and hands off to the catalog', () => {
  const page = read('assets/js/pages/finder.js');
  assert.ok(page.includes('ASSISTANT_QUESTIONS'), 'reuses the one question set');
  assert.ok(page.includes('buildCatalogUrl'), 'results are the re-ranked catalog, not a third view');
  assert.ok(!page.includes('rankCatalogForAnswers'), 'no second ranking implementation');
});

test('section_viewed tracking targets the sections that actually exist', () => {
  const app = read('assets/js/app.js');
  const start = app.indexOf('const SECTIONS = [');
  assert.ok(start > -1, 'SECTIONS array present');
  const block = app.slice(start, app.indexOf(']', start));
  const html = read('index.html');

  for (const id of [...block.matchAll(/'([a-z-]+)'/g)].map(m => m[1])) {
    assert.match(html, new RegExp(`id="${id}"`), `tracked section #${id} exists on the home`);
  }
});

/* ── E. Old deep links still resolve ─────────────────────────── */

test('legacy #catalog / #guide links are routed to the pages that replaced them', () => {
  const app = read('assets/js/app.js');
  assert.ok(app.includes("'#catalog': '/catalogo.html'"), '#catalog goes to the catalog page');
  assert.ok(app.includes("'#guide': '/elegir.html'"), '#guide goes to the finder page');
});

test('clean URLs for the new pages are routed by every host config', () => {
  const htaccess = read('.htaccess');
  assert.match(htaccess, /RewriteRule\s+\^catalogo\/\?\$\s+catalogo\.html/);
  assert.match(htaccess, /RewriteRule\s+\^elegir\/\?\$\s+elegir\.html/);

  const redirects = read('_redirects');
  assert.match(redirects, /\/catalogo\s+\/catalogo\.html\s+200/);
  assert.match(redirects, /\/elegir\s+\/elegir\.html\s+200/);
});

/* ── F. Kits stay contextual (unchanged behaviour) ───────────── */

test('kits are rendered contextually after a guided recommendation', () => {
  const render = read('assets/js/catalog/render.js');
  const kits = read('assets/js/ui/discoverySets.js');
  assert.ok(render.includes('renderContextualKit'), 'catalog renders the contextual kit after guided results');
  assert.ok(kits.includes('export async function renderContextualKit'), 'kits module exposes the contextual entry');
  assert.ok(kits.includes('_pickSetForAnswers'), 'the kit shown matches the finder answers');
});
