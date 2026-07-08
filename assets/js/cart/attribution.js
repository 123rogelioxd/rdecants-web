/* =============================================================
   RDECANTS — CAMPAIGN ATTRIBUTION STATE

   R Supply OS' Growth Campaign Center generates storefront links like:
     https://rdecants.com/?promo=VIP8&utm_campaign=vip-julio&utm_source=instagram&utm_medium=story

   This module reads those params on load, persists a small, sanitized
   attribution record (with a TTL) across the customer's session, and hands
   it to the Web Order payload so R Supply OS can resolve the campaign and
   recalculate the discount server-side.

   Source-of-truth rule (locked, same as discount.js):
     • The storefront NEVER computes discount math or trusts amounts.
     • We forward the promo CODE and campaign/UTM attribution only.
     • R Supply OS validates the code and resolves the campaign at order time.

   DOM-free so it can be unit-tested without a browser (like discount.js /
   momentum.js). All storage/window access is defensive.
   ============================================================= */

import { EventBus } from '../core/events.js';

const STORAGE_KEY = 'rdecants_attribution';

/* Attribution should feel "sticky" for a visit but never linger forever. */
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/* Keep stored values short and free of anything we'd never want to render or
   forward. Campaign slugs / UTM values are short identifiers by convention. */
const MAX_LEN = 64;

/* Strip anything that isn't a plain identifier char. This neutralizes any
   attempt to smuggle HTML/script or control chars through a query param — the
   value is never executed and, even if displayed, carries no markup. */
export function sanitizeValue(raw) {
  return String(raw ?? '')
    .trim()
    .slice(0, MAX_LEN)
    .replace(/[^\w\-. ]+/g, '')   // allow letters, digits, _ - . and spaces
    .trim();
}

/* Normalize a discount code for DISPLAY only. The backend remains the source
   of truth for the canonical code. */
export function normalizeCampaignCode(raw) {
  return sanitizeValue(raw).toUpperCase().replace(/\s+/g, '');
}

/* Parse the campaign params out of a query string into a clean record.
   Rules:
     • promo / discount_code / code all represent the discount code; prefer promo.
     • campaign_slug falls back to utm_campaign when missing (both are safe ids).
     • empty values are dropped; nothing empty is ever stored.
   Returns only the keys that carry a value. */
export function parseAttributionParams(search = '') {
  const params = new URLSearchParams(search || '');
  const get = key => sanitizeValue(params.get(key));

  const promo        = get('promo');
  const discountCode = get('discount_code');
  const code         = get('code');
  const utmCampaign  = get('utm_campaign');
  const utmSource    = get('utm_source');
  const utmMedium    = get('utm_medium');
  let   campaignSlug = get('campaign_slug');

  /* Prefer promo as the discount code, then discount_code, then code. */
  const resolvedCode = promo || discountCode || code;

  /* If no explicit campaign_slug, the utm_campaign is a safe stand-in. */
  if (!campaignSlug && utmCampaign) campaignSlug = utmCampaign;

  const record = {};
  if (resolvedCode) record.discount_code = resolvedCode;
  /* `promo` mirrors the ORIGINAL promo param only — never the code fallback. */
  if (promo)        record.promo = promo;
  if (campaignSlug) record.campaign_slug = campaignSlug;
  if (utmCampaign)  record.utm_campaign = utmCampaign;
  if (utmSource)    record.utm_source = utmSource;
  if (utmMedium)    record.utm_medium = utmMedium;

  return record;
}

