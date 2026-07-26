/* =============================================================
   Iteration 2 — brand identity + beginner-first storefront.

   Guards the things a visitor judges in the first two seconds (a real
   favicon instead of the browser's generic globe, a real logo instead of
   letterspaced text) and the things that decide whether they can act
   (one dominant CTA, three questions they can answer, three
   recommendations instead of the whole catalog).
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const exists = path => existsSync(join(root, path));

const PAGES = ['index.html', 'catalogo.html', 'elegir.html', 'ayuda.html', 'product.html', 'mood.html'];

/* ── A. Favicon: every page, real files, cache-busted ────────── */

test('the brand derivatives exist at every size the browsers ask for', () => {
  const required = [
    'favicon.ico',
    'assets/brand/rdecants-monogram.png',
    'assets/brand/favicon-16.png',
    'assets/brand/favicon-32.png',
    'assets/brand/favicon-48.png',
    'assets/brand/favicon-192.png',
    'assets/brand/favicon-512.png',
    'assets/brand/apple-touch-icon.png',
    'site.webmanifest',
  ];
  for (const file of required) {
    assert.ok(exists(file), `${file} is missing`);
    assert.ok(statSync(join(root, file)).size > 0, `${file} is empty`);
  }
});

test('every public page declares the favicon, not just the home', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<link rel="icon" href="\/favicon\.ico\?v=/, `${page}: .ico`);
    assert.match(html, /sizes="32x32" href="\/assets\/brand\/favicon-32\.png\?v=/, `${page}: 32px png`);
    assert.match(html, /sizes="16x16" href="\/assets\/brand\/favicon-16\.png\?v=/, `${page}: 16px png`);
    assert.match(html, /rel="apple-touch-icon" sizes="180x180"/, `${page}: apple touch icon`);
    assert.match(html, /rel="manifest" href="\/site\.webmanifest/, `${page}: manifest`);
    assert.match(html, /<meta name="theme-color" content="#f4f1ea">/, `${page}: theme colour`);
  }
});

test('favicon references are versioned — browsers cache these hardest of all', () => {
  const version = read('VERSION').trim();
  for (const page of PAGES) {
    const html = read(page);
    const icons = [...html.matchAll(/href="(\/favicon\.ico|\/assets\/brand\/[^"]+)"/g)].map(m => m[1]);
    for (const href of icons) {
      assert.match(href, new RegExp(`\\?v=${version.replace(/\./g, '\\.')}$`), `${page}: ${href} is not cache-busted`);
    }
  }
});

test('the web manifest points at the generated icons', () => {
  const manifest = JSON.parse(read('site.webmanifest'));
  const sizes = manifest.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'PWA icon sizes present');
  assert.equal(manifest.theme_color, '#f4f1ea');
});

/* ── B. Header lockup ────────────────────────────────────────── */

test('every page shares one header lockup: real monogram + wordmark', () => {
  for (const page of PAGES) {
    const html = read(page);
    const header = html.slice(html.indexOf('<header class="header">'), html.indexOf('</header>'));

    assert.match(header, /class="logo-mark"/, `${page}: monogram image`);
    assert.match(header, /src="\/assets\/brand\/rdecants-monogram\.png/, `${page}: uses the official artwork`);
    assert.match(header, /alt="RDecants"/, `${page}: the logo is labelled`);
    assert.match(header, /width="\d+" height="\d+"/, `${page}: dimensions reserved against layout shift`);
    assert.match(header, /<span class="logo-text">RDECANTS<\/span>/, `${page}: wordmark`);
    assert.ok(!/class="logo-mark"[^>]*loading="lazy"/.test(header), `${page}: the logo must not be lazy-loaded`);
  }
});

test('the monogram is the only brand image the header loads', () => {
  const css = read('assets/css/components.css');
  assert.match(css, /\.logo-mark \{[^}]*height: 30px/s, 'mobile lockup height is 30–34px');
  assert.match(css, /\.logo-mark \{ height: 34px; \}/, 'desktop lockup height is 34–40px');
});

/* ── C. "Ayúdame a elegir" cannot be missed ──────────────────── */

test('the finder is the dominant action of the hero, with its cost stated', () => {
  const html = read('index.html');
  const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf('</section>', html.indexOf('<section class="hero">')));

  assert.match(hero, /class="hero-cta"[^>]*href="\/elegir\.html"/s, 'the finder is the hero CTA');
  assert.match(hero, /3 preguntas · menos de 1 min/, 'the effort is stated up front');
  assert.match(hero, /class="btn-outline"[^>]*href="\/catalogo\.html"/s, 'the catalog is the outline secondary');

  /* Exactly one filled action in the hero: two equal buttons is no hierarchy. */
  assert.equal((hero.match(/class="hero-cta"/g) ?? []).length, 1);
  assert.equal((hero.match(/class="btn-outline"/g) ?? []).length, 1);
});

