/* =============================================================
   RDECANTS — HEADER
   Scroll behavior + persistent search (desktop inline / mobile overlay).
   Delegates all filtering to the existing SearchBar engine.
   ============================================================= */

import { SearchBar } from './searchbar.js?v=2026.06.03.2';

export function setupHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
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
  const mobileBtn = document.getElementById('btn-hs-mobile');

  if (!wrap || !input) return;

  /* Live search — debounced via SearchBar.applyQuery.
     Tracking is handled inside SearchBar._run() to avoid double-counting. */
  let _timer = null;
  input.addEventListener('input', () => {
    const q = input.value;
    xBtn.hidden = !q;
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

  /* Mobile — toggle overlay */
  mobileBtn?.addEventListener('click', () => {
    wrap.classList.add('hs-wrap--open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 80);
  });

  /* Cancel (mobile) — close overlay and clear */
  cancelBtn?.addEventListener('click', () => {
    _closeOverlay(wrap, input, xBtn);
  });

  /* ESC key — close overlay on mobile */
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (wrap.classList.contains('hs-wrap--open')) {
        _closeOverlay(wrap, input, xBtn);
      } else {
        input.value = '';
        xBtn.hidden = true;
        SearchBar.applyQuery('');
      }
    }
    if (e.key === 'Enter') {
      _scrollToCatalog();
      if (wrap.classList.contains('hs-wrap--open')) _closeOverlay(wrap, input, xBtn);
    }
  });
}

function _closeOverlay(wrap, input, xBtn) {
  wrap.classList.remove('hs-wrap--open');
  document.body.style.overflow = '';
  input.value = '';
  xBtn.hidden = true;
  SearchBar.applyQuery('');
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
