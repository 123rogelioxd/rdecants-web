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
