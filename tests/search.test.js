import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts } from '../assets/js/catalog/search.js';

const product = (id, house, name, options = {}) => ({
  id,
  house,
  brand: options.brand,
  name,
  aliases: options.aliases ?? [],
  canonical_name: options.canonical_name,
  concentration: options.concentration,
  version: options.version,
  notes: options.notes ?? [],
  desc: options.desc ?? '',
  story: options.story ?? options.desc ?? '',
  badge: options.badge ?? 'Disponible',
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
