import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── product.html asset paths ────────────────────────────────── */
test('product.html: all CSS/JS asset paths are root-relative', () => {
  const html = readFileSync(join(root, 'product.html'), 'utf8');

  /* Every local href/src must start with "/" (absolute root) or be
     a remote https:// resource. Bare or "./" or "../" paths break
     under /perfume/{slug}, where the URL base is /perfume/, so the
     browser would request /perfume/assets/... and 404. */
  const localAssetMatches = [
    ...html.matchAll(/<link[^>]+href="([^"]+)"/g),
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
  ].map(m => m[1]);

  assert.ok(localAssetMatches.length > 0, 'expected at least one asset reference');

  for (const url of localAssetMatches) {
    const isAbsoluteRoot = url.startsWith('/');
    const isRemote = /^https?:\/\//.test(url);
    assert.ok(
      isAbsoluteRoot || isRemote,
      `asset "${url}" must be root-relative ("/...") or remote, not "${url}"`
    );
    assert.ok(
      !url.startsWith('./') && !url.startsWith('../'),
      `asset "${url}" must not use "./" or "../"`
    );
  }
});

test('product.html: references the page entry script at /assets/js/pages/product.js', () => {
  const html = readFileSync(join(root, 'product.html'), 'utf8');
  assert.match(html, /src="\/assets\/js\/pages\/product\.js\?v=/);
});

/* ── .htaccess (Hostinger / LiteSpeed / Apache) ─────────────── */
test('.htaccess: exists at frontend root next to index.html', () => {
  assert.ok(existsSync(join(root, '.htaccess')), '.htaccess must live next to index.html');
  assert.ok(existsSync(join(root, 'index.html')));
  assert.ok(existsSync(join(root, 'product.html')));
});

test('.htaccess: rewrites /perfume/{slug} to product.html', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  assert.match(ht, /Options\s+-MultiViews/, 'must disable MultiViews');
  assert.match(ht, /RewriteEngine\s+On/);
  assert.match(ht, /RewriteBase\s+\//);
  assert.match(
    ht,
    /RewriteRule\s+\^perfume\/\(\[\^\/\]\+\)\/\?\$\s+product\.html\s+\[L,QSA\]/,
    'must rewrite /perfume/{slug} → product.html with [L,QSA]'
  );
});

test('.htaccess: keeps a safe SPA-style fallback for the root', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  assert.match(ht, /RewriteCond\s+%\{REQUEST_FILENAME\}\s+!-f/);
  assert.match(ht, /RewriteCond\s+%\{REQUEST_FILENAME\}\s+!-d/);
});

/* ── Netlify artefacts may remain, but are NOT the production solution ── */
test('Hostinger .htaccess is the authoritative router (Netlify files are non-binding)', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  /* If _redirects or netlify.toml exist, that's fine for local dev / static
     hosts, but Hostinger needs the rewrite expressed in .htaccess. The test
     just guarantees the .htaccess version is present. */
  assert.match(ht, /perfume\/\(\[\^\/\]\+\)\/\?\$/);
});

/* ── productPageUrl contract (already tested elsewhere, repeated here
       to make the routing contract self-contained) ──────────────── */
test('productPageUrl returns /perfume/{slug} that the rewrite handles', async () => {
  const { productPageUrl } = await import('../assets/js/ui/productPage.js');
  assert.equal(productPageUrl({ slug: 'sauvage-edt-dior' }), '/perfume/sauvage-edt-dior');
  /* The .htaccess regex ^perfume/([^/]+)/?$ must match this path. */
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  const ruleMatch = ht.match(/RewriteRule\s+\^perfume\/\(\[\^\/\]\+\)\/\?\$/);
  assert.ok(ruleMatch, 'rewrite rule present');
  const re = new RegExp('^/perfume/([^/]+)/?$');
  assert.ok(re.test('/perfume/sauvage-edt-dior'));
});

/* ── MIME types the hero depends on ───────────────────────────────
   Caught on the live site, not locally: Hostinger/LiteSpeed served .avif as
   `text/plain`, which also excluded it from the image cache rule so it was
   re-downloaded on every visit. <picture> commits to a <source> from its
   `type` attribute BEFORE fetching, so the browser then has to content-sniff
   a text/plain response to render the hero — fragile today and broken the
   moment a nosniff policy is added. */
test('the server is told what an .avif is, and caches it like the other images', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');

  assert.match(ht, /AddType\s+image\/avif\s+\.avif/, '.avif MIME type declared');
  assert.match(ht, /AddType\s+image\/webp\s+\.webp/, '.webp MIME type declared');
  assert.match(ht, /FilesMatch\s+"\\.\(avif\|webp\)\$"/, 'modern formats get a cache rule');
  assert.match(ht, /max-age=31536000, immutable/, 'and it is the immutable one');
});

test('every hero format referenced by the markup is a format the server can name', () => {
  const ht = readFileSync(join(root, '.htaccess'), 'utf8');
  const html = readFileSync(join(root, 'index.html'), 'utf8');

  const extensions = [...new Set(
    [...html.matchAll(/\/assets\/hero\/[\w.-]+\.(\w+)/g)].map(m => m[1].toLowerCase()),
  )];
  assert.ok(extensions.length >= 3, `expected avif/webp/jpg, got ${extensions}`);

  /* Apache/LiteSpeed knows jpg/png natively; anything newer must be declared. */
  const nativelyKnown = new Set(['jpg', 'jpeg', 'png', 'gif']);
  for (const ext of extensions) {
    if (nativelyKnown.has(ext)) continue;
    assert.match(ht, new RegExp(String.raw`AddType\s+image/${ext}\s+\.${ext}`),
      `index.html serves .${ext} from /assets/hero but .htaccess never declares it`);
  }
});
