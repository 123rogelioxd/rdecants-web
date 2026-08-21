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

test('home order is hero -> packs -> routes -> Roger -> finder -> new -> how it works -> faq', () => {
  /* The funnel, in the order a purchase actually happens:
       reduce friction (hero + three trust signals)
     → offer the easy buy       (packs)
     → let them self-segment    (Prefiero elegir yo)
     → show curation            (Roger recomienda)
     → rescue the undecided     (the finder prompt)
     → allow exploration        (Nuevos)
     → answer the rest          (Cómo funciona, FAQ)

     The previous order put three explanation blocks between the hero and
     anything a visitor could buy. */
  const html = read('index.html');
  const at = needle => html.indexOf(needle);

  const hero       = at('class="hero"');
  const packs      = at('id="packs"');
  const intents    = at('id="intenciones"');
  const roger      = at('id="roger-recomienda"');
  const assistant  = at('id="asistente"');
  const newest     = at('id="nuevos"');
  const howItWorks = at('id="como-funciona"');
  const faq        = at('id="faq"');

  for (const [name, index] of Object.entries({
    hero, packs, intents, roger, assistant, newest, howItWorks, faq,
  })) {
    assert.ok(index > -1, `${name} present`);
  }

  assert.ok(hero < packs, 'the hero, then something to buy');
  assert.ok(packs < intents, 'the easiest purchase comes before the browse routes');
  assert.ok(intents < roger, 'self-service routes before the curated rail');
  assert.ok(roger < assistant, "Roger's picks before the rescue prompt");
  assert.ok(assistant < newest, 'the rescue prompt before the discovery rail');
  assert.ok(newest < howItWorks, 'products before the long-form content');
  assert.ok(howItWorks < faq, 'how it works before the FAQ');
});

test('the packs are the first thing on the page a visitor can buy', () => {
  const html = read('index.html');
  const section = html.slice(html.indexOf('id="packs"'), html.indexOf('</section>', html.indexOf('id="packs"')));

  assert.match(section, /id="packs-rail"/, 'mount point for the resolved packs');
  assert.match(section, /aria-busy="true"/, 'starts in a loading state');
  assert.match(section, /pack-skeleton/, 'the card footprint is reserved so nothing jumps');

  /* No pack name, product, price or "3 × 3 ml" is written into the HTML: a
     pack is resolved from the live catalog at runtime, so the page can never
     advertise a fragrance that is sold out or a price that has moved. */
  assert.ok(!/\$\d/.test(section), 'no hardcoded price in the markup');
  for (const template of ['Pack Todo Terreno', 'Pack Para Salir', 'Pack Para Ella']) {
    assert.ok(!section.includes(template), `${template} is rendered, not hardcoded`);
  }
});

