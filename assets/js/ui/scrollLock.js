/* =============================================================
   RDECANTS — BODY SCROLL LOCK
   Single coherent lock for any full-screen overlay (cart drawer,
   product quick-view modal, mobile search, filter drawer).

   Why not `overflow: hidden` on <body>? It's the common first
   attempt, but iOS Safari can still rubber-band/pan the layout
   viewport behind an `overflow:hidden` body — the address bar and
   elastic overscroll operate outside plain CSS overflow. Pinning the
   body with `position: fixed` at its current scroll offset removes it
   from the scrollable viewport entirely, so there is nothing behind
   the overlay for a touch/wheel gesture to move.

   Reference-counted so independent overlays (e.g. the product modal
   closing while the cart is also open) never clobber each other's
   lock — only the call that brings the count back to 0 restores
   scroll, and only the call that takes it from 0 saves it.
   ============================================================= */

let _count = 0;
let _scrollY = 0;

export function lockBodyScroll() {
  if (_count === 0) {
    _scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${_scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
  }
  _count++;
}

export function unlockBodyScroll() {
  if (_count <= 0) return;
  _count--;
  if (_count === 0) {
    const { style } = document.body;
    const y = _scrollY;
    style.position = '';
    style.top = '';
    style.left = '';
    style.right = '';
    style.width = '';
    window.scrollTo(0, y);
  }
}

export function isBodyScrollLocked() {
  return _count > 0;
}

/* Test-only escape hatch — a stuck lock (e.g. a test that opens without
   closing) must not bleed into the next test's assertions. */
export function __resetBodyScrollLockForTests() {
  _count = 0;
  _scrollY = 0;
  const { style } = document.body;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  style.width = '';
}
