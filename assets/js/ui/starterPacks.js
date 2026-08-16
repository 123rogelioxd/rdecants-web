/* =============================================================
   RDECANTS — STARTER PACKS (UI)

   The first commercial surface on the home, directly under the hero. Logic
   (which fragrances, in which role, at what price) lives entirely in
   recommendations/starterPacks.js; this file renders it and wires the two
   things a customer can do: add the pack, or open one of its fragrances.

   Three deliberate choices:
     • The three fragrances are NAMED on the card. A pack the customer
       cannot see inside is a blind purchase, and this shop's whole promise
       is that you know what you are buying before you pay.
     • The section removes itself when no pack can be filled (empty or
       unreachable catalog) rather than rendering an empty shelf.
     • Tracking reuses the discovery_set_* events, which the backend
       allowlist already accepts. A new event name would be 422'd by
       R Supply OS and silently lost — see tests/backendAllowlistParity.
   ============================================================= */

import { CatalogProvider }   from '../providers/catalog.js';
import { resolveStarterPacks,
         STARTER_PACK_SIZE_ML } from '../recommendations/starterPacks.js';
import { openProductModal }  from './modal.js';
import { primeImageStates }  from './images.js';
import { Tracker }           from '../tracking/tracker.js';
import { formatPrice }       from '../utils/prices.js';

let _packs = [];

export async function renderStarterPacks(containerId = 'packs-rail') {
  const rail = document.getElementById(containerId);
  if (!rail) return;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  _packs = resolveStarterPacks(products);
  rail.setAttribute('aria-busy', 'false');

  /* Nothing to sell here is not an error state worth explaining twice: the
     rail below already says the catalog is being restocked. */
  if (!_packs.length) {
    rail.closest('section')?.remove();
    return;
  }

  rail.innerHTML = _packs.map(_packCard).join('');
  /* Loading / failed states for the canonical photos, same as every other
     product surface (ui/images.js). */
  primeImageStates(rail);
  _bind(rail);

  _packs.forEach(pack => Tracker.discoverySetViewed(pack));
}

/* The pack's mark. Line icons in the storefront's own style — never a
   photograph: a pack is assembled from whatever the catalog can fill today,
   so a picture of "the pack" would show bottles that may not be in it. */
const PACK_ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z" stroke-linejoin="round"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke-linejoin="round"/>',
  bloom: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3.2c2 0 3.2 1.5 3.2 3.2S14 9.4 12 9.4 8.8 8.1 8.8 6.4 10 3.2 12 3.2ZM12 14.6c2 0 3.2 1.3 3.2 3S14 20.8 12 20.8s-3.2-1.5-3.2-3.2 1.2-3 3.2-3ZM6.4 8.8c1.7 0 3.2 1.2 3.2 3.2s-1.5 3.2-3.2 3.2-3.2-1.2-3.2-3.2 1.5-3.2 3.2-3.2ZM17.6 8.8c1.7 0 3.2 1.2 3.2 3.2s-1.5 3.2-3.2 3.2-3.2-1.2-3.2-3.2 1.5-3.2 3.2-3.2Z" stroke-linejoin="round"/>',
};

function _packIcon(key) {
  const path = PACK_ICONS[key] ?? PACK_ICONS.compass;
  return `<span class="pack-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${path}</svg>
  </span>`;
}

/**
 * The three fragrances, as the CANONICAL catalog photograph of each one.
 *
 * `product.image` is the same field the catalog card, the modal and the PDP
 * read — this surface stores no image of its own and has no second source of
 * image truth. Nothing is generated: the customer sees the actual bottles
 * that are in the box, which is the whole point of showing them.
 *
 * Missing or broken photos degrade the way every other product surface does:
 * `img-shell img-failed` prints the house monogram (ui/images.js keeps the
 * state in sync on load and on error). If NOT ONE of the three products has a
 * photo, the row is dropped entirely and the card falls back to the icon
 * treatment alone rather than showing three empty boxes.
 */
