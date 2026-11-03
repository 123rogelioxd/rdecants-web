/* =============================================================
   RDECANTS — STARTER PACKS (UI)

   The first commercial surface on the home, directly under the hero. What
   is in each pack, in what order, and at what discount is decided by Roger
   in R Supply OS and delivered by /api/web/packs; this file renders it and
   wires the two things a customer can do: add the pack, or open one of its
   fragrances.

   Four deliberate choices:
     • The three fragrances are NAMED on the card. A pack the customer
       cannot see inside is a blind purchase, and this shop's whole promise
       is that you know what you are buying before you pay.
     • The section removes itself when the backend has no live pack —
       unreachable API, feature off, nothing configured, or one perfume out
       of stock. It never falls back to an algorithmically assembled pack;
       see recommendations/starterPacks.js for why that is the one fallback
       worth refusing.
     • The saving is the server's number, printed, not computed here.
     • The price treatment is restrained on purpose: a struck-through
       normal total, a prominent pack total, and one small taupe badge. The
       message is "this is obviously better value", not "this looks
       suspiciously cheap", and RDECANTS does not do red discount graphics.

   Layout (2026-11): the cards stack vertically on a phone instead of
   sitting in a sideways rail. With three packs a carousel hid two of them
   behind a swipe most visitors never make; a compact stacked card costs
   less scroll than it looks and every pack is seen.
   ============================================================= */

import { CatalogProvider }   from '../providers/catalog.js';
import { hasRealSavings,
         packAudience,
         STARTER_PACK_SIZE_ML } from '../recommendations/starterPacks.js';
import { openProductModal }  from './modal.js';
import { primeImageStates }  from './images.js';
import { Tracker }           from '../tracking/tracker.js';
import { formatPrice }       from '../utils/prices.js';
import { stripPictographs,
         titleCaseName }     from '../utils/presentation.js';

let _packs = [];

export async function renderStarterPacks(containerId = 'packs-rail') {
  const rail = document.getElementById(containerId);
  if (!rail) return;

  try {
    _packs = await CatalogProvider.getPacks();
  } catch {
    /* getPacks already swallows its own transport failures; this is belt and
       braces so a rejected promise can never leave the home half-rendered. */
    _packs = [];
  }

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
  _trackImpressions(rail);
  _keepWhatsAppOffPacks(rail);
}

/* Back-office copy can carry emoji and shouting capitals ("🌎 PACK
   TODOTERRENO"); the card prints the words only. Presentation, not data —
   the record in R Supply OS is untouched. */
function _packName(pack) {
  return titleCaseName(stripPictographs(pack.name)) || 'Pack';
}

/* The first sentence always shows; the rest is hidden on a phone (CSS) so
   the description stays at about two lines. */
function _packCopy(pack) {
  const copy = stripPictographs(pack.copy);
  if (!copy) return '';

  const [, lead = copy, rest = ''] = copy.match(/^(.+?[.!?])\s+(.+)$/s) ?? [];
  return `
    <p class="pack-copy">${_escape(lead)}${rest
      ? `<span class="pack-copy-rest"> ${_escape(rest)}</span>`
      : ''}</p>`;
}

/**
 * The three fragrances: the CANONICAL catalog photograph of each one over
 * its name, all three one tap from the product modal.
 *
 * `product.image` is the same field the catalog card, the modal and the PDP
 * read — this surface stores no image of its own and has no second source of
 * image truth, so replacing a photo in the catalog replaces it here with no
 * change to the card.
 *
 * Missing or broken photos degrade the way every other product surface does:
 * `img-shell img-failed` prints the house monogram. If NOT ONE of the three
 * has a photo, the photo boxes are dropped and the names stand alone rather
 * than three empty boxes.
 */
function _packItems(pack) {
  const withPhotos = pack.items.some(item => String(item.product?.image ?? '').trim());

  const items = pack.items.map(item => {
    const product = item.product;
    const image = String(product?.image ?? '').trim();
    const name = titleCaseName(product?.name ?? '');

    const thumb = withPhotos
      ? `<span class="pack-thumb${image ? '' : ' img-shell img-failed'}"
          style="--img-initial:${_brandInitialCss(product)}">
          ${image
            ? `<img src="${_escape(image)}" alt="" width="120" height="150" loading="lazy" decoding="async">`
            : ''}
        </span>`
      : '';

    return `
      <li>
        <button type="button" class="pack-item" data-product-id="${_escape(product?.id)}"
          aria-label="Ver ${_escape(product?.house ?? '')} ${_escape(name)}${item.label ? ` — ${_escape(item.label)}` : ''}">
          ${thumb}
          <span class="pack-item-name">${_escape(name)}</span>
        </button>
      </li>`;
  }).join('');

  return `<ul class="pack-items">${items}</ul>`;
}

/* The price block. Two shapes, because a pack with no configured discount is
   a legitimate curation and must not be dressed up as a deal: with savings it
   shows normal → pack → "Ahorras"; without, one plain total. */
function _packPrice(pack) {
  const { normalTotal, finalTotal, savings } = pack.pricing;

  if (!hasRealSavings(pack)) {
    return `
      <p class="pack-price">
        <span class="pack-price-label">Total</span>
        <strong>${formatPrice(finalTotal, 'Consultar')}</strong>
      </p>`;
  }

  /* `formatPrice` already appends " MXN" — the currency is stated once, on
     the price that is actually charged. The struck-through normal total and
     the saving badge print the bare amount, so the row reads
     "$450  $405 MXN  Ahorras $51" rather than repeating the currency three
     times on a 375 px card. */
  const bare = value => formatPrice(value).replace(/\s*MXN$/, '');

  return `
    <p class="pack-price pack-price--deal">
      <s class="pack-price-was">${bare(normalTotal)}</s>
      <strong class="pack-price-now">${formatPrice(finalTotal, 'Consultar')}</strong>
      <span class="pack-save">Ahorras ${bare(savings)}</span>
    </p>`;
}

