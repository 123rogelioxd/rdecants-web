/* =============================================================
   RDECANTS — MOOD PAGE ENTRY (/mood/{slug})
   ============================================================= */

import { bootstrapShell } from '../core/shell.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker } from '../tracking/tracker.js';
import { AppState } from '../core/state.js';
import {
  buildMoodPageHtml,
  hydrateMoodPage,
  findMoodBySlug,
  readMoodSlugFromLocation,
} from '../ui/moodPage.js';

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  const root = document.getElementById('mood-root');
  if (!root) return;

  const slug = readMoodSlugFromLocation();
  const mood = findMoodBySlug(slug);

  let products = [];
  try { products = await CatalogProvider.getProducts(); }
  catch { products = []; }

  root.innerHTML = buildMoodPageHtml(mood, products);

  if (!mood) {
    document.title = 'Mood no encontrado — RDecants';
    AppState.set('initialized', true);
    return;
  }

  document.title = `${mood.title} — RDecants`;
  hydrateMoodPage(root, mood, products);

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname, moodSlug: mood.slug });
});
