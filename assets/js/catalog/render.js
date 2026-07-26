/* =============================================================
   RDECANTS — CATALOG RENDERER
   Renders the product grid. Data comes exclusively from CatalogProvider.

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
import { primeImageStates } from '../ui/images.js';
import { getDisplayVariant,
         formatPrice }      from '../utils/prices.js';
import { getScarcityDisplay } from '../utils/scarcity.js';
import { getDisplayBadges }  from '../utils/guidance.js';

/* module-level ref kept for SearchBar callback */
let _productsContainer = null;

/* Incremental catalog rendering. The grid never paints the whole result set at
   once: it renders an initial batch (viewport-aware) and appends the next batch
   on "Ver más perfumes". This applies in EVERY state — default browse, filtered,
   and guided — so no long list (50 products, or a 30-match guided view) is ever
   dumped in one paint. Each fresh render (filter/guide change) resets the
   visible count to the initial batch; the guided top pick is first, so it is
   always in that first batch. */
const CATALOG_INITIAL_MOBILE  = 8;
const CATALOG_INITIAL_DESKTOP = 12;
const CATALOG_STEP_MOBILE  = 8;
const CATALOG_STEP_DESKTOP = 12;

let _lastCatalogProducts = [];
let _visibleCount = 0;
/* Render context carried between the initial paint and incremental appends so
   "Ver más" builds identical cards (incl. the guided top-pick treatment). */
