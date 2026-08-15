/* =============================================================
   RDECANTS — HOME EDITORIAL RAIL ("Roger recomienda")

   The home page's single commercial surface: four cards, then one clear
   link into the full catalog. It never renders the whole catalog.

   This rail was headed "Más vendidos" and was not sorted by sales. It used
   the catalog's commercial order — available → featured → badge → gender —
   which is a reasonable ordering and simply not the one the heading claimed.
   Real sales data exists at /api/web/trending and was not what this showed.

   So the products now come from Roger's own picks
   (/api/web/merchandising, slot `roger`) when he has curated them, and fall
   back to exactly the previous derived order when he has not. Both paths run
   through isSellable(), so nothing sold out is ever shown either way.
   ============================================================= */

import { CatalogProvider }   from '../providers/catalog.js';
import { filterProducts }    from '../catalog/search.js';
import { isSellable }        from '../recommendations/scoring.js';
import { describeProduct }   from '../recommendations/describe.js';
import { openProductModal }  from './modal.js';
import { primeImageStates }  from './images.js';
import { Tracker }           from '../tracking/tracker.js';
import { getDisplayVariant, getVariantForSize, getPrimaryVariants, formatPrice } from '../utils/prices.js';
import { getScarcityDisplay } from '../utils/scarcity.js';
import { genderBadgeHtml }   from './genderBadge.js';

/* Four on the home. More than that and the page becomes the catalog again;
   the whole catalog is one tap away under "Ver todos". */
export const BESTSELLER_LIMIT = 4;

/* The presentation the home leads with. 5 ml is the size the copy promises
   ("Probar 5 ml") and the one the price quotes. */
export const TRY_SIZE_ML = 5;

/* Pure: the products the rail should show, in order. Sold-out SKUs are
   excluded rather than shown as dead cards. */
export function selectBestsellers(products, limit = BESTSELLER_LIMIT) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const sellable = list.filter(isSellable);
  return filterProducts(sellable, { sort: 'trending' }).slice(0, Math.max(0, limit));
}

/**
 * Pure: reconcile curated placements with the derived fallback.
 *
 * A curated entry only survives if it is still sellable — the backend already
 * drops unpublished and sold-out products, but the storefront re-checks rather
 * than trusting a payload that may have been cached for up to a minute on
 * either side.
 *
 * If curation yields nothing at all, the rail falls back whole. It is never
 * topped up from the derived list: a half-curated, half-automatic rail would
 * make "Roger recomienda" partly untrue, and there is no way for the customer
 * to tell which halves are which.
 */
export function selectRogerPicks(placements, products, limit = BESTSELLER_LIMIT) {
  const curated = (Array.isArray(placements) ? placements : [])
    .filter(entry => entry?.product && isSellable(entry.product))
    .slice(0, Math.max(0, limit));

  if (curated.length) return curated;

  return selectBestsellers(products, limit).map(product => ({
    label: null, reason: null, product,
  }));
}

export async function renderBestsellers(containerId = 'bestsellers-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  /* Curation is additive: if it is off, un-migrated or empty, this is `[]`
     and the rail behaves exactly as it did before. */
  const placements = await CatalogProvider.getMerchandising('roger');

  const picks = selectRogerPicks(placements, products);
  grid.setAttribute('aria-busy', 'false');

  if (!picks.length) {
    grid.innerHTML = `
      <li class="rail-empty">
        <p>Estamos reabasteciendo el catálogo.</p>
        <p><a href="https://wa.me/5219516513018" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> y te decimos qué hay disponible hoy.</p>
      </li>`;
    return;
  }

  const curated = Boolean(placements.length);

  /* "Lo que traería si vinieras a preguntarme" is a promise that a person
     chose these. When the rail has fallen back to the derived order nobody
     did, so the line comes out — the same reason the heading stopped saying
     "Más vendidos". The heading itself stays: it names who stands behind the
     shop's selection, which is true either way. */
  if (!curated) document.getElementById('roger-recomienda-sub')?.remove();

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  picks.forEach((pick, index) => frag.appendChild(
    _buildRailCard(pick.product, index, { label: pick.label, reason: pick.reason, curated }),
  ));
  grid.appendChild(frag);
  primeImageStates(grid);

  syncEntryPrice(products);
  picks.forEach(p => Tracker.productView(p.product));
}

/**
 * Pure: the most recently added products the storefront can sell.
 *
 * R Supply OS does not expose a creation timestamp in the public catalog, so
 * the incremental `product_id` is the proxy — the same one the catalog's own
 * "Novedades" sort already uses, rather than a second definition of "new".
 */
export function selectNewest(products, limit = BESTSELLER_LIMIT) {
  return (Array.isArray(products) ? products : [])
    .filter(Boolean)
    .filter(isSellable)
    .filter(p => Number.isFinite(Number(p.product_id)))
    .sort((a, b) => Number(b.product_id) - Number(a.product_id))
    .slice(0, Math.max(0, limit));
}

export async function renderNewest(containerId = 'newest-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const picks = selectNewest(products);
  grid.setAttribute('aria-busy', 'false');

  /* No apology copy here — the rail above already handles the empty catalog.
     A second "we are restocking" block would just be noise. */
  if (!picks.length) {
    grid.closest('section')?.remove();
    return;
  }

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  picks.forEach((product, index) => frag.appendChild(_buildRailCard(product, index)));
  grid.appendChild(frag);
  primeImageStates(grid);
}

/* The hero prints an entry price ("desde $100"). A hardcoded number drifts
   the moment pricing changes, and a promise the catalog no longer honours is
   worse than no promise — so the real floor across every orderable
   presentation replaces it whenever the two disagree. */
