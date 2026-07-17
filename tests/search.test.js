import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, scoreSearchResult } from '../assets/js/catalog/search.js';

const product = (id, house, name, options = {}) => ({
  id,
  house,
  brand: options.brand,
  name,
  rawName: options.rawName,
  aliases: options.aliases ?? [],
  canonical_name: options.canonical_name,
  slug: options.slug,
  concentration: options.concentration,
  version: options.version,
  notes: options.notes ?? [],
  desc: options.desc ?? '',
  story: options.story ?? options.desc ?? '',
  badge: options.badge ?? 'Disponible',
  featured: options.featured ?? false,
  stock: options.stock ?? 10,
  gender: options.gender ?? 'masculine',
  fragrance: options.fragrance ?? null,
  variants: [{ size: 3, price: 120, stock: 10, availability: 10, available: true, variant_id: id }],
});

const catalog = [
  product('bdc', 'Chanel', 'Bleu de Chanel EDP', {
    concentration: 'EDP',
    fragrance: {
      canonical_name: 'Bleu de Chanel',
      aliases: ['bdc', 'bleu de chanel', 'blue channel'],
    },
  }),
  product('allure', 'Chanel', 'Allure Homme Sport', {
    aliases: ['allure sport'],
    desc: 'Azul fresco limpio',
    notes: ['cedro', 'citricos'],
  }),
  product('sauvage', 'Dior', 'Sauvage EDP', {
    aliases: ['sauvage', 'dior sauvage', 'dior sauvage edp'],
    fragrance: {
      canonical_name: 'Dior Sauvage',
      aliases: ['sauvage elixir style'],
      mood_tags: ['confident'],
      recommended_context_tags: ['office'],
      style_tags: ['masculine'],
      accords: ['ambroxan'],
    },
  }),
  product('miss-dior', 'Dior', 'Miss Dior', {
    desc: 'Tiene ambroxan y vibra confident para oficina',
    notes: ['ambroxan'],
    fragrance: {
      mood_tags: ['confident'],
      recommended_context_tags: ['office'],
      style_tags: ['romantic'],
      accords: ['ambroxan'],
    },
  }),
  product('issey', 'Issey Miyake', "L'Eau d'Issey Pour Homme", {
    fragrance: {
      canonical_name: "L'Eau d'Issey",
      aliases: ['issey miyake leau dissey', "l'eau d'issey", 'leau dissey'],
    },
  }),
  product('torino', 'Xerjoff', 'Torino 21', {
    fragrance: {
      canonical_name: 'Xerjoff Torino 21',
      aliases: ['torino 21'],
    },
  }),
  product('naxos', 'Xerjoff', 'Naxos', {
    fragrance: {
      canonical_name: 'Xerjoff Naxos',
      aliases: ['naxos'],
    },
  }),
];

const ids = query => filterProducts(catalog, { query }).map(p => p.id);

test('search matches by product name', () => {
  assert.deepEqual(ids('allure homme'), ['allure']);
});

test('search matches by brand or house', () => {
  assert.deepEqual(ids('chanel'), ['bdc', 'allure']);
});

test('search matches backend aliases and prioritizes the alias product', () => {
  assert.deepEqual(ids('bdc')[0], 'bdc');
  assert.ok(ids('bdc').includes('bdc'));
});

test('search matches aliases without accents or apostrophes', () => {
  assert.deepEqual(ids('issey miyake leau dissey'), ['issey']);
  assert.deepEqual(ids('l eau d issey'), ['issey']);
});

test('"bleu de chanel" does not return unrelated Chanel products', () => {
  assert.deepEqual(ids('bleu de chanel'), ['bdc']);
});

test('"sauvage" does not return non-Sauvage Dior products or metadata matches', () => {
  assert.deepEqual(ids('sauvage'), ['sauvage']);
  assert.deepEqual(ids('ambroxan'), [], 'accords and notes are not searchable');
  assert.deepEqual(ids('confident'), [], 'mood tags are not searchable');
  assert.deepEqual(ids('oficina'), [], 'recommendation tags and descriptions are not searchable');
  assert.deepEqual(ids('azul fresco'), [], 'descriptions are not searchable');
});

test('search tolerates lightweight typos on commercial identity only', () => {
  assert.ok(ids('chanle').includes('bdc'));
  assert.ok(ids('leau diseey').includes('issey'));
});

