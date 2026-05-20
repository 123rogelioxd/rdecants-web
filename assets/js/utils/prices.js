/* =============================================================
   RDECANTS - PRICE HELPERS
   Safe variant/price normalization for incomplete API data.
   ============================================================= */

const SIZE_ORDER = [3, 5, 10];

export function isValidPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function getPriceForSize(product, size) {
  const value = product?.prices?.[size];
  return isValidPrice(value) ? Number(value) : null;
}

export function getValidVariants(product) {
  return SIZE_ORDER
    .map(size => ({ size, price: getPriceForSize(product, size) }))
    .filter(variant => variant.price !== null);
}

export function hasValidPrice(product) {
  return getValidVariants(product).length > 0;
}

export function getDefaultVariant(product, preferredSize = 5) {
  const variants = getValidVariants(product);
  return variants.find(v => v.size === preferredSize) || variants[0] || null;
}

export function getSafePrice(product) {
  return getDefaultVariant(product)?.price ?? null;
}

export function priceSortValue(product, direction = 'asc') {
  const price = getSafePrice(product);
  if (price !== null) return price;
  return direction === 'desc' ? -Infinity : Infinity;
}

export function formatPrice(value, fallback = 'Consultar precio') {
  return isValidPrice(value) ? `$${Number(value)} MXN` : fallback;
}
