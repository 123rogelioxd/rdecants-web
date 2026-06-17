/* =============================================================
   RDECANTS — CART SHIPPING THRESHOLD
   Operation-first messaging for the cart drawer.

   Core rule (Sprint 2):
     • Order minimum = $0. Checkout is NEVER blocked.
     • $170 is a SHIPPING threshold, not a checkout gate. Below it, the
       order is still valid — it simply qualifies for local pickup, and
       shipping is the recommended (not required) path.

   Pure functions so they can be unit-tested without the DOM.
   ============================================================= */

export const SHIPPING_THRESHOLD = 170;

export function getShippingState(total = 0, threshold = SHIPPING_THRESHOLD) {
  const safeTotal = _money(total);
  const safeThreshold = _money(threshold) || SHIPPING_THRESHOLD;
  const remaining = Math.max(0, safeThreshold - safeTotal);
  const progress = safeThreshold > 0 ? Math.min(100, Math.round((safeTotal / safeThreshold) * 100)) : 100;

  return {
    threshold: safeThreshold,
    total: safeTotal,
    remaining,
    progress,
    isEligible: remaining <= 0,
  };
}

export function getCartMomentum({ count = 0, total = 0, threshold = SHIPPING_THRESHOLD } = {}) {
  if (count <= 0) {
    return { key: 'empty', message: '', shipping: getShippingState(0, threshold) };
  }

  const shipping = getShippingState(total, threshold);

  if (shipping.isEligible) {
    return {
      key: 'shipping',
      message: '✓ Tu pedido ya califica para envío.',
      shipping,
    };
  }

  return {
    key: 'local',
    message: `Los pedidos menores a $${shipping.threshold} pueden recogerse localmente sin problema. Para envío, el pedido recomendado es de $${shipping.threshold}+.`,
    shipping,
  };
}

function _money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
