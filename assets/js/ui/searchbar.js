/* =============================================================
   RDECANTS — SEARCH BAR + SMART FILTERS
   Premium search + filter UI injected above the catalog grid.

   Public API:
     SearchBar.init(allProducts, onFilter)  — mount + first render
     SearchBar.clearAll()                   — reset all filters

   Layout:
     Desktop ≥ 768px: two-row bar (search + pills + selects)
     Mobile  < 768px: search + "Filtros" button → bottom drawer
   ============================================================= */

import {
  filterProducts,
  getUniqueHouses,
  PRICE_LABELS,
  SORT_LABELS,
  MOOD_LABELS,
  GENDER_LABELS,
} from '../catalog/search.js';
import { Tracker }   from '../tracking/tracker.js';
import {
  Personalization,
  personalizeProducts,
} from '../recommendations/personalization.js';
import { rankCatalogForAnswers } from '../recommendations/assistant.js';
import { lockBodyScroll, unlockBodyScroll } from './scrollLock.js';

/* ── State ──────────────────────────────────────────────────── */
const _DEFAULT = {
  query:      '',
  mood:       null,
  house:      '',
  priceRange: null,
  sort:       'trending',
  gender:     null,
  /* Guided-catalog answers ({ family, occasion, gender }) set by the finder /
     intent chips. When present, the finder's beginner-safe ranking defines the
     grid order in place (top pick pinned) instead of the normal filter/sort. */
  guide:      null,
};

let _state            = { ..._DEFAULT };
let _allProducts      = [];
let _onFilter         = null;
let _lastResultCount  = 0;
let _lastTrackedQuery = '';
/* Query typed in the header before the catalog finishes loading.
   Applied on the next SearchBar.init() call.                     */
let _pendingQuery        = null;
/* Prevent firing personalized_catalog_viewed more than once per
   activation of the "for_you" sort mode.                        */
let _personalizationTracked = false;

/* ── DOM refs ────────────────────────────────────────────────── */
let _bar           = null;
let _drawer        = null;
let _drawerOverlay = null;
let _prevFocus     = null;

/* ── Public API ──────────────────────────────────────────────── */
export const SearchBar = {

  init(allProducts, onFilter) {
    /* tear down any existing instance */
    document.removeEventListener('keydown', _handleDrawerKey);
    _bar?.remove();
    _drawer?.remove();
    _drawerOverlay?.remove();

    _allProducts = allProducts;
    _onFilter    = onFilter;

    /* Carry over any query the user typed before the catalog loaded */
    const queued  = _pendingQuery;
    _pendingQuery = null;
    _state        = { ..._DEFAULT };
    if (queued) _state.query = queued;

    _buildBar();
    _buildDrawer();
    _injectBar();
    _bindBarEvents();
    _bindDrawerEvents();

    /* A query buffered before the catalog loaded is already in _state.query; the
       header input holds its own value, and _run() renders it as an active chip. */
    _run();          /* initial render; uses _state.query if set */
  },

  clearAll() {
    if (!_onFilter) return;
    _clearAll();
  },

  applyMood(mood) {
    if (!_onFilter) return;
    _state.guide = null;
    _state.mood = mood || null;
    _syncBarFromState();
    _syncDrawer();
    _run();
  },

  /* Guided-catalog entry point: the finder / intent chips hand their answers
     here; the grid re-ranks in place by beginner-safe fit with the top pick
     pinned. Clears any manual filters so the two never fight. */
  applyGuide(answers) {
    if (!_onFilter) return;
    _state = { ..._DEFAULT, guide: { ...answers } };
    _syncBarFromState();
    _syncDrawer?.();
    _run();
  },

  /* Exit guided mode ("Ver todo") back to the full default catalog. */
  clearGuide() {
    if (!_onFilter) return;
    _state.guide = null;
    _syncBarFromState();
    _run();
  },

  isGuided() {
    return Boolean(_state.guide);
  },

  /* The header owns the search input and delegates every keystroke here. */
  applyQuery(query) {
    if (!_onFilter) {
      /* SearchBar not ready yet — buffer query for init() */
      _pendingQuery = query || null;
      return;
    }
    if (query) _state.guide = null;   /* typing a search exits guided mode */
    _state.query = query || '';
    _run();
  },

  getState() {
    return { ..._state };
  },

  /* True when a search/mood/house/price/gender filter is active.
     Used by the catalog renderer to decide whether the compact mobile
     cap applies — filtered/search views always show every result. */
  hasActiveFilters() {
    return _hasActiveFilters();
  },

  applySort(sort) {
    if (!_onFilter) return;
    _state.guide = null;
    _state.sort = sort || 'trending';
    _syncBarFromState();
    _run();
  },
};

