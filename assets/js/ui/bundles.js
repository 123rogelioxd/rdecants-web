/* =============================================================
   RDECANTS — SMART BUNDLES (UI)
   Renders dynamically-generated kits. Logic lives in
   recommendations/bundles.js; this file only renders + wires.
   ============================================================= */

import { generateBundles } from '../recommendations/bundles.js?v=1.0.13';
import { CatalogProvider } from '../providers/catalog.js?v=1.0.13';
import { Tracker } from '../tracking/tracker.js';
import { openProductModal } from './modal.js?v=1.0.13';
import { primeImageStates } from './images.js';
import { getDefaultVariant, formatPrice } from '../utils/prices.js?v=1.0.13';

let _root = null;
let _bundles = [];

export async function setupBundles(containerId = 'smart-bundles') {
  _root = document.getElementById(containerId);
  if (!_root) return;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  _bundles = generateBundles(products);

  if (!_bundles.length) {
    _root.hidden = true;
    return;
  }

  _render(_bundles);
}

function _render(bundles) {
  _root.hidden = false;
  _root.innerHTML = `
    <div class="container">
      <div class="section-header fade-up">
        <div>
          <p class="section-label">Kits inteligentes</p>
          <h2 class="section-title">Listos<br><em>para combinar</em></h2>
        </div>
        <p style="font-size:12px;color:var(--muted);max-width:240px;line-height:1.7;">
          Selecciones armadas en vivo según mood, ocasión y disponibilidad real.
        </p>
      </div>
      <div class="bundle-grid">
        ${bundles.map(_bundleCard).join('')}
      </div>
    </div>
  `;

  primeImageStates(_root);
  Tracker.recommendationView(
    bundles.flatMap(b => b.items),
    { railId: 'smart_bundles', railTitle: 'Kits inteligentes' },
  );
  _bind();
}

function _bundleCard(bundle) {
  return `
    <article class="bundle-card fade-up" data-bundle-id="${bundle.id}">
      <header class="bundle-head">
        <h3 class="bundle-title">${bundle.title}</h3>
        <p class="bundle-desc">${bundle.description}</p>
      </header>

      <div class="bundle-items">
        ${bundle.items.map(_bundleItem).join('')}
      </div>

      <p class="bundle-why"><span>Por qué funciona</span>${bundle.why}</p>

      <div class="bundle-foot">
        <div class="bundle-total">
          <span class="bundle-total-label">Total del kit</span>
          <strong class="bundle-total-amount">${formatPrice(bundle.total)}</strong>
        </div>
        <button class="btn-primary bundle-add" data-bundle-id="${bundle.id}"
          aria-label="Agregar el ${bundle.title} al carrito">Agregar kit</button>
      </div>
    </article>
  `;
}

function _bundleItem(product) {
  const variant = getDefaultVariant(product);
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <button class="bundle-item" data-product-id="${product.id}" aria-label="Ver ${product.name}">
      <span class="bundle-item-img">
        ${hasImage
          ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('bundle-item-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="bundle-item-info">
        <span class="bundle-item-house">${product.house ?? ''}</span>
        <span class="bundle-item-name">${product.name}</span>
        <span class="bundle-item-price">${variant ? `${formatPrice(variant.price)} · ${variant.size}ml` : 'Consultar'}</span>
      </span>
    </button>
  `;
}

function _bind() {
  _root.querySelectorAll('.bundle-card').forEach(card => {
    const bundle = _bundles.find(b => b.id === card.dataset.bundleId);
    if (!bundle) return;

    card.querySelectorAll('.bundle-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const product = bundle.items.find(p => String(p.id) === itemEl.dataset.productId);
        if (product) openProductModal(product);
      });
    });

    card.querySelector('.bundle-add')?.addEventListener('click', () => _addBundle(bundle));
  });
}

async function _addBundle(bundle) {
  let added = 0;
  for (const product of bundle.items) {
    const variant = getDefaultVariant(product);
    if (!variant) continue;
    Tracker.recommendationClicked(product, added + 1, { railId: `bundle_${bundle.id}`, railTitle: bundle.title });
    // eslint-disable-next-line no-await-in-loop
    await window.__rd?.cart?.add(product.id, variant.size);
    added += 1;
  }
  if (added) window.__rd?.ui?.openCart?.();
}
