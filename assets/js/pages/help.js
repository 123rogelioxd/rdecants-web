/* =============================================================
   RDECANTS — HELP PAGE ENTRY (/ayuda.html)
   Static content; it only needs the shared shell so the header,
   search and cart behave the same as everywhere else.
   ============================================================= */

import { bootstrapShell } from '../core/shell.js';
import { Tracker }        from '../tracking/tracker.js';
import { AppState }       from '../core/state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();
  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});