test('the finder is offered in the header and inside the catalog too', () => {
  const home = read('index.html');
  assert.match(home, /class="nav-cta"[^>]*href="\/elegir\.html"/s, 'header action');

  const catalog = read('catalogo.html');
  assert.match(catalog, /class="helper-band"/, 'a band inside the catalog');
  assert.match(catalog, /¿No sabes cuál elegir\? Te recomendamos tres en menos de un minuto\./);
  assert.match(catalog, /class="btn-primary" href="\/elegir\.html">Ayúdame a elegir<\/a>/);
});

test('the floating WhatsApp button waits until the first screen is past', () => {
  const css = read('assets/css/components.css');
  const shell = read('assets/js/core/shell.js');

  assert.match(css, /\.whatsapp-float \{[^}]*visibility: hidden/s, 'hidden by default');
  assert.match(css, /\.whatsapp-float\.is-visible/, 'revealed by a class');
  assert.match(shell, /setupWhatsAppFloat/, 'the shell wires it');
  assert.match(shell, /window\.innerHeight \* 0\.6/, 'revealed after the first viewport');
});

/* ── D. Home composition ─────────────────────────────────────── */

test('the home explains the product before it sells anything', () => {
  const html = read('index.html');
  const hero = html.indexOf('<section class="hero">');
  const strip = html.indexOf('class="howto-strip"');
  const rail = html.indexOf('id="mas-vendidos"');

  assert.ok(hero > -1 && strip > -1 && rail > -1, 'all three present');
  assert.ok(hero < strip, 'hero first');
  assert.ok(strip < rail, 'the explanation comes before the products');

  const stripBlock = html.slice(strip, html.indexOf('</section>', strip));
  assert.match(stripBlock, /Botella original/);
  assert.match(stripBlock, /Tu decant de 3, 5 o 10 ml/);
  assert.match(stripBlock, /Listo para usar/);
});

test('the home shows four products and no size selectors', () => {
  const html = read('index.html');
  assert.match(html, /class="rail-grid rail-grid--four"/, 'the rail is capped at four');
  assert.match(html, /Ver todos/, 'link to the whole catalog');

  const css = read('assets/css/components.css');
  assert.match(css, /\.rail-grid--four > li:nth-child\(n \+ 5\) \{ display: none; \}/);
});

test('the home rail caps at four and quotes the size it sells', async () => {
  const { BESTSELLER_LIMIT, TRY_SIZE_ML, selectBestsellers } =
    await import('../assets/js/ui/bestsellers.js');

  assert.equal(BESTSELLER_LIMIT, 4);
  assert.equal(TRY_SIZE_ML, 5);

  const P = id => ({
    id, name: id, house: 'H', notes: [], badge: 'Disponible', stock: 5,
    variants: [{ size: 5, price: 100, stock: 5, availability: 5, available: true, variant_id: id }],
  });
  assert.equal(selectBestsellers(Array.from({ length: 20 }, (_, i) => P(`p${i}`))).length, 4);
});