/* ══════════════════════════════════════════════════════════════
   BAR — main search + filter row(s)
   ══════════════════════════════════════════════════════════════ */

function _buildBar() {
  /* Sort stays inline (a primary, expected control); house / price / gender /
     scent live behind the "Filtrar" panel so a 50-product catalog never shows
     a wall of controls. Search is owned solely by the header — the bar shows
     the active query as a removable chip instead of a second input. */
  const sortOpts = Object.entries(SORT_LABELS).map(([k, v]) =>
    `<option value="${k}" ${k === 'trending' ? 'selected' : ''}>${v}</option>`
  ).join('');

  _bar = document.createElement('div');
  _bar.id        = 'sf-bar';
  _bar.className = 'sf-bar';
  _bar.setAttribute('role',       'search');
  _bar.setAttribute('aria-label', 'Filtrar y ordenar fragancias');

  _bar.innerHTML = `
    <!-- "Para ti" personalization banner (visible when for_you sort is active) -->
    <div class="sf-for-you" id="sf-for-you" hidden aria-live="polite"></div>

    <div class="sf-toolbar">
      <!-- Count + removable active-filter chips (search / gender / scent / house / price) -->
      <div class="sf-active" id="sf-active" aria-live="polite"></div>

      <div class="sf-tools">
        <div class="sf-sel-wrap">
          <label class="sf-sr-only" for="sf-sort">Ordenar por</label>
          <select id="sf-sort" class="sf-sel" aria-label="Ordenar por">
            ${sortOpts}
          </select>
          <svg class="sf-arrow" viewBox="0 0 10 6" stroke="currentColor"
               stroke-width="1.5" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4"/>
          </svg>
        </div>

        <button class="sf-filter-btn" id="sf-filter-btn"
          aria-label="Abrir filtros" aria-expanded="false" aria-controls="sf-drawer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" width="14" height="14" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2"/>
          </svg>
          Filtrar
          <span class="sf-badge" id="sf-badge" aria-label="filtros activos" hidden>0</span>
        </button>
      </div>
    </div>
  `;
}

function _injectBar() {
  document.getElementById('products-grid')
    ?.insertAdjacentElement('beforebegin', _bar);
}

function _bindBarEvents() {
  /* Sort is the only inline control. Changing it exits guided mode so the
     finder ranking and a manual sort never fight over the grid. */
  _bar.querySelector('#sf-sort')?.addEventListener('change', e => {
    _state.guide = null;
    _state.sort = e.target.value;
    _run();
    if (_state.sort === 'for_you') Tracker.forYouSortApplied('user');
    else Tracker.filterApplied('sort', _state.sort, _lastResultCount);
  });

  /* "Filtrar" → progressive-disclosure panel (same panel on mobile + desktop). */
  _bar.querySelector('#sf-filter-btn')?.addEventListener('click', _openDrawer);

  /* Active-filter chips: each removes just its own filter; "Limpiar todo" resets. */
  _bar.querySelector('#sf-active')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-clear]');
    if (chip) _clearFilter(chip.dataset.clear);
  });
}

/* Remove a single active filter (or all) from the chip row. */
function _clearFilter(key) {
  if (key === 'all') { _clearAll(); return; }
  _state.guide = null;
  if (key === 'query') { _state.query = ''; _clearHeaderSearchInput(); _lastTrackedQuery = ''; }
  if (key === 'gender') _state.gender = null;
  if (key === 'mood')   _state.mood = null;
  if (key === 'house')  _state.house = '';
  if (key === 'price')  _state.priceRange = null;
  _syncBarFromState();
  _syncDrawer();
  _run();
  Tracker.filterCleared();
}

/* The header owns the search input; keep it in sync when the query is cleared
   from the catalog (chip removal / clear-all) so the two never drift apart. */
function _clearHeaderSearchInput() {
  const hs  = document.getElementById('hs-input');
  const hsx = document.getElementById('hs-x');
  if (hs)  hs.value = '';
  if (hsx) hsx.hidden = true;
}

/* ══════════════════════════════════════════════════════════════
   MOBILE DRAWER — bottom sheet
   ══════════════════════════════════════════════════════════════ */

