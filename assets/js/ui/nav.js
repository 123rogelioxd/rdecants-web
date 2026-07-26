/* =============================================================
   RDECANTS — MOBILE NAVIGATION DRAWER
   The compact header exposes a single toggle below 1024px; the links
   live in a drawer so the menu never competes with the hero.

   Kept separate from ui/header.js on purpose: the drawer is the only
   navigation surface that legitimately locks the page behind it, and
   header search must stay part of the document scroll.
   ============================================================= */

import { lockBodyScroll, unlockBodyScroll } from './scrollLock.js';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

let _drawer = null;
let _scrim  = null;
let _toggle = null;
let _prevFocus = null;

export function setupNav() {
  _toggle = document.getElementById('nav-toggle');
  _drawer = document.getElementById('nav-drawer');
  _scrim  = document.getElementById('nav-scrim');
  if (!_toggle || !_drawer) return;

  _toggle.addEventListener('click', () => (isOpen() ? closeNav() : openNav()));
  _scrim?.addEventListener('click', closeNav);
  document.getElementById('nav-close')?.addEventListener('click', closeNav);

  /* Following a link inside the drawer navigates away; close first so a
     cached back-navigation never restores a locked page. */
  _drawer.addEventListener('click', event => {
    if (event.target.closest('a')) closeNav();
  });

  document.addEventListener('keydown', _onKeydown);
}

function isOpen() {
  return Boolean(_drawer?.classList.contains('nav-drawer--open'));
}

export function openNav() {
  if (!_drawer || isOpen()) return;
  _prevFocus = document.activeElement;
  _drawer.classList.add('nav-drawer--open');
  _scrim?.classList.add('nav-scrim--open');
  _drawer.removeAttribute('aria-hidden');
  _toggle?.setAttribute('aria-expanded', 'true');
  lockBodyScroll();
  _drawer.querySelector(FOCUSABLE)?.focus();
}

export function closeNav() {
  if (!_drawer || !isOpen()) return;
  _drawer.classList.remove('nav-drawer--open');
  _scrim?.classList.remove('nav-scrim--open');
  _drawer.setAttribute('aria-hidden', 'true');
  _toggle?.setAttribute('aria-expanded', 'false');
  unlockBodyScroll();
  _prevFocus?.focus?.();
  _prevFocus = null;
}

/* Escape closes; Tab cycles inside the drawer while it owns the screen. */
function _onKeydown(event) {
  if (!isOpen()) return;

  if (event.key === 'Escape') { closeNav(); return; }
  if (event.key !== 'Tab') return;

  const items = Array.from(_drawer.querySelectorAll(FOCUSABLE));
  if (!items.length) return;

  const first = items[0];
  const last  = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
