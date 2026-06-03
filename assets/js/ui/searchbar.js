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
} from '../catalog/search.js?v=2026.06.03.2';
import { Tracker }   from '../tracking/tracker.js';
import {
  Personalization,
  personalizeProducts,
} from '../recommendations/personalization.js?v=2026.06.03.2';

/* ── State ──────────────────────────────────────────────────── */
const _DEFAULT = {
  query:      '',
  mood:       null,
  house:      '',
  priceRange: null,
  sort:       'trending',
  gender:     null,
};

let _state            = { ..._DEFAULT };
let _allProducts      = [];
let _onFilter         = null;
let _debounceTimer    = null;
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

    /* Sync the bar input so the buffered query is visible */
    if (queued) {
      const input = _bar?.querySelector('#sf-input');
      const xBtn  = _bar?.querySelector('#sf-x');
      if (input) input.value = queued;
      if (xBtn)  xBtn.hidden = false;
    }

    _run();          /* initial render; uses _state.query if set */
  },

  clearAll() {
    if (!_onFilter) return;
    _clearAll();
  },

  applyMood(mood) {
    if (!_onFilter) return;
    _state.mood = mood || null;
    _syncBarFromState();
    _syncDrawer();
    _run();
  },

  applyQuery(query) {
    if (!_onFilter) {
      /* SearchBar not ready yet — buffer query for init() */
      _pendingQuery = query || null;
      return;
    }
    _state.query = query || '';
    const input = _bar?.querySelector('#sf-input');
    const xBtn  = _bar?.querySelector('#sf-x');
    if (input) input.value = _state.query;
    if (xBtn)  xBtn.hidden = !_state.query;
    _run();
  },

  getState() {
    return { ..._state };
  },

  applySort(sort) {
    if (!_onFilter) return;
    _state.sort = sort || 'trending';
    _syncBarFromState();
    _run();
  },
};

/* ══════════════════════════════════════════════════════════════
   BAR — main search + filter row(s)
   ══════════════════════════════════════════════════════════════ */

function _buildBar() {
  const houses = getUniqueHouses(_allProducts);

  /* Mood pills (desktop) */
  const moodPills = Object.entries(MOOD_LABELS).map(([key, label]) =>
    `<button class="sf-mood ${_state.mood === key ? 'sf-mood--on' : ''}"
       data-mood="${key}" aria-pressed="${_state.mood === key}">
       ${label}
     </button>`
  ).join('');

  /* House options */
  const houseOpts = houses.map(h =>
    `<option value="${h}">${h}</option>`
  ).join('');

  /* Price options */
  const priceOpts = Object.entries(PRICE_LABELS).map(([k, v]) =>
    `<option value="${k}">${v}</option>`
  ).join('');

  /* Sort options */
  const sortOpts = Object.entries(SORT_LABELS).map(([k, v]) =>
    `<option value="${k}" ${k === 'trending' ? 'selected' : ''}>${v}</option>`
  ).join('');

  _bar = document.createElement('div');
  _bar.id        = 'sf-bar';
  _bar.className = 'sf-bar';
  _bar.setAttribute('role',       'search');
  _bar.setAttribute('aria-label', 'Buscar y filtrar fragancias');

  _bar.innerHTML = `
    <!-- Active mood explorer banner (visible only when a mood is set) -->
    <div class="sf-exploring" id="sf-exploring" hidden aria-live="polite"></div>

    <!-- "Para ti" personalization banner (visible when for_you sort is active) -->
    <div class="sf-for-you" id="sf-for-you" hidden aria-live="polite"></div>

    <!-- Row 1: search input + controls -->
    <div class="sf-row sf-row-top">

      <div class="sf-search">
        <svg class="sf-search-icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          id="sf-input"
          class="sf-input"
          type="search"
          placeholder="Buscar fragancia, marca o nota…"
          autocomplete="off"
          spellcheck="false"
          aria-label="Buscar fragancias"
        >
        <button class="sf-x" id="sf-x" aria-label="Limpiar búsqueda" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" width="10" height="10" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="sf-controls">
        <div class="sf-sel-wrap">
          <select id="sf-house" class="sf-sel" aria-label="Filtrar por casa">
            <option value="">Casa</option>${houseOpts}
          </select>
          <svg class="sf-arrow" viewBox="0 0 10 6" stroke="currentColor"
               stroke-width="1.5" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4"/>
          </svg>
        </div>

        <div class="sf-sel-wrap">
          <select id="sf-price" class="sf-sel" aria-label="Filtrar por precio">
            <option value="">Precio</option>${priceOpts}
          </select>
          <svg class="sf-arrow" viewBox="0 0 10 6" stroke="currentColor"
               stroke-width="1.5" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4"/>
          </svg>
        </div>

        <div class="sf-sel-wrap">
          <select id="sf-sort" class="sf-sel" aria-label="Ordenar por">
            ${sortOpts}
          </select>
          <svg class="sf-arrow" viewBox="0 0 10 6" stroke="currentColor"
               stroke-width="1.5" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4"/>
          </svg>
        </div>

        <span class="sf-count" id="sf-count"
          aria-live="polite" aria-atomic="true"></span>

        <button class="sf-clear" id="sf-clear"
          aria-label="Limpiar todos los filtros" hidden>
          × Limpiar
        </button>
      </div>
    </div>

    <!-- Row 1b: gender preference pills (desktop only — mobile uses drawer) -->
    <div class="sf-row sf-row-gender">
      <span class="sf-gender-label" aria-hidden="true">Para:</span>
      <div class="sf-genders" role="group" aria-label="Filtrar por género">
        <button class="sf-gender-btn ${!_state.gender ? 'sf-gender-btn--on' : ''}"
          data-gender="" aria-pressed="${!_state.gender}">Todos</button>
        ${Object.entries(GENDER_LABELS).map(([key, label]) =>
          `<button class="sf-gender-btn ${_state.gender === key ? 'sf-gender-btn--on' : ''}"
            data-gender="${key}" aria-pressed="${_state.gender === key}">${label}</button>`
        ).join('')}
      </div>
    </div>

    <!-- Row 2: mood pills (desktop) + mobile filter button -->
    <div class="sf-row sf-row-moods">

      <div class="sf-moods" role="group" aria-label="Filtrar por mood">
        ${moodPills}
      </div>

      <button class="sf-mobile-btn" id="sf-mobile-btn"
        aria-label="Abrir filtros" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" width="13" height="13" aria-hidden="true">
          <path d="M3 6h18M7 12h10M11 18h2"/>
        </svg>
        Filtros
        <span class="sf-badge" id="sf-badge" aria-label="filtros activos" hidden>0</span>
      </button>

    </div>
  `;
}

