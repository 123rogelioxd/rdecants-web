/* =============================================================
   RDECANTS — API CLIENT
   Thin fetch wrapper for R Supply OS web endpoints.
   ============================================================= */

import { API_BASE } from './config.js?v=1.0.7';

async function _get(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);

  return res.json();
}

async function _post(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
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
