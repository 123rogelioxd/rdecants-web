/* =============================================================
   RDECANTS — HEADER
   Scroll state + the single global search, which lives behind an icon
   in an overlay panel (there is no permanently visible search field).

   Two behaviours, one input:
     • On a page that owns the catalog grid, every keystroke filters it
       live through the existing SearchBar engine.
     • On a page without a grid (home, product, mood), submitting hands
       the query to the catalog page instead of silently doing nothing.

   The overlay deliberately does NOT lock the body: results are the
   page's own content and must stay scrollable while typing.
   ============================================================= */

import { SearchBar } from './searchbar.js';

const CATALOG_URL = '/catalogo.html';

export function setupHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  _setupHeaderSearch();
}

/* ── Header search ──────────────────────────────────────────── */
function _setupHeaderSearch() {
  const wrap      = document.getElementById('hs-wrap');
  const input     = document.getElementById('hs-input');
  const xBtn      = document.getElementById('hs-x');
  const cancelBtn = document.getElementById('hs-cancel');
  const searchBtn = document.getElementById('btn-hs-mobile');

  if (!wrap || !input) return;

  /* Live search — debounced via SearchBar.applyQuery.
     Tracking is handled inside SearchBar._run() to avoid double-counting. */
  let _timer = null;
  input.addEventListener('input', () => {
    const q = input.value;
    if (xBtn) xBtn.hidden = !q;
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      SearchBar.applyQuery(q);   /* buffers query if catalog not ready yet */
      if (q.length >= 1) _scrollToCatalog();
    }, 280);
  });

  /* Clear button */
  xBtn?.addEventListener('click', () => {
    input.value = '';
    xBtn.hidden = true;
    SearchBar.applyQuery('');
    input.focus();
  });

  /* The icon is the only search affordance, on every viewport. */
  searchBtn?.addEventListener('click', () => {
    wrap.classList.add('hs-wrap--open');
    searchBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 80);
  });

  cancelBtn?.addEventListener('click', () => {
    _closeOverlay(wrap, input, xBtn, searchBtn);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (wrap.classList.contains('hs-wrap--open')) {
        _closeOverlay(wrap, input, xBtn, searchBtn);
      } else {
        input.value = '';
        if (xBtn) xBtn.hidden = true;
        SearchBar.applyQuery('');
      }
    }
    if (e.key === 'Enter') {
      /* Without a grid on this page the query has nowhere to land, so send
         the visitor to the catalog with the search already applied. */
      if (!_hasCatalogGrid()) {
        const q = (input.value ?? '').trim();
        if (q) { _gotoCatalogSearch(q); return; }
      }
      _scrollToCatalog();
      if (wrap.classList.contains('hs-wrap--open')) {
        _closeOverlay(wrap, input, xBtn, searchBtn);
      }
    }
  });
}

function _closeOverlay(wrap, input, xBtn, searchBtn) {
  wrap.classList.remove('hs-wrap--open');
  input.value = '';
  if (xBtn) xBtn.hidden = true;
  searchBtn?.setAttribute('aria-expanded', 'false');
  SearchBar.applyQuery('');
  searchBtn?.focus?.();
}

function _hasCatalogGrid() {
  return Boolean(document.getElementById('products-grid'));
}

function _gotoCatalogSearch(query) {
  window.location.href = `${CATALOG_URL}?q=${encodeURIComponent(query)}`;
}

function _scrollToCatalog() {
  const catalog = document.getElementById('catalog');
  if (!catalog) return;
  const rect = catalog.getBoundingClientRect();
  /* Scroll only when the catalog grid is entirely out of the visible viewport.
     If any part is already on-screen, don't disrupt the user's scroll position. */
  const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
  if (!isVisible) {
    catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