test('the entry price in the hero tracks the real catalog floor', async () => {
  const { lowestOrderablePrice } = await import('../assets/js/ui/bestsellers.js');

  const product = (id, prices) => ({
    id, name: id, house: 'H', notes: [], badge: 'Disponible', stock: 5,
    variants: prices.map((price, i) => ({
      size: [3, 5, 10][i] ?? 5, price, stock: 5, availability: 5, available: true, variant_id: `${id}-${i}`,
    })),
  });

  assert.equal(lowestOrderablePrice([product('a', [120, 200]), product('b', [90, 150])]), 90);
  assert.equal(lowestOrderablePrice([]), null);

  /* A sold-out cheap variant must not advertise a price nobody can buy. */
  const soldOut = product('c', [50]);
  soldOut.variants[0].soldOut = true;
  soldOut.variants[0].availability = 0;
  assert.equal(lowestOrderablePrice([soldOut, product('d', [130])]), 130);
});

/* ── E. Plain-language descriptions come from real metadata ──── */

test('product descriptions are derived, never invented', async () => {
  const { describeProduct } = await import('../assets/js/recommendations/describe.js');

  const sweet = {
    name: 'X', house: 'H',
    notes: ['Vainilla', 'Miel', 'Tonka'],
    desc: 'Dulce y envolvente',
    fragrance: { scores: { crowdpleaser: 0.8, longevity: 0.9 } },
  };
  const text = describeProduct(sweet);
  assert.match(text, /^Dulce/, 'family comes from the notes');
  assert.match(text, /atractivo/, 'character comes from the scores');
  assert.match(text, /duradero/, 'performance comes from the scores');

  /* Nothing to say → say nothing, rather than inventing a personality. */
  assert.equal(describeProduct({ name: 'Y', notes: [], desc: '', fragrance: null }), '');
  assert.equal(describeProduct(null), '');
});

/* ── F. Three recommendations, not the catalog ───────────────── */

test('the finder returns at most three labelled picks', async () => {
  const { getBeginnerPicks, PICK_LABELS } = await import('../assets/js/recommendations/assistant.js');

  const make = (id, scores) => ({
    id, name: id, house: 'House', slug: id,
    notes: ['Bergamota', 'Cedro', 'Lavanda'],
    desc: 'Fresco y limpio para diario',
    story: 'Versátil y fácil de usar',
    badge: 'Disponible', stock: 10, gender: 'unisex',
    fragrance: {
      scent_family_normalized: 'fresh',
      mood_tags: ['diario', 'versatil'],
      recommendation_tags: ['diario', 'versatil'],
      occasions: ['dia'],
      style_tags: ['fresco', 'limpio', 'versatil'],
      accords: ['citrus'],
      scores,
    },
    variants: [3, 5, 10].map((size, i) => ({
      size, price: 100 + size * 10, stock: 10, availability: 10,
      available: true, soldOut: false, variant_id: `${id}-${i}`,
    })),
  });

  const products = [
    make('safe-one',   { versatility: 0.95, crowdpleaser: 0.95, projection: 0.3, longevity: 0.4 }),
    make('loud-one',   { versatility: 0.3,  crowdpleaser: 0.4,  projection: 0.95, longevity: 0.95 }),
    make('middle-one', { versatility: 0.6,  crowdpleaser: 0.6,  projection: 0.6,  longevity: 0.6 }),
    make('extra-one',  { versatility: 0.5,  crowdpleaser: 0.5,  projection: 0.5,  longevity: 0.5 }),
  ];

  const answers = { gender: 'any', age: '19-24', occasion: 'dia', preference: 'versatil' };
  const picks = getBeginnerPicks(answers, products);

  assert.ok(picks.length > 0 && picks.length <= 3, 'never more than three');
  assert.deepEqual(picks.map(p => p.role), ['best', 'safe', 'standout'].slice(0, picks.length));
  assert.equal(picks[0].label, PICK_LABELS.best);

  /* Each pick is a distinct product and explains itself in plain words. */
  assert.equal(new Set(picks.map(p => String(p.product.id))).size, picks.length);
  for (const pick of picks) {
    assert.ok(pick.blurb.length > 0, `${pick.role} has a human description`);
    assert.ok(pick.suggestedMl > 0, `${pick.role} suggests a size to try`);
  }

  /* Deterministic: the same answers always produce the same three. */
  assert.deepEqual(
    getBeginnerPicks(answers, products).map(p => String(p.product.id)),
    picks.map(p => String(p.product.id)),
  );
});

