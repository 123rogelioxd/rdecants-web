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
  const variant = getVariantForSize(product, size);
  const value = variant?.price ?? product?.prices?.[size];
  return isValidPrice(value) ? Number(value) : null;
}

export function getValidVariants(product) {
  if (Array.isArray(product?.variants) && product.variants.length) {
    return [...product.variants]
      .map(_normalizeVariant)
      .filter(variant => variant.price !== null)
      .sort((a, b) => a.size - b.size);
  }

  return SIZE_ORDER
    .map(size => _normalizeVariant({
      size,
      ml_size: size,
      price: product?.prices?.[size],
      retail_price: product?.prices?.[size],
      availability: Number(product?.stock ?? 0),
      sold_out: Number(product?.stock ?? 0) <= 0,
    }))
    .filter(variant => variant.price !== null);
}

export function hasValidPrice(product) {
  return getValidVariants(product).length > 0;
}

export function getOrderableVariants(product) {
  return getValidVariants(product).filter(variant => !variant.soldOut && variant.availability > 0);
}

export function getDefaultVariant(product, preferredSize = 5) {
  const variants = getOrderableVariants(product);
  return variants.find(v => v.size === preferredSize) || variants[0] || null;
}

export function getDisplayVariant(product, preferredSize = 5) {
  const variants = getValidVariants(product);
  return variants.find(v => v.size === preferredSize) || variants[0] || null;
}

export function getVariantForSize(product, size) {
  return getValidVariants(product).find(variant => variant.size === Number(size)) || null;
}

export function getSafePrice(product) {
  return getDisplayVariant(product)?.price ?? null;
}

export function priceSortValue(product, direction = 'asc') {
  const price = getSafePrice(product);
  if (price !== null) return price;
  return direction === 'desc' ? -Infinity : Infinity;
}

export function formatPrice(value, fallback = 'Consultar precio') {
  if (!isValidPrice(value)) return fallback;
  const n = Math.round(Number(value));
  return `$${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} MXN`;
}

export function getSizeLabel(ml) {
  if (ml === 3)  return 'Ideal para probar';
  if (ml === 5)  return 'Uso frecuente';
  if (ml === 10) return 'Mejor valor';
  return '';
}

function _normalizeVariant(raw = {}) {
  const size = Number(raw.size ?? raw.ml_size);
  const price = raw.price ?? raw.retail_price;
  const stock = _safeStock(raw.stock ?? raw.availability);
  const available = Object.prototype.hasOwnProperty.call(raw, 'available') ? Boolean(raw.available) : stock > 0;
  const soldOut = Boolean(raw.sold_out ?? raw.soldOut ?? false) || !available || stock <= 0;

  return {
    ...raw,
    size,
    ml_size: size,
    price: isValidPrice(price) ? Number(price) : null,
    retail_price: isValidPrice(price) ? Number(price) : null,
    availability: stock,
    stock,
    available,
    soldOut,
    sold_out: soldOut,
    variant_id: _variantId(raw),
    product_id: raw.product_id,
  };
}

function _safeStock(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function _variantId(raw = {}) {
  if (Object.prototype.hasOwnProperty.call(raw, 'variant_id')) return raw.variant_id;
  if (Object.prototype.hasOwnProperty.call(raw, 'variante_producto_id')) return raw.variante_producto_id;
  return raw.id ?? null;
}
