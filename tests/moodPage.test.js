import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const {
  MOODS,
  findMoodBySlug,
  getRelatedMoods,
  moodPageUrl,
  readMoodSlugFromLocation,
} = await import('../assets/js/moods/catalog.js');

const { scoreProductForMood, rankProductsForMood } =
  await import('../assets/js/moods/engine.js');

const { buildMoodPageHtml } = await import('../assets/js/ui/moodPage.js');

/* ── Mood catalog ──────────────────────────────────────────── */
test('mood catalog declares the six required collections', () => {
  const required = [
    'calor-tropical', 'noche-seduccion', 'fresh-office',
    'lujo-elegante', 'verano-playa', 'citas-nocturnas',
  ];
  const slugs = MOODS.map(m => m.slug);
  for (const slug of required) assert.ok(slugs.includes(slug), `missing mood: ${slug}`);
});

test('findMoodBySlug is case-insensitive and defensive', () => {
  assert.equal(findMoodBySlug('calor-tropical').title, 'Calor Tropical');
  assert.equal(findMoodBySlug('CALOR-TROPICAL').title, 'Calor Tropical');
  assert.equal(findMoodBySlug('nope'), null);
  assert.equal(findMoodBySlug(null), null);
});

test('moodPageUrl returns /mood/{slug} (URL-encoded)', () => {
  assert.equal(moodPageUrl({ slug: 'calor-tropical' }), '/mood/calor-tropical');
  assert.equal(moodPageUrl('noche-seduccion'), '/mood/noche-seduccion');
  assert.equal(moodPageUrl({ slug: 'a b' }), '/mood/a%20b');
});

test('readMoodSlugFromLocation parses /mood/{slug}', () => {
  assert.equal(readMoodSlugFromLocation('/mood/calor-tropical'), 'calor-tropical');
  assert.equal(readMoodSlugFromLocation('/mood/calor-tropical?foo=1'), 'calor-tropical');
  assert.equal(readMoodSlugFromLocation('/'), null);
});

test('getRelatedMoods returns existing mood objects', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const related = getRelatedMoods(tropical);
  assert.ok(related.length >= 2);
  assert.ok(related.every(m => MOODS.includes(m)));
});

/* ── MoodEngine ─────────────────────────────────────────────── */
const tropicalProduct = {
  id: 'p-tropical',
  name: 'Light Blue',
  house: 'Dolce & Gabbana',
  stock: 10,
  notes: ['marino', 'citrico', 'mineral', 'manzana'],
  variants: [{ size: 5, price: 180, stock: 10, availability: 10, available: true, soldOut: false, sold_out: false, variant_id: '1', product_id: 'p-tropical' }],
  fragrance: {
    scent_family_normalized: 'fresh',
    mood_tags: ['clean', 'fresh', 'cool'],
    style_tags: ['modern', 'minimal'],
    recommended_context_tags: ['daily', 'summer', 'warm-weather'],
    accords: ['aquatic', 'citrus'],
    scores: { freshness: 0.85, sweetness: 0.1, projection: 0.5, longevity: 0.6, versatility: 0.8 },
  },
};

const seductionProduct = {
  id: 'p-night',
  name: 'Tobacco Vanille',
  house: 'Tom Ford',
  stock: 4,
  notes: ['vainilla', 'tabaco', 'tonka', 'canela'],
  variants: [{ size: 5, price: 280, stock: 4, availability: 4, available: true, soldOut: false, sold_out: false, variant_id: '2', product_id: 'p-night' }],
  fragrance: {
    scent_family_normalized: 'oriental',
    mood_tags: ['sensual', 'mysterious', 'powerful'],
    style_tags: ['bold', 'luxurious'],
    recommended_context_tags: ['night', 'date', 'party'],
    accords: ['vanilla', 'tobacco'],
    scores: { freshness: 0.1, sweetness: 0.8, projection: 0.9, longevity: 0.95, versatility: 0.4 },
  },
};

const leanProduct = {
  /* No fragrance metadata — exercises the legacy fallback path */
  id: 'p-legacy',
  name: 'Acqua di Gio',
  house: 'Giorgio Armani',
  stock: 10,
  notes: ['marino', 'citrico', 'mineral'],
  desc: 'Fresco acuatico para el calor del verano.',
  story: 'Fresco verano playa',
  variants: [{ size: 5, price: 160, stock: 10, availability: 10, available: true, soldOut: false, sold_out: false, variant_id: '3', product_id: 'p-legacy' }],
};

test('MoodEngine scores tropical product highly for "calor-tropical"', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const seduction = findMoodBySlug('noche-seduccion');
  assert.ok(scoreProductForMood(tropicalProduct, tropical) > 10);
  assert.ok(scoreProductForMood(seductionProduct, tropical) <= 5);
  assert.ok(scoreProductForMood(seductionProduct, seduction) > 10);
});

test('MoodEngine ranks the right product first for each mood', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const ranked = rankProductsForMood([seductionProduct, tropicalProduct], tropical);
  assert.equal(ranked[0].id, 'p-tropical');
});

test('MoodEngine falls back to legacy metadata when fragrance is missing', () => {
  const tropical = findMoodBySlug('calor-tropical');
  /* leanProduct has no fragrance object but matches via notes + legacyKey */
  const score = scoreProductForMood(leanProduct, tropical);
  assert.ok(score > 0, 'lean product should still rank > 0 via notes/legacy');
});

