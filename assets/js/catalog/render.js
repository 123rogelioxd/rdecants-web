/* =============================================================
   RDECANTS — CATALOG RENDERER
   Renders featured product, product grid, and packs.
   Data comes exclusively from CatalogProvider.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }         from '../tracking/tracker.js';

/* ── Featured ────────────────────────────────────────────────── */
export async function renderFeatured() {
  const featured = await CatalogProvider.getFeatured();
  const el       = document.getElementById('featured-product');
  if (!el || !featured) return;

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
  const container = document.getElementById('products-grid');
  if (!container) return;

  const products = await CatalogProvider.getProducts();
  container.innerHTML = '';

  products.forEach((p, idx) => {
    Tracker.productView(p);

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
        : p.badge === 'TRENDING'     || p.badge === 'ALTA DEMANDA' ? 'trend'
          : '';

    const card = document.createElement('div');
    card.className   = 'product-card fade-up';
    card.style.transitionDelay = `${idx * 0.06}s`;

    card.innerHTML = `
      ${p.badge ? `<span class="card-badge ${badgeClass}">${p.badge}</span>` : ''}
      <div class="card-img-wrap">
        <img src="${p.image}" alt="${p.name}" loading="lazy">
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
            onclick="window.__rd.cart.add('${p.id}', 3)">
            <span class="ml">3ml</span>
            <span class="price">$${p.prices[3]}</span>
            <span class="cta">Prueba</span>
          </button>
          <button class="size-btn popular"
            onclick="window.__rd.cart.add('${p.id}', 5)">
            <span class="ml">5ml ⭐</span>
            <span class="price">$${p.prices[5]}</span>
            <span class="cta">Popular</span>
          </button>
          <button class="size-btn"
            onclick="window.__rd.cart.add('${p.id}', 10)">
            <span class="ml">10ml</span>
            <span class="price">$${p.prices[10]}</span>
            <span class="cta">Full</span>
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

/* ── Packs ───────────────────────────────────────────────────── */
export async function renderPacks() {
  const container = document.getElementById('packs-grid');
  if (!container) return;

  const packs = await CatalogProvider.getPacks();
  container.innerHTML = '';

  packs.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className   = 'pack-card fade-up';
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

/* ── Helpers ─────────────────────────────────────────────────── */
function _stockText(stock) {
  if (stock <= 1) return 'Última unidad disponible';
  if (stock <= 3) return `Solo ${stock} unidades disponibles`;
  if (stock <= 5) return 'Alta demanda esta semana';
  return 'Disponible';
}
