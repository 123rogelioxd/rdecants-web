/* =============================================================
   RDECANTS — API CONFIG
   Single source of truth for the backend base URL.
   Change this one line to point to staging or production.
   ============================================================= */
export const API_BASE =
  window.__RDECANTS_API_BASE__ ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://api.rdecants.com');

export function normalizeApiImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/storage/')) return `${API_BASE}${url}`;
  return url;
}