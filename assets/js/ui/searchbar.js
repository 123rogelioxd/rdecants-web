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
import { rankGuidedCatalog } from '../recommendations/assistant.js';
/* The finder's own label map. Reused rather than re-authored so a chip and the
   question that produced it cannot say different things — and so this file
   adds no second taxonomy for copy's sake. */
import { ANSWER_LABELS } from '../recommendations/engine.js';
import { buildCatalogUrl } from '../catalog/intents.js';
import { lockBodyScroll, unlockBodyScroll } from './scrollLock.js';

/* ── State ──────────────────────────────────────────────────── */
const _DEFAULT = {
  query:      '',
  mood:       null,
  house:      '',
  priceRange: null,
  sort:       'newest',
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
    if (_drawer?.classList.contains('sf-drawer--open')) {
      unlockBodyScroll();
    }
    document.removeEventListener('keydown', _handleDrawerKey);
    _bar?.remove();
    _drawer?.remove();
    _drawerOverlay?.remove();
    _prevFocus = null;

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
    _syncGuideToUrl();
  },

  /* Exit guided mode ("Ver todo") back to the full default catalog. */
  clearGuide() {
    if (!_onFilter) return;
    _state.guide = null;
    _syncBarFromState();
    _run();
    _syncGuideToUrl();
  },

  /* Drop exactly ONE answer, by explicit request. The engine names which
     dimension is worth relaxing; the customer decides. Nothing is ever
     loosened automatically, and the remaining answers keep filtering. */
  relaxGuide(dimension) {
    if (!_onFilter || !_state.guide || !dimension) return;
    const next = { ..._state.guide };
    delete next[dimension];
    _state.guide = Object.keys(next).length ? next : null;
    _syncBarFromState();
    _syncDrawer();
    _run();
    _syncGuideToUrl();
    Tracker.guideFilterRemoved(dimension, _state.guide ?? {});
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

  /* Gender, applied from outside the drawer (the catalog's "Explora rápido
     por género" buttons). It sets the SAME gender the drawer pill sets, so the
     pill, the removable chip, the badge count and the result count follow
     automatically — a second, parallel gender filter is exactly how two
     surfaces end up disagreeing about what is on screen.
     Passing null (or the active value again) clears it.

     ── The production bug this fixes ────────────────────────────────
     This used to begin `_state.guide = null`. So a customer who tapped
     "De día" on the home and then "Caballero" in the catalog did not get
     men's daytime fragrances — they got all men's fragrances, because
     choosing a gender silently threw the occasion away. Occasion and gender
     were mutually exclusive MODES, which is not what a filter row that shows
     two chips promises.

     They compose now. `gender` is one of the finder's own answer keys and
     `rankGuidedCatalog` already gates on it, so guided mode needs no second
     filtering engine — writing gender INTO the guide is the whole fix. When
     no guide is active it keeps writing `_state.gender`, so the plain catalog
     behaves exactly as before.

     One gender, one place: whichever mode is active, there is a single value,
     and `effectiveGender()` is the only thing that reads it. */
  applyGender(gender) {
    if (!_onFilter) return;

    const current = _effectiveGender();
    const next = gender && current !== gender ? gender : null;

    if (_state.guide) {
      const guide = { ..._state.guide };
      if (next) guide.gender = next;
      else delete guide.gender;
      /* Dropping the last answer leaves guided mode entirely; dropping one of
         several keeps the rest filtering — the same rule relaxGuide() uses. */
      _state.guide = Object.keys(guide).length ? guide : null;
    } else {
      _state.gender = next;
    }

    _syncBarFromState();
    _syncDrawer();
    _run();
    _syncGuideToUrl();
    return next;
  },

  /* The gender currently filtering the grid, wherever it is stored. The quick
     buttons, the drawer pill, the chips and the URL all read this, so none of
     them can show a state the grid does not have. */
  effectiveGender() {
    return _effectiveGender();
  },
};

/** One gender value, read from whichever mode owns it. */
function _effectiveGender() {
  return (_state.guide ? _state.guide.gender : _state.gender) ?? null;
}

/* ══════════════════════════════════════════════════════════════
   BAR — main search + filter row(s)
   ══════════════════════════════════════════════════════════════ */

