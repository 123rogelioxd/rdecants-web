/* =============================================================
   RDECANTS — EVENT TRACKING HELPER
   Posts behavioral events to the R Supply OS web events API.

   Usage:
     trackEvent('product_viewed', { product_id: '...', metadata: {...} })

   Transport:
     fetch keepalive with credentials omitted.
   Fire-and-forget and does not block the UX.
   ============================================================= */

import { API_BASE } from '../api/config.js';

const SESSION_KEY = 'rd_sid';
const _isDev = window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1';

/* ── Session ID — persisted across browser restarts ─────────── */
function _sessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/* ── Public API ──────────────────────────────────────────────── */
export function trackEvent(eventName, payload = {}) {
  const body = JSON.stringify({
    event_name: eventName,
    session_id: _sessionId(),
    source:     'web',
    ...payload,
  });

  const url = `${API_BASE}/api/web/events`;

  /* fetch keepalive preserves navigation reliability while omitting cookies for wildcard CORS. */
  fetch(url, {
    method:    'POST',
    credentials: 'omit',
    headers:   { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(err => {
    if (_isDev) console.warn('[RDecants] trackEvent failed:', eventName, err);
  });
}