test('search ignores tokens shorter than three characters', () => {
  assert.deepEqual(ids('a'), []);
  assert.deepEqual(ids('e'), []);
  assert.deepEqual(ids('de'), []);
});

test('search keeps commercial partial matches', () => {
  assert.deepEqual(ids('sauv'), ['sauvage']);
  assert.deepEqual(ids('bleu'), ['bdc']);
  assert.deepEqual(ids('torino'), ['torino']);
  assert.deepEqual(ids('naxos'), ['naxos']);
});

test('search is defensive when fragrance is null/missing', () => {
  const list = [
    product('a', 'Dior', 'Sauvage'),
    product('b', 'Chanel', 'Allure'),
  ];
  assert.doesNotThrow(() => filterProducts(list, { query: 'sauvage' }));
  assert.deepEqual(filterProducts(list, { query: 'sauvage' }).map(p => p.id), ['a']);
});

/* Regression catalog mirrors the fields that triggered the production issue:
   unrelated products carried "eau de parfum" in canonical names/aliases. */
const relevanceCatalog = [
  product('eros-flame', 'Versace', 'Eros Flame', {
    fragrance: {
      canonical_name: 'versace eros flame eau de parfum',
      aliases: ['versace eros flame edp'],
    },
  }),
  product('le-beau-edt', 'Jean Paul Gaultier', 'Le Beau EDT', {
    rawName: 'Le Beau',
    concentration: 'EDT',
    fragrance: {
      canonical_name: 'jean paul gaultier le beau edt',
      aliases: ['jpg le beau', 'le beau'],
    },
  }),
  product('sauvage', 'Dior', 'Sauvage EDP', {
    rawName: 'Sauvage',
    concentration: 'EDP',
    fragrance: {
      canonical_name: 'dior sauvage eau de parfum',
      aliases: ['dior sauvage edp', 'sauvage edp'],
    },
  }),
  product('profondo', 'Giorgio Armani', 'Profondo EDP', {
    fragrance: {
      canonical_name: 'armani acqua di gio profondo eau de parfum',
      aliases: ['adg profondo edp'],
    },
  }),
  product('nine-pm', 'Afnan', '9PM Night Out', {
    fragrance: {
      canonical_name: 'afnan 9pm night out eau de parfum',
      aliases: ['afnan 9pm night out'],
    },
  }),
  product('le-beau-parfum', 'Jean Paul Gaultier', 'Le Beau Le Parfum', {
    concentration: 'Parfum',
    fragrance: {
      canonical_name: 'jean paul gaultier le beau le parfum',
      aliases: ['jpg le beau le parfum', 'le beau le parfum'],
    },
  }),
  product('eros-edt', 'Versace', 'Eros EDT', {
    fragrance: {
      canonical_name: 'versace eros eau de toilette',
      aliases: ['versace eros edt'],
    },
  }),
];

const relevanceIds = (query, filters = {}) =>
  filterProducts(relevanceCatalog, { query, sort: 'trending', ...filters }).map(p => p.id);

test('Le beau returns only the Le Beau variants from the production-shaped catalog', () => {
  assert.deepEqual(relevanceIds('Le beau'), ['le-beau-edt', 'le-beau-parfum']);
  assert.deepEqual(relevanceIds('le beau'), ['le-beau-edt', 'le-beau-parfum']);
  assert.deepEqual(relevanceIds('  Le   beau  '), ['le-beau-edt', 'le-beau-parfum']);
  assert.deepEqual(relevanceIds('beau'), ['le-beau-edt', 'le-beau-parfum']);
});

test('Le beau rejects the eau-de-parfum fuzzy false positives', () => {
  const results = relevanceIds('Le beau');
  for (const id of ['eros-flame', 'sauvage', 'profondo', 'nine-pm', 'eros-edt']) {
    assert.ok(!results.includes(id), `${id} must not qualify through eau/EDP metadata`);
  }
  assert.equal(scoreSearchResult(relevanceCatalog[0], 'Le beau'), 0);
  assert.equal(scoreSearchResult(relevanceCatalog[3], 'Le beau'), 0);
  assert.equal(scoreSearchResult(relevanceCatalog[4], 'Le beau'), 0);
});

