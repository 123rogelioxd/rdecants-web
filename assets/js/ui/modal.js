/* =============================================================
   RDECANTS — PRODUCT DETAIL MODAL
   Opens a luxury detail sheet for any catalog product.

   Public API (also exposed on window.__rd.ui):
     openProductModal(product)   — receives a mapped product obj
     closeProductModal()

   Design rules:
     • Tokens only — no hardcoded colors or sizes
     • Vanilla JS — no frameworks
     • Accessible: focus-trap, ESC, aria-modal
     • Safe: image fallback if src missing/broken
   ============================================================= */

import { showToast } from './toast.js';
import { primeImageStates } from './images.js';
import { Tracker } from '../tracking/tracker.js';
import { getDefaultVariant,
         getPriceForSize,
         getDisplayVariant,
         getVariantForSize,
         getValidVariants,
         formatPrice,
         PRIMARY_SIZES } from '../utils/prices.js?v=2026.06.04.2';
import { getScarcityDisplay } from '../utils/scarcity.js?v=2026.06.04.2';
import { getDisplayBadges } from '../utils/guidance.js?v=2026.06.04.2';
import { productPageUrl } from './productPage.js?v=2026.06.04.2';

/* ── Constants ──────────────────────────────────────────────── */
const WHATSAPP_NUMBER = '5219516513018';

/* ── State ──────────────────────────────────────────────────── */
let _activeProduct  = null;
let _selectedSize   = 5;          /* default size */
let _prevFocus      = null;       /* restore focus on close */

/* ── DOM refs (created once, reused) ────────────────────────── */
let _overlay, _modal;

/* ── Build DOM (once) ───────────────────────────────────────── */
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

/* ── Open ────────────────────────────────────────────────────── */
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

/* ── Close ───────────────────────────────────────────────────── */
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

/* ── Render modal content ────────────────────────────────────── */
function _render() {
  const p = _activeProduct;
  if (!p || !_modal) return;

  const variants = getValidVariants(p);
  const activeVariant = variants.find(v => v.size === _selectedSize) || getDefaultVariant(p) || getDisplayVariant(p);
  _selectedSize = activeVariant?.size ?? null;
  const price = activeVariant?.price ?? null;
  const hasImage = p.image && p.image.trim() !== '';

  const scarcity = getScarcityDisplay(p);
  const stockHtml = _stockHtml(scarcity);
  const concentrationHtml = p.concentration
    ? `<span class="pdm-concentration">${p.concentration}</span>`
    : '';
  const genderHtml = _genderBadgeHtml(p.gender, 'pdm-gender');
  const badgeHtml = scarcity.key === 'ok'
    ? ''
    : `<span class="pdm-badge ${scarcity.badgeClass}">${scarcity.label}</span>`;

  const guidanceHtml = buildProductModalGuidanceHtml(p);
  const detailsHref = productPageUrl(p);
  const description = _modalDescription(p);

  const sizesHtml = PRIMARY_SIZES
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
        <span class="pdm-size-ml">${ml}ml</span>
        <span class="pdm-size-price">$${variant.price}</span>
        <span class="pdm-size-label">${disabled ? 'Agotado' : _modalSizeLabel(ml)}</span>
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
          <div class="pdm-meta-chips">
            ${genderHtml}
            ${concentrationHtml}
          </div>
        </div>
        <p class="pdm-decant-hint">Decant auténtico · prueba antes de comprar el frasco</p>

        ${description ? `<p class="pdm-story">${description}</p>` : ''}

        ${guidanceHtml}

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
            <div class="pdm-secondary-actions">
              <a class="pdm-details-link" href="${detailsHref}"
                 aria-label="Ver perfil completo de ${p.name}">
                Ver perfil completo
              </a>
              <button class="pdm-btn-wa" type="button"
                aria-label="Consultar ${p.name} por WhatsApp">
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div><!-- /pdm-info -->
  `;
  primeImageStates(_modal);

  /* Bind events after render */
  _bindEvents();
}

export function buildProductModalGuidanceHtml(product) {
  const guidanceHtml = getDisplayBadges(product, { context: 'quick_view' })
    .map(g => `<span class="guidance-chip guidance-chip--${g.key}">${g.label}</span>`)
    .join('');

  return guidanceHtml
    ? `<div class="pdm-guidance" aria-label="Recomendado para">${guidanceHtml}</div>`
    : '';
}

/* ── Event binding ───────────────────────────────────────────── */
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

/* ── Update price & size selection without full re-render ────── */
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

/* ── Cart action ─────────────────────────────────────────────── */
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
    /* No auto-open: the add toast ("Ver carrito") lets the customer keep
       browsing or open the cart on their own terms. */
    closeProductModal();
  } finally {
    _setButtonLoading(btn, false);
  }
}

/* ── WhatsApp action — opens WhatsApp directly with a product inquiry.
   This button always does what it says (no hidden add-to-cart). ───── */
function _handleWhatsApp() {
  const p = _activeProduct;
  if (!p) return;

  const variant   = getVariantForSize(p, _selectedSize);
  const house     = p.house ? `${p.house} ` : '';
  const sizeText  = variant?.size ? ` — ${variant.size}ml` : '';
  const priceText = (variant && variant.price) ? ` (${formatPrice(variant.price)})` : '';

  const message = [
    'Hola 👋',
    '',
    `Me interesa este decant: ${house}${p.name}${sizeText}${priceText}.`,
    '',
    '¿Me ayudas a confirmar disponibilidad, envío y forma de pago?',
  ].join('\n');

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  Tracker.productClicked(p, 'modal_whatsapp_direct');
  const opened = window.open(url, '_blank');
  if (!opened) window.location.href = url;
}

/* ── Overlay click — close only if clicking backdrop ─────────── */
function _handleOverlayClick(e) {
  if (e.target === _overlay) closeProductModal();
}

/* ── Keyboard ────────────────────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────────────────── */
function _defaultSize(product) {
  return getDefaultVariant(product)?.size ?? null;
}

function _modalDescription(product) {
  return String(product?.story || product?.desc || '').trim();
}

function _modalSizeLabel(ml) {
  const labels = {
    3: 'Ideal para probar',
    5: 'Recomendado',
    10: 'Mejor valor',
  };
  return labels[Number(ml)] ?? '';
}

function _stockHtml(scarcity) {
  if (scarcity.state === 'sold_out') return `
    <p class="card-stock pdm-stock">
      <span class="stock-dot" style="background:var(--danger)"></span>
      Agotado
    </p>`;
  return `
    <p class="card-stock pdm-stock card-stock--${scarcity.key}">
      <span class="stock-dot"></span>${scarcity.label}
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

function _genderLabel(gender) {
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

function _genderBadgeHtml(gender, className = 'gender-badge') {
  const label = _genderLabel(gender);
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
