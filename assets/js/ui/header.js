/* =============================================================
   RDECANTS — HEADER
   Scroll state + the magnifier, which is a shortcut to ONE search
   field: the visible input on the catalog page.

     • On the catalog, the icon focuses that input in place.
     • On any other page it navigates straight to the catalog with
       ?focus=search, and the catalog focuses the field on arrival
       (opening the keyboard on the mobile browsers that allow it).

   There is deliberately no overlay input any more: two search fields
   on the same site meant two states to keep in sync, and a query typed
   on the home page had nowhere to land until the visitor pressed Enter.
   ============================================================= */

import { stashSearchFocus } from '../catalog/intents.js';

const CATALOG_URL = '/catalogo.html';
const CATALOG_INPUT_ID = 'catalog-search-input';

export function setupHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  _setupSearchShortcut();
}

/* ── Magnifier → the catalog's search field ─────────────────── */
function _setupSearchShortcut() {
  const searchBtn = document.getElementById('btn-hs-mobile');
  if (!searchBtn) return;

  searchBtn.addEventListener('click', () => {
    const input = document.getElementById(CATALOG_INPUT_ID);
    if (input) { focusCatalogSearch(input); return; }
    /* Belt and braces: the URL states the intent, and a one-shot session flag
       survives the hosts that 301 away the query string (see intents.js). */
    stashSearchFocus();
    window.location.href = `${CATALOG_URL}?focus=search`;
  });
}

/* Bring the field into view and put the caret in it. Called both by the
   in-page shortcut and by the catalog page when it arrives with
   ?focus=search. Scrolling first keeps the field clear of the sticky
   header; the focus itself is what opens the mobile keyboard, where the
   browser allows it outside a direct tap. */
export function focusCatalogSearch(input = document.getElementById(CATALOG_INPUT_ID)) {
  if (!input) return false;
  input.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  input.focus?.({ preventScroll: true });
  /* Safari/Chrome on iOS only raise the keyboard for a focus that carries a
     user gesture; when it does open, put the caret after any existing text. */
  const value = input.value ?? '';
  input.setSelectionRange?.(value.length, value.length);
  return true;
}
