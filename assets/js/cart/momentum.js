/* =============================================================
   RDECANTS — CART MOMENTUM
   Honest, premium completion messaging for the cart drawer.
   Driven only by real state (item count + whether the required
   name is filled). No fabricated urgency, no countdowns.

   Pure function so it can be unit-tested without the DOM.
   ============================================================= */

export const MIN_ORDER_THRESHOLD = 200;

export function getCartMinimumState(total = 0, threshold = MIN_ORDER_THRESHOLD) {
  const safeTotal = _money(total);
  const safeThreshold = _money(threshold) || MIN_ORDER_THRESHOLD;
  const remaining = Math.max(0, safeThreshold - safeTotal);
  const progress = safeThreshold > 0 ? Math.min(100, Math.round((safeTotal / safeThreshold) * 100)) : 100;

  return {
    threshold: safeThreshold,
    total: safeTotal,
    remaining,
    progress,
    isComplete: remaining <= 0,
  };
}

export function getCartMomentum({ count = 0, total = 0, threshold = MIN_ORDER_THRESHOLD, hasValidName = false } = {}) {
  if (count <= 0) {
    return { key: 'empty', message: '', minimum: getCartMinimumState(0, threshold) };
  }

  const minimum = getCartMinimumState(total, threshold);

  if (!minimum.isComplete) {
    return {
      key: 'minimum',
      message: `Te faltan $${minimum.remaining} para completar el pedido minimo.`,
      title: 'Tu pedido casi esta listo.',
      helper: 'Agrega un decant mas para completar el pedido.',
      minimum,
    };
  }

  if (!hasValidName) {
    return {
      key: 'needs_name',
      message: 'Tu pedido casi esta listo. Agrega tu nombre para confirmarlo.',
      minimum,
    };
  }

  return {
    key: 'ready',
    message: 'Todo listo. Finaliza por WhatsApp cuando quieras.',
    minimum,
  };
}

function _money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
