/* =============================================================
   RDECANTS â€” PRODUCT DETAIL MODAL
   Opens a luxury detail sheet for any catalog product.

   Public API (also exposed on window.__rd.ui):
     openProductModal(product)   â€” receives a mapped product obj
     closeProductModal()

   Design rules:
     â€¢ Tokens only â€” no hardcoded colors or sizes
     â€¢ Vanilla JS â€” no frameworks
     â€¢ Accessible: focus-trap, ESC, aria-modal
     â€¢ Safe: image fallback if src missing/broken
   ============================================================= */

import { showToast } from './toast.js';
import { primeImageStates } from './images.js';
import { Tracker } from '../tracking/tracker.js';
import { getDefaultVariant,
         getPriceForSize,
         getDisplayVariant,
         getVariantForSize,
         getValidVariants,
         formatPrice } from '../utils/prices.js?v=1.0.13';

/* â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let _activeProduct  = null;
let _selectedSize   = 5;          /* default size */
let _prevFocus      = null;       /* restore focus on close */

/* â”€â”€ DOM refs (created once, reused) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let _overlay, _modal;

/* â”€â”€ Build DOM (once) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _ensureDOM() {
  if (_overlay) return;

  /* Overlay */
  _overlay = document.createElement('div');
  _overlay.id          = 'pdm-overlay';
  _overlay.className   = 'pdm-overlay';
  _overlay.setAttribute('aria-hidden', 'true');
  _overlay.addEventListener('click', _handleOverlayClick);

  /* Modal shell */
  _modal = document.createElement('div');
  _modal.id                  = 'pdm-modal';
  _modal.className           = 'pdm-modal';
  _modal.setAttribute('role', 'dialog');
  _modal.setAttribute('aria-modal', 'true');
  _modal.setAttribute('aria-labelledby', 'pdm-name');

  _overlay.appendChild(_modal);
  document.body.appendChild(_overlay);

  /* Global keyboard listener */
  document.addEventListener('keydown', _handleKey);
}

/* â”€â”€ Open â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export function openProductModal(product) {
  if (!product) return;

  _ensureDOM();

  _activeProduct = product;
  _selectedSize  = _defaultSize(product);
  _prevFocus     = document.activeElement;

  Tracker.productViewed(product);
  _render();

  requestAnimationFrame(() => {
    _overlay.classList.add('pdm-overlay--open');
    _modal.classList.add('pdm-modal--open');
  });

  document.body.style.overflow = 'hidden';

  /* Focus the close button after transition */
  setTimeout(() => {
    _modal.querySelector('.pdm-close')?.focus();
  }, 320);
}

/* â”€â”€ Close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export function closeProductModal() {
  if (!_overlay) return;

  _overlay.classList.remove('pdm-overlay--open');
  _modal.classList.remove('pdm-modal--open');
  document.body.style.overflow = '';

  /* Restore focus */
  _prevFocus?.focus?.();
  _prevFocus    = null;
  _activeProduct = null;
}

