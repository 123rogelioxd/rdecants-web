/* =============================================================
   RDECANTS — API CLIENT
   Thin fetch wrapper for R Supply OS web endpoints.

   All methods return parsed JSON or throw on HTTP error.
   Callers are responsible for fallback logic.
   ============================================================= */

import { API_BASE } from './config.js';

async function _get(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export const ApiClient = {
  /** Returns array of all catalog products */
  getCatalog:  () => _get('/api/web/catalog'),

  /** Returns [] or [product] — always an array */
  getFeatured: () => _get('/api/web/featured'),

  /** Returns array of trending products (used by carousel) */
  getTrending: () => _get('/api/web/trending'),

  /** Returns array of packs */
  getPacks:    () => _get('/api/web/packs'),
};
