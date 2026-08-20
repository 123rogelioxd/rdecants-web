/* =============================================================
   RDECANTS — DISCOUNT PREVIEW STATE (up to 2 stacked codes)

   Source-of-truth rule (locked):
     • R Supply OS validates, decides stackability and recalculates every
       discount during Web Order creation. The storefront NEVER computes
       discount math and never sends amounts/totals as truth.
     • This module only *previews* the set of codes so the customer can see
       an estimate before the WhatsApp handoff. It always sends the whole
       code set (coupon_codes[]) and trusts the backend's applied/rejected
       breakdown — the backend coordinator decides which combine.
     • When we create the Web Order we forward ONLY the codes.

   Up to MAX_COUPONS codes. Two codes combine only when the backend says so
   (both must be stackable); a rejected second code leaves the first intact.

   DOM-free so it can be unit-tested without a browser (like momentum.js).
   ============================================================= */

import { ApiClient } from '../api/client.js';
import { EventBus }  from '../core/events.js';

const STORAGE_KEY = 'rdecants_discount';
export const MAX_COUPONS = 2;

/* Customer-safe copy — never leak technical/validation jargon. */
export const API_DOWN_MSG = 'No pudimos validar el código ahorita. Puedes continuar sin descuento.';
const DEFAULT_INVALID_MSG = 'Ese código no es válido o ya expiró.';

/* Applied coupons the backend confirmed, ordered by calculation sequence.
   Each: { code, normalizedCode, amount, sequence } */
let _applied = _load();

export function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export const Discount = {
  /* Full applied list (copy). */
  get applied() { return _applied.map(a => ({ ...a })); },

  /* First applied code — kept for backward-compatible callers. */
  get code() { return _applied.length ? (_applied[0].normalizedCode || _applied[0].code) : null; },

  /* Applied codes in order — the only values that leave the frontend as intent. */
  codes() { return _applied.map(a => a.normalizedCode || a.code); },

  count() { return _applied.length; },
  isApplied() { return _applied.length > 0; },
  canAddMore() { return _applied.length < MAX_COUPONS; },

  /* Total discount across all applied codes (sum == backend total_discount). */
  amount() { return _applied.reduce((sum, a) => sum + _money(a.amount), 0); },

  /* Final total for a subtotal, honoring the last preview. Never below zero
     or above the subtotal, even with a stale preview. */
  totalFor(subtotal) {
    const sub = _money(subtotal);
    const amt = Math.min(this.amount(), sub);
    return Math.max(0, sub - amt);
  },

  /* Add one code to the set and re-preview the whole set. Does not add a
     duplicate or exceed MAX_COUPONS. Returns a discriminated result:
       { status: 'empty' }
       { status: 'duplicate' | 'max', message }
       { status: 'valid', code, normalizedCode, amount, total }
       { status: 'invalid', code, message }   ← customer-safe, keep checkout open
       { status: 'error', message }           ← API/network hiccup, allow checkout */
  async apply(rawCode, items = [], subtotal = 0) {
    const code = normalizeCode(rawCode);
    if (!code) return { status: 'empty' };
    if (this.codes().includes(code)) {
      return { status: 'duplicate', code, message: 'Ese código ya está aplicado.' };
    }
    if (!this.canAddMore()) {
      return { status: 'max', code, message: `Solo puedes usar ${MAX_COUPONS} códigos por pedido.` };
    }

    const parsed = await _previewSet([...this.codes(), code], items);
    if (parsed.status === 'error') return { status: 'error', code, message: API_DOWN_MSG };
    if (parsed.status === 'reject') return { status: 'invalid', code, message: parsed.message || DEFAULT_INVALID_MSG };

    _store(parsed.applied);

    const hit = parsed.applied.find(a => a.code === code);
    if (hit) {
      return { status: 'valid', code, normalizedCode: hit.normalizedCode, amount: hit.amount, total: parsed.total };
    }
    const rejected = parsed.rejected.find(r => r.code === code);
    return { status: 'invalid', code, message: rejected?.message || DEFAULT_INVALID_MSG };
  },

  /* Remove one code and re-preview the rest (so the remaining code's amount is
     recomputed authoritatively). Removing the last one clears the discount. */
  async remove(rawCode = null, items = [], subtotal = 0) {
    if (rawCode == null) { _store([]); return { status: 'removed' }; }

    const code = normalizeCode(rawCode);
    const remaining = this.codes().filter(c => c !== code);

    if (!remaining.length) { _store([]); return { status: 'removed' }; }

    const parsed = await _previewSet(remaining, items);
    if (parsed.status === 'error') {
      /* Keep whatever still validated locally; drop only the removed code so we
         never show a stale total. Backend confirms at order time. */
      _store(_applied.filter(a => a.code !== code));
      return { status: 'error', message: API_DOWN_MSG };
    }
    _store(parsed.applied);
    return { status: 'ok' };
  },

  /* Re-preview the applied set (cart changed). On success refresh amounts; any
     code that no longer validates is dropped so the customer never sees a stale
     total. Returns 'none' | 'valid' | 'invalid' | 'error'. */
  async revalidate(items = [], subtotal = 0) {
    if (!_applied.length) return { status: 'none' };

    const before = this.codes();
    const parsed = await _previewSet(before, items);
    if (parsed.status === 'error') return { status: 'error', message: API_DOWN_MSG };

    _store(parsed.applied);
    const dropped = before.some(c => !parsed.applied.find(a => a.code === c));
    return { status: dropped ? 'invalid' : 'valid' };
  },

  clear() { if (_applied.length) _store([]); },
};