test('name matches outrank explicit secondary aliases even when the alias is featured', () => {
  const secondary = product('secondary', 'Maison Test', 'Le Male Collector', {
    featured: true,
    fragrance: { aliases: ['le beau inspired'] },
  });
  const exact = product('exact', 'Maison Test', 'Le Beau', {
    fragrance: { aliases: ['le beau'] },
  });
  const results = filterProducts([secondary, exact], { query: 'Le beau', sort: 'trending' });

  assert.deepEqual(results.map(p => p.id), ['exact', 'secondary']);
  assert.ok(scoreSearchResult(exact, 'Le beau') > scoreSearchResult(secondary, 'Le beau'));
});

test('Le Beau EDT is qualifier-strict and does not fuzzy EDT into EDP', () => {
  assert.deepEqual(relevanceIds('Le Beau EDT'), ['le-beau-edt']);
});

test('a short token by itself cannot produce substring or fuzzy matches', () => {
  assert.deepEqual(relevanceIds('le'), []);
  assert.deepEqual(relevanceIds('de'), []);
});

test('JPG Le Beau combines the brand alias with the remaining name tokens', () => {
  assert.deepEqual(relevanceIds('JPG Le Beau'), ['le-beau-edt', 'le-beau-parfum']);
});

test('short identity tokens remain required inside meaningful compound queries', () => {
  const y = product('y-edp', 'Yves Saint Laurent', 'Y EDP', {
    fragrance: { aliases: ['ysl y', 'y edp'] },
  });
  const myslf = product('myslf', 'Yves Saint Laurent', 'MYSLF EDP');
  const unrelatedEdp = product('other-edp', 'Maison Test', 'Other EDP');
  const leParfum = product('le-parfum', 'Maison Test', 'Le Parfum');
  const genericParfum = product('generic-parfum', 'Maison Test', 'Other', {
    fragrance: { aliases: ['other eau de parfum'] },
  });

  assert.deepEqual(
    filterProducts([myslf, y], { query: 'YSL Y', sort: 'trending' }).map(p => p.id),
    ['y-edp'],
  );
  assert.deepEqual(
    filterProducts([unrelatedEdp, y], { query: 'Y EDP', sort: 'trending' }).map(p => p.id),
    ['y-edp'],
  );
  assert.deepEqual(
    filterProducts([genericParfum, leParfum], { query: 'Le parfum', sort: 'trending' }).map(p => p.id),
    ['le-parfum'],
  );
});

test('numeric naming equivalents still require every query token', () => {
  const million = product('million', 'Paco Rabanne', 'One Million Lucky');
  const unrelated = product('one-only', 'Maison Test', 'One More');

  assert.deepEqual(
    filterProducts([unrelated, million], { query: '1 Million', sort: 'trending' }).map(p => p.id),
    ['million'],
  );
});

test('Sauvage and Dior Sauvage prioritize the product identity', () => {
  const inspired = product('sauvage-inspired', 'Maison Test', 'Blue Tribute', {
    featured: true,
    fragrance: { aliases: ['dior sauvage inspired'] },
  });
  const list = [...relevanceCatalog, inspired];
  const sauvage = filterProducts(list, { query: 'Sauvage', sort: 'trending' }).map(p => p.id);
  const diorSauvage = filterProducts(list, { query: 'Dior Sauvage', sort: 'trending' }).map(p => p.id);

  assert.equal(sauvage[0], 'sauvage');
  assert.equal(diorSauvage[0], 'sauvage');
  assert.ok(sauvage.includes('sauvage'));
  assert.ok(diorSauvage.includes('sauvage'));
});

test('active filters intersect with search results and never add products', () => {
  assert.deepEqual(
    relevanceIds('Le beau', { house: 'Jean Paul Gaultier' }),
    ['le-beau-edt', 'le-beau-parfum'],
  );
  assert.deepEqual(relevanceIds('Le beau', { house: 'Versace' }), []);
  assert.deepEqual(relevanceIds('Le beau', { gender: 'mujer' }), []);
});

test('clearing a query restores the Destacados order', () => {
  const featuredAlias = product('featured-alias', 'Maison Test', 'Le Male Collector', {
    featured: true,
    fragrance: { aliases: ['le beau inspired'] },
  });
  const exactName = product('exact-name', 'Maison Test', 'Le Beau');
  const list = [exactName, featuredAlias];

  assert.deepEqual(
    filterProducts(list, { query: 'Le beau', sort: 'trending' }).map(p => p.id),
    ['exact-name', 'featured-alias'],
  );
  assert.deepEqual(
    filterProducts(list, { query: '', sort: 'trending' }).map(p => p.id),
    ['featured-alias', 'exact-name'],
  );
});
