/* =============================================================
   THE STOREFRONT PROMOTION BANNER

   Roger runs promotions like the "Dinámica 300 miembros". Doing that used
   to mean editing static HTML here, committing a flyer and redeploying.
   The banner now reads /api/web/promotion, which R Supply OS builds from a
   MarketingCampaign that already owns the lifecycle.

   Everything below is about the same two properties: the section renders
   exactly what the backend sent, and it removes itself — cleanly, with no
   gap and no console noise — for every reason it might have nothing to
   show. "No promotion" is a normal state for a store, not an outage.
   ============================================================= */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

/* ── Minimal DOM: one section the renderer fills or removes ────── */

class FakeSection {
  constructor() {
    this.innerHTML = '';
    this.hidden = true;
    this.removed = false;
    this.listeners = new Map();
  }
  remove() { this.removed = true; }
  addEventListener(t, h) { this.listeners.set(t, h); }
  querySelector(sel) {
    return this.innerHTML.includes(sel.replace(/[[\]]/g, ''))
      ? { addEventListener: (t, h) => this.listeners.set(`cta:${t}`, h) }
      : null;
  }
}

let _section;
let _tracked = [];

globalThis.window = { location: { hostname: 'localhost', pathname: '/', search: '' }, addEventListener() {} };
const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
globalThis.document = {
  getElementById: id => (id === 'promocion' ? _section : null),
  addEventListener() {},
};

const { renderPromotion, _card } = await import('../assets/js/ui/promotion.js');
const { CatalogProvider } = await import('../assets/js/providers/catalog.js');
const { Tracker } = await import('../assets/js/tracking/tracker.js');

const _realGetPromotion = CatalogProvider.getPromotion.bind(CatalogProvider);

Tracker.emit = (name, payload) => { _tracked.push({ name, payload }); };

const PROMOTION = {
  id: 3,
  campaignSlug: 'dinamica-300',
  headline: 'Dinámica 300 miembros',
  body: 'Participa antes del domingo.',
  image: { mobile: '/img/promo-m.jpg', desktop: '/img/promo-d.jpg' },
  cta: { label: 'Ver dinámica', url: 'https://rdecants.com/dinamica' },
  endsAt: null,
};

beforeEach(() => {
  _section = new FakeSection();
  _tracked = [];
});

function stubPromotion(value) {
  CatalogProvider.getPromotion = async () => value;
}

/* ── Rendering ───────────────────────────────────────────────── */

test('a live promotion renders its headline, body and CTA', async () => {
  stubPromotion(PROMOTION);
  await renderPromotion('promocion');

  assert.equal(_section.removed, false);
  assert.equal(_section.hidden, false);
  assert.match(_section.innerHTML, /Dinámica 300 miembros/);
  assert.match(_section.innerHTML, /Participa antes del domingo\./);
  assert.match(_section.innerHTML, /Ver dinámica/);
  assert.match(_section.innerHTML, /https:\/\/rdecants\.com\/dinamica/);
});

test('the creative is served responsively, mobile crop by default', async () => {
  const html = _card(PROMOTION);

  /* The <img> src is the MOBILE file: a phone must not download the desktop
     crop and then discard it. The desktop file is behind a min-width source. */
  assert.match(html, /<img src="\/img\/promo-m\.jpg"/);
  assert.match(html, /<source media="\(min-width: 768px\)" srcset="\/img\/promo-d\.jpg">/);
});

test('one uploaded creative stands in for both sizes', async () => {
  const onlyDesktop = _card({ ...PROMOTION, image: { mobile: null, desktop: '/img/only.jpg' } });
  assert.match(onlyDesktop, /<img src="\/img\/only\.jpg"/);

  const onlyMobile = _card({ ...PROMOTION, image: { mobile: '/img/only.jpg', desktop: null } });
  assert.match(onlyMobile, /<img src="\/img\/only\.jpg"/);
  assert.doesNotMatch(onlyMobile, /<source/, 'no empty source element');
});

test('a text-only promotion renders without an image frame', () => {
  const html = _card({ ...PROMOTION, image: { mobile: null, desktop: null } });

  assert.doesNotMatch(html, /promo-figure/);
  assert.match(html, /Dinámica 300 miembros/);
});

test('a promotion with no destination renders without a button', () => {
  const html = _card({ ...PROMOTION, cta: null });

  assert.doesNotMatch(html, /promo-cta/);
  assert.match(html, /Dinámica 300 miembros/);
});

