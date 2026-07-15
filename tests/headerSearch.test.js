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

  /* Single module identity: both import searchbar.js with the SAME bare
     specifier (no ?v= query). A divergent query string would load a second,
     un-initialised SearchBar instance — the exact duplicate-state bug the
     guided-catalog Phase 0 dedup removed. */
  assert.match(header, /from '\.\/searchbar\.js'/);
  assert.match(render, /from '\.\.\/ui\/searchbar\.js'/);
  assert.doesNotMatch(header, /searchbar\.js\?v=/);
  assert.doesNotMatch(render, /searchbar\.js\?v=/);
});

test('header has the only global search input and delegates to SearchBar.applyQuery', () => {
  const html = read('index.html');
  const header = read('assets/js/ui/header.js');

  assert.equal((html.match(/id="hs-input"/g) ?? []).length, 1);
  assert.match(header, /input\.addEventListener\('input'/);
  assert.match(header, /SearchBar\.applyQuery\(q\)/);
});