/* â”€â”€ Render modal content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _render() {
  const p = _activeProduct;
  if (!p || !_modal) return;

  const variants = getValidVariants(p);
  const activeVariant = variants.find(v => v.size === _selectedSize) || getDefaultVariant(p) || getDisplayVariant(p);
  _selectedSize = activeVariant?.size ?? null;
  const price = activeVariant?.price ?? null;
  const hasImage = p.image && p.image.trim() !== '';

  const stockHtml = _stockHtml(p.stock);
  const concentrationHtml = p.concentration
    ? `<span class="pdm-concentration">${p.concentration}</span>`
    : '';
  const badgeHtml = p.badge
    ? `<span class="pdm-badge ${_badgeClass(p.badge, p.stock)}">${p.badge}</span>`
    : '';

  const notesHtml = (p.notes ?? [])
    .map(n => `<span class="note-tag">${n}</span>`)
    .join('');

  const sizesHtml = [3, 5, 10]
    .map(ml => {
      const variant = variants.find(v => v.size === ml);
      if (!variant) return '';
      const disabled = variant.soldOut || variant.availability <= 0 || !_validVariantId(variant.variant_id);
      return `
      <button
        class="pdm-size-btn ${ml === _selectedSize ? 'pdm-size-btn--active' : ''} ${disabled ? 'pdm-size-btn--disabled' : ''}"
        data-size="${ml}"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
        aria-pressed="${ml === _selectedSize}"
        aria-label="${ml}ml - $${variant.price} MXN${disabled ? ' agotado' : ''}"
      >
        <span class="pdm-size-ml">${ml}ml${ml === 5 ? ' · recomendado' : ''}</span>
        <span class="pdm-size-price">$${variant.price}</span>
        <span class="pdm-size-label">${disabled ? 'Agotado' : _sizeLabel(ml)}</span>
      </button>
    `;
    }).join('');

  _modal.innerHTML = `
    <!-- Close -->
    <button class="pdm-close" aria-label="Cerrar detalle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" width="18" height="18" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>

    <!-- Image panel -->
    <div class="pdm-img-panel">
      ${badgeHtml}
      <div class="pdm-img-wrap">
        ${hasImage
          ? `<img
               src="${p.image}"
               alt="${p.name}"
               class="pdm-img"
               loading="eager"
               decoding="async"
               onerror="this.parentElement.classList.add('pdm-img-wrap--fallback');this.remove()"
             >`
          : '<div class="pdm-img-wrap--fallback"></div>'
        }
      </div>
    </div>

    <!-- Info panel -->
    <div class="pdm-info">

      <div class="pdm-info-scroll">

        <p class="pdm-house">${p.house ?? ''}</p>
        <div class="pdm-title-row">
          <h2 class="pdm-name" id="pdm-name">${p.name}</h2>
          ${concentrationHtml}
        </div>

        ${p.story
          ? `<p class="pdm-story">${p.story}</p>`
          : ''}
        ${p.desc && p.desc !== p.story
          ? `<p class="pdm-desc">${p.desc}</p>`
          : ''}

        ${notesHtml
          ? `<div class="pdm-notes card-notes">${notesHtml}</div>`
          : ''}

        ${stockHtml}

      </div><!-- /pdm-info-scroll -->

      <div class="pdm-buybar" aria-label="Compra rapida">
        ${variants.length
          ? '<div class="pdm-sizes-label">Elige presentación</div>'
          : '<div class="pdm-price-consult">Precio disponible por consulta personalizada.</div>'}
        <div class="pdm-sizes" role="group" aria-label="Seleccionar presentación" ${variants.length ? '' : 'hidden'}>
          ${sizesHtml}
        </div>

        <div class="pdm-buybar-bottom">
          <div class="pdm-price-row">
            <span class="pdm-price" id="pdm-price">${formatPrice(price, 'Consultar precio')}</span>
            <span class="pdm-price-unit">${_selectedSize ? `${_selectedSize}ml` : 'WhatsApp'}</span>
          </div>

          <div class="pdm-actions">
            <button class="btn-primary pdm-btn-add" id="pdm-btn-add"
              ${_isOrderableVariant(activeVariant) ? '' : 'disabled aria-disabled="true"'}
              aria-label="${activeVariant ? `Agregar ${p.name} ${_selectedSize}ml al carrito` : 'Precio por consultar'}">
              ${_isOrderableVariant(activeVariant) ? 'Agregar' : 'Agotado'}
            </button>
            <button class="pdm-btn-wa"
              aria-label="Preparar pedido de ${p.name} por WhatsApp">
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div><!-- /pdm-info -->
  `;
  primeImageStates(_modal);

  /* Bind events after render */
  _bindEvents();
}

/* â”€â”€ Event binding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _bindEvents() {
  /* Close button */
  _modal.querySelector('.pdm-close')
    ?.addEventListener('click', closeProductModal);

  /* Size buttons */
  _modal.querySelectorAll('.pdm-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedSize = Number(btn.dataset.size);
      _updateSizeUI();
    });
  });

  /* Add to cart */
  _modal.querySelector('#pdm-btn-add')
    ?.addEventListener('click', _handleAddToCart);

  /* WhatsApp */
  _modal.querySelector('.pdm-btn-wa')
    ?.addEventListener('click', _handleWhatsApp);

  /* Focus trap */
  _modal.addEventListener('keydown', _trapFocus);
}

