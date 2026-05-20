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

import { CatalogProvider }  from '../providers/catalog.js';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from '../ui/modal.js';
import { SearchBar }        from '../ui/searchbar.js';
import { observeFadeUp }    from '../ui/animations.js';

/* module-level ref kept for SearchBar callback */
let _productsContainer = null;

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

  el.innerHTML = `
    <div class="featured-img">
      <img src="${featured.image}" alt="${featured.name}" loading="lazy">
    </div>
    <div class="featured-info">
      <span class="featured-tag">★ FRAGANCIA DESTACADA</span>
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
        $${featured.prices[5]} MXN <small>/ 5ml</small>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn-primary"
          onclick="window.__rd.cart.add('${featured.id}', 5)">
          Agregar a mi colección
        </button>
        <button class="btn-ghost" onclick="window.__rd.ui.scrollToCatalog()">
          Ver colección
        </button>
      </div>
    </div>
  `;
}

/* ── Product grid ────────────────────────────────────────────── */
export async function renderProducts() {
  _productsContainer = document.getElementById('products-grid');
  if (!_productsContainer) return;

  _productsContainer.innerHTML = '<p class="catalog-loading">Cargando colección...</p>';

  const products = await CatalogProvider.getProducts();

  if (!products?.length) {
    _productsContainer.innerHTML =
      '<p class="catalog-empty">Sin productos disponibles por ahora.</p>';
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

/* ── Packs ───────────────────────────────────────────────────── */
export async function renderPacks() {
  const container = document.getElementById('packs-grid');
  if (!container) return;

  container.innerHTML = '<p class="catalog-loading">Cargando packs...</p>';

  const packs = await CatalogProvider.getPacks();

  if (!packs?.length) {
    container.innerHTML = '<p class="catalog-empty">Sin packs disponibles por ahora.</p>';
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
        onclick="window.__rd.cart.addPack('${p.id}')">
        Quiero este pack
      </button>
    `;

    container.appendChild(card);
  });
}

/* ── Grid renderer (used by SearchBar callback) ──────────────── */
function _renderGrid(products) {
  if (!_productsContainer) return;

  _productsContainer.innerHTML = '';

  /* Empty state */
  if (!products.length) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty';
    empty.innerHTML = `
      <div class="sf-empty-icon" aria-hidden="true">◯</div>
      <h3 class="sf-empty-title">Sin resultados</h3>
      <p class="sf-empty-desc">
        Intenta otros filtros o ajusta tu búsqueda
      </p>
      <button class="btn-ghost sf-empty-clear"
        onclick="window.__rd?.ui?.clearSearch?.()">
        Limpiar filtros →
      </button>
    `;
    _productsContainer.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  products.forEach((p, idx) => {
    const stockWarning =
      p.stock <= 3
        ? `<div class="card-stock">
             <span class="stock-dot"></span>${_stockText(p.stock)}
           </div>`
        : p.stock <= 5
          ? `<div class="card-stock" style="color:var(--accent)">
               <span class="stock-dot" style="background:var(--accent)"></span>
               ${_stockText(p.stock)}
             </div>`
          : '';

    const badgeClass =
      p.badge === 'ÚLTIMAS UNIDADES' || p.stock <= 2 ? 'danger'
        : p.badge === 'TRENDING' || p.badge === 'ALTA DEMANDA' ? 'trend'
          : '';

    const card = document.createElement('div');
    card.className             = 'product-card product-card--clickable fade-up';
    card.style.transitionDelay = `${idx * 0.05}s`;
    card.setAttribute('role',       'button');
    card.setAttribute('tabindex',   '0');
    card.setAttribute('aria-label', `Ver detalle de ${p.name}`);

    card.innerHTML = `
      ${p.badge ? `<span class="card-badge ${badgeClass}">${p.badge}</span>` : ''}
      <div class="card-img-wrap">
        <img src="${p.image}" alt="${p.name}" loading="lazy"
             onerror="this.style.opacity='0'">
      </div>
      <div class="card-body">
        <p class="card-house">${p.house}</p>
        <h3 class="card-name">${p.name}</h3>
        <p class="card-story">${p.story}</p>
        <div class="card-notes">
          ${p.notes.map(n => `<span class="note-tag">${n}</span>`).join('')}
        </div>
        ${stockWarning}
        <div class="sizes">
          <button class="size-btn"
            onclick="event.stopPropagation();window.__rd.cart.add('${p.id}', 3)">
            <span class="ml">3ml</span>
            <span class="price">$${p.prices[3]}</span>
            <span class="cta">Prueba</span>
          </button>
          <button class="size-btn popular"
            onclick="event.stopPropagation();window.__rd.cart.add('${p.id}', 5)">
            <span class="ml">5ml ⭐</span>
            <span class="price">$${p.prices[5]}</span>
            <span class="cta">Popular</span>
          </button>
          <button class="size-btn"
            onclick="event.stopPropagation();window.__rd.cart.add('${p.id}', 10)">
            <span class="ml">10ml</span>
            <span class="price">$${p.prices[10]}</span>
            <span class="cta">Full</span>
          </button>
        </div>
      </div>
    `;

    /* Click → modal */
    card.addEventListener('click', e => {
      if (e.target.closest('.size-btn')) return;
      openProductModal(p);
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
}

/* ── Helpers ─────────────────────────────────────────────────── */
function _stockText(stock) {
  if (stock <= 1) return 'Última unidad disponible';
  if (stock <= 3) return `Solo ${stock} unidades disponibles`;
  if (stock <= 5) return 'Alta demanda esta semana';
  return 'Disponible';
}
