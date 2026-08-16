/* =============================================================
   RDECANTS — CATALOG PAGE ENTRY (/catalogo.html)

   The full store: search, filters, sort, the whole grid, product
   detail, presentation choice, cart and the WhatsApp order. None of
   that logic changed with the redesign — it simply moved off the home
   page and onto its own route, so the first screen a visitor sees no
   longer carries every control at once.

   The page accepts guidance from the URL so the home's intent tiles
   and the guided finder can hand over an already-filtered view:
     /catalogo.html?intent=noche
     /catalogo.html?family=fresco&occasion=dia&gender=hombre
     /catalogo.html?q=sauvage
     /catalogo.html?mood=fresco
   ============================================================= */

import { bootstrapShell }    from '../core/shell.js';
import { renderProducts }    from '../catalog/render.js';
import { SearchBar }         from '../ui/searchbar.js';
import { focusCatalogSearch } from '../ui/header.js';
import { readGuideFromQuery,
         readQueryFromQuery,
         takeGuideHandoff,
         takeSearchFocus }    from '../catalog/intents.js';
import { setupScrollAnimations,
         observeFadeUp }     from '../ui/animations.js';
import { Tracker }           from '../tracking/tracker.js';
import { AppState }          from '../core/state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  /* The grid must exist (and SearchBar must be initialised against real
     products) before any URL-driven guidance can be applied. */
  await renderProducts();

  _setupInlineSearch();
  _setupQuickGender();
  _applyUrlState(window.location.search);
  _applyFocusRequest(window.location.search);

  observeFadeUp();
  setupScrollAnimations();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

/* SEARCH_DEBOUNCE_MS is short enough that the grid feels live from the first
   character and long enough that a fast typist filters once, not eight times. */
const SEARCH_DEBOUNCE_MS = 200;

/* The catalog owns the one visible search field in the storefront. Every
   keystroke filters the grid through the same SearchBar engine the filters
   use — Enter is accepted but never required, and nothing waits for it. */
function _setupInlineSearch() {
  const input = document.getElementById('catalog-search-input');
  if (!input) return;

  const clearBtn = document.getElementById('catalog-search-x');
  let timer = null;

  const run = query => {
    if (clearBtn) clearBtn.hidden = !query;
    clearTimeout(timer);
    timer = setTimeout(() => SearchBar.applyQuery(query), SEARCH_DEBOUNCE_MS);
  };

  input.addEventListener('input', () => run(input.value));

  /* The native search widget's own clear (the WebKit "×") fires `search`,
     not `input`, on some builds — treat it like any other edit. */
  input.addEventListener('search', () => run(input.value));

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    clearTimeout(timer);
    SearchBar.applyQuery('');
    input.focus();
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      input.value = '';
      if (clearBtn) clearBtn.hidden = true;
      clearTimeout(timer);
      SearchBar.applyQuery('');
      return;
    }
    if (event.key === 'Enter') {
      /* Results are already on screen; Enter just commits the pending
         debounce and dismisses the mobile keyboard. */
      event.preventDefault();
      clearTimeout(timer);
      SearchBar.applyQuery(input.value);
      input.blur();
    }
  });
}

/* "Explora rápido por género" — the two buttons above the grid.
   They are a shortcut to the catalog's own gender filter, not a second
   filtering path: SearchBar.applyGender sets the same state the drawer pill
   sets and re-runs the same engine, so the pill, the removable chip and the
   count can never disagree with these buttons. Tapping the active one again
   clears the filter, which is why the pressed state is read back from what
   SearchBar actually applied rather than assumed. */
function _setupQuickGender() {
  const root = document.getElementById('quick-gender');
  if (!root) return;

  const buttons = [...root.querySelectorAll('[data-gender]')];
  if (!buttons.length) return;

  const sync = active => {
    buttons.forEach(btn =>
      btn.setAttribute('aria-pressed', String(btn.dataset.gender === active)));
  };

  root.addEventListener('click', event => {
    const btn = event.target.closest('[data-gender]');
    if (!btn) return;

    const active = SearchBar.applyGender(btn.dataset.gender) ?? null;
    sync(active);
    if (active) Tracker.genderFilterApplied(active, 'catalog_quick');
    else Tracker.filterCleared();
  });

  /* The same filter can also be changed from the drawer pill, the removable
     chip or "Limpiar todo". Reconciling after any click keeps these buttons
     from showing a pressed state the grid no longer has — cheaper and less
     brittle than mirroring every one of those code paths.

     Synchronously, not in a rAF: every one of those handlers is bound to an
     element deeper than the document, so by the time the click bubbles here
     the state is already updated — and a rAF would simply never run in a
     backgrounded tab, leaving the buttons lying about the filter. */
  document.addEventListener('click', () => sync(SearchBar.getState().gender ?? null));
}

/* Arriving from the header magnifier: focus the field (and, where the browser
   allows it, raise the keyboard), then drop the flag from the URL so a reload
   or a shared link is a plain catalog visit. The session flag is always
   consumed, even when the URL already carried the request, so it can never
   leak into the next visit. */
function _applyFocusRequest(search) {
  const params = new URLSearchParams(String(search ?? '').replace(/^\?/, ''));
  const stashed = takeSearchFocus();
  if (params.get('focus') !== 'search' && !stashed) return;

  focusCatalogSearch();

  params.delete('focus');
  const rest = params.toString();
  window.history?.replaceState?.(
    window.history.state,
    '',
    `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
  );
}

/* Apply whatever the URL asked for, in priority order: an explicit search
   beats guidance, guidance beats a bare mood filter. Anything unrecognised
   is ignored rather than guessed at. */
function _applyUrlState(search) {
  const query = readQueryFromQuery(search);
  if (query) {
    const input = document.getElementById('catalog-search-input');
    if (input) input.value = query;
    const clearBtn = document.getElementById('catalog-search-x');
    if (clearBtn) clearBtn.hidden = false;
    SearchBar.applyQuery(query);
    /* Drop any parked answers: an explicit search is a new intent. */
    takeGuideHandoff();
    return;
  }

  /* URL first; the one-shot handoff only covers the case where a host
     redirect ate the query on the way here (see catalog/intents.js). */
  const guide = readGuideFromQuery(search) ?? takeGuideHandoff();
  if (guide) {
    SearchBar.applyGuide(guide);
    Tracker.assistantStarted?.(guide);
    return;
  }

  const mood = new URLSearchParams(search.replace(/^\?/, '')).get('mood');
  if (mood) SearchBar.applyMood(mood);
}
