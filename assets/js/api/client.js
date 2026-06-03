/* =============================================================
   RDECANTS — API CLIENT
   Thin fetch wrapper for R Supply OS web endpoints.
   ============================================================= */

import { API_BASE, BUILD_VERSION } from './config.js?v=2026.06.03.2';

async function _get(path) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('v', `${BUILD_VERSION}-${Date.now()}`);

  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);

  return res.json();
}

async function _post(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    if (res.status === 422) {
      console.error('[RDecants] API validation failed:', { path, status: res.status, response: data });
    }

    const message = data?.message || `API ${path} -> ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const ApiClient = {
  getDecantsProducts: () => _get('/api/web/catalog'),
  getCatalog:         () => _get('/api/web/catalog'),
  getFeatured:        () => _get('/api/web/featured'),
  getTrending:        () => _get('/api/web/trending'),
  getPacks:           () => _get('/api/web/packs'),
  createWebOrder:     (payload) => _post('/api/web/orders', payload),
};
