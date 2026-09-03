/* =============================================================
   PDP SEO — title, description, canonical, structured data.

   The PDP is client-rendered: a non-JS crawler sees only the generic static
   shell in product.html. Googlebot executes JS and re-crawls after render,
   so setProductSeo() is a real improvement for the crawler that matters
   most — this file proves it actually produces correct, parseable output,
   not just that the right function names appear in the source.

   No jsdom in this repo's toolchain, so a minimal DOM stub — just enough
   surface for querySelector/createElement/getElementById/head.appendChild —
   drives the real function against real product payloads.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ── Minimal DOM stub ─────────────────────────────────────────── */

function makeElement(tag) {
  const attrs = new Map();
  return {
    tagName: tag,
    id: '',
    _text: '',
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    _attrs: attrs,
  };
}

function stubDocument(initialHead = []) {
  const head = [...initialHead];
  const doc = {
    title: '',
    head: {
      appendChild(el) { head.push(el); },
    },
    createElement(tag) { return makeElement(tag); },
    getElementById(id) { return head.find(el => el.id === id) ?? null; },
    querySelector(selector) {
      const m = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
      if (!m) return null;
      const [, tag, attr, value] = m;
      return head.find(el => el.tagName === tag && el.getAttribute(attr) === value) ?? null;
    },
    _head: head,
  };
  return doc;
}

/* A canonical <link> and the two <meta property="og:*"> the static HTML
   ships pre-existing (see product.html), so setProductSeo's update-in-place
   path is exercised, not just its create-new path. */
function stubHead() {
  const canonical = makeElement('link');
  canonical.setAttribute('rel', 'canonical');
  canonical.setAttribute('href', 'https://rdecants.com/product.html');

  const ogTitle = makeElement('meta');
  ogTitle.setAttribute('property', 'og:title');
  ogTitle.setAttribute('content', 'RDecants — Detalle de fragancia');

  return [canonical, ogTitle];
}

/* `document` must stay the stub for the caller's whole test — setProductSeo
   is invoked AFTER this resolves, not inside it — so nothing here restores
   the previous value. Every test starts by calling this, which reassigns
   globalThis.document to a fresh stub before touching it, so no state leaks
   from one test into the next despite the shared global. */
async function withStubDom() {
  const doc = stubDocument(stubHead());
  globalThis.document = doc;

  const mod = await import('../assets/js/ui/productPage.js');

  return { setProductSeo: mod.setProductSeo, doc };
}

/* ── Fixtures ─────────────────────────────────────────────────── */

const product = (overrides = {}) => ({
  id: 42,
  product_id: 42,
  slug: 'sauvage-dior',
  name: 'SAUVAGE',
  house: 'DIOR',
  desc: 'Fresco y especiado, el clásico masculino de salida rápida.',
  image: 'https://cdn.rdecants.com/img/sauvage.jpg',
  stock: 12,
  prices: { 3: 90, 5: 140, 10: 250 },
  // `availability` (units) is what getValidVariants() actually reads to
  // decide soldOut — an explicit `sold_out: false` alone is NOT enough; a
  // variant with no stock/availability field computes as sold out
  // regardless, because `available` defaults to `stock > 0`.
  variants: [
    { size: 3, price: 90, sold_out: false, availability: 8 },
    { size: 5, price: 140, sold_out: false, availability: 12 },
    { size: 10, price: 250, sold_out: false, availability: 4 },
  ],
  ...overrides,
});

function jsonLd(doc, id) {
  const el = doc.getElementById(id);
  assert.ok(el, `expected a <script id="${id}">`);
  return JSON.parse(el.textContent);
}

/* ── Title / description / canonical / OG ────────────────────── */

test('sets a real, product-specific title', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  assert.equal(doc.title, 'SAUVAGE — DIOR | RDecants');
});

test('updates the existing canonical link in place, to the real product URL', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const canonical = doc.querySelector('link[rel="canonical"]');
  assert.equal(canonical.getAttribute('href'), 'https://rdecants.com/perfume/sauvage-dior');
});

test('uses the real product description, not the generic placeholder', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const desc = doc.querySelector('meta[name="description"]');
  assert.equal(desc.getAttribute('content'), 'Fresco y especiado, el clásico masculino de salida rápida.');
});

test('falls back to an honest generated description when the product has none', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ desc: '' }), { origin: 'https://rdecants.com' });

  const content = doc.querySelector('meta[name="description"]').getAttribute('content');
  assert.match(content, /DIOR SAUVAGE/);
  assert.match(content, /decant/i);
});

test('a long description is truncated to a reasonable meta length', async () => {
  const long = 'A'.repeat(500);
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ desc: long }), { origin: 'https://rdecants.com' });

  const content = doc.querySelector('meta[name="description"]').getAttribute('content');
  assert.ok(content.length <= 300);
});