/* Card face: mark · who it is for · 3 × 3 ml, then the name, one or two
   lines of copy, the three real bottles with their names, the real price
   and one action. */
function _packCard(pack) {
  const name = _packName(pack);
  const audience = packAudience(pack);

  return `
    <li>
      <article class="pack-card" data-pack-id="${_escape(pack.id)}">
        <div class="pack-head">
          ${_packIcon(pack)}
          ${audience ? `<span class="pack-audience">${audience.label}</span>` : ''}
          <span class="pack-kicker">${pack.count} × ${pack.itemSize} ml</span>
          ${pack.badge ? `<span class="pack-badge">${_escape(stripPictographs(pack.badge))}</span>` : ''}
        </div>

        <h3 class="pack-name">${_escape(name)}</h3>
        ${_packCopy(pack)}

        ${_packItems(pack)}

        <div class="pack-foot">
          ${_packPrice(pack)}
          <button type="button" class="btn-primary pack-add" data-pack-id="${_escape(pack.id)}"
            aria-label="Agregar ${_escape(name)} al carrito">
            Elegir este pack
          </button>
        </div>
      </article>
    </li>`;
}

/* The pack's mark. Line icons in the storefront's own style — never a
   photograph: the three real bottles are already on the card, and a picture
   "of the pack" would be a fourth image of nothing. Chosen from the slug so a
   pack keeps the same mark across renders without storing one. */
const PACK_ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z" stroke-linejoin="round"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke-linejoin="round"/>',
  bloom: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3.2c2 0 3.2 1.5 3.2 3.2S14 9.4 12 9.4 8.8 8.1 8.8 6.4 10 3.2 12 3.2ZM12 14.6c2 0 3.2 1.3 3.2 3S14 20.8 12 20.8s-3.2-1.5-3.2-3.2 1.2-3 3.2-3ZM6.4 8.8c1.7 0 3.2 1.2 3.2 3.2s-1.5 3.2-3.2 3.2-3.2-1.2-3.2-3.2 1.5-3.2 3.2-3.2ZM17.6 8.8c1.7 0 3.2 1.2 3.2 3.2s-1.5 3.2-3.2 3.2-3.2-1.2-3.2-3.2 1.5-3.2 3.2-3.2Z" stroke-linejoin="round"/>',
};

function _packIcon(pack) {
  const slug = String(pack.slug ?? '');
  const key = /ella|mujer|fem/.test(slug) ? 'bloom'
    : /salir|noche|night/.test(slug) ? 'moon'
    : 'compass';

  return `<span class="pack-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${PACK_ICONS[key]}</svg>
  </span>`;
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
      if (pack) {
        Tracker.packSelected(pack, 'pack_cta');
        await _addPack(pack, add);
      }
      return;
    }

    const item = event.target.closest('.pack-item');
    if (item) {
      const card = item.closest('.pack-card');
      const pack = _byId(card?.dataset.packId);
      const product = pack?.products.find(p => String(p?.id) === item.dataset.productId);
      if (product) {
        openProductModal(product);
        Tracker.packSelected(pack, 'pack_item');
        Tracker.productClicked(product, 'starter_pack');
      }
      return;
    }

    const card = event.target.closest('.pack-card');
    const pack = _byId(card?.dataset.packId);
    if (pack) Tracker.packSelected(pack, 'pack_card');
  });
}

/* pack_viewed is an impression: once per card, when half of it has actually
   been on screen. Stacked vertically, the third pack is often below the
   fold, so "rendered" would overstate it. */
function _trackImpressions(rail) {
  if (!('IntersectionObserver' in window)) {
    _packs.forEach(pack => Tracker.packViewed(pack));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const pack = _byId(entry.target.dataset.packId);
      if (pack) Tracker.packViewed(pack);
    }
  }, { threshold: 0.5 });

  rail.querySelectorAll('.pack-card').forEach(card => observer.observe(card));
}

/* The floating WhatsApp button sits on the right edge, exactly where each
   card's names, price and "Elegir este pack" pass under it. It steps aside
   while it overlaps the packs and comes back as soon as it does not; same
   pattern as the PDP sticky bar and the open cart (body class + CSS). */
function _keepWhatsAppOffPacks(rail) {
  const float = document.querySelector('.whatsapp-float');
  if (!float) return;

  const update = () => {
    const fab = float.getBoundingClientRect();
    const packs = rail.getBoundingClientRect();
    const overlaps = fab.bottom > packs.top && fab.top < packs.bottom
      && fab.right > packs.left && fab.left < packs.right;
    document.body.classList.toggle('wa-over-packs', overlaps);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

async function _addPack(pack, button) {
  button.disabled = true;
  try {
    /* Cart.addPack stores the pack's IDENTITY and quantity. It does not store
       the price: checkout sends { pack_id, quantity } and R Supply OS resolves
       the products, re-reads the canonical 3 ml variants and derives the
       discount again. The totals below are display only. */
    const added = await window.__rd?.cart?.addPack?.(pack);
    if (added !== false) Tracker.packAdded(pack);
  } finally {
    button.disabled = false;
  }
}

function _byId(id) {
  return _packs.find(pack => String(pack.id) === String(id)) ?? null;
}

function _escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { STARTER_PACK_SIZE_ML };
