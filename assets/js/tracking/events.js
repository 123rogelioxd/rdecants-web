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
const _isDev = globalThis.window?.location?.hostname === 'localhost' ||
               globalThis.window?.location?.hostname === '127.0.0.1';

/* ── Session ID — persisted across browser restarts ─────────── */
function _sessionId() {
  const storage = globalThis.localStorage;
  let id = storage?.getItem?.(SESSION_KEY);
  if (!id) {
    id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    storage?.setItem?.(SESSION_KEY, id);
  }
  return id;
}

/* ── Public API ──────────────────────────────────────────────── */
export function trackEvent(eventName, payload = {}) {
  const timestamp = new Date().toISOString();
  const pageUrl = globalThis.window?.location?.href ?? '';
  const path = globalThis.window?.location?.pathname ?? '/';

  const body = JSON.stringify({
    event: eventName,
    event_name: eventName,
    session_id: _sessionId(),
    source: payload.source ?? 'web',
    surface: payload.surface ?? payload.source ?? 'web',
    url: pageUrl,
    path,
    timestamp,
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
  }).then(async res => {
    if (!_isDev || res.ok) return;
    const details = await res.text().catch(() => '');
    console.warn('[RDecants] trackEvent rejected:', eventName, res.status, details);
  }).catch(err => {
    if (_isDev) console.warn('[RDecants] trackEvent failed:', eventName, err);
  });
}
