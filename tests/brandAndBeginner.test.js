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
    assert.match(html, /<meta name="theme-color" content="#F5F1E8">/, `${page}: theme colour`);
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
  const rail = html.indexOf('id="roger-recomienda"');

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

test('the finder returns at most three picks, numbered in score order', async () => {
  const { getBeginnerPicks, PICK_LABELS } = await import('../assets/js/recommendations/assistant.js');

  const make = (id, scores) => ({
    id, name: id, house: 'House', slug: id,
    notes: ['Bergamota', 'Cedro', 'Lavanda'],
    desc: 'Fresco y limpio para diario',
    story: 'Versátil y fácil de usar',
    badge: 'Disponible', stock: 10, gender: 'unisex',
    fragrance: {
      scent_family_normalized: 'citrico',
      moods: ['limpio', 'moderno', 'juvenil'],
      mood_tags: ['limpio', 'moderno', 'juvenil'],
      recommendation_tags: ['diario', 'versatil', 'facil_de_usar'],
      occasions: ['diario', 'escuela'],
      climates: ['calido', 'templado'],
      style_tags: ['fresco', 'limpio', 'versatil'],
      accords: ['citrico', 'acuatico'],
      scores,
    },
    variants: [3, 5, 10].map((size, i) => ({
      size, price: 100 + size * 10, stock: 10, availability: 10,
      available: true, soldOut: false, variant_id: `${id}-${i}`,
    })),
  });

  const base = {
    office_safe: 0.8, freshness: 0.8, summer: 0.85, cold_weather: 0.45,
    intensity: 0.4, longevity: 0.6, night_out: 0.35, date_night: 0.55,
    compliment: 0.65, elegance: 0.6, sweetness: 0.25,
  };
  const products = [
    make('safe-one',   { ...base, versatility: 0.95, mass_appeal: 0.95, blind_buy_safe: 0.9, beginner_friendly: 0.92, projection: 0.3 }),
    make('middle-one', { ...base, versatility: 0.8,  mass_appeal: 0.8,  blind_buy_safe: 0.78, beginner_friendly: 0.8, projection: 0.5 }),
    make('extra-one',  { ...base, versatility: 0.74, mass_appeal: 0.74, blind_buy_safe: 0.72, beginner_friendly: 0.74, projection: 0.5 }),
    make('fourth-one', { ...base, versatility: 0.7,  mass_appeal: 0.7,  blind_buy_safe: 0.68, beginner_friendly: 0.7, projection: 0.5 }),
  ];

  const answers = { gender: 'unisex', age: '19-24', occasion: 'dia', goal: 'versatil', climate: 'calido' };
  const picks = getBeginnerPicks(answers, products);

  assert.ok(picks.length > 0 && picks.length <= 3, 'never more than three');

  /* The three cards ARE ranks 1–3 of one order. They used to be
     "best / safe / standout", where cards two and three were chosen by a
     second pass that ignored the ranking — so the third card could be a
     product the engine had placed last. */
  assert.deepEqual(picks.map(p => p.rank), [1, 2, 3].slice(0, picks.length));
  assert.deepEqual(picks.map(p => p.label), [
    'Nuestra recomendación #1', 'Nuestra recomendación #2', 'Nuestra recomendación #3',
  ].slice(0, picks.length));
  assert.equal(picks[0].label, PICK_LABELS[1]);

  /* Literally descending by score — no re-shuffling for variety. */
  for (let i = 1; i < picks.length; i++) {
    assert.ok(picks[i - 1].compatibility >= picks[i].compatibility,
      `#${i} (${picks[i - 1].compatibility}) must not rank below #${i + 1} (${picks[i].compatibility})`);
  }
  assert.equal(picks[0].product.id, 'safe-one', 'the best versatility fit leads');

  /* Each pick is a distinct product and explains itself in plain words. */
  assert.equal(new Set(picks.map(p => String(p.product.id))).size, picks.length);
  for (const pick of picks) {
    assert.ok(pick.blurb.length > 0, `#${pick.rank} has a human description`);
    assert.ok(pick.reason.length > 0, `#${pick.rank} says why it is there`);
    assert.ok(pick.suggestedMl > 0, `#${pick.rank} suggests a size to try`);
    assert.ok(pick.genderDisplay?.label, `#${pick.rank} states who it is for`);
  }

  /* Deterministic: the same answers always produce the same three. */
  assert.deepEqual(
    getBeginnerPicks(answers, products).map(p => String(p.product.id)),
    picks.map(p => String(p.product.id)),
  );
});