test('age never filters the catalog — it only sets the size to try first', async () => {
  const { suggestedStarterMl, AGE_RULES } = await import('../assets/js/recommendations/assistant.js');

  assert.equal(suggestedStarterMl('15-18'), 3, 'a first fragrance starts small');
  assert.equal(suggestedStarterMl('19-24'), 5);
  assert.equal(suggestedStarterMl('35+'), 5);
  assert.equal(suggestedStarterMl(undefined), 5, 'unanswered falls back to the common size');

  /* The rule exists in exactly one place so the missing metadata stays
     documented rather than being reinvented per surface. */
  assert.deepEqual(Object.keys(AGE_RULES), ['15-18', '19-24', '25-34', '35+']);
});

test('a gift with no stated preference is treated as the safe option', async () => {
  const { resolvePreference } = await import('../assets/js/recommendations/assistant.js');

  assert.equal(resolvePreference({ occasion: 'regalo' }), 'versatil');
  assert.equal(resolvePreference({ occasion: 'regalo', preference: 'destacar' }), 'destacar');
  assert.equal(resolvePreference({ occasion: 'dia' }), null, 'no preference is not a preference');
});

test('the finder page renders three picks and offers the set before the long list', () => {
  const page = read('assets/js/pages/finder.js');
  assert.match(page, /getBeginnerPicks/, 'uses the shared engine');
  assert.match(page, /¿No quieres elegir sólo uno\? Prueba tus tres recomendaciones\./);
  assert.match(page, /Ver más opciones/);

  const setIndex = page.indexOf('_setOffer');
  const moreIndex = page.indexOf('picks-more');
  assert.ok(setIndex > -1 && moreIndex > -1 && setIndex < moreIndex,
    'the set is rendered above the link to everything else');
});

/* ── G. Typography: a shop, not a magazine ───────────────────── */

test('headings are sans; the serif survives only in the wordmark', () => {
  const css = read('assets/css/components.css');
  const serifUses = [...css.matchAll(/font-family: var\(--font-serif\)/g)];
  assert.equal(serifUses.length, 1, 'exactly one serif usage remains');

  const block = css.slice(css.lastIndexOf('.logo-text', serifUses[0].index), serifUses[0].index + 60);
  assert.match(block, /\.logo-text/, 'and it is the wordmark');

  assert.match(css, /\.hero-title \{[^}]*font-family: var\(--font-display\)/s);
  assert.match(css, /\.section-title \{[^}]*font-family: var\(--font-display\)/s);
});

test('the type scale matches the brief on both viewports', () => {
  const css = read('assets/css/components.css');
  assert.match(css, /\.hero-title \{[^}]*font-size: clamp\(34px, [\d.]+vw, 48px\)/s,
    'H1 is 34–38px on mobile and 46–48px on desktop');

  const styles = read('assets/css/styles.css');
  assert.match(styles, /body \{[^}]*font-size: 16px/s, 'body text never drops below 16px');
});

/* ── H. Palette discipline ───────────────────────────────────── */

test('the primary action is ink, and the accent stays rare', () => {
  const tokens = read('assets/css/tokens.css');
  const css = read('assets/css/components.css');

  assert.match(tokens, /--action:\s*#191816/);
  assert.match(tokens, /--action-hover:\s*#30302d/);

  assert.match(css, /\.btn-primary \{[^}]*background: var\(--action\)/s, 'primary button is ink');
  assert.doesNotMatch(css, /\.btn-primary \{[^}]*background: var\(--wine\)/s, 'never a wine primary button');
  assert.match(css, /\.hero-cta \{[^}]*background: var\(--action\)/s, 'hero CTA is ink');
});
