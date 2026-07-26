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
import { readGuideFromQuery,
         readQueryFromQuery,
         takeGuideHandoff }   from '../catalog/intents.js';
import { setupScrollAnimations,
         observeFadeUp }     from '../ui/animations.js';
import { Tracker }           from '../tracking/tracker.js';
import { AppState }          from '../core/state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  /* The grid must exist (and SearchBar must be initialised against real
     products) before any URL-driven guidance can be applied. */
  await renderProducts();

  _applyUrlState(window.location.search);

  observeFadeUp();
  setupScrollAnimations();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

/* Apply whatever the URL asked for, in priority order: an explicit search
   beats guidance, guidance beats a bare mood filter. Anything unrecognised
   is ignored rather than guessed at. */
function _applyUrlState(search) {
  const query = readQueryFromQuery(search);
  if (query) {
    const input = document.getElementById('hs-input');
    if (input) input.value = query;
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