test('age sets the size to try first AND is a real (never disqualifying) affinity signal', async () => {
  const { suggestedStarterMl, AGE_RULES, getAssistantRecommendations } =
    await import('../assets/js/recommendations/assistant.js');

  assert.equal(suggestedStarterMl('15-18'), 3, 'a first fragrance starts small');
  assert.equal(suggestedStarterMl('19-24'), 5);
  assert.equal(suggestedStarterMl('35+'), 5);
  assert.equal(suggestedStarterMl(undefined), 5, 'unanswered falls back to the common size');

  /* The rule exists in exactly one place so the missing age metadata stays
     documented rather than being reinvented per surface. */
  assert.deepEqual(Object.keys(AGE_RULES), ['15-18', '19-24', '25-34', '35+']);

  /* R Supply OS sends no age field, but it does send a mood vocabulary that
     carries real audience signal. Age therefore MOVES the score — it used to
     do nothing at all beyond picking a bottle size. */
  const make = (id, moods, scores) => ({
    id, name: id, house: 'House', gender: 'unisex', notes: [], desc: '', story: '',
    badge: 'Disponible', stock: 10,
    fragrance: {
      occasions: ['diario'], climates: ['templado'], moods, mood_tags: moods,
      style_tags: ['limpio'], recommendation_tags: ['diario'],
      accords: ['citrico'], scent_family_normalized: 'citrico', scores,
    },
    variants: [{ size: 5, price: 180, stock: 10, availability: 10, available: true, soldOut: false, variant_id: `${id}-5` }],
  });

  const shared = {
    versatility: 0.8, mass_appeal: 0.8, blind_buy_safe: 0.78, beginner_friendly: 0.8,
    office_safe: 0.8, intensity: 0.4, projection: 0.45, longevity: 0.6,
    freshness: 0.7, summer: 0.6, cold_weather: 0.6, elegance: 0.6,
    luxury: 0.5, exclusivity: 0.45, compliment: 0.6,
  };
  const young = make('young', ['juvenil', 'social'], shared);
  const mature = make('mature', ['maduro', 'elegante', 'serio'], shared);
  const answers = { occasion: 'dia', goal: 'versatil', climate: 'templado' };

  assert.equal(getAssistantRecommendations({ ...answers, age: '15-18' }, [young, mature])[0].product.id, 'young');
  assert.equal(getAssistantRecommendations({ ...answers, age: '35+' }, [young, mature])[0].product.id, 'mature');

  /* But age is never a ban: both remain eligible at every age. */
  for (const age of Object.keys(AGE_RULES)) {
    assert.equal(getAssistantRecommendations({ ...answers, age }, [young, mature]).length, 2,
      `age ${age} must not disqualify a fragrance`);
  }
});

test('a gift with no stated preference is treated as the safe option', async () => {
  const { resolvePreference } = await import('../assets/js/recommendations/assistant.js');

  assert.equal(resolvePreference({ occasion: 'regalo' }), 'versatil');
  assert.equal(resolvePreference({ occasion: 'regalo', preference: 'destacar' }), 'destacar');
  assert.equal(resolvePreference({ occasion: 'dia' }), null, 'no preference is not a preference');
});

test('the finder page renders numbered picks and offers the set before the long list', () => {
  const page = read('assets/js/pages/finder.js');
  assert.match(page, /getFinderResult/, 'uses the shared engine');
  assert.match(page, /¿No quieres elegir sólo uno\? Prueba tus/);
  assert.match(page, /Ver más opciones compatibles/);

  const setIndex = page.indexOf('_setOffer');
  const moreIndex = page.indexOf('picks-more');
  assert.ok(setIndex > -1 && moreIndex > -1 && setIndex < moreIndex,
    'the set is rendered above the link to everything else');

  /* The editable answer summary and the honest empty/partial states are part
     of the page contract, not optional polish. */
  assert.match(page, /Cambiar respuestas/, 'the answers stay editable above the results');
  assert.match(page, /data-edit-step=/, 'each answer links back to the step that set it');
  assert.match(page, /data-relax=/, 'one condition can be relaxed, explicitly');
  assert.match(page, /_renderNoMatch/, 'a no-match state exists instead of padding');
  assert.match(page, /stashGuideHandoff/, 'every answer survives the trip to the catalog');
  assert.match(page, /genderBadgeHtml/, 'each pick states who it is for');
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

  assert.match(tokens, /--color-primary:\s*#191816/);
  assert.match(tokens, /--action:\s*var\(--color-primary\)/);
  assert.match(tokens, /--action-hover:\s*#30302d/);

  assert.match(css, /\.btn-primary \{[^}]*background: var\(--action\)/s, 'primary button is ink');
  assert.doesNotMatch(css, /\.btn-primary \{[^}]*background: var\(--(wine|bronze|accent)\)/s,
    'the primary button is never painted with the accent');
  assert.match(css, /\.hero-cta \{[^}]*background: var\(--action\)/s, 'hero CTA is ink');
});