function _injectBar() {
  document.getElementById('products-grid')
    ?.insertAdjacentElement('beforebegin', _bar);
}

function _bindBarEvents() {
  const input = _bar.querySelector('#sf-input');
  const xBtn  = _bar.querySelector('#sf-x');

  input?.addEventListener('input', e => {
    _state.query = e.target.value;
    xBtn.hidden  = !_state.query;
    _debounce();
  });

  xBtn?.addEventListener('click', () => {
    _state.query = '';
    input.value  = '';
    xBtn.hidden  = true;
    input.focus();
    _run();
  });

  _bar.querySelectorAll('.sf-gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.gender;
      _state.gender = (g === '' || _state.gender === g) ? null : g;
      _syncGender(_bar);
      _run();
      if (_state.gender) Tracker.genderFilterApplied(_state.gender, 'catalog');
    });
  });

  _bar.querySelectorAll('.sf-mood').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mood;
      _state.mood = _state.mood === m ? null : m;
      _syncMoods(_bar);
      _run();
      if (_state.mood) Tracker.filterApplied('mood', _state.mood, _lastResultCount);
    });
  });

  _bar.querySelector('#sf-house')?.addEventListener('change', e => {
    _state.house = e.target.value;
    _run();
    if (_state.house) Tracker.filterApplied('house', _state.house, _lastResultCount);
  });

  _bar.querySelector('#sf-price')?.addEventListener('change', e => {
    _state.priceRange = e.target.value || null;
    _run();
    if (_state.priceRange) Tracker.filterApplied('price', _state.priceRange, _lastResultCount);
  });

  _bar.querySelector('#sf-sort')?.addEventListener('change', e => {
    _state.sort = e.target.value;
    _run();
    if (_state.sort === 'for_you') Tracker.forYouSortApplied('user');
    else Tracker.filterApplied('sort', _state.sort, _lastResultCount);
  });

  _bar.querySelector('#sf-clear')?.addEventListener('click', _clearAll);

  _bar.querySelector('#sf-mobile-btn')?.addEventListener('click', _openDrawer);
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
  const sortPills  = Object.entries(SORT_LABELS).map(([k, v])   => _dp('sort',  k, v)).join('');

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

      <section class="sf-drawer-sec">
        <p class="sf-drawer-label">Ordenar</p>
        <div class="sf-dp-group">${sortPills}</div>
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
  document.body.style.overflow = 'hidden';
  _bar?.querySelector('#sf-mobile-btn')
    ?.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', _handleDrawerKey);
  setTimeout(() => _drawer.querySelector('#sf-drawer-close')?.focus(), 120);
}

