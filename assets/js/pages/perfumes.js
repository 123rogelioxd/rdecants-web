import { bootstrapShell } from '../core/shell.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker } from '../tracking/tracker.js';
import { formatPrice } from '../utils/prices.js';
import { Cart } from '../cart/cart.js';
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

/**
 * What this card's black button does, and what it says.
 *
 * The rule lives in R Supply OS, next to the inventory that decides it; this
 * only reads the answer. One purchasable is not a choice — it is the answer —
 * so the button buys it. Two or more and the button asks which, because a
 * button that silently picks one is picking a size and a price for somebody.
 */
export function bottleAffordance(product = {}) {
  return product.purchase?.bottles ?? { mode: 'sold_out', cta: null, count: 0, direct: null, sizes: [], choices: [] };
}

/**
 * The buying line under the name.
 *
 * "Desde $1,990 / Nuevo sellado" told a customer the least useful half of what
 * the shop knows. With one bottle on the shelf the card can say exactly what
 * it is — "100 ml · Nuevo sellado" — and with several it can say which sizes
 * are on offer instead of making the size a surprise on the next page.
 */
export function bottlePresentationLine(product = {}) {
  const affordance = bottleAffordance(product);

  if (affordance.mode === 'add_to_cart' && affordance.direct) {
    return affordance.direct.presentation || affordance.direct.size_label || '';
  }

  const sizes = (affordance.sizes ?? []).filter(size => Number.isFinite(size) && size > 0);
  const conditions = affordance.condition_labels ?? bottleOfferTypes(product);

  if (!sizes.length) return conditions.join(' · ');

  return [sizes.map(size => `${size} ml`).join(' / '), conditions.join(' · ')]
    .filter(Boolean)
    .join(' · ');
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

  // Click → cart, with no page in between. Delegated so it survives every
  // re-render the filters trigger.
  grid.addEventListener('click', async event => {
    const picker = event.target.closest('[data-toggle-picker]');

    if (picker) {
      const card = picker.closest('.bottle-card');
      const box = card?.querySelector('[data-picker]');
      if (!box) return;
      const open = box.hidden;
      box.hidden = !open;
      picker.setAttribute('aria-expanded', String(open));
      return;
    }

    const button = event.target.closest('[data-add-offer]');
    if (!button) return;

    const offerKey = button.dataset.addOffer;
    const productId = button.dataset.product;
    if (!offerKey || !productId) return;

    button.disabled = true;
    const original = button.textContent;
    try {
      const added = await Cart.addBottle(productId, offerKey);
      if (added) button.textContent = 'Agregado ✓';
      // Feedback on the button itself: the cart drawer already announces the
      // add, and a customer who is scanning a grid should not have to look
      // away from the card they just pressed to know it worked.
      //
      // No event is emitted here on purpose. `Cart.addBottle` already fires
      // `bottle_added_to_cart` for every successful add, wherever it came
      // from, and a second name for one action would either double-count it or
      // — being absent from API_EVENT_MAP — go nowhere at all.
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 1400);
    }
  });

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

/**
 * One bottle on the shelf is one click.
 *
 * The card used to be a single link wrapping everything, with a black button
 * that only ever navigated. That is the right shape when there is a choice to
 * make and the wrong one when there is not: a customer pressing the black
 * button has already decided, and sending them to a product page to pick from
 * a list of one is pure friction.
 *
 * So the image and the name stay a link — for the people who came to read
 * about it — and the button becomes a real button whose job depends on what
 * the shelf holds.
 */
function _card(product) {
  const affordance = bottleAffordance(product);
  const price = affordance.mode === 'add_to_cart' && affordance.direct
    ? affordance.direct.price
    : bottleEntryPrice(product);
  const url = productPageUrl(product);
  const direct = affordance.mode === 'add_to_cart' && affordance.direct;

  return `
    <article class="bottle-card" data-product="${_escape(product.id)}">
      <a class="bottle-card-link" href="${_escape(url)}" aria-label="Ver ${_escape(product.name)}">
        <div class="bottle-card-image${product.image ? '' : ' img-shell img-failed'}">
          ${product.image ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" width="500" height="625" loading="lazy" decoding="async">` : ''}
        </div>
        <div class="bottle-card-body">
          <p class="bottle-card-house">${_escape(product.house)}</p>
          <h2 class="bottle-card-name">${_escape(product.name)}</h2>
          <p class="bottle-card-presentation">${_escape(bottlePresentationLine(product))}</p>
          <p class="bottle-card-price">${price
            ? (direct ? formatPrice(price) : `Desde ${formatPrice(price)}`)
            : 'Consulta disponibilidad'}</p>
        </div>
      </a>
      <div class="bottle-card-actions">
        ${_cta(product, affordance)}
      </div>
      <div class="bottle-card-picker" data-picker hidden>
        ${(affordance.choices ?? []).map(choice => `
          <button type="button" class="bottle-card-choice"
            data-add-offer="${_escape(choice.offer_key ?? '')}"
            data-product="${_escape(product.id)}">
            <span>${_escape(choice.presentation || choice.size_label || '')}</span>
            <strong>${formatPrice(choice.price)}</strong>
          </button>`).join('')}
      </div>
    </article>`;
}

function _cta(product, affordance) {
  if (affordance.mode === 'sold_out') {
    return '<button type="button" class="btn-primary bottle-card-cta" disabled>Agotado</button>';
  }

  if (affordance.mode === 'add_to_cart' && affordance.direct?.offer_key) {
    return `<button type="button" class="btn-primary bottle-card-cta"
      data-add-offer="${_escape(affordance.direct.offer_key)}"
      data-product="${_escape(product.id)}"
      aria-label="Agregar ${_escape(product.name)}, ${_escape(affordance.direct.presentation ?? '')}, al carrito">
      ${_escape(affordance.cta)}
    </button>`;
  }

  return `<button type="button" class="btn-primary bottle-card-cta" data-toggle-picker
    aria-expanded="false" aria-label="Elegir presentación de ${_escape(product.name)}">
    ${_escape(affordance.cta)}
  </button>`;
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