test('updates the pre-existing og:title in place rather than duplicating it', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const ogTitles = doc._head.filter(el => el.getAttribute('property') === 'og:title');
  assert.equal(ogTitles.length, 1, 'must not create a second og:title tag');
  assert.equal(ogTitles[0].getAttribute('content'), 'DIOR SAUVAGE — RDecants');
});

/* ── Product JSON-LD ──────────────────────────────────────────── */

test('emits a valid Product JSON-LD block with the real brand, sku and image', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-product-jsonld');
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.name, 'SAUVAGE');
  assert.equal(ld.sku, '42');
  assert.equal(ld.brand.name, 'DIOR');
  assert.deepEqual(ld.image, ['https://cdn.rdecants.com/img/sauvage.jpg']);
  assert.equal(ld.url, 'https://rdecants.com/perfume/sauvage-dior');
});

test('multiple real sizes become an AggregateOffer with the true low/high price', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-product-jsonld');
  assert.equal(ld.offers['@type'], 'AggregateOffer');
  assert.equal(ld.offers.lowPrice, 90);
  assert.equal(ld.offers.highPrice, 250);
  assert.equal(ld.offers.offerCount, 3);
  assert.equal(ld.offers.priceCurrency, 'MXN');
});

test('a single sellable size becomes one plain Offer, not an AggregateOffer of one', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({
    prices: { 5: 140 },
    variants: [{ size: 5, price: 140, sold_out: false, availability: 6 }],
  }), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-product-jsonld');
  assert.equal(ld.offers['@type'], 'Offer');
  assert.equal(ld.offers.price, 140);
});

test('in-stock availability reflects the real stock count', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ stock: 5 }), { origin: 'https://rdecants.com' });

  assert.equal(jsonLd(doc, 'pdp-product-jsonld').offers.availability, 'https://schema.org/InStock');
});

test('zero stock is declared OutOfStock, never silently InStock', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ stock: 0, variants: [{ size: 5, price: 140, sold_out: true }] }), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-product-jsonld');
  // Sold-out variants are excluded from getValidVariants' price set, so no
  // real price exists to offer — no `offers` block is emitted at all rather
  // than one claiming a price for something not for sale.
  assert.equal(ld.offers, undefined);
});

/**
 * The project rule this test exists to enforce: never fabricate a rating or
 * review this catalogue does not have. A generic Product-schema helper is
 * exactly the kind of code that "helpfully" adds aggregateRating; this must
 * never happen here.
 */
test('never emits a rating or review — this catalogue has neither', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-product-jsonld');
  assert.equal(ld.aggregateRating, undefined);
  assert.equal(ld.review, undefined);
});

test('a product with no image omits the image field rather than inventing one', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ image: null }), { origin: 'https://rdecants.com' });

  assert.equal(jsonLd(doc, 'pdp-product-jsonld').image, undefined);
});

/* ── Breadcrumb JSON-LD ───────────────────────────────────────── */

test('emits a three-level breadcrumb ending at the real canonical URL', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product(), { origin: 'https://rdecants.com' });

  const ld = jsonLd(doc, 'pdp-breadcrumb-jsonld');
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.equal(ld.itemListElement.length, 3);
  assert.equal(ld.itemListElement[0].item, 'https://rdecants.com');
  assert.equal(ld.itemListElement[2].item, 'https://rdecants.com/perfume/sauvage-dior');
  assert.equal(ld.itemListElement[2].name, 'SAUVAGE');
});

/* ── Safety ───────────────────────────────────────────────────── */

test('a description containing "</script>" cannot break out of the JSON-LD tag', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ desc: 'Huele a limpio</script><script>alert(1)</script>' }), { origin: 'https://rdecants.com' });

  const raw = doc.getElementById('pdp-product-jsonld').textContent;
  assert.doesNotMatch(raw, /<\/script>/);
  // Still valid, still round-trips to the real (if odd) description text.
  const ld = JSON.parse(raw);
  assert.match(ld.description, /Huele a limpio/);
});

test('re-running for a different product replaces the tags rather than duplicating them', async () => {
  const { setProductSeo, doc } = await withStubDom();
  setProductSeo(product({ name: 'FIRST' }), { origin: 'https://rdecants.com' });
  setProductSeo(product({ name: 'SECOND' }), { origin: 'https://rdecants.com' });

  const ldTags = doc._head.filter(el => el.id === 'pdp-product-jsonld');
  assert.equal(ldTags.length, 1);
  assert.equal(jsonLd(doc, 'pdp-product-jsonld').name, 'SECOND');
});

test('calling with no product is a safe no-op', async () => {
  const { setProductSeo, doc } = await withStubDom();
  const titleBefore = doc.title;

  assert.doesNotThrow(() => setProductSeo(null));
  assert.equal(doc.title, titleBefore);
});
