/* =============================================================
   RDECANTS — CATALOG RENDERER
   Renders featured product, product grid, and packs.
   Data comes exclusively from CatalogProvider.

   States handled:
     • loading   — placeholder text while fetching
     • empty     — section hidden / empty message when no items
     • filtered  — SearchBar callback re-renders with subset
     • no-match  — elegant empty state when filters return 0
   ============================================================= */

import { CatalogProvider }  from '../providers/catalog.js?v=2026.06.04.2';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from '../ui/modal.js?v=2026.06.04.2';
import { SearchBar }        from '../ui/searchbar.js?v=2026.06.04.2';
import { observeFadeUp }    from '../ui/animations.js';
import { primeImageStates } from '../ui/images.js';
import { getDefaultVariant,
         getDisplayVariant,
         formatPrice }      from '../utils/prices.js?v=2026.06.04.2';
import { getScarcityDisplay } from '../utils/scarcity.js?v=2026.06.04.2';
import { getDisplayBadges }  from '../utils/guidance.js?v=2026.06.04.2';

/* module-level ref kept for SearchBar callback */
let _productsContainer = null;

/* Compact mobile catalog: the default browse view shows the first
   MOBILE_CATALOG_CAP cards; the rest sit behind "Ver más perfumes".
   The cap is mobile-only (CSS media query) and NEVER applies while a
   search/filter is active — those views always show every result. */
const MOBILE_CATALOG_CAP = 8;
let _catalogExpanded = false;
let _lastCatalogProducts = [];
let _catalogResizeBound = false;
let _lastMobileCatalogState = null;

/* ── Featured ────────────────────────────────────────────────── */
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

/* ── Product grid ────────────────────────────────────────────── */
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

  /* Measure time-to-catalog — fires once when catalog enters viewport */
  const _catalogLoadTime = Date.now();
  const _catalogSection  = document.getElementById('catalog');
  if (_catalogSection && 'IntersectionObserver' in window) {
    const _obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        _obs.disconnect();
        Tracker.catalogReached(Date.now() - _catalogLoadTime);
      }
    }, { threshold: 0.1 });
    _obs.observe(_catalogSection);
  }
}

/* ── Packs ───────────────────────────────────────────────────── */
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