export function lowestOrderablePrice(products) {
  const prices = (Array.isArray(products) ? products : [])
    .filter(Boolean)
    .filter(isSellable)
    /* PRIMARY_SIZES only. The 2 ml exists as a cart completer, not as a
       presentation anyone browses to — quoting it in the hero would
       advertise an entry price the customer cannot actually pick, the same
       trap the PDP already guards against. */
    .flatMap(product => getPrimaryVariants(product)
      .filter(v => !v.soldOut && v.availability > 0 && Number(v.price) > 0)
      .map(v => Number(v.price)));
  return prices.length ? Math.min(...prices) : null;
}

export function syncEntryPrice(products, doc = document) {
  const target = doc.querySelector('[data-entry-price]');
  if (!target) return;
  const lowest = lowestOrderablePrice(products);
  if (!Number.isFinite(lowest)) return;
  const printed = Number(String(target.textContent).replace(/[^0-9.]/g, ''));
  if (printed === lowest) return;
  target.textContent = formatPrice(lowest).replace(/\s*MXN$/, '');
}

/* Card face: photo · brand · name · one plain-language line · 5 ml price ·
   one action. No size selector here — three toggles on every card is how
   the home became a control panel last time; the sizes live in the product
   view, one tap away. */
function _buildRailCard(product, index, editorial = {}) {
  const tryVariant = getVariantForSize(product, TRY_SIZE_ML);
  const variant = tryVariant ?? getDisplayVariant(product);
  const stock = getScarcityDisplay(product);
  const canQuickAdd = Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));

  /* Quote the size the button offers. If 5 ml is not stocked for this
     product, say which size the price refers to instead of implying 5 ml. */
  const priceHtml = variant
    ? `${formatPrice(variant.price)} <small>· ${variant.size} ml</small>`
    : 'Consultar precio';

  const actionLabel = tryVariant && canQuickAdd
    ? `Probar ${TRY_SIZE_ML} ml`
    : canQuickAdd ? `Probar ${variant.size} ml` : 'Ver tamaños';

  const blurb = describeProduct(product);

  const li = document.createElement('li');
  const card = document.createElement('article');
  card.className = 'product-card product-card--clickable';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Ver detalle de ${product.name}`);

  /* ONE badge, never two.
     Precedence is deliberate: real scarcity outranks editorial copy, because
     "Últimos ml" is a fact about what the customer can still buy and
     "Roger recomienda" is an opinion. Stacking both is how a card starts
     looking like a discount aggregator. */
  const badgeText = stock.state === 'last_units'
    ? stock.label
    : (String(editorial.label ?? '').trim() || '');
  const badgeClass = stock.state === 'last_units' ? stock.badgeClass : 'card-badge--editorial';
  const urgent = badgeText
    ? `<span class="card-badge ${badgeClass}">${_escape(badgeText)}</span>`
    : '';

  /* Roger's one-line "why". Replaces the derived blurb rather than joining
     it — two descriptions of the same perfume on one card is one too many. */
  const reason = String(editorial.reason ?? '').trim();

  card.innerHTML = `
    ${urgent}
    <div class="card-img-wrap${product.image ? '' : ' img-shell img-failed'}" style="--img-initial:${_brandInitialCss(product)}">
      ${product.image
        ? `<img src="${product.image}" alt="${product.name}" width="400" height="500" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async">`
        : ''}
    </div>
    <div class="card-body">
      <div class="card-topline">
        <p class="card-house">${product.house}</p>
        ${genderBadgeHtml(product)}
      </div>
      <h3 class="card-name">${product.name}</h3>
      ${reason
        ? `<p class="card-blurb card-blurb--reason">${_escape(reason)}</p>`
        : (blurb ? `<p class="card-blurb">${blurb}</p>` : '')}
      <div class="card-purchase">
        <p class="card-price">${priceHtml}</p>
        <button type="button" class="card-action"
          aria-label="${canQuickAdd ? `Agregar ${product.name} en ${variant.size} ml al carrito` : `Ver tamaños de ${product.name}`}">
          ${actionLabel}
        </button>
      </div>
    </div>`;

  card.querySelector('.card-action')?.addEventListener('click', event => {
    event.stopPropagation();
    if (canQuickAdd) {
      window.__rd?.cart?.add(product.id, variant.size);
      Tracker.productClicked(product, 'home_rail_try_size');
    } else {
      /* No orderable variant to add — open the product so the customer can
         see the real presentations instead of hitting a dead button. */
      openProductModal(product);
      Tracker.productClicked(product, 'home_rail_action');
    }
  });

  card.addEventListener('click', event => {
    if (event.target.closest('.card-action')) return;
    openProductModal(product);
    Tracker.productClicked(product, 'home_rail');
    /* Curated picks report separately: "does Roger recomienda get clicked?"
       is a different question from "does the home rail get clicked?", and it
       is the one that decides whether the curation is worth his time. */
    if (editorial.curated) Tracker.rogerRecommendationClicked(product, index + 1);
  });

  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProductModal(product);
    }
  });

  li.appendChild(card);
  return li;
}

/* Operator-authored copy reaches innerHTML, so it is escaped at the boundary.
   The admin field is length-limited and typed by a trusted operator, but "the
   author is trusted" is not the same guarantee as "this cannot inject". */
function _escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _brandInitialCss(p) {
  const source = String(p?.house || p?.name || 'R').trim();
  const ch = source.charAt(0).toUpperCase();
  return `'${/[A-Z0-9À-Ý]/.test(ch) ? ch : 'R'}'`;
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return false;
  return true;
}