function _packThumbs(pack) {
  if (!pack.slots.some(slot => String(slot.product.image ?? '').trim())) return '';

  const thumbs = pack.slots.map(slot => {
    const product = slot.product;
    const image = String(product.image ?? '').trim();
    return `
      <button type="button" class="pack-thumb${image ? '' : ' img-shell img-failed'}"
        style="--img-initial:${_brandInitialCss(product)}"
        data-product-id="${_escape(product.id)}"
        aria-label="Ver ${_escape(product.house ?? '')} ${_escape(product.name)} — ${_escape(slot.label)}">
        ${image
          ? `<img src="${_escape(image)}" alt="" width="120" height="150" loading="lazy" decoding="async">`
          : ''}
      </button>`;
  }).join('');

  return `<div class="pack-thumbs">${thumbs}</div>`;
}

/* Card face: mark + name · 3 × 3 ml · one sentence · the three real bottles ·
   their names · the real total · one action. The ROLE of each fragrance is
   carried by the sentence, in the same order the thumbnails and names print,
   so the card can show what is inside without becoming a table. */
function _packCard(pack) {
  const names = pack.slots
    .map(slot => `<span class="pack-name-item">${_escape(slot.product.name)}</span>`)
    .join('<span class="pack-name-sep" aria-hidden="true">·</span>');

  return `
    <li>
      <article class="pack-card" data-pack-id="${_escape(pack.id)}">
        <div class="pack-head">
          ${_packIcon(pack.icon)}
          <div class="pack-head-copy">
            <p class="pack-kicker">${pack.count} × ${pack.itemSize} ml</p>
            <h3 class="pack-name">${_escape(pack.name)}</h3>
          </div>
        </div>

        <p class="pack-copy">${_escape(pack.copy)}</p>

        ${_packThumbs(pack)}
        <p class="pack-names">${names}</p>

        <div class="pack-foot">
          <p class="pack-price">
            <span class="pack-price-label">Total</span>
            <strong>${formatPrice(pack.total, 'Consultar')}</strong>
          </p>
          <button type="button" class="btn-primary pack-add" data-pack-id="${_escape(pack.id)}"
            aria-label="Agregar ${_escape(pack.name)} al carrito">
            Elegir este pack
          </button>
        </div>
      </article>
    </li>`;
}

/* The house initial shown when a photo is missing or 404s — the same
   treatment the catalog cards and the finder picks use. */
function _brandInitialCss(product) {
  const source = String(product?.house || product?.name || 'R').trim();
  const ch = source.charAt(0).toUpperCase();
  return `'${/[A-Z0-9À-Ý]/.test(ch) ? ch : 'R'}'`;
}

/* One delegated listener for the whole rail: the cards are re-rendered as a
   block, so per-card handlers would have to be re-bound on every render. */
function _bind(rail) {
  rail.addEventListener('click', async event => {
    const add = event.target.closest('.pack-add');
    if (add) {
      const pack = _byId(add.dataset.packId);
      if (pack) await _addPack(pack, add);
      return;
    }

    const item = event.target.closest('.pack-thumb');
    if (item) {
      const card = item.closest('.pack-card');
      const pack = _byId(card?.dataset.packId);
      const product = pack?.products.find(p => String(p.id) === item.dataset.productId);
      if (product) {
        openProductModal(product);
        Tracker.discoverySetClicked(pack, 'pack_item');
        Tracker.productClicked(product, 'starter_pack');
      }
      return;
    }

    const card = event.target.closest('.pack-card');
    const pack = _byId(card?.dataset.packId);
    if (pack) Tracker.discoverySetClicked(pack, 'pack_card');
  });
}

async function _addPack(pack, button) {
  button.disabled = true;
  try {
    Tracker.discoverySetAdded(pack);
    /* Cart.addBundle re-resolves each product from the canonical catalog and
       re-reads the 3 ml variant, so the price charged is the price shown even
       if the pack was rendered a few minutes ago. `total === originalTotal`
       keeps its proration ratio at 1 — no invented discount. */
    await window.__rd?.cart?.addBundle?.({
      id: pack.id,
      title: pack.name,
      items: pack.products,
      itemSize: pack.itemSize ?? STARTER_PACK_SIZE_ML,
      originalTotal: pack.total,
      total: pack.total,
      savings: 0,
    });
  } finally {
    button.disabled = false;
  }
}

function _byId(id) {
  return _packs.find(pack => pack.id === id) ?? null;
}

function _escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
