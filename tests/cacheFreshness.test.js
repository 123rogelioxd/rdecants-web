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

/* CSS is served `immutable` for a year, so a stylesheet change only reaches a
   real device when this query string moves. Keep it in lockstep with the
   VERSION file and every entry point — a page left behind serves last year's
   CSS against this year's markup. */
const ASSET_VERSION = '2026.07.26.1';

const ENTRY_POINTS = [
  'index.html', 'catalogo.html', 'elegir.html', 'ayuda.html',
  'product.html', 'mood.html',
];

test('HTML entry points declare no-cache metadata and current asset version', () => {
  for (const filename of ENTRY_POINTS) {
    const html = read(filename);
    assert.match(html, /http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/);
    assert.match(html, /http-equiv="Pragma" content="no-cache"/);
    assert.match(html, /http-equiv="Expires" content="0"/);

    for (const sheet of ['tokens', 'animations', 'components', 'styles']) {
      assert.match(
        html,
        new RegExp(`assets/css/${sheet}\\.css\\?v=${ASSET_VERSION.replace(/\./g, '\\.')}`),
        `${filename} must cache-bust ${sheet}.css to ${ASSET_VERSION}`,
      );
    }

    assert.doesNotMatch(
      html,
      /\?v=(?!2026\.07\.26\.1)[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+/,
      `${filename} still references a stale asset version`,
    );
  }
});

test('the VERSION file matches the version stamped into the pages', () => {
  assert.equal(read('VERSION').trim(), ASSET_VERSION);
});

test('Hostinger headers prevent stale HTML and revalidate JS', () => {
  const htaccess = read('.htaccess');

  assert.match(htaccess, /FilesMatch "\\\.html\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache, no-store, must-revalidate"/);
  assert.match(htaccess, /FilesMatch "\\\.js\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache"/);
});
