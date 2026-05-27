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
      <div class="bundle-section-head fade-up">
        <div>
          <p class="section-label">Colecciones curadas</p>
          <h2 class="section-title">Kits<br><em>inteligentes</em></h2>
        </div>
        <p class="bundle-section-copy">
          Menos exploracion, mas intencion: cada kit combina mood, ocasion, ambiente y stock real.
        </p>
      </div>
      <div class="bundle-editorial-grid">
        ${bundles.map(_bundleCard).join('')}
      </div>
    </div>
  `;

  primeImageStates(_root);
  Tracker.recommendationView(
    bundles.flatMap(b => b.items),
    { railId: 'smart_bundles', railTitle: 'Kits inteligentes' },
  );
  bundles.forEach(bundle => Tracker.bundleViewed(bundle));
  _bind();
}

function _bundleCard(bundle) {
  const hero = bundle.items[0];
  const supporting = bundle.items.slice(1);
  const heroVariant = hero ? getDefaultVariant(hero, bundle.itemSize) : null;
  const hasHeroImage = hero?.image && hero.image.trim() !== '';

  return `
    <article class="bundle-card fade-up" data-bundle-id="${bundle.id}">
      <div class="bundle-hero">
        <button class="bundle-hero-img" data-product-id="${hero?.id ?? ''}" aria-label="Ver ${hero?.name ?? bundle.title}">
          ${hasHeroImage
            ? `<img src="${hero.image}" alt="${hero.name}" loading="lazy" decoding="async"
                 onerror="this.parentElement.classList.add('bundle-hero-img--fallback');this.remove()">`
            : ''}
        </button>
        <div class="bundle-savings-badge">
          <span>Ahorra</span>
          <strong>${formatPrice(bundle.savings, '$0 MXN')}</strong>
        </div>
      </div>

      <div class="bundle-copy">
        <p class="bundle-mood">${_bundleMood(bundle.id)}</p>
        <h3 class="bundle-title">${bundle.title}</h3>
        <p class="bundle-desc">${bundle.description}</p>
        <p class="bundle-why"><span>Por que funciona</span>${bundle.why}</p>

        ${hero ? `
          <button class="bundle-feature" data-product-id="${hero.id}" aria-label="Ver ${hero.name}">
            <span>${hero.house}</span>
            <strong>${hero.name}</strong>
            <small>${heroVariant ? `${formatPrice(heroVariant.price)} · ${heroVariant.size}ml` : 'Consultar'}</small>
          </button>
        ` : ''}

        <div class="bundle-items">
          ${supporting.map(product => _bundleItem(product, bundle)).join('')}
        </div>
      </div>

      <div class="bundle-foot">
        <div class="bundle-total">
          <span class="bundle-total-label">Valor separado</span>
          <span class="bundle-total-original">${formatPrice(bundle.originalTotal)}</span>
          <span class="bundle-total-label">Precio del kit</span>
          <strong class="bundle-total-amount">${formatPrice(bundle.total)}</strong>
        </div>
        <button class="btn-primary bundle-add" data-bundle-id="${bundle.id}"
          aria-label="Agregar el ${bundle.title} al carrito">Agregar kit</button>
      </div>
    </article>
  `;
}

function _bundleItem(product, bundle = {}) {
  const variant = getDefaultVariant(product, bundle.itemSize);
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

    card.querySelectorAll('.bundle-item, .bundle-feature, .bundle-hero-img').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const product = bundle.items.find(p => String(p.id) === itemEl.dataset.productId);
        if (product) openProductModal(product);
      });
    });

    card.querySelector('.bundle-add')?.addEventListener('click', () => _addBundle(bundle));
  });
}

async function _addBundle(bundle) {
  Tracker.bundleAdded(bundle);
  bundle.items.forEach((product, index) => {
    Tracker.recommendationClicked(product, index + 1, { railId: `bundle_${bundle.id}`, railTitle: bundle.title });
  });
  await window.__rd?.cart?.addBundle?.(bundle);
  window.__rd?.ui?.openCart?.();
}

function _bundleMood(id) {
  const labels = {
    'calor-tropical': 'Ambiente: calor / terraza / playa',
    'oficina-clean': 'Mood: limpio / profesional',
    'seduccion-nocturna': 'Ocasion: noche / cita',
    'fresh-luxury': 'Personalidad: lujo fresco',
    'arabic-intensity': 'Presencia: intensa / envolvente',
  };
  return labels[id] ?? 'Seleccion editorial';
}
