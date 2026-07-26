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
import { openProductModal }  from './modal.js';
import { primeImageStates }  from './images.js';
import { Tracker }           from '../tracking/tracker.js';
import { getDisplayVariant, formatPrice } from '../utils/prices.js';
import { getScarcityDisplay } from '../utils/scarcity.js';

export const BESTSELLER_LIMIT = 8;

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

  picks.forEach(p => Tracker.productView(p));
}

/* Card face: photo · house · name · entry price + presentation · one action.
   Deliberately no scent chips, no stock chatter, no story — that detail
   belongs to the product view, not to a discovery rail. */
function _buildRailCard(product, index) {
  const variant = getDisplayVariant(product);
  const stock = getScarcityDisplay(product);
  const canQuickAdd = Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));

  const priceHtml = variant
    ? `Desde ${formatPrice(variant.price)} <small>· ${variant.size} ml</small>`
    : 'Consultar precio';

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
      <p class="card-house">${product.house}</p>
      <h3 class="card-name">${product.name}</h3>
      <div class="card-purchase">
        <p class="card-price">${priceHtml}</p>
        <button type="button" class="card-action"
          aria-label="${canQuickAdd ? `Agregar ${product.name} al carrito` : `Ver opciones de ${product.name}`}">
          ${canQuickAdd ? 'Agregar' : 'Ver'}
        </button>
      </div>
    </div>`;

  card.querySelector('.card-action')?.addEventListener('click', event => {
    event.stopPropagation();
    if (canQuickAdd) {
      window.__rd?.cart?.add(product.id, variant.size);
      Tracker.productClicked(product, 'home_rail_quick_add');
    } else {
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
