import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('catalog API GET requests bypass browser caches', () => {
  const client = read('assets/js/api/client.js');

  assert.match(client, /url\.searchParams\.set\('v', `\$\{BUILD_VERSION\}-\$\{Date\.now\(\)\}`\)/);
  assert.match(client, /cache:\s*'no-store'/);
  for (const endpoint of ['catalog', 'featured', 'trending', 'packs']) {
    assert.match(client, new RegExp(`_get\\('/api/web/${endpoint}'\\)`));
  }
});

test('HTML entry points declare no-cache metadata and current asset version', () => {
  for (const filename of ['index.html', 'product.html', 'mood.html']) {
    const html = read(filename);
    assert.match(html, /http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/);
    assert.match(html, /http-equiv="Pragma" content="no-cache"/);
    assert.match(html, /http-equiv="Expires" content="0"/);
    assert.match(html, /\?v=2026\.06\.03\.3/);
  }
});

test('Hostinger headers prevent stale HTML and revalidate JS', () => {
  const htaccess = read('.htaccess');

  assert.match(htaccess, /FilesMatch "\\\.html\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache, no-store, must-revalidate"/);
  assert.match(htaccess, /FilesMatch "\\\.js\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache"/);
});