function _buildDrawer() {
  const houses = getUniqueHouses(_allProducts);

  /* ── Overlay ── */
  _drawerOverlay = document.createElement('div');
  _drawerOverlay.id        = 'sf-ov';
  _drawerOverlay.className = 'sf-ov';
  _drawerOverlay.addEventListener('click', _closeDrawer);
  document.body.appendChild(_drawerOverlay);

  /* ── Drawer ── */
  _drawer = document.createElement('div');
  _drawer.id        = 'sf-drawer';
  _drawer.className = 'sf-drawer';
  _drawer.setAttribute('role',       'dialog');
  _drawer.setAttribute('aria-modal', 'true');
  _drawer.setAttribute('aria-label', 'Filtros de búsqueda');

  const _dp = (t, v, label) =>
    `<button class="sf-dp" data-t="${t}" data-v="${v}" aria-label="Filtrar ${label}">${label}</button>`;

  const moodPills  = Object.entries(MOOD_LABELS).map(([k, v])   => _dp('mood',  k, v)).join('');
  const housePills = houses.map(h                                => _dp('house', h, h)).join('');
  const pricePills = Object.entries(PRICE_LABELS).map(([k, v])  => _dp('price', k, v)).join('');

  const genderPills = [
    `<button class="sf-dp" data-t="gender" data-v="" aria-label="Filtrar todos">Todos</button>`,
    ...Object.entries(GENDER_LABELS).map(([k, v]) =>
      `<button class="sf-dp" data-t="gender" data-v="${k}" aria-label="Filtrar ${v}">${v}</button>`
    ),
  ].join('');

  _drawer.innerHTML = `
    <div class="sf-drawer-handle" aria-hidden="true"></div>

    <div class="sf-drawer-head">
      <h3 class="sf-drawer-title">Filtros</h3>
      <button class="sf-drawer-close" id="sf-drawer-close" aria-label="Cerrar filtros">×</button>
    </div>

    <div class="sf-drawer-body">

      <section class="sf-drawer-sec">
        <p class="sf-drawer-label">Para quién</p>
        <div class="sf-dp-group">${genderPills}</div>
      </section>

      <section class="sf-drawer-sec">
        <p class="sf-drawer-label">Mood</p>
        <div class="sf-dp-group">${moodPills}</div>
      </section>

      <section class="sf-drawer-sec">
        <p class="sf-drawer-label">Casa</p>
        <div class="sf-dp-group">${housePills}</div>
      </section>

      <section class="sf-drawer-sec">
        <p class="sf-drawer-label">Precio / 5ml</p>
        <div class="sf-dp-group">${pricePills}</div>
      </section>

    </div>

    <div class="sf-drawer-foot">
      <button class="btn-ghost" id="sf-drawer-reset">Limpiar</button>
      <button class="btn-primary" id="sf-drawer-apply">Ver resultados</button>
    </div>
  `;

  document.body.appendChild(_drawer);
}

function _bindDrawerEvents() {
  _drawer.querySelector('#sf-drawer-close')
    ?.addEventListener('click', _closeDrawer);

  _drawer.querySelector('#sf-drawer-apply')
    ?.addEventListener('click', _closeDrawer);

  _drawer.querySelector('#sf-drawer-reset')
    ?.addEventListener('click', () => {
      _clearAll();
      _syncDrawer();
    });

  _drawer.querySelectorAll('.sf-dp').forEach(btn => {
    btn.addEventListener('click', () => {
      const { t, v } = btn.dataset;

      if (t === 'gender') _state.gender    = (v === '' || _state.gender === v) ? null : v;
      if (t === 'mood')  _state.mood       = _state.mood === v        ? null : v;
      if (t === 'house') _state.house      = _state.house === v       ? ''   : v;
      if (t === 'price') _state.priceRange = _state.priceRange === v  ? null : v;
      if (t === 'sort') {
        _state.sort = v;
        if (v === 'for_you') Tracker.forYouSortApplied('user');
      }

      _syncDrawer();
      _syncBarFromState();
      _run();
    });
  });
}

function _openDrawer() {
  _syncDrawer();
  _prevFocus = document.activeElement;
  _drawer.classList.add('sf-drawer--open');
  _drawerOverlay.classList.add('sf-ov--open');
  lockBodyScroll();
  _bar?.querySelector('#sf-filter-btn')
    ?.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', _handleDrawerKey);
  setTimeout(() => _drawer.querySelector('#sf-drawer-close')?.focus(), 120);
}

