import { test } from 'node:test';
import assert from 'node:assert/strict';

/* The productPage module imports browser-only UI helpers (primeImageStates,
   showToast, Tracker). We stub them via a thin re-export shim is overkill —
   the pure functions we want to test (URL helpers, slug lookup, defensive
   HTML, modal CTA) don't touch those imports until you call hydrate/render.

   Node 22 supports dynamic import of ES modules with side-effects only when
   the resolver finds them; nothing here touches DOM, so importing the
   module is safe. */
const mod = await import('../assets/js/ui/productPage.js');
const {
  productPageUrl,
  readSlugFromLocation,
  findProductBySlug,
  buildProductPageHtml,
} = mod;

const sample = {
  id: 'dior-sauvage',
  slug: 'dior-sauvage',
  name: 'Sauvage',
  house: 'Dior',
  concentration: 'EDP',
  story: 'Composición aromática moderna.',
  desc: 'Fresco y especiado.',
  notes: ['bergamota', 'pimienta', 'ambroxan'],
  image: '',
  badge: 'Disponible',
  stock: 10,
  variants: [
    { id: 'v3', size: 3, ml_size: 3, price: 120, retail_price: 120, availability: 10, stock: 10, available: true, soldOut: false, sold_out: false, variant_id: '1', product_id: 'dior-sauvage' },
    { id: 'v5', size: 5, ml_size: 5, price: 180, retail_price: 180, availability: 10, stock: 10, available: true, soldOut: false, sold_out: false, variant_id: '2', product_id: 'dior-sauvage' },
  ],
  fragrance: {
    canonical_name: 'Dior Sauvage',
    aliases: ['roger', 'jhony deep'],
    scent_family_normalized: 'aromatic',
    mood_tags: ['clean', 'confident'],
    recommended_context_tags: ['office', 'daily'],
    style_tags: ['masculine', 'modern'],
    accords: ['ambroxan', 'bergamot'],
    scores: { freshness: 0.7, sweetness: 0.2, projection: 0.8, longevity: 0.7, versatility: 0.85 },
  },
};

test('productPageUrl builds /perfume/{slug} from slug, falls back to id', () => {
  assert.equal(productPageUrl(sample), '/perfume/dior-sauvage');
  assert.equal(productPageUrl({ id: 'fallback-id' }), '/perfume/fallback-id');
  assert.equal(productPageUrl({ slug: 'with spaces & symbols' }), '/perfume/with%20spaces%20%26%20symbols');
});

test('readSlugFromLocation parses /perfume/{slug}', () => {
  assert.equal(readSlugFromLocation('/perfume/dior-sauvage'), 'dior-sauvage');
  assert.equal(readSlugFromLocation('/perfume/dior-sauvage?foo=1'), 'dior-sauvage');
  assert.equal(readSlugFromLocation('/perfume/with%20spaces'), 'with spaces');
  assert.equal(readSlugFromLocation('/'), null);
  assert.equal(readSlugFromLocation(''), null);
});

test('findProductBySlug matches by slug, then by id, defensively', () => {
  const products = [
    { id: 'a', slug: 'alpha', name: 'A' },
    { id: 'b', slug: 'beta', name: 'B' },
    { id: 'no-slug-c', name: 'C' },
  ];
  assert.equal(findProductBySlug(products, 'beta').name, 'B');
  assert.equal(findProductBySlug(products, 'BETA').name, 'B');
  assert.equal(findProductBySlug(products, 'no-slug-c').name, 'C');
  assert.equal(findProductBySlug(products, 'nope'), null);
  assert.equal(findProductBySlug(null, 'alpha'), null);
  assert.equal(findProductBySlug(products, null), null);
});

