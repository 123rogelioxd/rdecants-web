import { bootstrapShell } from '../core/shell.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker } from '../tracking/tracker.js';
import { formatPrice } from '../utils/prices.js';
import { productPageUrl } from '../ui/productPage.js';
import { primeImageStates } from '../ui/images.js';

const FILTERS = ['all', 'sealed', 'tester', 'partial'];

export function bottleConditionGroup(offer = {}) {
  const condition = String(offer.condition ?? '').toLowerCase();
  if (condition.includes('parcial')) return 'partial';
  if (condition.includes('tester')) return 'tester';
  return 'sealed';
}

export function filterBottleProducts(products = [], filter = 'all') {
  const selected = FILTERS.includes(filter) ? filter : 'all';
  return (Array.isArray(products) ? products : [])
    .filter(product => Array.isArray(product?.bottles) && product.bottles.length > 0)
    .filter(product => selected === 'all' || product.bottles.some(offer => bottleConditionGroup(offer) === selected));
}

export function bottleEntryPrice(product = {}) {
  const prices = (product.bottles ?? []).map(offer => Number(offer.price)).filter(price => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function bottleOfferTypes(product = {}) {
  const labels = new Map();
  (product.bottles ?? []).forEach(offer => labels.set(bottleConditionGroup(offer), offer.condition_label));
  return [...labels.values()].filter(Boolean);
}

globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();
  const grid = document.getElementById('perfumes-grid');
  const count = document.getElementById('perfumes-count');
  const retry = document.getElementById('perfumes-retry');
  if (!grid) return;

  let products = [];
  let filter = 'all';

  const load = async () => {
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = _skeletons();
    retry?.setAttribute('hidden', '');
    try {
      products = await CatalogProvider.getProducts();
      render();
      Tracker.emit('perfumes_view', { resultCount: filterBottleProducts(products).length });
    } catch {
      grid.innerHTML = _state('No pudimos cargar Perfumes', 'Revisa tu conexión e inténtalo de nuevo.');
      retry?.removeAttribute('hidden');
    }
  };

  const render = () => {
    const visible = filterBottleProducts(products, filter);
    grid.setAttribute('aria-busy', 'false');
    if (count) count.textContent = `${visible.length} ${visible.length === 1 ? 'fragancia' : 'fragancias'}`;
    grid.innerHTML = visible.length
      ? visible.map(_card).join('')
      : filter === 'all'
        ? _state('No hay botellas disponibles hoy', 'Vuelve pronto para ver las próximas fragancias completas.')
        : _state('No hay ofertas con este filtro', 'Prueba con Todos para ver las botellas disponibles hoy.');
    primeImageStates(grid);
  };

  document.querySelectorAll('[data-bottle-filter]').forEach(button => {
    button.addEventListener('click', () => {
      filter = button.dataset.bottleFilter;
      document.querySelectorAll('[data-bottle-filter]').forEach(candidate => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });
  retry?.addEventListener('click', load);
  await load();
});

function _card(product) {
  const price = bottleEntryPrice(product);
  const types = bottleOfferTypes(product);
  const url = productPageUrl(product);
  return `
    <article class="bottle-card">
      <a class="bottle-card-link" href="${_escape(url)}" aria-label="Ver botellas de ${_escape(product.name)}">
        <div class="bottle-card-image${product.image ? '' : ' img-shell img-failed'}">
          ${product.image ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" width="500" height="625" loading="lazy" decoding="async">` : ''}
        </div>
        <div class="bottle-card-body">
          <p class="bottle-card-house">${_escape(product.house)}</p>
          <h2 class="bottle-card-name">${_escape(product.name)}</h2>
          <p class="bottle-card-price">${price ? `Desde ${formatPrice(price)}` : 'Consulta disponibilidad'}</p>
          <div class="bottle-card-types" aria-label="Tipos de oferta">
            ${types.map(label => `<span>${_escape(label)}</span>`).join('')}
          </div>
          <span class="btn-primary bottle-card-cta">Ver ofertas</span>
        </div>
      </a>
    </article>`;
}

function _skeletons() {
  return Array.from({ length: 6 }, () => '<div class="card-skeleton" aria-hidden="true"></div>').join('');
}

function _state(title, description) {
  return `<div class="catalog-empty premium-empty"><div class="sf-empty-icon" aria-hidden="true">R</div><h2 class="sf-empty-title">${title}</h2><p class="sf-empty-desc">${description}</p></div>`;
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
