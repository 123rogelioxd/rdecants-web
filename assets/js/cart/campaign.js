/* =============================================================
   RDECANTS — CAMPAIGN PROMO AUTO-APPLY (orchestration)

   Bridges the pure Attribution state to the Discount preview. When a customer
   lands from a campaign link, we try to auto-apply the promo code as soon as
   the cart has something to price — never blocking browsing or checkout.

   This layer is DOM-free: UI side effects (messages, toasts) are injected as
   callbacks so it can be unit-tested without a browser. R Supply OS stays the
   source of truth; we only ever forward the CODE.
   ============================================================= */

import { Attribution } from './attribution.js?v=2026.06.04.2';
import { Discount }    from './discount.js?v=2026.06.04.2';
import { Tracker }     from '../tracking/tracker.js';

/* Once we've attempted an auto-apply this page load we don't retry on every
   cart change — a rejected code shouldn't re-hit the API on each tap. A fresh
   URL visit is a new page load, which resets this. Manual applies also set it. */
let _autoAttempted = false;

export function resetAutoApplyGuard() {
  _autoAttempted = false;
}

export function markAutoApplyDone() {
  _autoAttempted = true;
}

/* Attempt to auto-apply the pending campaign promo.
   Returns a discriminated status so callers/tests can assert without DOM:
     { status: 'none' }            — no pending promo (or dismissed/expired)
     { status: 'skip_applied' }    — a discount is already applied (manual wins)
     { status: 'pending' }         — cart empty; wait for the first item
     { status: 'skip_attempted' }  — already tried this page load
     …otherwise the Discount.apply() result: 'valid' | 'invalid' | 'error' */
export async function maybeAutoApplyPromo({ items = [], total = 0, onMessage, onApplied } = {}) {
  const code = Attribution.pendingPromoCode();
  if (!code) return { status: 'none' };

  /* A manually-entered code (or an already-applied one) always wins. */
  if (Discount.isApplied()) return { status: 'skip_applied' };

  /* Don't require items on landing — keep the promo pending until one exists. */
  if (!items.length) return { status: 'pending' };

  if (_autoAttempted) return { status: 'skip_attempted' };
  _autoAttempted = true;

  Tracker.campaignPromoAutoApplyAttempted(Attribution.forTracking());

  let result;
  try {
    result = await Discount.apply(code, items, total);
  } catch {
    /* Never crash the cart on an unexpected failure. */
    onMessage?.(
      'No pudimos validar el código ahorita. Puedes continuar sin descuento.',
      'error',
    );
    return { status: 'error' };
  }

  if (result.status === 'valid') {
    Tracker.campaignPromoApplied(Attribution.forTracking(), result.amount);
    onApplied?.(result);
  } else if (result.status === 'invalid') {
    /* Keep attribution (they still came from the campaign) but don't hold an
       invalid code as applied. Do not block checkout. */
    Tracker.campaignPromoRejected(Attribution.forTracking());
    onMessage?.(result.message, 'invalid');
  } else {
    /* error / empty → soft-fail, checkout stays open. */
    onMessage?.(result.message, 'error');
  }

  return result;
}