test('MoodEngine is defensive against null/empty inputs', () => {
  assert.equal(scoreProductForMood(null, findMoodBySlug('calor-tropical')), 0);
  assert.equal(scoreProductForMood(tropicalProduct, null), 0);
  assert.deepEqual(rankProductsForMood(null, findMoodBySlug('calor-tropical')), []);
});

/* ── Mood page HTML ─────────────────────────────────────────── */
test('buildMoodPageHtml renders all six editorial sections', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const html = buildMoodPageHtml(tropical, [tropicalProduct, leanProduct]);

  assert.ok(html.includes('id="mood-hero"'), 'hero');
  assert.ok(html.includes('Calor Tropical'), 'title');
  assert.ok(html.includes('mood-why'), 'why section');
  assert.ok(html.includes('Funciona en climas cálidos'), 'why bullet from metadata');
  assert.ok(html.includes('id="mood-featured"'), 'featured');
  assert.ok(html.includes('Fragancias destacadas'), 'featured heading');
  assert.ok(html.includes('id="mood-discover"'), 'discovery');
  assert.ok(html.includes('mood-catalog-cta'), 'catalog CTA');
  assert.ok(html.includes('/#catalog'), 'catalog CTA points to home catalog');
});

test('mood page surfaces the chips defined in the catalog', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const html = buildMoodPageHtml(tropical, []);
  ['Calor', 'Verano', 'Diario', 'Fresco'].forEach(chip => {
    assert.ok(html.includes(`>${chip}<`), `chip "${chip}" should appear`);
  });
});

test('mood page surfaces related-mood cards for cross-discovery', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const html = buildMoodPageHtml(tropical, []);
  assert.ok(html.includes('Si te gusta Calor Tropical'));
  assert.ok(html.includes('/mood/verano-playa'));
  assert.ok(html.includes('/mood/fresh-office'));
});

test('mood page is defensive: empty product list shows curated-empty state', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const html = buildMoodPageHtml(tropical, []);
  assert.ok(html.includes('Pronto curaremos esta colección'));
  assert.ok(html.includes('id="mood-discover"'), 'discovery still renders');
  assert.ok(html.includes('mood-catalog-cta'), 'catalog CTA still renders');
});

test('mood page shows not-found state for unknown slug', () => {
  const html = buildMoodPageHtml(null, []);
  assert.ok(html.includes('No encontramos ese mood'));
  /* Fallback shows existing moods so the user can recover */
  assert.ok(html.includes('/mood/calor-tropical'));
});

test('mood page never displays fragrance.aliases', () => {
  const tropical = findMoodBySlug('calor-tropical');
  const productWithAliases = {
    ...tropicalProduct,
    fragrance: { ...tropicalProduct.fragrance, aliases: ['internal-search-term'] },
  };
  const html = buildMoodPageHtml(tropical, [productWithAliases]);
  assert.ok(!html.includes('internal-search-term'));
});

/* ── Static assets + routing ────────────────────────────────── */
test('mood.html uses root-relative asset paths (Hostinger-safe)', () => {
  const html = readFileSync(join(root, 'mood.html'), 'utf8');
  const local = [
    ...html.matchAll(/<link[^>]+href="([^"]+)"/g),
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
  ].map(m => m[1]);
  for (const url of local) {
    const isAbs = url.startsWith('/');
    const isRemote = /^https?:\/\//.test(url);
    assert.ok(isAbs || isRemote, `asset "${url}" must be root-relative`);
    assert.ok(!url.startsWith('./') && !url.startsWith('../'), `asset "${url}" must not be relative`);
  }
});

test('.htaccess rewrites /mood/{slug} → mood.html', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  assert.match(ht, /RewriteRule\s+\^mood\/\(\[\^\/\]\+\)\/\?\$\s+mood\.html\s+\[L,QSA\]/);
});

test('mood.html exists at the frontend root', () => {
  assert.ok(existsSync(join(root, 'mood.html')));
  assert.ok(existsSync(join(root, 'assets/js/pages/mood.js')));
  assert.ok(existsSync(join(root, 'assets/js/moods/engine.js')));
  assert.ok(existsSync(join(root, 'assets/js/moods/catalog.js')));
});

/* ── Catalog mood badge — never silently filter ─────────────── */
test('searchbar mood-active banner shows "Mood activo" + count + Quitar', () => {
  /* Inspect source to verify the contract; full DOM test runs in browser */
  const src = readFileSync(join(root, 'assets/js/ui/searchbar.js'), 'utf8');
  assert.match(src, /Mood activo/);
  assert.match(src, /perfumes? encontrados?/);
  assert.match(src, /Quitar filtro/);
});

/* ── Home rails navigate to /mood/{slug} (not silent filter) ─ */
test('home rails open the curated mood page, not a hidden catalog filter', () => {
  const src = readFileSync(join(root, 'assets/js/recommendations/index.js'), 'utf8');
  /* The Explorar mood handler now navigates to /mood/{slug} */
  assert.match(src, /window\.location\.href\s*=\s*`\/mood\//);
  assert.match(src, /_railMoodSlug/);
});
