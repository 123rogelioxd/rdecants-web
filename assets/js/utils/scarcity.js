import { getValidVariants } from './prices.js?v=1.0.13';

/* =============================================================
   RDECANTS — OPERATIONAL SCARCITY
   Single source of truth for availability messaging.
   Every signal is derived from REAL inventory or operational
   metadata returned by R Supply OS — never fabricated urgency.

   Stock tiers (by real available units):
     sold_out    — nothing orderable
     last_units  — <= 2 units
     low         — <= 5 units
     available   — healthy stock

   Demand signal (independent of stock tier):
     derived only when the backend tags the product with an
     operational demand badge (alta demanda, mas pedido, ...).
   ============================================================= */

const LAST_UNITS_MAX = 2;
const LOW_STOCK_MAX = 5;

const DEMAND_BADGES = [
  'alta demanda',
  'alta rotacion',
  'mas pedido',
  'mas vendido',
  'best seller',
  'bestseller',
  'trending',
  'top ventas',
];

export function getScarcityState(product) {
  const stock = _availableStock(product);
  if (stock <= 0) return 'sold_out';
  if (stock <= LAST_UNITS_MAX) return 'last_units';
  if (stock <= LOW_STOCK_MAX) return 'low';
  return 'available';
}

/* Real demand signal — only true when the backend operationally
   tagged the product. We never infer demand from stock alone. */
export function hasHighDemand(product) {
  const badge = _norm(product?.badge);
  if (!badge) return false;
  return DEMAND_BADGES.some(signal => badge.includes(signal));
}

export function getScarcityDisplay(product) {
  const state = getScarcityState(product);
  const demand = state !== 'sold_out' && hasHighDemand(product);

  if (state === 'sold_out') {
    return _display(state, 'out', 'Agotado', 'danger', false);
  }

  if (state === 'last_units') {
    return _display(state, 'low', 'Ultimas unidades', 'danger', demand);
  }

  if (state === 'low') {
    return _display(state, 'few', 'Pocas unidades disponibles', 'trend', demand);
  }

  return _display(state, 'ok', 'Disponible', '', demand);
}

function _display(state, key, label, badgeClass, demand) {
  return { state, key, label, badgeClass, demand };
}

function _availableStock(product) {
  const variants = getValidVariants(product);

  if (variants.length) {
    const availableStocks = variants
      .filter(_variantAvailable)
      .map(_variantStock)
      .filter(stock => stock > 0);

    return availableStocks.length ? Math.max(...availableStocks) : 0;
  }

  return _safeStock(product?.stock);
}

function _variantAvailable(variant) {
  if (Object.prototype.hasOwnProperty.call(variant, 'available')) {
    return Boolean(variant.available);
  }

  return !variant.soldOut;
}

function _variantStock(variant) {
  return _safeStock(variant?.public_stock ?? variant?.stock ?? variant?.availability);
}

function _safeStock(value) {
  const stock = Number(value);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