let _renderCtx = { guided: null, recById: null };
let _catalogResizeBound = false;
let _lastMobileCatalogState = null;

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

  /* SearchBar handles the first and all subsequent renders. In guided mode it
     passes ranking meta so the grid pins the finder's top pick and shows the
     editorial state header + contextual kit prompt. */
  SearchBar.init(products, (filtered, meta) => {
    _renderGrid(filtered, { guided: meta?.guided ? meta : null });
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

/* ── Grid renderer (used by SearchBar callback) ──────────────── */
function _renderGrid(products, { rememberProducts = true, guided = null, preserveVisible = false } = {}) {
  if (!_productsContainer) return;

  _removeShowMore();

  /* Guided-mode chrome (editorial state header + contextual kit) is torn down
     and rebuilt each render so a return to the plain catalog is always clean. */
  _syncGuideState(guided, products.length);

  _productsContainer.innerHTML = '';
  const catalogProducts = normalizeCatalogProducts(products);
  if (rememberProducts) _lastCatalogProducts = catalogProducts;

  /* Empty state */
  if (!catalogProducts.length) {
    _syncKitPrompt(null);
    const empty = document.createElement('div');
    empty.className = 'sf-empty premium-empty';
    empty.innerHTML = guided
      ? `
        <div class="sf-empty-icon" aria-hidden="true">R</div>
        <h3 class="sf-empty-title">Aún no hay un match exacto</h3>
        <p class="sf-empty-desc">Ajusta tus respuestas o explora toda la colección.</p>
        <button class="btn-ghost sf-empty-clear" onclick="window.__rd?.ui?.clearGuide?.()">
          Ver todo el catálogo
        </button>`
      : `
        <div class="sf-empty-icon" aria-hidden="true">R</div>
        <h3 class="sf-empty-title">Sin match perfecto</h3>
        <p class="sf-empty-desc">Intenta otros filtros o ajusta tu búsqueda</p>
        <button class="btn-ghost sf-empty-clear" onclick="window.__rd?.ui?.clearSearch?.()">
          Limpiar filtros →
        </button>`;
    _productsContainer.appendChild(empty);
    return;
  }

  /* Reason lookup for the guided top pick (one honest, deterministic line).
     Kept on _renderCtx so incremental appends build identical cards. */
  const recById = guided?.recommendations
    ? new Map(guided.recommendations.map(r => [String(r.product.id), r]))
    : null;
  _renderCtx = { guided, recById };

  const total = catalogProducts.length;
  const initial = getInitialVisible(_isMobileCatalog());
  /* Fresh render (filter/guide change) → back to the initial batch. On a resize
     re-render we keep whatever the customer had already revealed. */
  _visibleCount = preserveVisible
    ? Math.min(Math.max(_visibleCount, initial), total)
    : Math.min(initial, total);

  const frag = document.createDocumentFragment();
  getVisibleProducts(catalogProducts, _visibleCount)
    .forEach((p, idx) => frag.appendChild(_buildCard(p, idx, _renderCtx)));

  _productsContainer.appendChild(frag);
  primeImageStates(_productsContainer);

  _syncLoadMore(total);

  /* Contextual kit prompt — only after a guided recommendation, never as a
     standing homepage section. */
  _syncKitPrompt(guided);
}

/* Build a single product card node. Shared by the initial paint and by
   incremental "Ver más" appends so every card is identical, including the
   guided top-pick treatment. `absoluteIndex` is the card's position in the full
   list (used only for a small, capped stagger). */
function _buildCard(p, absoluteIndex, { guided, recById } = {}) {
  const displayVariant = getDisplayVariant(p);
  const priceHtml = displayVariant
    ? `${formatPrice(displayVariant.price)} <small>${displayVariant.size}ml</small>`
    : 'Consultar precio';
  const stockState = getScarcityDisplay(p);
  const isSoldOut = stockState.state === 'sold_out';
  const canQuickAdd = !isSoldOut && _isOrderableVariant(displayVariant);

  /* Card face reduced to essentials (image · house · name · one fit signal ·
     price · action). Concentration lives in the display name and gender is a
     filter, so neither clutters the card. Exactly one signal is shown:
       • the guided reason line for the top pick, or
       • one guidance chip (scent/occasion) describing fit.
     Availability is deliberately NOT shown inline — only a genuinely urgent
     state (sold out / last units) earns the corner badge, so scarcity stays
     rare and honest instead of firing on every low-stock SKU. */
  const rec = recById?.get(String(p.id));
  const isTop = Boolean(guided && rec?.isTop);
  const guidanceBadge = getDisplayBadges(p, { context: 'catalog_card' })[0];
  const isUrgent = stockState.state === 'sold_out' || stockState.state === 'last_units';
  const guidanceHtml = guidanceBadge
    ? `<div class="card-guidance" aria-label="Ideal para"><span class="guidance-chip guidance-chip--${guidanceBadge.key}">${guidanceBadge.label}</span></div>`
    : '';
  const whyHtml = isTop && rec?.reasons?.length
    ? `<p class="card-why">${rec.reasons[0]}</p>`
    : '';

  const card = document.createElement('div');
  card.className             = `product-card product-card--clickable fade-up visible${isTop ? ' product-card--top' : ''}`;
  /* Cap the stagger so late batches never wait on a long transition delay. */
  card.style.transitionDelay = `${Math.min(absoluteIndex, 8) * 0.04}s`;
  card.setAttribute('role',       'button');
  card.setAttribute('tabindex',   '0');
  card.setAttribute('aria-label', `Ver detalle de ${p.name}`);

  card.innerHTML = `
    ${isTop ? '<span class="card-top-flag">Nuestra recomendación</span>' : ''}
    ${!isTop && isUrgent ? `<span class="card-badge ${stockState.badgeClass}">${stockState.label}</span>` : ''}
    <div class="card-img-wrap${p.image ? '' : ' img-shell img-failed'}" style="--img-initial:${_brandInitialCss(p)}">
      ${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">` : ''}
    </div>
    <div class="card-body">
      <p class="card-house">${p.house}</p>
      <h3 class="card-name">${p.name}</h3>
      ${whyHtml}
      ${guidanceHtml}
      <div class="card-purchase">
        <p class="card-price">${priceHtml}</p>
        <button class="btn-primary card-action"
          ${isSoldOut ? 'disabled aria-disabled="true"' : ''}
          aria-label="${isSoldOut ? `${p.name} agotado` : canQuickAdd ? `Agregar ${p.name} al carrito` : `Consultar disponibilidad de ${p.name}`}">
          ${isSoldOut ? 'Agotado' : canQuickAdd ? 'Agregar' : 'Consultar'}
        </button>
      </div>
    </div>
  `;

  card.querySelector('.card-action')?.addEventListener('click', e => {
    e.stopPropagation();
    if (isSoldOut) return;
    if (canQuickAdd) {
      /* No auto-open — the add toast ("Ver carrito") keeps browsing uninterrupted. */
      window.__rd?.cart?.add(p.id, displayVariant.size);
    } else {
      openProductModal(p);
    }
    Tracker.productClicked(p, canQuickAdd ? 'quick_add' : 'card_action');
  });

  card.addEventListener('click', e => {
    if (e.target.closest('.card-action')) return;
    openProductModal(p);
    const activeQuery = SearchBar.getState().query;
    if (activeQuery) Tracker.searchResultClicked(p, activeQuery, absoluteIndex);
    Tracker.productClicked(p, 'grid');
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProductModal(p);
    }
  });

  return card;
}

/* ── Guided-mode chrome ──────────────────────────────────────── */

const _FAMILY_LABELS = { fresco: 'Fresco', dulce: 'Dulce', intenso: 'Intenso', elegante: 'Elegante' };
const _OCCASION_LABELS = { dia: 'Diario', diario: 'Diario', noche: 'Noche', oficina: 'Oficina', cita: 'Cita', fiesta: 'Fiesta' };
const _GENDER_LABELS = { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Unisex' };

function _guideAnswerLabels(answers = {}) {
  return [
    _FAMILY_LABELS[answers.family],
    _OCCASION_LABELS[answers.occasion],
    _GENDER_LABELS[answers.gender],
  ].filter(Boolean);
}

/* Editorial state header above the grid: "Para ti · Fresco · Diario · N
   fragancias" with Ajustar (reopen the finder) and Ver todo (exit guided). */
function _syncGuideState(guided, count = 0) {
  document.getElementById('catalog-guide-state')?.remove();
  if (!guided) return;

  const labels = _guideAnswerLabels(guided.answers);
  const noun = count === 1 ? 'fragancia' : 'fragancias';
  const el = document.createElement('div');
  el.id = 'catalog-guide-state';
  el.className = 'catalog-guide-state';
  el.innerHTML = `
    <div class="cgs-info">
      <span class="cgs-kicker">Para ti</span>
      ${labels.length ? `<span class="cgs-answers">${labels.join(' · ')}</span>` : ''}
      <span class="cgs-count">${count} ${noun}</span>
    </div>
    <div class="cgs-actions">
      <button type="button" class="cgs-adjust" id="cgs-adjust">Ajustar</button>
      <button type="button" class="cgs-clear" id="cgs-clear">Ver todo</button>
    </div>`;
  _productsContainer.insertAdjacentElement('beforebegin', el);

  el.querySelector('#cgs-clear')?.addEventListener('click', () => window.__rd?.ui?.clearGuide?.());
  el.querySelector('#cgs-adjust')?.addEventListener('click', () => {
    /* The questions live on their own page now; only scroll in place if a
       guide bar happens to be mounted on this page. */
    const inPage = document.getElementById('guide');
    if (inPage) inPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.location.href = '/elegir.html';
  });
}

/* Contextual kit prompt after guided results. Rendered by the kits module so
   all kit logic (resolve, sellability, add-to-cart) stays in one place. */
function _syncKitPrompt(guided) {
  const existing = document.getElementById('catalog-kit-prompt');
  if (!guided) { existing?.remove(); return; }

  let slot = existing;
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'catalog-kit-prompt';
    slot.className = 'catalog-kit-prompt';
    const anchor = document.getElementById('catalog-more') || _productsContainer;
    anchor.insertAdjacentElement('afterend', slot);
  }

  import('../ui/discoverySets.js')
    .then(({ renderContextualKit }) => renderContextualKit?.(slot, guided.answers))
    .catch(() => { slot.remove(); });
}

/* ── Incremental "Ver más perfumes" ──────────────────────────── */

/* Show / update the load-more control. Present in ANY state (default, filtered,
   guided) whenever there are more products than are currently painted. */
function _syncLoadMore(total) {
  _removeShowMore();
  _lastMobileCatalogState = _isMobileCatalog();
  _ensureCatalogCapResizeSync();

  if (_visibleCount >= total) return;

  const shown = getCatalogShown(total, _visibleCount);
  const wrap = document.createElement('div');
  wrap.className = 'catalog-more catalog-more-panel';
  wrap.id        = 'catalog-more';
  wrap.innerHTML = `
    <p class="catalog-more-count catalog-count" id="catalog-more-count">Mostrando ${shown} de ${total} perfumes</p>
    <button type="button" class="catalog-more-btn" id="catalog-more-btn" aria-label="Ver más perfumes">
      Ver más perfumes
    </button>`;

  _productsContainer.insertAdjacentElement('afterend', wrap);
  wrap.querySelector('#catalog-more-btn')?.addEventListener('click', _loadMore);
}

/* Append the next batch — never re-render or paint the whole list. Preserves the
   current view (finder ranking / filters), the guided top-pick treatment and
   every already-rendered card. */
function _loadMore() {
  const list = normalizeCatalogProducts(_lastCatalogProducts);
  const total = list.length;
  if (!total || _visibleCount >= total) { _removeShowMore(); return; }

  const before = _visibleCount;
  _visibleCount = Math.min(before + getCatalogStep(_isMobileCatalog()), total);

  const frag = document.createDocumentFragment();
  list.slice(before, _visibleCount)
    .forEach((p, i) => frag.appendChild(_buildCard(p, before + i, _renderCtx)));
  _productsContainer.appendChild(frag);
  primeImageStates(_productsContainer);
  observeFadeUp();

  Tracker.catalogExpanded(total, before);
  _syncLoadMore(total);
}

function _removeShowMore() {
  document.getElementById('catalog-more')?.remove();
}

/* When the viewport crosses the mobile/desktop boundary the initial batch size
   changes; re-render the current view (preserving how much the customer has
   already revealed and any guided ranking). */
function _ensureCatalogCapResizeSync() {
  if (_catalogResizeBound || typeof window === 'undefined') return;
  _catalogResizeBound = true;
  window.addEventListener('resize', () => {
    const isMobile = _isMobileCatalog();
    if (isMobile === _lastMobileCatalogState) return;
    _lastMobileCatalogState = isMobile;
    if (_lastCatalogProducts.length) {
      _renderGrid(_lastCatalogProducts, {
        rememberProducts: false,
        guided: _renderCtx.guided,
        preserveVisible: true,
      });
    }
  });
}

function _isMobileCatalog() {
  return Boolean(globalThis.matchMedia?.('(max-width: 768px)').matches);
}

/* ── Pure incremental helpers (DOM-free, unit-tested) ────────── */

/* Initial batch painted before any "Ver más": smaller on mobile, larger on
   desktop, so neither viewport ever gets the whole 50-card list at once. */
export function getInitialVisible(isMobile) {
  return isMobile ? CATALOG_INITIAL_MOBILE : CATALOG_INITIAL_DESKTOP;
}

/* How many more cards each "Ver más" reveals. */
export function getCatalogStep(isMobile) {
  return isMobile ? CATALOG_STEP_MOBILE : CATALOG_STEP_DESKTOP;
}

/* The slice actually rendered for a given visible count. */
export function getVisibleProducts(products, visibleCount) {
  const list = normalizeCatalogProducts(products);
  if (!Number.isFinite(visibleCount)) return list;
  return list.slice(0, Math.max(0, visibleCount));
}

/* Count shown in "Mostrando X de Y" — never more than the total. */
export function getCatalogShown(total, visibleCount) {
  const t = Math.max(0, Number(total) || 0);
  if (!Number.isFinite(visibleCount)) return t;
  return Math.min(Math.max(0, visibleCount), t);
}

/* Whether a "Ver más" control is still needed. */
export function hasMoreToShow(total, visibleCount) {
  const t = Math.max(0, Number(total) || 0);
  return getCatalogShown(t, visibleCount) < t;
}

export function normalizeCatalogProducts(products) {
  return Array.isArray(products) ? products.filter(Boolean) : [];
}

/* ── Helpers ─────────────────────────────────────────────────── */

/* CSS `content` value for the image fallback monogram. When a product photo
   is missing or fails to load, the placeholder shows the house's initial
   (e.g. "C" for Chanel) instead of a generic "R", so the rare fallback reads
   as intentional and product-specific rather than a database default. */
function _brandInitialCss(p) {
  const source = String(p?.house || p?.name || 'R').trim();
  const ch = source.charAt(0).toUpperCase();
  const safe = /[A-Z0-9À-Ý]/.test(ch) ? ch : 'R';
  return `'${safe}'`;
}


export function genderLabel(gender) {
  const labels = {
    masculine: 'Hombre',
    hombre: 'Hombre',
    male: 'Hombre',
    feminine: 'Mujer',
    mujer: 'Mujer',
    female: 'Mujer',
    unisex: 'Unisex',
    unisex_masculine: 'Unisex masc.',
    unisex_feminine: 'Unisex fem.',
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
