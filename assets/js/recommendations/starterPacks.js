/* =============================================================
   RDECANTS — STARTER PACKS (shape helpers)

   ── What this file used to be ──────────────────────────────────────
   It ASSEMBLED the packs. Three templates, each a set of finder answers,
   filled by ranking the live catalog with `rankCatalog()` and taking the
   best unused product per slot.

   That was the wrong business model, and it failed in a specific, visible
   way: the ranking optimises for FIT, and the best fit for "quiero que se
   note" is frequently a niche flanker. A pack that exists for the visitor
   who cannot name a single fragrance was therefore free to fill itself
   with Torino 21 and Sauvage Elixir — a beginner box at a price no
   beginner is going to spend on perfumes they have never smelled.

   The fix is not a price ceiling and not a re-weighted ranking. Both would
   still be an algorithm choosing a commercial product. A starter pack IS a
   commercial product, so Roger chooses what is in it, in R Supply OS, and
   the storefront renders what he chose.

   ── What this file is now ──────────────────────────────────────────
   Pure shape helpers over the `/api/web/packs` payload. No selection, no
   ranking, no templates, no fallback. There is deliberately NO path back
   to rankCatalog() from here: a "temporary" algorithmic fallback would be
   indistinguishable from the bug above on exactly the day the API is down,
   and a customer would be shown a $900 beginner pack nobody approved.

   When the backend has no packs, the section hides. See ui/starterPacks.js.

   ── Price ──────────────────────────────────────────────────────────
   Still not computed here, and now for a stronger reason than before.
   R Supply OS derives the normal total from the canonical 3 ml prices,
   applies the pack's own discount rule, and returns both — and it does the
   same arithmetic again at checkout, against live variants. The numbers on
   the card are read from that payload and never recalculated locally: a
   storefront that could compute a pack price could disagree with the one
   the customer is charged.
   ============================================================= */

/** The presentation a pack is sold in. Three millilitres is the trial size. */
export const STARTER_PACK_SIZE_ML = 3;

/** Products per pack. Three roles, three decants — the "3 × 3 ml" promise. */
export const STARTER_PACK_COUNT = 3;

/**
 * Pure: normalize one pack from `/api/web/packs` into the shape the card
 * renders and the cart adds.
 *
 * Returns null for anything that cannot be rendered honestly — a pack with no
 * id, no items, or no pricing block. The backend already refuses to publish an
 * incomplete pack; this is the storefront declining to invent the missing half
 * if one ever arrives anyway.
 */
export function normalizePack(raw) {
  if (!raw) return null;

  const id = raw.id ?? raw.pack_id ?? null;
  const items = Array.isArray(raw.items) ? raw.items.map(normalizePackItem).filter(Boolean) : [];
  const pricing = normalizePackPricing(raw.pricing);

  if (id === null || id === undefined || !items.length || !pricing) return null;

  return {
    id,
    slug: raw.slug ?? String(id),
    name: raw.name ?? 'Pack',
    copy: raw.description ?? raw.short_description ?? '',
    badge: raw.badge ?? null,
    itemSize: Number(raw.presentation_ml ?? STARTER_PACK_SIZE_ML),
    count: items.length,
    items,
    /* `products` mirrors the discovery-set shape so existing surfaces that
       expect a flat product list keep working without a second contract. */
    products: items.map(item => item.product),
    pricing,
  };
}

/** Pure: every renderable pack in the payload, in the order the backend sent. */
export function normalizePacks(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list.map(normalizePack).filter(Boolean);
}

/**
 * Pure: one slot. The product is the canonical web-catalog payload, mapped by
 * the caller through the same `_mapProduct` every other surface uses, so this
 * carries no separately stored name, image or price.
 */
function normalizePackItem(raw) {
  if (!raw?.product) return null;

  const variant = raw.variant ?? null;
  const variantId = variant?.id ?? variant?.variant_id ?? null;

  return {
    position: Number(raw.position ?? 0),
    label: raw.role_label ?? null,
    product: raw.product,
    variant: variant
      ? {
          ...variant,
          variant_id: variantId,
          size: Number(variant.ml ?? variant.size ?? STARTER_PACK_SIZE_ML),
          price: Number(variant.price ?? 0),
        }
      : null,
  };
}

/**
 * Pure: the server's pricing block, read — never recomputed.
 *
 * `savings` is taken from `discount_amount` rather than derived from
 * (normal − final) locally. They are the same number when the payload is
 * consistent, and when they are not, the server's own subtraction is the one
 * the customer will be charged by.
 */
export function normalizePackPricing(raw) {
  if (!raw) return null;

  const normalTotal = Number(raw.normal_total);
  const finalTotal = Number(raw.final_total);
  const savings = Number(raw.discount_amount ?? 0);

  if (!Number.isFinite(normalTotal) || !Number.isFinite(finalTotal)) return null;

  return {
    normalTotal,
    finalTotal,
    savings: Number.isFinite(savings) ? savings : 0,
    savingsPercentage: Number(raw.savings_percentage ?? 0),
    discountType: raw.discount_type ?? 'none',
  };
}

/** True when a pack is worth showing a "Ahorras" badge for. */
export function hasRealSavings(pack) {
  return Number(pack?.pricing?.savings) > 0
    && Number(pack?.pricing?.finalTotal) < Number(pack?.pricing?.normalTotal);
}
