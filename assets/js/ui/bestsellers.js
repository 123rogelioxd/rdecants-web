/* =============================================================
   RDECANTS — HOME BESTSELLERS RAIL
   The home page's single commercial surface: at most eight cards on
   desktop, four on a phone (CSS trims the tail), then one clear link
   into the full catalog. It never renders the whole catalog.

   Ranking reuses the catalog's own commercial order ("trending":
   available → featured → badge → gender tiebreak) so the home and the
   catalog agree on what is prominent. Nothing sold out is ever
   featured here — that is what isSellable() is for.
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

export async function renderBestsellers(containerId = 'bestsellers-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const picks = selectBestsellers(products);
  grid.setAttribute('aria-busy', 'false');

  if (!picks.length) {
    grid.innerHTML = `
      <li class="rail-empty">
        <p>Estamos reabasteciendo el catálogo.</p>
        <p><a href="https://wa.me/5219516513018" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> y te decimos qué hay disponible hoy.</p>
      </li>`;
    return;
  }

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  picks.forEach((product, index) => frag.appendChild(_buildRailCard(product, index)));
  grid.appendChild(frag);
  primeImageStates(grid);

  syncEntryPrice(products);
  picks.forEach(p => Tracker.productView(p));
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
function _buildRailCard(product, index) {
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

  /* Only a genuinely urgent state earns the single allowed mark. */
  const urgent = stock.state === 'last_units'
    ? `<span class="card-badge ${stock.badgeClass}">${stock.label}</span>`
    : '';

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
      ${blurb ? `<p class="card-blurb">${blurb}</p>` : ''}
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