test('buildProductPageHtml renders full intelligence sections from fragrance', () => {
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('Sauvage'), 'name');
  assert.ok(html.includes('Dior'), 'house');
  assert.ok(html.includes('EDP'), 'concentration');
  assert.ok(html.includes('pdp-btn-add'), 'add-to-cart button');
  assert.ok(html.includes('pdp-btn-wa'), 'WhatsApp button');
  assert.ok(html.includes('pdp-sizes'), 'variant selector');
  assert.ok(html.includes('Perfil Olfativo'), 'fragrance profile section');
  assert.ok(html.includes('¿Para quién es?'), 'audience section');
  assert.ok(html.includes('¿Cuándo usarlo?'), 'when section');
  assert.ok(html.includes('Si te gusta esto'), 'related rail heading');
  assert.ok(!html.includes('roger') && !html.includes('jhony'), 'aliases never displayed');
});

test('buildProductPageHtml is defensive when fragrance is null/missing', () => {
  const lean = { ...sample, fragrance: null };
  const html = buildProductPageHtml(lean);
  assert.ok(html.includes('Sauvage'), 'still renders product');
  assert.ok(html.includes('pdp-btn-add'), 'cart still works');
  assert.ok(!html.includes('Perfil Olfativo'), 'no profile when fragrance missing');
  assert.ok(!html.includes('¿Para quién es?'), 'no audience when fragrance missing');
});

test('buildProductPageHtml shows not-found state for missing product', () => {
  const html = buildProductPageHtml(null);
  assert.ok(html.includes('No encontramos esa fragancia'));
  assert.ok(html.includes('href="/"'), 'offers a way back home');
});

/* Modal-side CTA test: re-imports the URL builder the modal uses, since the
   modal itself is DOM-coupled. The contract that matters is the href shape. */
test('modal "Ver detalles" CTA targets /perfume/{slug}', () => {
  /* The modal builds the href via productPageUrl — verify the contract. */
  assert.equal(productPageUrl(sample), '/perfume/dior-sauvage');
});

/* ── Editorial UX redesign ──────────────────────────────────── */

test('PDP order: editorial sections come BEFORE buy controls', () => {
  const html = buildProductPageHtml(sample);
  /* Reorder spec: hero → why → summary → fit → intelligence → buy → related.
     Buy must not be the first repeated thing the user sees. */
  const i = needle => html.indexOf(needle);
  assert.ok(i('id="pdp-hero"') >= 0);
  assert.ok(i('¿Por qué esta fragancia?') > i('id="pdp-hero"'));
  assert.ok(i('Resumen del perfil') > i('¿Por qué esta fragancia?'));
  assert.ok(i('id="pdp-fit"') > i('Resumen del perfil'));
  assert.ok(i('id="pdp-buy"') > i('id="pdp-fit"'));
  assert.ok(i('id="pdp-related"') > i('id="pdp-buy"'));
});

test('PDP hero does NOT contain the variant selector (moved to buy section)', () => {
  const html = buildProductPageHtml(sample);
  const heroSlice = html.slice(
    html.indexOf('id="pdp-hero"'),
    html.indexOf('<!-- B. Why')
  );
  assert.ok(!heroSlice.includes('pdp-sizes'), 'hero should not show variant grid');
  assert.ok(!heroSlice.includes('pdp-btn-add'), 'hero should not show Add button');
  assert.ok(heroSlice.includes('pdp-jump-buy'), 'hero exposes a "Comprar" jump button');
  assert.ok(heroSlice.includes('pdp-jump-fit'), 'hero exposes "¿Es para mí?" jump');
});

test('PDP renders the interactive fit quiz with 3 metadata-driven questions', () => {
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('id="pdp-fit"'));
  assert.ok(html.includes('¿Buscas algo fresco?'));
  assert.ok(html.includes('¿Lo quieres para diario?'));
  assert.ok(html.includes('¿Quieres que llame atención?'));
  assert.ok(html.includes('data-q="fresh"'));
  assert.ok(html.includes('data-q="daily"'));
  assert.ok(html.includes('data-q="standout"'));
});

test('PDP shows the compact profile summary card', () => {
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('Resumen del perfil'));
  assert.ok(html.includes('Familia'));
  assert.ok(html.includes('Vibra'));
  assert.ok(html.includes('Ideal para'));
});

test('PDP includes the sticky mini-buy CTA', () => {
  const html = buildProductPageHtml(sample);
  assert.ok(html.includes('id="pdp-sticky-cta"'));
  assert.ok(html.includes('pdp-sticky-cta-btn'));
});

