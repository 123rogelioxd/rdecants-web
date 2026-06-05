import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('header search imports the same SearchBar module instance as the catalog', () => {
  const header = read('assets/js/ui/header.js');
  const render = read('assets/js/catalog/render.js');

  assert.match(header, /from '\.\/searchbar\.js\?v=2026\.06\.04\.2'/);
  assert.match(render, /from '\.\.\/ui\/searchbar\.js\?v=2026\.06\.04\.2'/);
});

test('header has the only global search input and delegates to SearchBar.applyQuery', () => {
  const html = read('index.html');
  const header = read('assets/js/ui/header.js');

  assert.equal((html.match(/id="hs-input"/g) ?? []).length, 1);
  assert.match(header, /input\.addEventListener\('input'/);
  assert.match(header, /SearchBar\.applyQuery\(q\)/);
});