/* ── Grid renderer (used by SearchBar callback) ──────────────── */
function _renderGrid(products, { rememberProducts = true } = {}) {
  if (!_productsContainer) return;

  /* Reset any compact-cap UI from a previous render before re-painting */
  _removeShowMore();
  _productsContainer.classList.remove('products-grid--capped');

  _productsContainer.innerHTML = '';
  const catalogProducts = normalizeCatalogProducts(products);
  if (rememberProducts) _lastCatalogProducts = catalogProducts;

  /* Empty state */
  if (!catalogProducts.length) {
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
  const total = catalogProducts.length;
  const productsToRender = getCatalogRenderProducts(catalogProducts, {
    expanded: _catalogExpanded,
    filtersActive: _catalogFiltersActive(),
    isMobile: _isMobileCatalog(),
  });

  productsToRender.forEach((p, idx) => {
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
    const genderChip = genderBadgeHtml(p.gender, 'card-gender');

    const badgeClass = stockState.badgeClass;
    const guidanceHtml = getDisplayBadges(p, { limit: 1 })
      .map(g => `<span class="guidance-chip guidance-chip--${g.key}">${g.label}</span>`)
      .join('');

    const card = document.createElement('div');
    card.className             = 'product-card product-card--clickable fade-up visible';
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
          <div class="card-meta-chips">
            ${genderChip}
            ${concentrationChip}
          </div>
        </div>
        ${guidanceHtml ? `<div class="card-guidance" aria-label="Recomendado para">${guidanceHtml}</div>` : ''}
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

    /* Click → modal */
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
      const activeQuery = SearchBar.getState().query;
      if (activeQuery) Tracker.searchResultClicked(p, activeQuery, idx);
      Tracker.productClicked(p, 'grid');
    });

    /* Keyboard → modal */
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
  _applyCatalogCap(total);
}

/* ── Compact mobile catalog ──────────────────────────────────── */

/* Decide whether the compact cap + "Ver más perfumes" control applies.
   Capping only happens in the default browse view: no active filters and
   more items than the cap. Search/filtered views show everything. */
function _applyCatalogCap(total) {
  const filtersActive = _catalogFiltersActive();
  const isMobile = _isMobileCatalog();
  _lastMobileCatalogState = isMobile;
  _ensureCatalogCapResizeSync();

  if (filtersActive || !isMobile || total <= MOBILE_CATALOG_CAP) {
    _catalogExpanded = false;
    return;
  }

  if (!_catalogExpanded) _productsContainer.classList.add('products-grid--capped');
  _renderShowMore(total);
}

function _renderShowMore(total) {
  const shown = getCatalogCapShown(total, {
    expanded: _catalogExpanded,
    filtersActive: _catalogFiltersActive(),
    isMobile: _isMobileCatalog(),
  });

  const wrap = document.createElement('div');
  wrap.className = 'catalog-more catalog-more-panel';
  wrap.id        = 'catalog-more';
  wrap.innerHTML = `
    <p class="catalog-more-count catalog-count" id="catalog-more-count">Mostrando ${shown} de ${total} perfumes</p>
    <button type="button" class="catalog-more-btn" id="catalog-more-btn"
      aria-expanded="${_catalogExpanded}">
      ${_catalogExpanded ? 'Mostrar menos' : 'Ver más perfumes'}
    </button>`;

  _productsContainer.insertAdjacentElement('afterend', wrap);
  wrap.querySelector('#catalog-more-btn')
    ?.addEventListener('click', _toggleCatalog);
}

function _toggleCatalog() {
  const products = normalizeCatalogProducts(_lastCatalogProducts);
  if (!products.length) {
    _removeShowMore();
    _productsContainer?.classList.remove('products-grid--capped');
    return;
  }

  _catalogExpanded = !_catalogExpanded;
  const nextTotal = products.length;

  if (_catalogExpanded) {
    Tracker.catalogExpanded(nextTotal, Math.min(MOBILE_CATALOG_CAP, nextTotal));
  } else {
    Tracker.catalogCollapsed(nextTotal);
  }

  _renderGrid(products, { rememberProducts: false });

  if (!_catalogExpanded) {
    requestAnimationFrame(() => {
      _productsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function _removeShowMore() {
  document.getElementById('catalog-more')?.remove();
}

function _ensureCatalogCapResizeSync() {
  if (_catalogResizeBound || typeof window === 'undefined') return;
  _catalogResizeBound = true;
  window.addEventListener('resize', () => {
    const isMobile = _isMobileCatalog();
    if (isMobile === _lastMobileCatalogState) return;
    _lastMobileCatalogState = isMobile;
    if (_lastCatalogProducts.length) _renderGrid(_lastCatalogProducts);
  });
}

function _isMobileCatalog() {
  return Boolean(globalThis.matchMedia?.('(max-width: 768px)').matches);
}

function _catalogFiltersActive() {
  return SearchBar.hasActiveFilters?.() ?? false;
}

export function getCatalogRenderProducts(products, {
  expanded = false,
  filtersActive = false,
  isMobile = false,
  cap = MOBILE_CATALOG_CAP,
} = {}) {
  const list = normalizeCatalogProducts(products);
  if (!isMobile || filtersActive || expanded || list.length <= cap) return list;
  return list.slice(0, cap);
}

export function getCatalogCapVisibility(total, {
  expanded = false,
  filtersActive = false,
  isMobile = false,
  cap = MOBILE_CATALOG_CAP,
} = {}) {
  return getCatalogRenderProducts(Array.from({ length: Math.max(0, total) }, () => ({})), {
    expanded,
    filtersActive,
    isMobile,
    cap,
  }).map(() => true);
}

export function getCatalogCapShown(total, {
  expanded = false,
  filtersActive = false,
  isMobile = false,
  cap = MOBILE_CATALOG_CAP,
} = {}) {
  if (!isMobile || filtersActive || expanded) return total;
  return Math.min(cap, total);
}

export function normalizeCatalogProducts(products) {
  return Array.isArray(products) ? products.filter(Boolean) : [];
}

/* ── Helpers ─────────────────────────────────────────────────── */
function _stockText(stock) {
  if (stock <= 1) return 'Ultima unidad disponible';
  if (stock <= 3) return `Solo ${stock} unidades disponibles`;
  if (stock <= 5) return 'Alta demanda esta semana';
  return 'Disponible';
}

export function genderLabel(gender) {
  const labels = {
    hombre: 'Hombre',
    male: 'Hombre',
    mujer: 'Mujer',
    female: 'Mujer',
    unisex: 'Unisex',
  };
  return labels[String(gender ?? '').toLowerCase()] ?? '';
}

export function genderBadgeHtml(gender, className = 'gender-badge') {
  const label = genderLabel(gender);
  return label ? `<span class="${className}">${label}</span>` : '';
}

function _isOrderableVariant(variant) {
  return Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}
