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
         getValidVariants,
         formatPrice } from '../utils/prices.js';

const WHATSAPP_NUMBER = '5219516513018';

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
  const activeVariant = variants.find(v => v.size === _selectedSize) || variants[0] || null;
  _selectedSize = activeVariant?.size ?? null;
  const price = activeVariant?.price ?? null;
  const hasImage = p.image && p.image.trim() !== '';

  const stockHtml = _stockHtml(p.stock);
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
      return `
      <button
        class="pdm-size-btn ${ml === _selectedSize ? 'pdm-size-btn--active' : ''}"
        data-size="${ml}"
        aria-pressed="${ml === _selectedSize}"
        aria-label="${ml}ml - $${variant.price} MXN"
      >
        <span class="pdm-size-ml">${ml}ml${ml === 5 ? ' *' : ''}</span>
        <span class="pdm-size-price">$${variant.price}</span>
        <span class="pdm-size-label">${_sizeLabel(ml)}</span>
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
        <h2 class="pdm-name" id="pdm-name">${p.name}</h2>

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

        <!-- Size selector -->
        ${variants.length
          ? '<div class="pdm-sizes-label">Elige tu tamano</div>'
          : '<div class="pdm-price-consult">Precio disponible por consulta personalizada.</div>'}
        <div class="pdm-sizes" role="group" aria-label="Seleccionar tamano" ${variants.length ? '' : 'hidden'}>
          ${sizesHtml}
        </div>

        <!-- Price display -->
        <div class="pdm-price-row">
          <span class="pdm-price" id="pdm-price">${formatPrice(price, 'Consultar precio')}</span>
          <span class="pdm-price-unit">${_selectedSize ? `MXN / ${_selectedSize}ml` : 'Disponibilidad por WhatsApp'}</span>
        </div>

        <!-- Actions -->
        <div class="pdm-actions">
          <button class="btn-primary pdm-btn-add" id="pdm-btn-add"
            ${activeVariant ? '' : 'disabled aria-disabled="true"'}
            aria-label="${activeVariant ? `Agregar ${p.name} ${_selectedSize}ml al carrito` : 'Precio por consultar'}">
            ${activeVariant ? 'Agregar al bag' : 'Consultar precio'}
          </button>
          <button class="pdm-btn-wa"
            aria-label="Comprar ${p.name} por WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Comprar por WhatsApp
          </button>
        </div>

      </div><!-- /pdm-info-scroll -->
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

  /* Update price display */
  const priceEl = _modal.querySelector('#pdm-price');
  const unitEl  = _modal.querySelector('.pdm-price-unit');
  if (priceEl) priceEl.textContent = formatPrice(price, 'Consultar precio');
  if (unitEl)  unitEl.textContent  = _selectedSize ? `MXN / ${_selectedSize}ml` : 'Disponibilidad por WhatsApp';

  /* Update button label */
  const addBtn = _modal.querySelector('#pdm-btn-add');
  if (addBtn) addBtn.setAttribute('aria-label',
    `Agregar ${p.name} ${_selectedSize}ml al carrito`);

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
  if (_selectedSize === null || getPriceForSize(_activeProduct, _selectedSize) === null) {
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
function _handleWhatsApp() {
  const p     = _activeProduct;
  if (!p) return;
  const btn = _modal?.querySelector('.pdm-btn-wa');
  _setButtonLoading(btn, true, 'Abriendo WhatsApp...');
  const price = getPriceForSize(p, _selectedSize);
  const priceText = price === null ? 'Por confirmar' : `$${price} MXN`;
  const sizeText = _selectedSize ? `${_selectedSize}ml` : 'Tamano por confirmar';
  const msg   = encodeURIComponent(
    `*RDecants - Consulta de producto*\n\n` +
    `Producto: *${p.name}*\n` +
    `Casa: ${p.house}\n` +
    `Tamano: ${sizeText}\n` +
    `Precio: ${priceText}\n\n` +
    `Hola, me interesa este producto. Esta disponible?`
  );
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  setTimeout(() => _setButtonLoading(btn, false), 700);
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
  if (ml === 10) return 'Full';
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
      Agotado por el momento
    </p>`;
  if (stock <= 1) return `
    <p class="card-stock pdm-stock">
      <span class="stock-dot"></span>Ultima unidad disponible
    </p>`;
  if (stock <= 3) return `
    <p class="card-stock pdm-stock">
      <span class="stock-dot"></span>Solo ${stock} unidades disponibles
    </p>`;
  if (stock <= 5) return `
    <p class="card-stock pdm-stock" style="color:var(--accent)">
      <span class="stock-dot" style="background:var(--accent)"></span>
      Alta demanda esta semana
    </p>`;
  return '';
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


