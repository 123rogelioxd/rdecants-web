/* =============================================================
   RDECANTS - PRICE HELPERS
   Safe variant/price normalization for incomplete API data.
   ============================================================= */

const SIZE_ORDER = [3, 5, 10];

/* Presentations offered as the primary, directly-buyable choice in the
   storefront. Smaller sizes (e.g. 2ml) are intentionally excluded here:
   they exist only as a cart "completer" to reach the order minimum, never
   as the headline "Desde $X" entry price (which would be misleading since
   they are not selectable in the size grid). */
export const PRIMARY_SIZES = [3, 5, 10];

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

/* Valid variants limited to the primary, directly-buyable presentations
   (see PRIMARY_SIZES). Kept sorted ascending by size. */
export function getPrimaryVariants(product) {
  return getValidVariants(product).filter(variant => PRIMARY_SIZES.includes(variant.size));
}

/* Smallest primary presentation with a valid price — the honest entry point
   for "Desde {size}ml" display copy. Returns null when no primary variant
   has a price. */
export function getEntryVariant(product) {
  return getPrimaryVariants(product)[0] ?? null;
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

/* True only when `ml` is genuinely cheaper PER MILLILITRE than the base size
   (default 5 ml). This is what makes "Mejor valor" / a 10 ml upgrade nudge an
   honest claim: when 10 ml costs exactly 2× the 5 ml price it saves nothing,
   so no value language is shown. Returns false when either price is missing. */
export function isBetterValuePerMl(product, ml = 10, baseMl = 5) {
  const target = getVariantForSize(product, ml);
  const base = getVariantForSize(product, baseMl);
  if (!isValidPrice(target?.price) || !isValidPrice(base?.price)) return false;
  const targetSize = Number(target.size) || ml;
  const baseSize = Number(base.size) || baseMl;
  if (targetSize <= 0 || baseSize <= 0) return false;
  return (Number(target.price) / targetSize) < (Number(base.price) / baseSize);
}

/* Size label. The 10 ml "Mejor valor" claim is COMPUTED, never assumed:
   it only appears when 10 ml is actually cheaper per ml than 5 ml for this
   product. Without product context (legacy single-arg callers) the 10 ml
   label is empty rather than a false value claim. */
export function getSizeLabel(ml, product = null) {
  if (ml === 3)  return 'Ideal para probar';
  if (ml === 5)  return 'Uso frecuente';
  if (ml === 10) return isBetterValuePerMl(product, 10, 5) ? 'Mejor valor' : '';
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