test('the home never advertises a discount the backend cannot honour', () => {
  /* This test used to require that NO savings language existed anywhere,
     because R Supply OS had no pack discount and any "Ahorras" would have
     been a number this repository invented.

     R Supply OS now owns a real one: it derives the pack's normal total from
     the canonical 3 ml prices, applies the operator's configured rule, and
     derives it AGAIN at checkout against live variants. So savings language
     is allowed — but the guarantee it existed to protect is unchanged and now
     stated directly: every figure shown must be READ from the server payload,
     and none of it may be computed here. */
  const html = read('index.html');
  const logic = read('assets/js/recommendations/starterPacks.js');
  const ui = read('assets/js/ui/starterPacks.js');

  /* Comments are stripped first: the source explains WHY it computes nothing,
     and that reasoning is the thing most worth keeping. */
  const executable = src => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  /* No arithmetic on money, in either file. A local subtraction is exactly
     how a displayed saving starts to disagree with a charged one. */
  for (const [name, source] of [['logic', logic], ['ui', ui]]) {
    const code = executable(source);
    assert.doesNotMatch(code, /normalTotal\s*[-+*/]\s*finalTotal|finalTotal\s*[-+*/]/,
      `${name}: the saving must be read, not derived`);
    assert.doesNotMatch(code, /reduce\(\s*\(sum/, `${name}: no local total is summed`);
  }

  /* The saving that IS shown comes from the server's own discount_amount. */
  assert.match(executable(logic), /savings:\s*Number\.isFinite\(savings\)/,
    'savings is normalized straight off discount_amount');

  /* And no savings figure is hardcoded into the page itself. */
  assert.doesNotMatch(executable(html), /Ahorras?\s*\$?\d/i,
    'no static discount number in the markup');
});

test('the home no longer claims a best-seller ranking it never produced', () => {
  const html = read('index.html');

  /* The rail was headed "Más vendidos" while being sorted by availability,
     the `featured` flag and `factor_hype`. Real sales data lives at
     /api/web/trending and was not what it showed.

     Comments are stripped first: the source still explains the rename, and
     that history is worth keeping. What must not survive is the claim
     reaching a customer. */
  const rendered = html.replace(/<!--[\s\S]*?-->/g, '');

  assert.ok(!rendered.includes('Más vendidos'), 'the untrue heading is gone');
  assert.ok(!rendered.includes('id="mas-vendidos"'), 'and so is its anchor');
  assert.match(rendered, /<h2[^>]*>Roger recomienda<\/h2>/);
});

test('the hero carries the promise, two actions and three trust signals', () => {
  const html = read('index.html');
  const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf('</section>', html.indexOf('<section class="hero">')));

  assert.match(hero, /Tu próximo perfume no tiene que costarte una botella completa/);
  assert.match(hero, /Prueba fragancias originales desde 3 ml/);
  assert.match(hero, /href="\/elegir\.html"/, 'primary action is the finder');
  assert.match(hero, /href="\/catalogo\.html"/, 'secondary action is the catalog');

  /* Three compact signals, and nothing else between the actions and the
     packs — the hero must not become a section of its own again. */
  const trust = hero.slice(hero.indexOf('class="hero-trust"'), hero.indexOf('</ul>', hero.indexOf('class="hero-trust"')));
  assert.match(trust, /100% originales/);
  assert.match(trust, /Desde 3 ml/);
  assert.match(trust, /Envíos a todo México/);
  assert.equal((trust.match(/<li>/g) ?? []).length, 3, 'three signals, no more');

  assert.ok(!hero.includes('class="hero-sizes"'),
    'the 3/5/10 ml chips moved into "Cómo funciona" — the hero is not an explainer');
});

test('each promise is claimed in at most two places, both deliberate', () => {
  const html = read('index.html');

  /* The hero states the fast signals a first-time visitor needs before they
     scroll; the process strip closes "Cómo funciona" with the guarantees.
     That is two occurrences by design. A third means the page has started
     padding itself again, which is what the old four trust blocks were. */
  const strip = html.slice(html.indexOf('class="trust-line"'), html.indexOf('</ul>', html.indexOf('class="trust-line"')));
  assert.match(strip, /100% originales/);
  assert.match(strip, /Preparados al momento/);
  assert.match(strip, /Envíos a todo México/);

  /* Comments and the structured-data block are not customer-visible copy. */
  const rendered = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

  for (const [promise, limit] of [
    ['100% originales', 2],       /* hero + process strip */
    ['Preparados al momento', 1], /* process strip only */
    ['Envíos a todo México', 4],  /* infobar, hero, strip, footer tagline */
  ]) {
    assert.ok(
      (rendered.match(new RegExp(promise, 'g')) ?? []).length <= limit,
      `"${promise}" is claimed more than ${limit} time(s) on the home`,
    );
  }
});

test('the best-seller rail links to the full catalog instead of inlining it', () => {
  const html = read('index.html');
  assert.match(html, /id="bestsellers-grid"/, 'rail mount present');
  assert.match(html, /Ver catálogo completo/, 'explicit path to the whole catalog');
  assert.match(html, /href="\/catalogo\.html"/, 'the link is a real route');
});

test('exactly three shopping routes are offered, each with a destination', () => {
  const html = read('index.html');
  const section = html.slice(html.indexOf('id="intenciones"'), html.indexOf('</section>', html.indexOf('id="intenciones"')));
  assert.match(section, /Prefiero elegir yo/, 'named for what it is: the self-service route');
  assert.match(section, /Explora según la ocasión que traes en mente\./);

  const grid = html.slice(html.indexOf('id="intent-grid"'), html.indexOf('</ul>', html.indexOf('id="intent-grid"')));

  /* Three, not four: "cita", "fiesta" and "noche" are one decision for a
     customer, and the catalogue metadata cannot separate them anyway. */
  assert.equal((grid.match(/class="intent-tile"/g) ?? []).length, 3, 'three tiles, no more');
  assert.match(grid, /De día/);
  assert.match(grid, /Para salir/);
  assert.match(grid, /Para regalar/);

  /* The hints say what each route covers so nobody has to guess. */
  assert.match(grid, /Citas, fiesta, noche/);

  /* Every tile leads somewhere real: a pre-filtered catalog or the finder. */
  const hrefs = [...grid.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(hrefs.length, 3, 'every tile is a link');
  for (const href of hrefs) {
    assert.ok(
      href.startsWith('/catalogo.html?') || href === '/elegir.html',
      `intent destination "${href}" is filtered results or the guided flow`,
    );
  }

  /* Each one is measurable, or we cannot answer "which route do people take?" */
  assert.equal((grid.match(/data-path="/g) ?? []).length, 3);
});

test('the guided flow is offered once more, as a compact rescue prompt', () => {
  const html = read('index.html');
  const section = html.slice(html.indexOf('id="asistente"'), html.indexOf('</section>', html.indexOf('id="asistente"')));

  assert.match(section, /¿No sabes cuál elegir\?/, 'the question, on its own line');
  assert.match(section, /Responde tres preguntas\./, 'and what it costs to answer');
  assert.match(section, /href="\/elegir\.html"/);
  assert.match(html, /class="section[^"]*section--band"[^>]*id="asistente"/,
    'compact by construction: it must not compete with the hero');
});

test('the new-arrivals rail is short and links out rather than growing', () => {
  const html = read('index.html');
  const section = html.slice(html.indexOf('id="nuevos"'), html.indexOf('</section>', html.indexOf('id="nuevos"')));

  assert.match(section, /Nuevos en RDECANTS/);
  assert.match(section, /id="newest-grid"/);
  assert.match(section, /rail-grid--four/, 'capped like every other rail');
  assert.match(section, /href="\/catalogo\.html\?sort=newest"/, 'the rest is one tap away');
});

test('how it works is three short steps', () => {
  const html = read('index.html');
  const steps = html.slice(html.indexOf('steps-grid'), html.indexOf('</ol>', html.indexOf('steps-grid')));
  assert.equal((steps.match(/class="step-card"/g) ?? []).length, 3, 'exactly three steps');
  assert.match(steps, /Elige tu perfume/);
  assert.match(steps, /Selecciona 3, 5 o 10 ml/);
  assert.match(steps, /Envía tu pedido por WhatsApp/);
});

test('authenticity is stated once — and the lot evidence is still one tap away', () => {
  /* The standing "Cada decant sale de un frasco original" panel is gone: it
     was a full section restating the trust line and the FAQ's first answer.
     What it actually carried — the offer to send lot evidence over WhatsApp
     before you pay — moved into that FAQ answer, so nothing was lost except
     the third telling. */
  const html = read('index.html');
  assert.ok(!html.includes('id="autenticidad"'), 'no standing authenticity section');
  assert.ok(!html.includes('class="authenticity-panel"'));

  const faq = html.slice(html.indexOf('class="faq-list'), html.indexOf('</div>', html.indexOf('class="faq-list')));
  assert.match(faq, /frasco/i, 'the claim survives');
  assert.match(faq, /lote/i, 'and so does the lot evidence');
  assert.match(faq, /wa\.me\/5219516513018/, 'as a real WhatsApp action, not a description of one');

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

test('the header exposes the four canonical storefront destinations, search and cart', () => {
  const html = read('index.html');
  const header = html.slice(html.indexOf('<header class="header">'), html.indexOf('</header>'));

  assert.match(header, /class="header-logo"/);
  assert.match(header, /href="\/catalogo\.html"/);
  assert.match(header, /href="\/perfumes\.html"/);
  assert.match(header, /href="\/cotiza\.html"/);
  assert.match(header, /href="\/elegir\.html"/);
  assert.match(header, /id="btn-hs-mobile"/, 'search is an icon');
  assert.match(header, /id="cart-count"/, 'cart shows a quantity');

  /* Three browse/quote destinations plus the highlighted finder action. */
  assert.equal((header.match(/class="header-nav-link"/g) ?? []).length, 3, 'three plain nav links');
  assert.equal((header.match(/class="nav-cta"/g) ?? []).length, 1, 'one highlighted action');

  /* The home page carries no search field at all — not in the header and not
     in an overlay. The magnifier navigates to the catalog, which owns the one
     search input in the storefront. */
  assert.doesNotMatch(header, /id="hs-input"/, 'no search field in the header');
  assert.doesNotMatch(html, /hs-wrap/, 'no search overlay on the home page');
  assert.doesNotMatch(html, /type="search"/, 'no second search input anywhere on the home');
});

test('footer links point to live routes only', () => {
  const html = read('index.html');
  const footer = html.slice(html.indexOf('<footer class="footer">'));

  assert.match(footer, /wa\.me\/5219516513018/, 'WhatsApp');
  assert.match(footer, /href="\/catalogo\.html"/, 'Catálogo');
  assert.match(footer, /href="\/elegir\.html"/, 'Ayúdame a elegir');
  assert.match(footer, /RDECANTS/, 'customer-facing legal line kept');

  for (const dead of ['#assistant', '#discovery-sets', '#smart-bundles', '#taste-builder', '#guide']) {
    assert.ok(!footer.includes(`href="${dead}"`), `no dead ${dead} anchor`);
  }
});

/* ── D. Entry points mount the right things ──────────────────── */

test('app.js is the discovery entry point and mounts no catalog machinery', () => {
  const app = read('assets/js/app.js');
  assert.ok(app.includes('renderStarterPacks'), 'home renders the starter packs');
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

  /* The kit is built from the RANKING, not from an intent map. `_pickSetForAnswers`
     chose an editorial template from a single answer (occasion 'noche' → the
     'noches' kit) and ignored the rest, which is how a "Mujer" result ended up
     offering three masculine fragrances with an add-to-cart button. */
  const executable = kits.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!executable.includes('_pickSetForAnswers'),
    'the intent→template map must not come back');
  assert.ok(kits.includes('buildPersonalizedSet'), 'the contextual kit is built from the recommendations');
  assert.match(render, /renderContextualKit\?\.\(slot, \{\s*recommendations:/s,
    'the catalog passes the ranked rows, not the raw answers');
});
