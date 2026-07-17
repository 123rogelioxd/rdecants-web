/* =============================================================
   RDECANTS — BODY SCROLL LOCK
   Covers the shared lock utility (assets/js/ui/scrollLock.js) and
   verifies every overlay that used to run its own competing
   `document.body.style.overflow` toggle now goes through it.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function stubDom(initialScrollY = 0) {
  const scrollToCalls = [];
  const body = { style: {} };
  globalThis.document = { body };
  globalThis.window = {
    scrollY: initialScrollY,
    scrollTo(x, y) {
      this.scrollY = y;
      scrollToCalls.push([x, y]);
    },
  };
  return { body, scrollToCalls };
}

/* ── Core lock mechanics ─────────────────────────────────────── */

test('lock pins the body at the current scroll offset (position:fixed, not overflow:hidden)', async () => {
  const { body } = stubDom(240);
  const { lockBodyScroll, unlockBodyScroll, __resetBodyScrollLockForTests } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  lockBodyScroll();

  assert.equal(body.style.position, 'fixed');
  assert.equal(body.style.top, '-240px');
  assert.equal(body.style.left, '0');
  assert.equal(body.style.right, '0');
  assert.equal(body.style.width, '100%');

  unlockBodyScroll();
});

test('unlock restores the exact original scroll position and clears the pin', async () => {
  const { body, scrollToCalls } = stubDom(613);
  const { lockBodyScroll, unlockBodyScroll, __resetBodyScrollLockForTests } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  lockBodyScroll();
  unlockBodyScroll();

  assert.deepEqual(scrollToCalls, [[0, 613]]);
  assert.equal(body.style.position, '');
  assert.equal(body.style.top, '');
  assert.equal(body.style.left, '');
  assert.equal(body.style.right, '');
  assert.equal(body.style.width, '');
});

test('reopening does not jump to the top — each lock captures the live scroll position', async () => {
  const { body } = stubDom(100);
  const { lockBodyScroll, unlockBodyScroll, __resetBodyScrollLockForTests } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  lockBodyScroll();
  unlockBodyScroll();

  /* Between close and reopen the customer scrolled the page further. */
  globalThis.window.scrollY = 900;
  lockBodyScroll();
  assert.equal(body.style.top, '-900px', 'the second lock must not reuse the first offset');
  unlockBodyScroll();
});

test('unlock is a no-op when nothing is locked (no negative counting, no stray scrollTo)', async () => {
  const { scrollToCalls } = stubDom(50);
  const { unlockBodyScroll, __resetBodyScrollLockForTests, isBodyScrollLocked } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  unlockBodyScroll();
  unlockBodyScroll();

  assert.equal(scrollToCalls.length, 0);
  assert.equal(isBodyScrollLocked(), false);
});

/* ── Reference counting — the actual fix for "competing lock systems" ── */

test('nested locks (e.g. cart opened while the quick-view modal is still open) do not clobber each other', async () => {
  const { body, scrollToCalls } = stubDom(320);
  const { lockBodyScroll, unlockBodyScroll, __resetBodyScrollLockForTests, isBodyScrollLocked } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  lockBodyScroll();   // e.g. the product modal opens
  lockBodyScroll();   // e.g. the cart opens on top of it

  unlockBodyScroll(); // cart closes first — modal is still open
  assert.equal(isBodyScrollLocked(), true, 'still locked while the modal is open');
  assert.equal(body.style.position, 'fixed', 'body must stay pinned');
  assert.equal(scrollToCalls.length, 0, 'scroll must not be restored yet');

  unlockBodyScroll(); // modal closes — now it's safe to restore
  assert.equal(isBodyScrollLocked(), false);
  assert.deepEqual(scrollToCalls, [[0, 320]]);
});

test('repeated open/close cycles do not accumulate styles or leak scroll offsets', async () => {
  const { body, scrollToCalls } = stubDom(0);
  const { lockBodyScroll, unlockBodyScroll, __resetBodyScrollLockForTests } =
    await import('../assets/js/ui/scrollLock.js');
  __resetBodyScrollLockForTests();

  const positions = [80, 400, 15, 777];
  for (const y of positions) {
    globalThis.window.scrollY = y;
    lockBodyScroll();
    unlockBodyScroll();
  }

  assert.deepEqual(scrollToCalls, positions.map(y => [0, y]), 'each cycle restores its own position');
  assert.equal(body.style.position, '', 'no leftover inline style after the last cycle');
  assert.equal(body.style.top, '');
});

/* ── One coherent lifecycle — no competing body-lock systems ─────
   Every overlay used to run its own `document.body.style.overflow`
   toggle independently (cart drawer, product quick-view modal, mobile
   search overlay, sort/filter drawer). That's the exact bug class the
   reference-counted lock above fixes — verify none of the four regressed
   back to a standalone implementation. */

const CONSUMERS = [
  'assets/js/cart/render.js',
  'assets/js/ui/modal.js',
  'assets/js/ui/searchbar.js',
];

test('the cart drawer, quick-view modal and filter drawer share the one scroll lock', () => {
  for (const file of CONSUMERS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /from\s+['"].*scrollLock\.js['"]/, `${file} imports the shared lock`);
    assert.match(src, /\blockBodyScroll\(\)/, `${file} calls lockBodyScroll()`);
    assert.match(src, /\bunlockBodyScroll\(\)/, `${file} calls unlockBodyScroll()`);
    assert.doesNotMatch(
      src,
      /document\.body\.style\.overflow\s*=/,
      `${file} must not run its own competing overflow toggle`,
    );
  }
});

test('filter drawer open/close is idempotent and teardown releases an active lock', () => {
  const src = fs.readFileSync('assets/js/ui/searchbar.js', 'utf8');

  assert.match(
    src,
    /function _openDrawer\(\)\s*{\s*if \(!_drawer \|\| !_drawerOverlay \|\| _drawer\.classList\.contains\('sf-drawer--open'\)\) return;/,
    'opening an already-open filter drawer must not acquire another lock',
  );
  assert.match(
    src,
    /function _closeDrawer\(\)\s*{\s*if \(!_drawer\?\.classList\.contains\('sf-drawer--open'\)\) return;/,
    'closing an already-closed drawer must not release another component lock',
  );
  assert.match(
    src,
    /init\(allProducts, onFilter\)[\s\S]*?classList\.contains\('sf-drawer--open'\)[\s\S]*?unlockBodyScroll\(\)[\s\S]*?_drawer\?\.remove\(\)/,
    'reinitializing the catalog must release the filter drawer before removing it',
  );
});
