/* =============================================================
   RDECANTS — API CONFIG
   Single source of truth for the backend base URL.
   Change this one line to point to staging or production.
   ============================================================= */
export const API_BASE =
  globalThis.window?.__RDECANTS_API_BASE__ ||
  (globalThis.window?.location?.hostname === 'localhost' || globalThis.window?.location?.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://api.rdecants.com');

// Keep this in sync with the asset query strings in the HTML entry points
// and with the VERSION file (tests/cacheFreshness.test.js checks all three).
export const BUILD_VERSION = '2026.07.31.1';

export function normalizeApiImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/storage/')) return `${API_BASE}${url}`;
  return url;
}
