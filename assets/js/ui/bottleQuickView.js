/* =============================================================
   RDECANTS — BOTTLE QUICK VIEW
   A lightweight detail overlay for a physical bottle offer: condition,
   real fill level, price, one Add action — without leaving the grid.

   Deliberately NOT a retrofit of modal.js's decant quick view: that modal
   is built entirely around choosing a decant SIZE (a multi-button size row,
   `_selectedSize` state). A bottle is not sized — it is a specific physical
   unit in a specific condition, and its "choice" (when there is one) is
   between sealed / tester / partial siblings, not millilitres. Sharing one
   state machine for two different questions was how the previous storefront
   pass ended up inferring purchasability from a price range instead of
   reading it — see bottleAffordance() in pages/perfumes.js. Two small,
   honest modules beat one that has to branch on what kind of thing it is
   showing.

   Every field rendered here comes from `product.bottles[]`
   (providers/catalog.js:_mapBottleOffer) — condition, remaining_percent,
   price, stock. Nothing is invented: there is no per-unit photo in the data
   model yet, so the canonical fragrance photo is shown and never presented
   as if it were a photo of this exact bottle.

   Public API (also exposed on window.__rd.ui):
     openBottleQuickView(product, offerKey)
     closeBottleQuickView()
   ============================================================= */

import { showToast } from './toast.js';
import { primeImageStates } from './images.js';
import { lockBodyScroll, unlockBodyScroll } from './scrollLock.js';
import { Tracker } from '../tracking/tracker.js';
import { Cart } from '../cart/cart.js';
import { formatPrice } from '../utils/prices.js';
import { productPageUrl } from './productPage.js';

let _product = null;
let _offerKey = null;
let _prevFocus = null;
let _overlay, _sheet;

function _ensureDOM() {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.id = 'bqv-overlay';
  _overlay.className = 'bqv-overlay';
  _overlay.setAttribute('aria-hidden', 'true');
  _overlay.addEventListener('click', e => { if (e.target === _overlay) closeBottleQuickView(); });

  _sheet = document.createElement('div');
  _sheet.id = 'bqv-sheet';
  _sheet.className = 'bqv-sheet';
  _sheet.setAttribute('role', 'dialog');
  _sheet.setAttribute('aria-modal', 'true');
  _sheet.setAttribute('aria-labelledby', 'bqv-name');

  _overlay.appendChild(_sheet);
  document.body.appendChild(_overlay);

  document.addEventListener('keydown', _handleKey);
}

export function openBottleQuickView(product, offerKey) {
  const offers = Array.isArray(product?.bottles) ? product.bottles : [];
  if (!product || !offers.length) return;

  _ensureDOM();
  _product = product;
  _offerKey = offers.some(o => o.offer_key === offerKey) ? offerKey : offers[0].offer_key;
  _prevFocus = document.activeElement;

  Tracker.emit('bottle_quick_view_opened', { productId: product.id, offerKey: _offerKey });
  _render();

  requestAnimationFrame(() => {
    _overlay.classList.add('bqv-overlay--open');
    _sheet.classList.add('bqv-sheet--open');
  });
  lockBodyScroll();
  setTimeout(() => _sheet.querySelector('.bqv-close')?.focus(), 280);
}

export function closeBottleQuickView() {
  if (!_overlay) return;
  _overlay.classList.remove('bqv-overlay--open');
  _sheet.classList.remove('bqv-sheet--open');
  unlockBodyScroll();
  _prevFocus?.focus?.();
  _prevFocus = null;
  _product = null;
  _offerKey = null;
}

function _handleKey(e) {
  if (!_overlay?.classList.contains('bqv-overlay--open')) return;
  if (e.key === 'Escape') { closeBottleQuickView(); return; }
  if (e.key === 'Tab') _trapFocus(e);
}

