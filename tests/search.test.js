import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';

const product = (id, house, name, notes = [], desc = '') => ({
  id,
  house,
  name,
  notes,
  desc,
  story: desc,
  badge: 'Disponible',
  variants: [{ size: 3, price: 120, stock: 10, availability: 10, available: true, variant_id: id }],
});

const catalog = [
  product('ysl', 'Yves Saint Laurent', 'Y EDP', ['bergamota'], 'fresco versatil'),
  product('bleu', 'Chanel', 'Bleu de Chanel EDT', ['cedro'], 'limpio elegante'),
  product('jpg', 'Jean Paul Gaultier', 'Le Male Elixir', ['vainilla'], 'dulce noche'),
  product('adg', 'Giorgio Armani', 'Acqua di Gio Profondo', ['marino'], 'acuatico fresco'),
  product('other', 'Dior', 'Sauvage EDP', ['pimienta'], 'ambar fresco'),
];

const ids = query => filterProducts(catalog, { query }).map(p => p.id);

test('search understands house and product aliases', () => {
  assert.ok(ids('ysl').includes('ysl'));
  assert.ok(ids('bdc').includes('bleu'));
  assert.ok(ids('jpg').includes('jpg'));
  assert.ok(ids('adg').includes('adg'));
});

test('search supports short fragrance aliases', () => {
  assert.deepEqual(ids('y'), ['ysl']);
  assert.ok(ids('le male').includes('jpg'));
});

test('search tolerates lightweight typos', () => {
  assert.ok(ids('chanle').includes('bleu'));
  assert.ok(ids('profndo').includes('adg'));
});

test('alias queries do not leak Spanish " y " false positives', () => {
  /* Products whose desc/story uses the Spanish connective "y" must NOT
     surface when the query is a YSL alias. */
  const noisy = [
    product('le-beau', 'Jean Paul Gaultier', 'Le Beau Le Parfum', ['coco'], 'tropical fresco y seductor'),
    product('torino', 'Xerjoff', 'Torino 22', ['miel'], 'dulce y opulento'),
    product('nine-pm', 'Afnan', '9PM Night Out', ['manzana'], 'dulce y juvenil'),
    product('ysl-y', 'Yves Saint Laurent', 'Y EDP', ['bergamota'], 'fresco versatil'),
  ];
  const search = q => filterProducts(noisy, { query: q }).map(p => p.id);

  assert.deepEqual(search('ysl').sort(),       ['ysl-y']);
  assert.deepEqual(search('y edp').sort(),     ['ysl-y']);
  assert.deepEqual(search('ysl y edp').sort(), ['ysl-y']);
});

test('search matches fragrance.aliases with partial query', () => {
  const sauvage = {
    ...product('sauvage', 'Dior', 'Sauvage', ['pimienta'], 'fresco especiado'),
    fragrance: {
      canonical_name: 'Dior Sauvage',
      aliases: ['jhony deep', 'sauvage', 'dior', 'dior sauvage edt', 'roger'],
      scent_family_normalized: 'amber-fougere',
      mood_tags: ['confident'],
      recommended_context_tags: ['office'],
      style_tags: ['masculine'],
      accords: ['ambroxan', 'bergamot'],
    },
  };
  const list = [sauvage, product('other', 'Chanel', 'Allure', ['rosa'], 'floral')];
  const search = q => filterProducts(list, { query: q }).map(p => p.id);

  assert.ok(search('rog').includes('sauvage'), 'partial alias "rog" should match "roger"');
  assert.ok(search('ROG').includes('sauvage'), 'search is case-insensitive');
  assert.ok(search('jhony').includes('sauvage'), 'matches another alias');
  assert.ok(search('ambroxan').includes('sauvage'), 'matches an accord');
  assert.ok(search('confident').includes('sauvage'), 'matches a mood tag');
});

test('search is defensive when fragrance is null/missing', () => {
  const list = [
    { ...product('a', 'Dior', 'Sauvage', ['pimienta'], 'fresco'), fragrance: null },
    product('b', 'Chanel', 'Allure', ['rosa'], 'floral'),
  ];
  assert.doesNotThrow(() => filterProducts(list, { query: 'sauvage' }));
  assert.ok(filterProducts(list, { query: 'sauvage' }).map(p => p.id).includes('a'));
});

test('alias queries scoped to brand: bdc and jpg', () => {
  const list = [
    product('bdc',    'Chanel',             'Bleu de Chanel EDT',  ['cedro'],   'limpio elegante'),
    product('jpg-lm', 'Jean Paul Gaultier', 'Le Male Elixir',      ['vainilla'], 'dulce noche'),
    product('jpg-lb', 'Jean Paul Gaultier', 'Le Beau Le Parfum',   ['coco'],    'fresco y tropical'),
    product('noise',  'Dior',               'Sauvage EDP',         ['ambar'],   'fresco y especiado'),
  ];
  const search = q => filterProducts(list, { query: q }).map(p => p.id).sort();

  assert.deepEqual(search('bdc'),         ['bdc']);
  assert.deepEqual(search('jpg'),         ['jpg-lb', 'jpg-lm']);
  assert.deepEqual(search('jpg le male'), ['jpg-lb', 'jpg-lm']);
});
