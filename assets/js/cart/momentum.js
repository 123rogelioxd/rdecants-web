/* =============================================================
   RDECANTS — CART MOMENTUM
   Honest, premium completion messaging for the cart drawer.
   Driven only by real state (item count + whether the required
   name is filled). No fabricated urgency, no countdowns.

   Pure function so it can be unit-tested without the DOM.
   ============================================================= */

export function getCartMomentum({ count = 0, hasValidName = false } = {}) {
  if (count <= 0) {
    return { key: 'empty', message: '' };
  }

  if (!hasValidName) {
    return {
      key: 'needs_name',
      message: 'Tu pedido casi esta listo. Agrega tu nombre para confirmarlo.',
    };
  }

  return {
    key: 'ready',
    message: 'Todo listo. Finaliza por WhatsApp cuando quieras.',
  };
}
