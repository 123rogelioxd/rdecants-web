/* =============================================================
   RDECANTS â€” CATALOG RENDERER
   Renders featured product, product grid, and packs.
   Data comes exclusively from CatalogProvider.

   States handled:
     â€¢ loading   â€” placeholder text while fetching
     â€¢ empty     â€” section hidden / empty message when no items
     â€¢ filtered  â€” SearchBar callback re-renders with subset
     â€¢ no-match  â€” elegant empty state when filters return 0
   ============================================================= */

import { CatalogProvider }  from '../providers/catalog.js?v=1.0.16';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from '../ui/modal.js?v=1.0.13';
import { SearchBar }        from '../ui/searchbar.js?v=1.0.2';
import { observeFadeUp }    from '../ui/animations.js';
import { primeImageStates } from '../ui/images.js';
import { getDefaultVariant,
         getDisplayVariant,
         formatPrice }      from '../utils/prices.js?v=1.0.13';
import { getScarcityDisplay } from '../utils/scarcity.js?v=1.0.13';
import { getGuidanceBadges }  from '../utils/guidance.js?v=1.0.13';

/* module-level ref kept for SearchBar callback */
let _productsContainer = null;

/* â”€â”€ Featured â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export async function renderFeatured() {
  const el = document.getElementById('featured-product');
  if (!el) return;

  el.innerHTML = '<p class="catalog-loading">Cargando...</p>';

  const featured = await CatalogProvider.getFeatured();

  if (!featured) {
    el.closest('section')?.remove();
    return;
  }

  Tracker.productView(featured);
  const featuredVariant = getDefaultVariant(featured);
  const canAddFeatured = _isOrderableVariant(featuredVariant);
  const featuredPrice = featuredVariant
    ? `${formatPrice(featuredVariant.price)} <small>/ ${featuredVariant.size}ml</small>`
    : 'Consultar precio';

  el.innerHTML = `
    <div class="featured-img">
      <img src="${featured.image}" alt="${featured.name}" loading="lazy" decoding="async">
    </div>
    <div class="featured-info">
      <span class="featured-tag">FRAGANCIA DESTACADA</span>
      <p style="font-size:11px;letter-spacing:.35em;color:var(--muted);text-transform:uppercase;margin-bottom:10px;">
        ${featured.house}
      </p>
      <h2 class="featured-title">${featured.name}</h2>
      <p class="featured-desc">${featured.story}</p>
      <div class="card-notes" style="margin-bottom:28px;">
        ${featured.notes.map(n => `<span class="note-tag">${n}</span>`).join('')}
      </div>
      ${featured.stock <= 3
        ? `<p class="card-stock"><span class="stock-dot"></span>${_stockText(featured.stock)}</p>`
        : ''}
      <div class="featured-price">
        ${featuredPrice}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn-primary"
          ${canAddFeatured ? `onclick="window.__rd.cart.add('${featured.id}', ${featuredVariant.size})"` : 'disabled aria-disabled="true"'}
          aria-label="${canAddFeatured ? `Agregar ${featured.name} ${featuredVariant.size}ml al carrito` : 'Precio por consultar'}">
          ${canAddFeatured ? 'Agregar a mi colección' : 'Consultar precio'}
        </button>
        <button class="btn-ghost" onclick="window.__rd.ui.scrollToCatalog()">
          Ver coleccion
        </button>
      </div>
    </div>
  `;
  primeImageStates(el);
}

function _emptyState(title, desc) {
  return `
    <div class="catalog-empty premium-empty">
      <div class="sf-empty-icon" aria-hidden="true">R</div>
      <h3 class="sf-empty-title">${title}</h3>
      <p class="sf-empty-desc">${desc}</p>
    </div>
  `;
}

/* â”€â”€ Product grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export async function renderProducts() {
  _productsContainer = document.getElementById('products-grid');
  if (!_productsContainer) return;

  _productsContainer.innerHTML = '<p class="catalog-loading">Cargando coleccion...</p>';

  const products = await CatalogProvider.getProducts();

  if (!products?.length) {
    _productsContainer.innerHTML = _emptyState(
      'Aún no hay perfumes publicados.',
      'Cuando el catálogo tenga fragancias activas aparecerán aquí.',
    );
    return;
  }

  /* Track initial view for all products once */
  products.forEach(p => Tracker.productView(p));

  /* SearchBar handles the first and all subsequent renders */
  SearchBar.init(products, (filtered) => {
    _renderGrid(filtered);
    observeFadeUp();
  });
}

