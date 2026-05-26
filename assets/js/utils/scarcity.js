import { getValidVariants } from './prices.js?v=1.0.13';

export function getScarcityState(product) {
  const variants = getValidVariants(product);

  if (variants.length) {
    const availableVariants = variants.filter(variant => {
      const stock = _variantStock(variant);
      return _variantAvailable(variant) && stock > 0;
    });

    if (!availableVariants.length) return 'sold_out';

    const maxStock = Math.max(...availableVariants.map(_variantStock));
    if (maxStock <= 2) return 'last_units';

    return 'available';
  }

  const stock = _safeStock(product?.stock);
  if (stock <= 0) return 'sold_out';
  if (stock <= 2) return 'last_units';
  return 'available';
}

export function getScarcityDisplay(product) {
  const state = getScarcityState(product);

  if (state === 'sold_out') {
    return { state, key: 'out', label: 'Agotado', badgeClass: 'danger' };
  }

  if (state === 'last_units') {
    return { state, key: 'low', label: 'Ultimas unidades', badgeClass: 'danger' };
  }

  return { state, key: 'ok', label: 'Disponible', badgeClass: '' };
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