/* ── Internals ──────────────────────────────────────────────── */

/* Preview a set of codes via the multi-coupon contract. Returns:
     { status:'ok', applied:[…], rejected:[…], totalDiscount, total }
     { status:'reject', message }   ← 4xx (bad payload / >2 codes)
     { status:'error' }             ← network/5xx */
async function _previewSet(codes, items) {
  const list = codes.map(normalizeCode).filter(Boolean);
  if (!list.length) return { status: 'ok', applied: [], rejected: [], totalDiscount: 0, total: 0 };

  let res;
  try {
    res = await ApiClient.previewDiscount(buildPreviewPayload(list, items));
  } catch {
    return { status: 'error' };
  }

  const { ok, status, data } = res || {};
  if (!ok) {
    if (status >= 400 && status < 500) {
      return { status: 'reject', message: _safeMessage(data?.message ?? data?.discount_message) };
    }
    return { status: 'error' };
  }

  const coupons = Array.isArray(data?.coupons) ? data.coupons : [];
  const rejected = Array.isArray(data?.rejected) ? data.rejected : [];

  return {
    status: 'ok',
    applied: coupons
      .map(c => ({
        code: normalizeCode(c.code),
        normalizedCode: normalizeCode(c.code),
        amount: _money(c.discount_amount ?? c.amount),
        sequence: Number(c.sequence) || 0,
      }))
      .filter(a => a.code && a.amount > 0)
      .sort((a, b) => a.sequence - b.sequence),
    rejected: rejected
      .filter(r => r && r.code)
      .map(r => ({ code: normalizeCode(r.code), message: _safeMessage(r.message) })),
    totalDiscount: _money(data?.total_discount),
    total: _money(data?.total),
  };
}

/* Multi-coupon preview payload. Accepts an array of codes (or a single string).
   Sends coupon_codes[] — the storefront's canonical contract.

   Packs travel in their own `packs` array as identity and quantity, exactly as
   they do at checkout. They used to be filtered out, on the (then true)
   grounds that packs were never priced server-side; they now are, and omitting
   them would preview a coupon against a base that excluded most of the cart —
   a smaller discount on screen than the one actually applied, or a larger one
   if the pack's own saving were ignored. Preview and checkout must resolve the
   same cart or they will quote different totals. */
export function buildPreviewPayload(codes, items = []) {
  const list = (Array.isArray(codes) ? codes : [codes]).map(normalizeCode).filter(Boolean);
  const all = items || [];

  const packs = all
    .filter(item => item?.type === 'pack' && item.pack_id !== null && item.pack_id !== undefined)
    .map(item => ({ pack_id: item.pack_id, quantity: Number(item.qty) || 1 }));

  return {
    coupon_codes: list,
    channel: 'storefront',
    items: all
      .filter(item => item && item.type !== 'pack')
      .map(item => item.type === 'bottle'
        ? {
            product_id: item.product_id ?? item.sourceId ?? null,
            offer_key: item.offer_key,
            quantity: 1,
          }
        : {
            product_id: item.product_id ?? item.sourceId ?? null,
            variant_id: item.variant_id ?? null,
            quantity: Number(item.qty) || 1,
          }),
    ...(packs.length ? { packs } : {}),
  };
}

function _store(applied) {
  _applied = (applied || []).map(a => ({
    code: a.code,
    normalizedCode: a.normalizedCode || a.code,
    amount: _money(a.amount),
    sequence: Number(a.sequence) || 0,
  }));
  _commit();
}

function _safeMessage(message, fallback = DEFAULT_INVALID_MSG) {
  const text = String(message ?? '').trim();
  return text || fallback;
}

function _money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function _commit() {
  try {
    if (_applied.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(_applied));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — in-memory state still works */ }
  EventBus.emit('discount:updated', { applied: Discount.applied });
}

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    /* Back-compat: the previous single-coupon shape stored one object. */
    const list = Array.isArray(parsed) ? parsed : (parsed && parsed.code ? [parsed] : []);
    return list
      .filter(a => a && a.code)
      .slice(0, MAX_COUPONS)
      .map(a => ({
        code: normalizeCode(a.code),
        normalizedCode: normalizeCode(a.normalizedCode || a.code),
        amount: _money(a.amount),
        sequence: Number(a.sequence) || 0,
      }));
  } catch {
    return [];
  }
}