/* â”€â”€ Packs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export async function renderPacks() {
  const container = document.getElementById('packs-grid');
  if (!container) return;

  container.innerHTML = '<p class="catalog-loading">Cargando packs...</p>';

  const packs = await CatalogProvider.getPacks();

  if (!packs?.length) {
    container.innerHTML = _emptyState(
      'Packs en curaduria',
      'Aun no hay packs disponibles, pero el catalogo sigue abierto para armar tu seleccion.',
    );
    return;
  }

  container.innerHTML = '';

  packs.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className         = 'pack-card fade-up';
    card.style.transitionDelay = `${idx * 0.08}s`;

    card.innerHTML = `
      <span class="pack-badge">${p.badge}</span>
      <div class="pack-emoji">${p.emoji}</div>
      <h3 class="pack-name">${p.name}</h3>
      <p class="pack-desc">${p.desc}</p>
      <p class="pack-detail">${p.detail}</p>
      ${p.stock <= 3
        ? `<div class="pack-stock"><span class="stock-dot"></span>${_stockText(p.stock)}</div>`
        : ''}
      <div class="pack-pricing">
        <span class="pack-price-now">$${p.price}</span>
        <span class="pack-price-was">$${p.originalPrice}</span>
      </div>
          <button class="btn-gold" style="width:100%;"
        onclick="window.__rd.cart.addPack('${p.id}')"
        aria-label="Agregar pack ${p.name} al carrito">
        Quiero este pack
      </button>
    `;

    container.appendChild(card);
  });
}

/* â”€â”€ Grid renderer (used by SearchBar callback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _renderGrid(products) {
  if (!_productsContainer) return;

  _productsContainer.innerHTML = '';

  /* Empty state */
  if (!products.length) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty premium-empty';
    empty.innerHTML = `
      <div class="sf-empty-icon" aria-hidden="true">R</div>
      <h3 class="sf-empty-title">Sin match perfecto</h3>
      <p class="sf-empty-desc">
        Intenta otros filtros o ajusta tu busqueda
      </p>
      <button class="btn-ghost sf-empty-clear"
        onclick="window.__rd?.ui?.clearSearch?.()">
        Limpiar filtros ->
      </button>
    `;
    _productsContainer.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  products.forEach((p, idx) => {
    const displayVariant = getDisplayVariant(p);
    const priceHtml = displayVariant
      ? `${formatPrice(displayVariant.price)} <small>${displayVariant.size}ml</small>`
      : 'Consultar precio';
    const stockState = getScarcityDisplay(p);
    const isSoldOut = stockState.state === 'sold_out';
    const canQuickAdd = !isSoldOut && _isOrderableVariant(displayVariant);
    const concentrationChip = p.concentration
      ? `<span class="card-concentration">${p.concentration}</span>`
      : '';

    const badgeClass = stockState.badgeClass;
    const guidanceHtml = getGuidanceBadges(p)
      .map(g => `<span class="guidance-chip guidance-chip--${g.key}">${g.label}</span>`)
      .join('');

    const card = document.createElement('div');
    card.className             = 'product-card product-card--clickable fade-up';
    card.style.transitionDelay = `${idx * 0.05}s`;
    card.setAttribute('role',       'button');
    card.setAttribute('tabindex',   '0');
    card.setAttribute('aria-label', `Ver detalle de ${p.name}`);

    card.innerHTML = `
      ${stockState.key !== 'ok' ? `<span class="card-badge ${badgeClass}">${stockState.label}</span>` : ''}
      <div class="card-img-wrap">
        <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">
      </div>
      <div class="card-body">
        <p class="card-house">${p.house}</p>
        <div class="card-title-row">
          <h3 class="card-name">${p.name}</h3>
          ${concentrationChip}
        </div>
        ${guidanceHtml ? `<div class="card-guidance" aria-label="Recomendado para">${guidanceHtml}</div>` : ''}
        <p class="card-story">${p.story}</p>
        <div class="card-purchase">
          <div>
            <p class="card-price">${priceHtml}</p>
            <p class="card-stock card-stock--${stockState.key}">
              <span class="stock-dot"></span>${stockState.label}
            </p>
          </div>
          <button class="btn-primary card-action"
            ${isSoldOut ? 'disabled aria-disabled="true"' : ''}
            aria-label="${isSoldOut ? `${p.name} agotado` : canQuickAdd ? `Agregar ${p.name} al carrito` : `Consultar disponibilidad de ${p.name}`}">
            ${isSoldOut ? 'Agotado' : canQuickAdd ? 'Agregar' : 'Consultar'}
          </button>
        </div>
      </div>
    `;

    /* Click â†’ modal */
    card.querySelector('.card-action')?.addEventListener('click', e => {
      e.stopPropagation();
      if (isSoldOut) return;
      if (canQuickAdd) {
        window.__rd?.cart?.add(p.id, displayVariant.size);
        window.__rd?.ui?.openCart?.();
      } else {
        openProductModal(p);
      }
      Tracker.productClicked(p, canQuickAdd ? 'quick_add' : 'card_action');
    });

    card.addEventListener('click', e => {
      if (e.target.closest('.card-action')) return;
      openProductModal(p);
      Tracker.productClicked(p, 'grid');
    });

    /* Keyboard â†’ modal */
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProductModal(p);
      }
    });

    frag.appendChild(card);
  });

  _productsContainer.appendChild(frag);
  primeImageStates(_productsContainer);
}

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _stockText(stock) {
  if (stock <= 1) return 'Ultima unidad disponible';
  if (stock <= 3) return `Solo ${stock} unidades disponibles`;
  if (stock <= 5) return 'Alta demanda esta semana';
  return 'Disponible';
}

function _sizeLabel(size) {
  if (size === 3) return 'Prueba';
  if (size === 5) return 'Popular';
  if (size === 10) return 'Grande';
  return 'Decant';
}

function _isOrderableVariant(variant) {
  return Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}