function _trapFocus(e) {
  const focusable = _sheet.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function _activeOffer() {
  return (_product?.bottles ?? []).find(o => o.offer_key === _offerKey) ?? null;
}

function _render() {
  const p = _product;
  const offer = _activeOffer();
  if (!p || !offer) return;

  const siblings = p.bottles.filter(o => o.offer_key !== offer.offer_key);
  const hasImage = p.image && p.image.trim() !== '';
  const canAdd = (offer.stock ?? 0) > 0;

  _sheet.innerHTML = `
    <button class="bqv-close" aria-label="Cerrar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>

    <div class="bqv-img-wrap${hasImage ? '' : ' bqv-img-wrap--fallback'}">
      ${hasImage
        ? `<img src="${p.image}" alt="${p.name}" class="bqv-img" loading="eager" decoding="async"
             onerror="this.parentElement.classList.add('bqv-img-wrap--fallback');this.remove()">`
        : ''}
      <span class="bqv-condition-chip">${_escape(offer.condition_label)}</span>
    </div>

    <div class="bqv-info">
      <p class="bqv-house">${_escape(p.house ?? '')}</p>
      <h2 class="bqv-name" id="bqv-name">${_escape(p.name)}</h2>

      ${_conditionDetailHtml(offer)}

      ${siblings.length ? `
        <div class="bqv-siblings" role="group" aria-label="Otras condiciones disponibles">
          <p class="bqv-siblings-label">También disponible</p>
          ${siblings.map(s => `
            <button type="button" class="bqv-sibling-btn" data-offer-key="${_escape(s.offer_key)}">
              <span>${_escape(s.condition_label)} · ${_escape(s.size_label)}</span>
              <strong>${formatPrice(s.price)}</strong>
            </button>`).join('')}
        </div>` : ''}

      <div class="bqv-buybar">
        <div class="bqv-price-row">
          <span class="bqv-price">${formatPrice(offer.price)}</span>
          ${!canAdd ? '<span class="bqv-soldout">Agotado</span>' : ''}
        </div>
        <button class="btn-primary bqv-btn-add" id="bqv-btn-add" ${canAdd ? '' : 'disabled aria-disabled="true"'}
          aria-label="Agregar ${_escape(p.name)}, ${_escape(offer.condition_label)}, al carrito">
          ${canAdd ? 'Agregar' : 'Agotado'}
        </button>
        <a class="bqv-details-link" href="${productPageUrl(p)}" aria-label="Ver perfil completo de ${_escape(p.name)}">
          Ver perfil completo
        </a>
      </div>
    </div>
  `;

  primeImageStates(_sheet);
  _bindEvents();
}

/**
 * The one section this module exists for: real condition, in the words a
 * customer actually needs before buying a specific physical unit. A sealed
 * or tester bottle has nothing further to disclose beyond its condition —
 * only a partial bottle's remaining_percent is a real, measured fact worth a
 * line of its own, and it is shown ONLY when the backend sent one (never
 * estimated here).
 */
function _conditionDetailHtml(offer) {
  const lines = [`<p class="bqv-size">${_escape(offer.size_label)}</p>`];

  if (offer.condition === 'tester_parcial' || offer.remaining_percent !== null) {
    if (offer.remaining_percent !== null && Number.isFinite(offer.remaining_percent)) {
      lines.push(`
        <div class="bqv-fill" aria-label="Contenido restante: ${offer.remaining_percent}%">
          <div class="bqv-fill-track"><div class="bqv-fill-bar" style="width:${Math.max(0, Math.min(100, offer.remaining_percent))}%"></div></div>
          <span class="bqv-fill-label">${offer.remaining_percent}% del frasco</span>
        </div>`);
    }
  }

  return lines.join('');
}

function _bindEvents() {
  _sheet.querySelector('.bqv-close')?.addEventListener('click', closeBottleQuickView);

  _sheet.querySelectorAll('.bqv-sibling-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _offerKey = btn.dataset.offerKey;
      _render();
    });
  });

  const addBtn = _sheet.querySelector('#bqv-btn-add');
  addBtn?.addEventListener('click', async () => {
    if (addBtn.disabled) return;
    addBtn.disabled = true;
    const original = addBtn.textContent;
    try {
      // Cart.addBottle already raises its own toast on both the "no longer
      // available" and "already in your cart" outcomes — a second toast here
      // would just repeat it in different words.
      const added = await Cart.addBottle(_product.id, _offerKey);
      addBtn.textContent = added ? 'Agregado ✓' : original;
      if (added) setTimeout(closeBottleQuickView, 700);
      else addBtn.disabled = false;
    } catch {
      addBtn.textContent = original;
      addBtn.disabled = false;
      showToast('No pudimos agregarla. Intenta de nuevo.');
    }
  });
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