function _closeDrawer() {
  _drawer.classList.remove('sf-drawer--open');
  _drawerOverlay.classList.remove('sf-ov--open');
  document.body.style.overflow = '';
  _bar?.querySelector('#sf-mobile-btn')
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
  _updateCount(result.length);
  _updateClear();
  _updateBadge();
  _updateExploring(result.length);
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
      <span class="sf-fy-label">Completa el Taste Builder para personalizar el catálogo</span>
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

/** Visible "Mood activo" badge. The catalog NEVER filters silently —
   if a mood is on, the user sees what's active and how to remove it. */
function _updateExploring(count = 0) {
  const banner = _bar?.querySelector('#sf-exploring');
  if (!banner) return;
  const label = _state.mood ? MOOD_LABELS[_state.mood] : null;
  if (!label) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  const noun = count === 1 ? 'perfume encontrado' : 'perfumes encontrados';
  banner.hidden = false;
  banner.innerHTML = `
    <span class="sf-exploring-kicker">Mood activo</span>
    <strong class="sf-exploring-label">${label}</strong>
    <span class="sf-exploring-count">${count} ${noun}</span>
    <button type="button" class="sf-exploring-clear"
      aria-label="Quitar filtro de mood">Quitar filtro</button>`;
  banner.querySelector('.sf-exploring-clear')
    ?.addEventListener('click', () => {
      _state.mood = null;
      _syncBarFromState();
      _syncDrawer();
      _run();
    });
}

function _debounce() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_run, 280);
}

/* ══════════════════════════════════════════════════════════════
   UI SYNC HELPERS
   ══════════════════════════════════════════════════════════════ */

/** Toggle .sf-mood--on on all mood buttons in a container */
function _syncMoods(container) {
  container.querySelectorAll('.sf-mood').forEach(btn => {
    const on = btn.dataset.mood === _state.mood;
    btn.classList.toggle('sf-mood--on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

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

/** Toggle .sf-gender-btn--on on all gender buttons in a container */
function _syncGender(container) {
  container.querySelectorAll('.sf-gender-btn').forEach(btn => {
    const on = btn.dataset.gender === '' ? !_state.gender : btn.dataset.gender === _state.gender;
    btn.classList.toggle('sf-gender-btn--on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

/** Push _state into bar's select elements + mood + gender pills */
function _syncBarFromState() {
  if (!_bar) return;
  _syncGender(_bar);
  _syncMoods(_bar);
  const h = _bar.querySelector('#sf-house');
  const p = _bar.querySelector('#sf-price');
  const s = _bar.querySelector('#sf-sort');
  if (h) h.value = _state.house;
  if (p) p.value = _state.priceRange ?? '';
  if (s) s.value = _state.sort;
}

function _updateCount(n) {
  const el = _bar?.querySelector('#sf-count');
  if (!el) return;
  const total = _allProducts.length;
  el.textContent = n === total
    ? `${total} fragancias`
    : `${n} de ${total}`;
  el.classList.toggle('sf-count--filtered', n !== total);
}

function _updateClear() {
  const btn = _bar?.querySelector('#sf-clear');
  if (btn) btn.hidden = !_hasActiveFilters();
}

function _updateBadge() {
  const mobileBtn = _bar?.querySelector('#sf-mobile-btn');
  const badge     = _bar?.querySelector('#sf-badge');
  if (!mobileBtn || !badge) return;
  const n = _activeFilterCount();
  badge.textContent = n;
  badge.hidden      = n === 0;
  mobileBtn.classList.toggle('sf-mobile-btn--active', n > 0);
}

function _hasActiveFilters() {
  return !!(
    _state.query ||
    _state.mood  ||
    _state.house ||
    _state.priceRange ||
    _state.gender
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
  if (!_bar) return;
  const input = _bar.querySelector('#sf-input');
  const xBtn  = _bar.querySelector('#sf-x');
  if (input) input.value = '';
  if (xBtn)  xBtn.hidden  = true;
  _syncBarFromState();
  _run();
  if (hadFilters) Tracker.filterCleared();
}