/* â”€â”€ Update price & size selection without full re-render â”€â”€â”€â”€â”€â”€ */
function _updateSizeUI() {
  const p     = _activeProduct;
  const price = getPriceForSize(p, _selectedSize);
  const variant = getVariantForSize(p, _selectedSize);

  /* Update price display */
  const priceEl = _modal.querySelector('#pdm-price');
  const unitEl  = _modal.querySelector('.pdm-price-unit');
  if (priceEl) priceEl.textContent = formatPrice(price, 'Consultar precio');
  if (unitEl)  unitEl.textContent  = _selectedSize ? `${_selectedSize}ml` : 'WhatsApp';

  /* Update button label */
  const addBtn = _modal.querySelector('#pdm-btn-add');
  if (addBtn) {
    const disabled = !_isOrderableVariant(variant);
    addBtn.disabled = disabled;
    addBtn.setAttribute('aria-disabled', String(disabled));
    addBtn.textContent = disabled ? 'Agotado' : 'Agregar';
    addBtn.setAttribute('aria-label',
      disabled ? `${p.name} ${_selectedSize}ml agotado` : `Agregar ${p.name} ${_selectedSize}ml al carrito`);
  }

  /* Toggle active class on size buttons */
  _modal.querySelectorAll('.pdm-size-btn').forEach(btn => {
    const active = Number(btn.dataset.size) === _selectedSize;
    btn.classList.toggle('pdm-size-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* â”€â”€ Cart action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function _handleAddToCart() {
  if (!_activeProduct) return;
  const variant = getVariantForSize(_activeProduct, _selectedSize);
  if (_selectedSize === null || getPriceForSize(_activeProduct, _selectedSize) === null || !_isOrderableVariant(variant)) {
    showToast('Precio por confirmar. Escribenos por WhatsApp.');
    return;
  }
  const btn = _modal?.querySelector('#pdm-btn-add');
  _setButtonLoading(btn, true, 'Agregando...');
  try {
    await window.__rd?.cart?.add(_activeProduct.id, _selectedSize);
    /* Close modal and open cart for a smooth flow */
    closeProductModal();
    setTimeout(() => window.__rd?.ui?.openCart?.(), 300);
  } finally {
    _setButtonLoading(btn, false);
  }
}

/* â”€â”€ WhatsApp action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function _handleWhatsApp() {
  const p     = _activeProduct;
  if (!p) return;
  const btn = _modal?.querySelector('.pdm-btn-wa');
  const variant = getVariantForSize(p, _selectedSize);
  if (!_isOrderableVariant(variant)) {
    showToast('Tu pedido se crea al presionar Finalizar por WhatsApp.');
    closeProductModal();
    setTimeout(() => window.__rd?.ui?.openCart?.(), 300);
    return;
  }

  _setButtonLoading(btn, true, 'Preparando...');
  try {
    await window.__rd?.cart?.add(p.id, _selectedSize);
    showToast('Tu pedido se crea al presionar Finalizar por WhatsApp.');
    closeProductModal();
    setTimeout(() => window.__rd?.ui?.openCart?.(), 300);
  } finally {
    _setButtonLoading(btn, false);
  }
}

/* â”€â”€ Overlay click â€” close only if clicking backdrop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _handleOverlayClick(e) {
  if (e.target === _overlay) closeProductModal();
}

/* â”€â”€ Keyboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _handleKey(e) {
  if (!_overlay?.classList.contains('pdm-overlay--open')) return;
  if (e.key === 'Escape') closeProductModal();
}

function _trapFocus(e) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(
    _modal.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _defaultSize(product) {
  return getDefaultVariant(product)?.size ?? null;
}

function _sizeLabel(ml) {
  if (ml === 3)  return 'Prueba';
  if (ml === 5)  return 'Popular';
  if (ml === 10) return 'Grande';
  return '';
}

function _badgeClass(badge, stock) {
  const badgeText = _normalizeBadge(badge);
  if (badgeText === 'ULTIMAS UNIDADES' || stock <= 2) return 'danger';
  if (badgeText === 'TRENDING' || badgeText === 'ALTA DEMANDA') return 'trend';
  return '';
}

function _stockHtml(stock) {
  if (stock <= 0) return `
    <p class="card-stock pdm-stock">
      <span class="stock-dot" style="background:var(--danger)"></span>
      Agotado
    </p>`;
  if (stock <= 3) return `
    <p class="card-stock pdm-stock">
      <span class="stock-dot"></span>Pocas piezas
    </p>`;
  return `
    <p class="card-stock pdm-stock card-stock--ok">
      <span class="stock-dot"></span>Disponible
    </p>`;
}

function _setButtonLoading(btn, isLoading, label = '') {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.label = btn.innerHTML;
    btn.classList.add('is-loading');
    btn.disabled = true;
    if (label) btn.textContent = label;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    delete btn.dataset.label;
  }
}

function _normalizeBadge(badge) {
  return String(badge ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function _isOrderableVariant(variant) {
  return Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}


