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
const ASSET_VERSION = '2026.08.26.1';

const ENTRY_POINTS = [
  'index.html', 'catalogo.html', 'elegir.html', 'ayuda.html',
  'product.html', 'mood.html', 'perfumes.html', 'cotiza.html',
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

    /* Derived from ASSET_VERSION rather than hardcoded: a literal here is
       how the version pin silently rots one bump behind the real one. */
    assert.doesNotMatch(
      html,
      new RegExp(`\\?v=(?!${ASSET_VERSION.replace(/\./g, '\\.')})[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+`),
      `${filename} still references a stale asset version`,
    );
  }
});

test('the VERSION file matches the version stamped into the pages', () => {
  assert.equal(read('VERSION').trim(), ASSET_VERSION);
});

/* The API client stamps BUILD_VERSION onto every catalog request, so a stale
   value there is a second, quieter way to serve last release's data. */
test('the API client build version tracks the asset version', () => {
  assert.match(
    read('assets/js/api/config.js'),
    new RegExp(`BUILD_VERSION = '${ASSET_VERSION.replace(/\./g, '\\.')}'`),
  );
});

test('Hostinger headers prevent stale HTML and revalidate JS', () => {
  const htaccess = read('.htaccess');

  assert.match(htaccess, /FilesMatch "\\\.html\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache, no-store, must-revalidate"/);
  assert.match(htaccess, /FilesMatch "\\\.js\$"/);
  assert.match(htaccess, /Header set Cache-Control "no-cache"/);
});

/* Hostinger served site.webmanifest as text/plain, which put it outside every
   cache rule in .htaccess — the only file on the site with no caching policy
   at all. iOS re-reads the manifest when it launches the home-screen web app,
   so a heuristically cached copy keeps the installed icon on an old app
   definition. It has to declare its type and revalidate like the HTML. */
test('the web manifest is typed and revalidated like the HTML', () => {
  const htaccess = read('.htaccess');

  assert.match(htaccess, /AddType application\/manifest\+json \.webmanifest/);
  assert.match(
    htaccess,
    /FilesMatch "\\\.webmanifest\$">\s*\n\s*Header set Cache-Control "no-cache, no-store, must-revalidate"/,
  );
});

/* LiteSpeed injects `Expires: +7 days` onto static files. Cache-Control wins
   per RFC 7234, but the revalidating responses must not also claim a week of
   freshness — that contradiction is what an installed web app gets to resolve
   on its own. */
test('revalidating responses do not also advertise a week of freshness', () => {
  const htaccess = read('.htaccess');

  for (const ext of ['html', 'js', 'webmanifest']) {
    const block = new RegExp(`FilesMatch "\\\\\\.${ext}\\$">([\\s\\S]*?)</FilesMatch>`);
    const match = htaccess.match(block);
    assert.ok(match, `.htaccess must carry a ${ext} header block`);
    assert.match(
      match[1],
      /Header set Expires "0"/,
      `${ext} responses must expire immediately, not inherit LiteSpeed's +7 days`,
    );
  }
});

/* An iOS home-screen web app is suspended rather than closed, so returning to
   it restores the last document with no navigation — `no-store` on the HTML
   never runs and the app can sit a release behind forever. The inline check
   below is the only thing that closes that gap without a service worker, and
   it has to be inline: the HTML is the one file guaranteed fresh on device. */
test('every entry point can update itself when relaunched from the home screen', () => {
  for (const filename of ENTRY_POINTS) {
    const html = read(filename);

    assert.match(
      html,
      /navigator\.standalone === true/,
      `${filename} must scope the update check to the installed app`,
    );
    assert.match(
      html,
      /fetch\('\/VERSION', \{ cache: 'no-store' \}\)/,
      `${filename} must ask the server for the deployed version uncached`,
    );
    assert.match(
      html,
      new RegExp(`var BUILD = '${ASSET_VERSION.replace(/\./g, '\\.')}';`),
      `${filename} must compare against the version it was built with`,
    );
    assert.match(
      html,
      /addEventListener\('visibilitychange', check\)/,
      `${filename} must re-check when the app returns to the foreground`,
    );
    assert.match(
      html,
      /sessionStorage\.getItem\('rd-updated-to'\)/,
      `${filename} must guard against a reload loop mid-deploy`,
    );
  }
});
