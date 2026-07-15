/* =============================================================
   RDECANTS — DISCOUNT PREVIEW STATE

   Source-of-truth rule (locked):
     • R Supply OS validates and recalculates every discount during
       Web Order creation. The storefront NEVER computes discount math.
     • This module only *previews* a code so the customer can see an
       estimated amount/total before the WhatsApp handoff.
     • When we create the Web Order we send ONLY the discount_code —
       never the amount or the final total as truth.

   DOM-free so it can be unit-tested without a browser (like momentum.js).
   ============================================================= */

import { ApiClient } from '../api/client.js';
import { EventBus }  from '../core/events.js';

const STORAGE_KEY = 'rdecants_discount';

/* Customer-safe copy — never leak technical/validation jargon. */
export const API_DOWN_MSG = 'No pudimos validar el código ahorita. Puedes continuar sin descuento.';
const DEFAULT_INVALID_MSG = 'Ese código no es válido o ya expiró.';

/* ── Applied preview (null when none) ───────────────────────────
   { code, normalizedCode, amount, subtotal, total, message } */
let _applied = _load();

export function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export const Discount = {
  get applied() { return _applied ? { ..._applied } : null; },

  isApplied() { return Boolean(_applied); },

  /* The only value that ever leaves the frontend as intent. */
  get code() { return _applied ? (_applied.normalizedCode || _applied.code) : null; },

  amount() { return _applied ? _money(_applied.amount) : 0; },

  /* Final total for a given subtotal, honoring the last preview. Never lets a
     stale preview drive the total below zero or above the subtotal. */
  totalFor(subtotal) {
    const sub = _money(subtotal);
    if (!_applied) return sub;
    const amt = Math.min(_money(_applied.amount), sub);
    return Math.max(0, sub - amt);
  },

  /* Preview a raw code against the current cart. Pure orchestration — does NOT
     mutate applied state. Returns a discriminated result:
       { status: 'empty' }
       { status: 'valid', code, normalizedCode, amount, total, message }
       { status: 'invalid', message }   ← customer-safe, do not block checkout
       { status: 'error', message }     ← API/network hiccup, allow checkout */
  async preview(rawCode, items = [], subtotal = 0) {
    const code = normalizeCode(rawCode);
    if (!code) return { status: 'empty' };

    let res;
    try {
      res = await ApiClient.previewDiscount(buildPreviewPayload(code, items));
    } catch {
      return { status: 'error', message: API_DOWN_MSG };
    }
    return _parsePreview(code, res, subtotal);
  },

  /* Preview + persist on success. Returns the same result shape as preview(). */
  async apply(rawCode, items = [], subtotal = 0) {
    const result = await this.preview(rawCode, items, subtotal);
    if (result.status === 'valid') {
      _applied = {
        code: result.code,
        normalizedCode: result.normalizedCode,
        amount: result.amount,
        subtotal: _money(subtotal),
        total: result.total,
        message: result.message,
      };
      _commit();
    }
    return result;
  },

  /* Re-preview the applied code (cart changed). On success we refresh the
     amount/total; on any non-valid outcome we REMOVE it so the customer never
     sees a stale total. R Supply OS still has the final say at order time. */
  async revalidate(items = [], subtotal = 0) {
    if (!_applied) return { status: 'none' };

    const result = await this.preview(_applied.normalizedCode || _applied.code, items, subtotal);
    if (result.status === 'valid') {
      _applied = {
        ..._applied,
        normalizedCode: result.normalizedCode,
        amount: result.amount,
        subtotal: _money(subtotal),
        total: result.total,
        message: result.message,
      };
      _commit();
    } else {
      this.remove();
    }
    return result;
  },

  remove() {
    if (!_applied) return;
    _applied = null;
    _commit();
  },

  clear() { this.remove(); },
};

/* ── Internals ──────────────────────────────────────────────── */
function _parsePreview(code, res, subtotal) {
  const { ok, status, data } = res || {};

  if (!ok) {
    /* 4xx → the code itself was rejected; surface the backend's safe message.
       5xx / anything else → treat as a soft error, keep checkout open. */
    if (status >= 400 && status < 500) {
      return { status: 'invalid', message: _safeMessage(data?.message ?? data?.discount_message) };
    }
    return { status: 'error', message: API_DOWN_MSG };
  }

  const valid = data?.valid !== false;
  const amount = _money(data?.discount_amount ?? data?.amount);

  if (!valid || amount <= 0) {
    return { status: 'invalid', message: _safeMessage(data?.message ?? data?.discount_message) };
  }

  const sub = _money(subtotal);
  const backendTotal = _money(data?.total);
  const total = backendTotal > 0 ? backendTotal : Math.max(0, sub - amount);

  return {
    status: 'valid',
    code,
    normalizedCode: normalizeCode(data?.normalized_code ?? data?.code ?? code),
    amount,
    total,
    message: _safeMessage(data?.message, ''),
  };
}

export function buildPreviewPayload(code, items = []) {
  return {
    code: normalizeCode(code),
    channel: 'storefront',
    items: (items || [])
      .filter(item => item && item.type !== 'pack')
      .map(item => ({
        product_id: item.product_id ?? item.sourceId ?? null,
        variant_id: item.variant_id ?? null,
        quantity: Number(item.qty) || 1,
      })),
  };
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
    if (_applied) localStorage.setItem(STORAGE_KEY, JSON.stringify(_applied));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — in-memory state still works */ }
  EventBus.emit('discount:updated', { applied: Discount.applied });
}

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.code) return null;
    return {
      code: parsed.code,
      normalizedCode: parsed.normalizedCode || parsed.code,
      amount: _money(parsed.amount),
      subtotal: _money(parsed.subtotal),
      total: _money(parsed.total),
      message: String(parsed.message ?? ''),
    };
  } catch {
    return null;
  }
}