function _closeDrawer() {
  _drawer.classList.remove('sf-drawer--open');
  _drawerOverlay.classList.remove('sf-ov--open');
  unlockBodyScroll();
  _bar?.querySelector('#sf-filter-btn')
    ?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', _handleDrawerKey);
  _prevFocus?.focus?.();
  _prevFocus = null;
}

function _handleDrawerKey(e) {
  if (!_drawer?.classList.contains('sf-drawer--open')) return;

  if (e.key === 'Escape') {
    _closeDrawer();
    return;
  }

  if (e.key !== 'Tab') return;

  const focusable = Array.from(_drawer.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ══════════════════════════════════════════════════════════════
   ENGINE
   ══════════════════════════════════════════════════════════════ */

function _run() {
  /* Guided mode: the finder's beginner-safe ranking defines the grid order in
     place (top pick pinned). Manual filters/sort are bypassed — using any of
     them exits guided mode (handlers null _state.guide). */
  if (_state.guide) {
    const recommendations = rankCatalogForAnswers(_state.guide, _allProducts);
    const products = recommendations.map(r => r.product);
    _lastResultCount = products.length;
    _onFilter?.(products, { guided: true, answers: _state.guide, recommendations });
    _updateActiveChips(products.length);
    _updateBadge();
    _updateForYouBanner(0);
    return;
  }

  /* 1. Pure filter: query, mood, house, price, gender, sort base */
  const filtered = filterProducts(_allProducts, _state);

  /* 2. Personalization pass — only when "Para ti" sort is active.
     Disliked products sink to the bottom; non-disliked are re-ranked
     by taste affinity. Falls back to filtered order when no taste signal. */
  const result = _state.sort === 'for_you'
    ? _applyPersonalization(filtered)
    : filtered;

  _lastResultCount = result.length;
  _onFilter?.(result);
  _updateActiveChips(result.length);
  _updateBadge();
  _updateForYouBanner(result.length);
  _trackSearchQuery(result.length);
}

/* Post-process a filtered list through the taste signal.
   Returns the same list in original order when no signal exists. */
function _applyPersonalization(products) {
  if (!Personalization.hasSignal()) return products;   /* fallback: trending order */

  const taste      = Personalization.getTaste();
  const dislikedIds = new Set((taste.dislikes ?? []).map(String));

  const liked    = products.filter(p => !dislikedIds.has(String(p.id)));
  const disliked = products.filter(p =>  dislikedIds.has(String(p.id)));

  /* personalizeProducts re-ranks liked pool by affinity;
     disliked are appended at the bottom — not hidden. */
  return [...personalizeProducts(liked, taste), ...disliked];
}

/* Render "Para ti" banner and track first personalized view */
function _updateForYouBanner(count = 0) {
  const banner = _bar?.querySelector('#sf-for-you');
  if (!banner) return;

  if (_state.sort !== 'for_you') {
    banner.hidden      = true;
    banner.innerHTML   = '';
    _personalizationTracked = false;  /* reset for next activation */
    return;
  }

  const taste    = Personalization.getTaste();
  const hasSignal = Personalization.hasSignal();
  const likeCount = (taste.likes ?? []).length;

  /* Emit personalized_catalog_viewed once per "Para ti" session */
  if (!_personalizationTracked) {
    _personalizationTracked = true;
    Tracker.personalizedCatalogViewed(
      likeCount,
      (taste.dislikes ?? []).length,
    );
  }

  banner.hidden = false;

  if (!hasSignal) {
    banner.innerHTML = `
      <span class="sf-fy-kicker">✦ Para ti</span>
      <span class="sf-fy-label">Abre algunas fragancias y ordenamos el catálogo según tu gusto</span>
      <button type="button" class="sf-fy-clear" aria-label="Ver destacados">Ver destacados ×</button>`;
  } else {
    const noun = likeCount === 1 ? '1 fragancia evaluada' : `${likeCount} fragancias evaluadas`;
    banner.innerHTML = `
      <span class="sf-fy-kicker">✦ Para ti</span>
      <span class="sf-fy-label">Ordenado por tus preferencias</span>
      <span class="sf-fy-count">${noun}</span>
      <button type="button" class="sf-fy-clear" aria-label="Volver a destacados">Ver destacados ×</button>`;
  }

  banner.querySelector('.sf-fy-clear')
    ?.addEventListener('click', () => {
      _state.sort = 'trending';
      _syncBarFromState();
      _run();
    });
}

function _trackSearchQuery(count) {
  const q = (_state.query ?? '').trim();
  if (q.length >= 2 && q !== _lastTrackedQuery) {
    _lastTrackedQuery = q;
    Tracker.searchPerformed(q, count, 'catalog');
    if (count === 0) Tracker.searchNoResults(q, 'catalog');
  } else if (!q) {
    _lastTrackedQuery = '';
  }
}

/* Active-filter state. The catalog NEVER filters silently — every active
   filter (search / gender / scent-mood / house / price) is shown as its own
   removable chip next to the result count, plus a single "Limpiar todo". In
   guided mode the guide-state header above the grid is the primary summary, so
   the bar just reports how many recommendations were found. */
function _activeChips() {
  return [
    _state.query      ? { key: 'query',  label: `“${_state.query}”` }        : null,
    _state.gender     ? { key: 'gender', label: GENDER_LABELS[_state.gender] } : null,
    _state.mood       ? { key: 'mood',   label: MOOD_LABELS[_state.mood] }     : null,
    _state.house      ? { key: 'house',  label: _state.house }                 : null,
    _state.priceRange ? { key: 'price',  label: PRICE_LABELS[_state.priceRange] } : null,
  ].filter(Boolean);
}

function _updateActiveChips(count = 0) {
  const el = _bar?.querySelector('#sf-active');
  if (!el) return;
  const total = _allProducts.length;

  /* Guided mode already gets ONE compact state header (answers + count +
     Ajustar/Ver todo) directly above the grid — see _syncGuideState in
     catalog/render.js. Repeating the count here would say "Para ti" twice
     in the same screen, so this row stays empty while guided. */
  if (_state.guide) {
    el.innerHTML = '';
    return;
  }

  const chips = _activeChips();
  const countText = count === total ? `${total} fragancias` : `${count} de ${total}`;
  el.innerHTML = `
    <span class="sf-count ${chips.length ? 'sf-count--filtered' : ''}">${countText}</span>
    ${chips.map(c =>
      `<button class="sf-chip" type="button" data-clear="${c.key}"
        aria-label="Quitar filtro ${c.label}">${c.label}<span class="sf-chip-x" aria-hidden="true">×</span></button>`
    ).join('')}
    ${chips.length
      ? `<button class="sf-chip-clear" type="button" data-clear="all">Limpiar todo</button>`
      : ''}
  `;
}

/* ══════════════════════════════════════════════════════════════
   UI SYNC HELPERS
   ══════════════════════════════════════════════════════════════ */

/** Sync all drawer pill states from _state */
function _syncDrawer() {
  _drawer.querySelectorAll('.sf-dp').forEach(btn => {
    const { t, v } = btn.dataset;
    let on = false;
    if (t === 'gender') on = v === '' ? !_state.gender : _state.gender === v;
    if (t === 'mood')   on = _state.mood       === v;
    if (t === 'house')  on = _state.house      === v;
    if (t === 'price')  on = _state.priceRange === v;
    if (t === 'sort')   on = _state.sort       === v;
    btn.classList.toggle('sf-dp--on', on);
  });
}

/** Push _state into the bar's only inline control (sort). Gender / mood / house
    / price now live in the drawer and are synced by _syncDrawer(). */
function _syncBarFromState() {
  if (!_bar) return;
  const s = _bar.querySelector('#sf-sort');
  if (s) s.value = _state.sort;
}

function _updateBadge() {
  const filterBtn = _bar?.querySelector('#sf-filter-btn');
  const badge     = _bar?.querySelector('#sf-badge');
  if (!filterBtn || !badge) return;
  const n = _activeFilterCount();
  badge.textContent = n;
  badge.hidden      = n === 0;
  filterBtn.classList.toggle('sf-filter-btn--active', n > 0);
}

function _hasActiveFilters() {
  return !!(
    _state.query ||
    _state.mood  ||
    _state.house ||
    _state.priceRange ||
    _state.gender ||
    _state.guide
  );
}

function _activeFilterCount() {
  return (
    (_state.query      ? 1 : 0) +
    (_state.mood       ? 1 : 0) +
    (_state.house      ? 1 : 0) +
    (_state.priceRange ? 1 : 0) +
    (_state.gender     ? 1 : 0)
  );
}

function _clearAll() {
  const hadFilters = _hasActiveFilters();
  _state        = { ..._DEFAULT };
  _pendingQuery = null;
  _lastTrackedQuery = '';
  _clearHeaderSearchInput();
  if (!_bar) return;
  _syncBarFromState();
  _syncDrawer();
  _run();
  if (hadFilters) Tracker.filterCleared();
}