test('score bars render text bands (Alta / Media / Fuerte) next to the bar', async () => {
  const { buildFragranceProfileHtml, scoreBand, getScoreSummary } =
    await import('../assets/js/ui/fragranceProfile.js');

  /* Pure helpers */
  assert.equal(scoreBand('freshness', 80), 'Alta');
  assert.equal(scoreBand('freshness', 40), 'Media');
  assert.equal(scoreBand('freshness', 10), 'Baja');
  assert.equal(scoreBand('projection', 80), 'Fuerte');
  assert.equal(scoreBand('longevity', 80), 'Larga');

  /* Rendered output exposes the bands as user-visible text */
  const html = buildFragranceProfileHtml(sample);
  assert.match(html, /class="fp-bar-band">Alta</);
  assert.match(html, /class="fp-bar-band">Fuerte</);

  const summary = getScoreSummary(sample.fragrance);
  assert.equal(summary.length, 5);
  assert.ok(summary.every(s => typeof s.band === 'string' && s.band.length));
});

test('evaluateFitAnswers gives a positive verdict when product matches', async () => {
  const { evaluateFitAnswers } = await import('../assets/js/ui/productPage.js');
  /* Sauvage has projection 0.85, versatility 0.85, freshness 0.7 — should pass all three */
  const verdict = evaluateFitAnswers(sample, { fresh: 'yes', daily: 'yes', standout: 'yes' });
  assert.equal(verdict.tone, 'positive');
  assert.equal(verdict.headline, 'Sí, este va contigo.');
});

test('evaluateFitAnswers gives a mixed verdict on partial matches', async () => {
  const { evaluateFitAnswers } = await import('../assets/js/ui/productPage.js');
  const sweetCandy = {
    ...sample,
    fragrance: {
      ...sample.fragrance,
      scent_family_normalized: 'gourmand',
      mood_tags: ['playful', 'sensual'],
      style_tags: ['bold'],
      recommended_context_tags: ['night', 'date'],
      scores: { freshness: 0.1, sweetness: 0.9, projection: 0.85, longevity: 0.85, versatility: 0.3 },
    },
  };
  const verdict = evaluateFitAnswers(sweetCandy, { fresh: 'yes', daily: 'yes', standout: 'yes' });
  assert.equal(verdict.tone, 'mixed');
  assert.match(verdict.headline, /Coincide en 1 de 3/);
});

test('evaluateFitAnswers is defensive when fragrance is missing', async () => {
  const { evaluateFitAnswers } = await import('../assets/js/ui/productPage.js');
  assert.equal(evaluateFitAnswers({ ...sample, fragrance: null }, { fresh: 'yes' }), null);
});

test('PDP keeps cart Add + WhatsApp wired in the buy section', () => {
  const html = buildProductPageHtml(sample);
  const buySlice = html.slice(
    html.indexOf('id="pdp-buy"'),
    html.indexOf('id="pdp-related"')
  );
  assert.ok(buySlice.includes('id="pdp-btn-add"'));
  assert.ok(buySlice.includes('id="pdp-btn-wa"'));
  assert.ok(buySlice.includes('pdp-sizes'));
});

test('PDP is defensive: hero+buy still render when fragrance is null', () => {
  const lean = { ...sample, fragrance: null };
  const html = buildProductPageHtml(lean);
  assert.ok(html.includes('id="pdp-hero"'));
  assert.ok(html.includes('id="pdp-buy"'));
  assert.ok(html.includes('id="pdp-btn-add"'));
  /* No editorial blocks that depend on fragrance */
  assert.ok(!html.includes('Resumen del perfil'));
  assert.ok(!html.includes('id="pdp-fit"'));
  assert.ok(!html.includes('Perfil Olfativo'));
});

test('PDP never displays fragrance.aliases (search-only data)', () => {
  const html = buildProductPageHtml(sample);
  assert.ok(!html.includes('roger') && !html.includes('jhony'),
    'aliases must never be rendered on the PDP');
});