export const Attribution = {
  /* Read the current URL (or an explicit search string), and if it carries any
     campaign params, persist them as the active attribution — resetting the
     "promo dismissed" flag so a fresh visit re-enables auto-apply. Visiting a
     plain internal page (no params) leaves any existing attribution intact so
     it survives browsing. Returns the active record (or null). */
  capture(search = _search()) {
    const parsed = parseAttributionParams(search);
    if (_hasAny(parsed)) {
      const record = { ...parsed, ts: _now(), promoDismissed: false };
      _save(record);
      EventBus.emit('attribution:updated', { attribution: this.current() });
      return this.current();
    }
    return this.current();
  },

  /* The active, non-expired attribution (public view, no internal flags). */
  current() {
    const record = _load();
    if (!record) return null;
    return _publicView(record);
  },

  hasAttribution() {
    return Boolean(_load());
  },

  /* The promo code we may still auto-apply. Null once the customer removed it
     manually (promoDismissed) or when the record has expired. */
  pendingPromoCode() {
    const record = _load();
    if (!record || record.promoDismissed) return null;
    return record.discount_code || null;
  },

  /* Fields for the Web Order payload. The discount_code is gated by the
     dismissed flag ("pending promo code IF the user kept it"); the campaign/UTM
     attribution is always forwarded so R Supply OS can attribute the sale.
     Never includes amounts — the backend recalculates. Empties are omitted. */
  forOrder() {
    const record = _load();
    if (!record) return {};

    const out = {};
    const code = record.promoDismissed ? '' : (record.discount_code || '');
    if (code)                 out.discount_code = code;
    if (record.promo)         out.promo = record.promo;
    if (record.campaign_slug) out.campaign_slug = record.campaign_slug;
    if (record.utm_campaign)  out.utm_campaign = record.utm_campaign;
    if (record.utm_source)    out.utm_source = record.utm_source;
    if (record.utm_medium)    out.utm_medium = record.utm_medium;
    return out;
  },

  /* Safe subset for analytics — no customer PII, ever. */
  forTracking() {
    const record = _load();
    if (!record) return {};
    return {
      code:          record.discount_code || '',
      promo:         record.promo || '',
      campaign_slug: record.campaign_slug || '',
      utm_campaign:  record.utm_campaign || '',
      utm_source:    record.utm_source || '',
      utm_medium:    record.utm_medium || '',
    };
  },

  /* Customer removed the promo manually: keep the attribution (they still came
     from the campaign) but stop auto-applying the code this session. */
  dismissPromo() {
    const record = _load();
    if (!record || record.promoDismissed) return;
    record.promoDismissed = true;
    _save(record);
  },

  /* Full wipe — used after a successful checkout handoff. */
  clear() {
    _remove();
    EventBus.emit('attribution:updated', { attribution: null });
  },
};

/* ── Internals ──────────────────────────────────────────────── */
function _publicView(record) {
  const view = {};
  if (record.discount_code) view.discount_code = record.discount_code;
  if (record.promo)         view.promo = record.promo;
  if (record.campaign_slug) view.campaign_slug = record.campaign_slug;
  if (record.utm_campaign)  view.utm_campaign = record.utm_campaign;
  if (record.utm_source)    view.utm_source = record.utm_source;
  if (record.utm_medium)    view.utm_medium = record.utm_medium;
  view.promoDismissed = Boolean(record.promoDismissed);
  return view;
}

function _hasAny(record) {
  return Boolean(record) && Object.keys(record).length > 0;
}

function _now() {
  return Date.now();
}

function _isExpired(record) {
  const ts = Number(record?.ts);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return _now() - ts > TTL_MS;
}

function _save(record) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch { /* storage unavailable — in-memory callers still degrade cleanly */ }
}

/* Load + validate + auto-expire. A stale record is dropped on read so callers
   never see expired attribution. */
function _load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    _remove();
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || _isExpired(parsed)) {
    _remove();
    return null;
  }

  /* Re-sanitize on the way out — defense in depth if storage was tampered. */
  const record = {};
  for (const key of ['discount_code', 'promo', 'campaign_slug', 'utm_campaign', 'utm_source', 'utm_medium']) {
    const value = sanitizeValue(parsed[key]);
    if (value) record[key] = value;
  }
  if (!_hasAny(record)) {
    _remove();
    return null;
  }
  record.ts = Number(parsed.ts) || 0;
  record.promoDismissed = Boolean(parsed.promoDismissed);
  return record;
}

function _remove() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* no-op */ }
}

function _search() {
  return globalThis.window?.location?.search ?? '';
}
