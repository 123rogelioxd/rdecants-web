/* =============================================================
   RDECANTS — EVENT TRACKING HELPER
   Posts behavioral events to the R Supply OS web events API.

   Usage:
     trackEvent('product_viewed', { product_id: '...', metadata: {...} })

   Transport:
     sendBeacon (preferred) → fetch keepalive (fallback)
   Both are fire-and-forget and do not block the UX.
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

  /* sendBeacon: reliable for navigation events (WA redirect, etc.) */
  if (typeof navigator.sendBeacon === 'function') {
    const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    if (queued) return;
  }

  /* fetch keepalive: fallback when sendBeacon is unavailable or queue is full */
  fetch(url, {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(err => {
    if (_isDev) console.warn('[RDecants] trackEvent failed:', eventName, err);
  });
}