test('operator copy is escaped, never interpolated as markup', () => {
  const html = _card({ ...PROMOTION, headline: '<img src=x onerror=alert(1)>' });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

/* ── Absence ─────────────────────────────────────────────────── */

test('no promotion removes the section entirely', async () => {
  stubPromotion(null);
  await renderPromotion('promocion');

  assert.equal(_section.removed, true, 'no gap where a banner would be');
  assert.equal(_section.innerHTML, '');
});

test('an endpoint failure removes the section without throwing', async () => {
  CatalogProvider.getPromotion = async () => { throw new Error('network'); };

  await assert.doesNotReject(renderPromotion('promocion'));
  assert.equal(_section.removed, true);
});

test('a missing mount point is not an error', async () => {
  stubPromotion(PROMOTION);
  await assert.doesNotReject(renderPromotion('does-not-exist'));
});

test('the provider collapses every backend failure to null', async () => {
  const { ApiClient } = await import('../assets/js/api/client.js');

  /* The tests above stub CatalogProvider.getPromotion itself; this one is
     about the provider's own collapsing, so the real implementation goes
     back in first. */
  CatalogProvider.getPromotion = _realGetPromotion;

  ApiClient.getPromotion = async () => { throw new Error('503'); };
  assert.equal(await CatalogProvider.getPromotion(), null, 'endpoint down');

  ApiClient.getPromotion = async () => ({ promotion: null });
  assert.equal(await CatalogProvider.getPromotion(), null, 'nothing scheduled');

  ApiClient.getPromotion = async () => ({ promotion: { headline: '   ' } });
  assert.equal(await CatalogProvider.getPromotion(), null, 'nothing to say');
});

/* ── Tracking ────────────────────────────────────────────────── */

test('a rendered promotion is measurable with a name the backend accepts', async () => {
  stubPromotion(PROMOTION);
  await renderPromotion('promocion');

  const viewed = _tracked.find(e => e.name === 'promotion_viewed');
  assert.ok(viewed, 'promotion_viewed is emitted');
  assert.equal(viewed.payload.campaign_slug, 'dinamica-300',
    'the campaign slug joins back to MarketingCampaign');
});

/* ── Design constraints ──────────────────────────────────────── */

test('the banner does not shout', () => {
  /* No red, no countdown, no urgency copy. The campaign's own creative
     carries whatever noise it carries; the frame around it does not add
     more. Comments stripped — this file explains the rule it enforces. */
  const css = read('assets/css/components.css');
  const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const js = strip(read('assets/js/ui/promotion.js'));
  /* Just the promotion block, comments removed — the surrounding file has
     plenty of prose, and prose is not a design decision. */
  const promoCss = strip(
    css.slice(css.indexOf('.promo-card'), css.indexOf('/* ── A pack inside the cart drawer')),
  );

  assert.doesNotMatch(js, /¡|!!|OFERTA|ÚLTIMAS|countdown|urgen/i);

  /* Every colour in the frame comes from the storefront's own tokens. That
     is a stronger check than hunting for red literals: a token cannot be a
     one-off marketplace colour, because the palette does not contain one. */
  const colours = [...promoCss.matchAll(/(?:^|[\s:])(?:color|background|border(?:-\w+)?)\s*:\s*([^;]+);/g)]
    .map(m => m[1].trim());
  for (const value of colours) {
    assert.ok(
      value.includes('var(--') || /^(none|0|transparent|inherit)$/.test(value)
        || /^\d+px solid var\(--/.test(value),
      `hardcoded colour in the promotion frame: ${value}`,
    );
  }
});

test('the section ships empty and hidden, so it cannot flash before it resolves', () => {
  const html = read('index.html');

  assert.match(html, /<section class="section section--tight" id="promocion"[^>]*hidden><\/section>/);
});

test('the promotion sits between the packs and "Prefiero elegir yo"', () => {
  const html = read('index.html');

  const packs = html.indexOf('id="packs"');
  const promo = html.indexOf('id="promocion"');
  const intents = html.indexOf('id="intenciones"');

  assert.ok(packs > -1 && promo > -1 && intents > -1, 'all three sections exist');
  assert.ok(packs < promo, 'packs first — the thing they can buy');
  assert.ok(promo < intents, 'then the promotion, then the browse routes');
});

test('the promotion never replaces the hero', () => {
  const html = read('index.html');

  assert.ok(html.indexOf('class="hero"') < html.indexOf('id="promocion"'));
});