function _buildBar() {
  /* Sort stays inline (a primary, expected control); house / price / gender /
     scent live behind the "Filtrar" panel so a 50-product catalog never shows
     a wall of controls. Search is owned solely by the header — the bar shows
     the active query as a removable chip instead of a second input. */
  const sortOpts = Object.entries(SORT_LABELS).map(([k, v]) =>
    `<option value="${k}" ${k === 'newest' ? 'selected' : ''}>${v}</option>`
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
            <option value="relevance" hidden>Relevancia</option>
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

/* Remove a single active filter (or all) from the chip row.
   A `guide:<dimension>` key drops exactly that answer and leaves the rest
   filtering — the × on "De día" must not take "Caballero" with it. */
function _clearFilter(key) {
  if (key === 'all') { _clearAll(); return; }

  if (key.startsWith('guide:')) {
    SearchBar.relaxGuide(key.slice('guide:'.length));
    return;
  }

  _state.guide = null;
  if (key === 'query') { _state.query = ''; _syncSearchInput(''); _lastTrackedQuery = ''; }
  if (key === 'gender') _state.gender = null;
  if (key === 'mood')   _state.mood = null;
  if (key === 'house')  _state.house = '';
  if (key === 'price')  _state.priceRange = null;
  _syncBarFromState();
  _syncDrawer();
  _run();
  Tracker.filterCleared();
}

/* The catalog's visible field is the only search input. Push the engine's
   query back into it whenever the query changes from somewhere else (a chip
   removal, "Limpiar todo", or a ?q= handed over in the URL) so the field and
   the grid can never disagree. */
function _syncSearchInput(query) {
  const input = document.getElementById('catalog-search-input');
  const clear = document.getElementById('catalog-search-x');
  if (input && input.value !== query) input.value = query;
  if (clear) clear.hidden = !query;
}

/* Mirror the active query into the address bar so a search is shareable and
   survives a reload. replaceState, never pushState: one history entry per
   keystroke would turn the back button into an undo key for typing, and
   "back" has to leave the catalog the way the visitor expects. */
function _syncQueryToUrl(query) {
  const loc = globalThis.window?.location;
  const history = globalThis.window?.history;
  if (!loc?.href || typeof history?.replaceState !== 'function') return;
  if (!document.getElementById('products-grid')) return;   /* catalog page only */

  try {
    const url = new URL(loc.href);
    const next = (query ?? '').trim();
    if ((url.searchParams.get('q') ?? '') === next) return;
    if (next) url.searchParams.set('q', next);
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch { /* opaque or non-standard location — the grid is still filtered */ }
}

/* A live search owns the screen: the page's own editorial blocks (the
   "¿No sabes cuál elegir?" band and anything else marked as browse-only)
   step aside while results are showing, instead of sitting between the
   field and its matches. */
function _syncSearchingState(query) {
  document.body?.classList?.toggle?.('rd-searching', Boolean(query));
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

      /* Gender goes through the same entry point the quick buttons use, so
         the drawer cannot write a gender the guide does not see (and vice
         versa). Everything else is a plain catalog filter and exits guided
         mode, because the finder ranking and a manual mood/house/price filter
         have no defined way to compose. */
      if (t === 'gender') {
        SearchBar.applyGender(v === '' ? null : v);
        return;
      }
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
  if (!_drawer || !_drawerOverlay || _drawer.classList.contains('sf-drawer--open')) return;
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
  if (!_drawer?.classList.contains('sf-drawer--open')) return;
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
  /* The control reflects the effective primary order. _state.sort is retained
     underneath so it can act as the relevance tiebreak and be restored when
     the query is cleared. */
  _syncBarFromState();

  /* One query, three surfaces: the field, the URL and the page state. */
  const activeQuery = (_state.query ?? '').trim();
  _syncQueryToUrl(activeQuery);
  _syncSearchingState(activeQuery);

  /* Guided mode: the finder's beginner-safe ranking defines the grid order in
     place (top pick pinned). Manual filters/sort are bypassed — using any of
     them exits guided mode (handlers null _state.guide). */
  if (_state.guide) {
    /* One engine, one order: this is the exact ranking the finder's three
       picks came from, uncapped. Only high-compatibility matches are in it,
       which is why the grid can honestly call the first three "Nuestra
       recomendación #1–#3" and why "Ver todo el catálogo" is a separate,
       announced action rather than a silent widening. */
    const guided = rankGuidedCatalog(_state.guide, _allProducts);
    const products = guided.rows.map(r => r.product);
    _lastResultCount = products.length;
    _onFilter?.(products, {
      guided: true,
      answers: guided.answers,
      recommendations: guided.rows,
      notices: guided.notices,
      relaxation: guided.relaxation,
    });
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
  const result = _state.sort === 'for_you' && !_state.query?.trim()
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
/**
 * Every active filter, as its own removable chip.
 *
 * In guided mode each ANSWER is a chip — "De día ×", "Caballero ×" — rather
 * than the whole guide being one all-or-nothing thing. That is the visible
 * half of the composition fix: if the row shows two chips, tapping either
 * one's × must remove only that dimension, and the other must keep filtering.
 * The chip key is the canonical answer key, so removal routes straight to
 * relaxGuide() with no lookup table.
 */
function _activeChips() {
  if (_state.guide) {
    return GUIDE_CHIP_ORDER
      .filter(dimension => _state.guide[dimension])
      .map(dimension => ({
        key: `guide:${dimension}`,
        label: _guideLabel(dimension, _state.guide[dimension]),
      }));
  }

  return [
    _state.query      ? { key: 'query',  label: `“${_state.query}”` }        : null,
    _state.gender     ? { key: 'gender', label: GENDER_LABELS[_state.gender] } : null,
    _state.mood       ? { key: 'mood',   label: MOOD_LABELS[_state.mood] }     : null,
    _state.house      ? { key: 'house',  label: _state.house }                 : null,
    _state.priceRange ? { key: 'price',  label: PRICE_LABELS[_state.priceRange] } : null,
  ].filter(Boolean);
}

/* Chip order, so "De día · Caballero" reads the same way every time rather
   than in whatever order the answers happened to be written. Occasion first
   because it is what the customer chose on the home. */
const GUIDE_CHIP_ORDER = ['occasion', 'gender', 'family', 'goal', 'climate', 'age', 'budget'];

/* Customer-facing wording for one answer.
   `ANSWER_LABELS` is the finder's own map, so a chip and the question that
   produced it cannot say different things — notably `salir`, which the finder
   presents as "Salidas nocturnas". Gender falls back to the catalog's
   Hombre/Mujer labels, which is the vocabulary the quick buttons use. */
function _guideLabel(dimension, value) {
  if (dimension === 'gender') {
    return ANSWER_LABELS.gender?.[value] ?? GENDER_LABELS[value] ?? value;
  }
  return ANSWER_LABELS[dimension]?.[value] ?? String(value);
}

function _updateActiveChips(count = 0) {
  const el = _bar?.querySelector('#sf-active');
  if (!el) return;
  const total = _allProducts.length;

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
    /* Read through the effective value: in guided mode the gender lives on
       the guide, and a pill that reflected only `_state.gender` would show
       "Todos" while the grid was filtered to Caballero. */
    if (t === 'gender') on = v === '' ? !_effectiveGender() : _effectiveGender() === v;
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
  if (s) s.value = _state.query?.trim() ? 'relevance' : _state.sort;
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

/* The badge counts what the chip row shows, so the two can never disagree
   about how many filters are on. In guided mode that is one per answer — a
   customer looking at "De día × Caballero ×" must see 2, not 1 or 0. */
function _activeFilterCount() {
  if (_state.guide) return _activeChips().length;

  return (
    (_state.query      ? 1 : 0) +
    (_state.mood       ? 1 : 0) +
    (_state.house      ? 1 : 0) +
    (_state.priceRange ? 1 : 0) +
    (_state.gender     ? 1 : 0)
  );
}

/**
 * Mirror the guided state into the address bar.
 *
 * `buildCatalogUrl` is the same serializer the finder hands over with, so a
 * shared link and a reload land on exactly the state that produced them:
 * `?occasion=dia&gender=hombre` restores both chips, not one.
 *
 * replaceState, never pushState — for the same reason the query does. Each
 * refinement is an edit to one view, not a new page, and pushing would turn
 * Back into an undo key for filter taps instead of "leave the catalog".
 */
function _syncGuideToUrl() {
  const loc = globalThis.window?.location;
  const history = globalThis.window?.history;
  if (!loc?.href || typeof history?.replaceState !== 'function') return;
  if (!document.getElementById('products-grid')) return;   /* catalog page only */

  try {
    const url = new URL(loc.href);
    const next = new URL(buildCatalogUrl(_state.guide ?? {}), url.origin);

    /* A live search is serialized by _syncQueryToUrl and must survive a
       guide change — the two writers own different params. */
    const query = (_state.query ?? '').trim();
    if (query) next.searchParams.set('q', query);

    const search = next.searchParams.toString();
    if (search === url.searchParams.toString()) return;

    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  } catch { /* opaque or non-standard location — the grid is still filtered */ }
}

function _clearAll() {
  const hadFilters = _hasActiveFilters();
  _state        = { ..._DEFAULT };
  _pendingQuery = null;
  _lastTrackedQuery = '';
  _syncSearchInput('');
  if (!_bar) return;
  _syncBarFromState();
  _syncDrawer();
  _run();
  if (hadFilters) Tracker.filterCleared();
}
