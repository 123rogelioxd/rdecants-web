/* =============================================================
   RDECANTS — SHARED DECANT AVAILABILITY
   Presentation stock is derived display data. Every presentation of a
   physical product consumes one canonical milliliter pool from R Supply OS.
   ============================================================= */

const EPSILON = 0.00001;

export function physicalProductKey(entity = {}) {
  const value = entity.product_id ?? entity.sourceId ?? entity.id;
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export function sharedAvailableMl(product = {}) {
  const explicit = _nonNegativeNumber(product.available_ml ?? product.availableMl);
  if (explicit !== null) return explicit;

  /* Backwards-compatible fallback for an older catalog response. These variant
     counts are already derived by R Supply OS from the same physical pool; use
     the strongest lower bound, never a sum of presentation-level stock. */
  const candidates = (Array.isArray(product.variants) ? product.variants : [])
    .map(variant => {
      const size = _positiveNumber(variant.size ?? variant.ml_size ?? variant.ml);
      const stock = _nonNegativeNumber(variant.stock ?? variant.availability ?? variant.public_stock);
      return size !== null && stock !== null ? size * stock : null;
    })
    .filter(value => value !== null);

  return candidates.length ? Math.max(...candidates) : null;
}

export function requestedMlForProduct(items = [], productKey) {
  if (!productKey) return 0;

  return items.reduce((total, item) => {
    if (item?.type === 'pack' || item?.type === 'bottle' || physicalProductKey(item) !== String(productKey)) return total;
    const size = _positiveNumber(item.size);
    const qty = _positiveNumber(item.qty);
    return total + (size !== null && qty !== null ? size * qty : 0);
  }, 0);
}

export function canConsumeSharedMl(items, productKey, availableMl, size, quantity = 1) {
  const available = _nonNegativeNumber(availableMl);
  const presentationMl = _positiveNumber(size);
  const qty = _positiveNumber(quantity);

  /* Unknown availability is supported only for old/non-decant catalog data;
     existing per-variant checks remain in force in that compatibility path. */
  if (available === null || presentationMl === null || qty === null) return true;

  return requestedMlForProduct(items, productKey) + presentationMl * qty <= available + EPSILON;
}

export function findSharedAvailabilityViolation(items = []) {
  const groups = _groupAvailability(items);

  for (const [productKey, group] of groups) {
    const requestedMl = requestedMlForProduct(items, productKey);
    if (requestedMl > group.availableMl + EPSILON) {
      return { productKey, requestedMl, availableMl: group.availableMl, item: group.item };
    }
  }

  return null;
}

/* Repairs legacy persisted carts deterministically. Earlier lines keep their
   quantities; later lines are reduced/removed once the one shared pool is used. */
export function clampToSharedAvailability(items = []) {
  const groups = _groupAvailability(items);
  const used = new Map();
  const result = [];
  const adjusted = [];
  const removed = [];

  for (const item of items) {
    const productKey = physicalProductKey(item);
    const group = productKey ? groups.get(productKey) : null;
    const size = _positiveNumber(item?.size);

    if (item?.type === 'pack' || item?.type === 'bottle' || !group || size === null) {
      result.push(item);
      continue;
    }

    const alreadyUsed = used.get(productKey) ?? 0;
    const maxQty = Math.max(0, Math.floor((group.availableMl - alreadyUsed + EPSILON) / size));
    const currentQty = Math.max(1, Math.floor(Number(item.qty) || 1));
    const nextQty = Math.min(currentQty, maxQty);

    if (nextQty <= 0) {
      removed.push(item);
      continue;
    }

    const next = nextQty === currentQty ? item : { ...item, qty: nextQty };
    if (nextQty !== currentQty) adjusted.push({ previous: item, next });
    result.push(next);
    used.set(productKey, alreadyUsed + size * nextQty);
  }

  return { items: result, adjusted, removed };
}

function _groupAvailability(items) {
  const groups = new Map();

  for (const item of items) {
    if (!item || item.type === 'pack' || item.type === 'bottle') continue;
    const productKey = physicalProductKey(item);
    const availableMl = _nonNegativeNumber(item.available_ml ?? item.availableMl);
    if (!productKey || availableMl === null) continue;

    const current = groups.get(productKey);
    if (!current || availableMl < current.availableMl) {
      groups.set(productKey, { availableMl, item });
    }
  }

  return groups;
}

function _positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function _nonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
