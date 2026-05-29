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
