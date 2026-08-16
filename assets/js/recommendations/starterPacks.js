/* =============================================================
   RDECANTS — STARTER PACKS (logic)

   Three fixed packs of 3 × 3 ml, offered directly under the hero. They
   exist for the visitor who wants to try perfume and cannot name a single
   fragrance: the cheapest honest way in is three small decants that already
   cover the situations they will actually be in.

   ── Where the products come from ───────────────────────────────────
   Each pack is THREE SLOTS, and a slot is nothing but a set of finder
   answers. Filling a slot means ranking the live catalog with
   `rankCatalog()` — the exact engine and the exact gates the guided finder
   uses — and taking the best product that is still unused inside the pack.

   That matters more than it looks:
     • "Pack Para Ella" carries `gender: 'mujer'` on every slot, so it is
       filled by the same hard gender constraint the finder enforces. The
       old themed kits picked by keyword score with no gender rule at all,
       which is how a set of three masculine fragrances once ended up under
       a "Mujer" result with an add-to-cart button.
     • Nothing sold out, unpublished or without an orderable variant id can
       enter a pack: `rankCatalog` already excludes it, and the 3 ml variant
       is re-checked here before the slot is accepted.
     • A pack that cannot fill all three slots is DROPPED, never padded with
       a near-miss. Three named roles with two products in the box is a
       broken promise, and the customer cannot see which role is missing.

   ── Price ──────────────────────────────────────────────────────────
   The total is the sum of the same three 3 ml variants the cart will
   resolve, so the price shown is the price charged. There is deliberately
   NO savings badge: R Supply OS has no pack discount, and a "-15%" this
   storefront invented would be a fake discount on a real order. If a real
   pack price ever exists upstream, it belongs here, not in the markup.
   ============================================================= */

import { rankCatalog } from './engine.js';
import { isSellable } from './scoring.js';
import { getVariantForSize } from '../utils/prices.js';

/** The presentation a pack is sold in. Three millilitres is the trial size. */
export const STARTER_PACK_SIZE_ML = 3;

/** Products per pack. Three roles, three decants — the "3 × 3 ml" promise. */
export const STARTER_PACK_COUNT = 3;

/* The three packs, in page order. Copy is customer-facing and deliberately
   short: on a phone the card has to be readable at a glance. */
export const STARTER_PACK_TEMPLATES = [
  {
    id: 'todo-terreno',
    name: 'Pack Todo Terreno',
    /* `icon` names a mark, not a picture: the renderer maps it to one of the
       storefront's own line icons. Deliberately not a photograph — the pack
       is assembled from whatever the catalog can fill today, so any image of
       "the pack" would show bottles that may not be in it. */
    icon: 'compass',
    /* One short sentence. It carries the three roles in the same order the
       card lists the fragrances, which is what lets the list itself stay a
       line of names instead of a table of labels. */
    copy: 'Uno fresco, uno que va con todo y uno para salir.',
    slots: [
      { key: 'fresco',   label: 'Fresco',     answers: { occasion: 'dia',   family: 'fresco' } },
      { key: 'versatil', label: 'Va con todo', answers: { occasion: 'dia',   goal: 'versatil' } },
      { key: 'salir',    label: 'Para salir',  answers: { occasion: 'salir', goal: 'destacar' } },
    ],
  },
  {
    id: 'para-salir',
    name: 'Pack Para Salir',
    icon: 'moon',
    copy: 'Cita, fiesta y noche, con presencia para cuando sales.',
    slots: [
      { key: 'cita',   label: 'Cita',   answers: { occasion: 'salir', goal: 'mejor' } },
      { key: 'fiesta', label: 'Fiesta', answers: { occasion: 'salir', goal: 'destacar' } },
      { key: 'noche',  label: 'Noche',  answers: { occasion: 'salir', family: 'intenso' } },
    ],
  },
  {
    id: 'para-ella',
    name: 'Pack Para Ella',
    icon: 'bloom',
    copy: 'Diario, salidas y una para ocasión especial. Femeninas.',
    slots: [
      { key: 'diario',   label: 'Diario',           answers: { gender: 'mujer', occasion: 'dia',   goal: 'versatil' } },
      { key: 'salir',    label: 'Para salir',       answers: { gender: 'mujer', occasion: 'salir', goal: 'destacar' } },
      { key: 'especial', label: 'Ocasión especial', answers: { gender: 'mujer', occasion: 'salir', goal: 'mejor' } },
    ],
  },
];

/**
 * Pure: resolve every pack against a live catalog.
 *
 * @returns {Array} packs that could be filled completely, in template order.
 *                  A pack that could not is omitted — never half-filled.
 */
export function resolveStarterPacks(products, {
  sizeMl = STARTER_PACK_SIZE_ML,
  templates = STARTER_PACK_TEMPLATES,
} = {}) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  if (!list.length) return [];

  return templates
    .map(template => resolveStarterPack(template, list, { sizeMl }))
    .filter(Boolean);
}

/** Pure: one pack, or null when any slot cannot be filled. */
export function resolveStarterPack(template, products, { sizeMl = STARTER_PACK_SIZE_ML } = {}) {
  if (!template?.slots?.length) return null;

  const used = new Set();
  const slots = [];

  for (const slot of template.slots) {
    const match = _fillSlot(slot, products, used, sizeMl);
    if (!match) return null;                       /* incomplete → no pack */
    used.add(String(match.product.id));
    slots.push({ key: slot.key, label: slot.label, ...match });
  }

  const variants = slots.map(s => s.variant);

  return {
    id: template.id,
    /* `name` / `products` / `total` mirror the discovery-set shape so the
       existing Tracker.discoverySet* payloads and Cart.addBundle accept a
       pack without a second contract. */
    name: template.name,
    copy: template.copy,
    icon: template.icon ?? null,
    slots,
    products: slots.map(s => s.product),
    variants,
    itemSize: sizeMl,
    count: slots.length,
    total: variants.reduce((sum, v) => sum + Number(v.price), 0),
    /* No invented discount — see the header note. Kept explicit so a caller
       cannot mistake "no badge" for "nobody thought about it". */
    savings: 0,
  };
}

/* The best product for one slot: the engine's own ranking, first entry that
   is not already in this pack and can actually be sold in the pack size. */
function _fillSlot(slot, products, used, sizeMl) {
  const { results } = rankCatalog(products, slot.answers ?? {});

  for (const evaluation of results) {
    const product = evaluation.product;
    if (!product || used.has(String(product.id))) continue;
    /* rankCatalog already dropped unsellable products; re-checking here keeps
       this function safe to call from any surface with any product list. */
    if (!isSellable(product)) continue;

    const variant = getVariantForSize(product, sizeMl);
    if (!isOrderablePackVariant(variant)) continue;

    return { product, variant, compatibility: evaluation.compatibility };
  }

  return null;
}

/** A variant a pack may contain: in stock, priced, and orderable upstream. */
export function isOrderablePackVariant(variant) {
  if (!variant || variant.soldOut || !(Number(variant.availability) > 0)) return false;
  if (!Number.isFinite(Number(variant.price)) || Number(variant.price) <= 0) return false;
  const id = String(variant.variant_id ?? '').trim();
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}
