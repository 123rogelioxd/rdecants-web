/* =============================================================
   RDECANTS — PRODUCT DETAIL PAGE
   Renders the dedicated /perfume/{slug} page using catalog data.
   Pure-ish: receives a root element + product, hydrates the DOM
   and wires variant / cart / WhatsApp / related interactions.

   The fragrance intelligence (Perfil Olfativo, ¿Por qué?, ¿Para
   quién?, ¿Cuándo?, score bars, "Si te gusta esto...") lives here.
   The modal is intentionally lean and only links here.
   ============================================================= */

import { primeImageStates } from './images.js';
import { Tracker } from '../tracking/tracker.js';
import {
  getDefaultVariant,
  getPriceForSize,
  getDisplayVariant,
  getVariantForSize,
  getValidVariants,
  formatPrice,
} from '../utils/prices.js?v=1.0.13';
import { getScarcityDisplay } from '../utils/scarcity.js?v=1.0.13';
import { getGuidanceBadges } from '../utils/guidance.js?v=1.0.13';
import { getRelatedProducts } from '../recommendations/upsells.js?v=1.0.14';
import { buildWhyHtml } from './why.js?v=1.0.13';
import { buildFragranceProfileHtml } from './fragranceProfile.js?v=1.0.0';
import { showToast } from './toast.js';

/* ── Public: build the page HTML for a product ──────────────── */
export function buildProductPageHtml(product) {
  if (!product) return _notFoundHtml();

  const variants = getValidVariants(product);
  const defaultVariant = getDefaultVariant(product) || getDisplayVariant(product);
  const defaultSize = defaultVariant?.size ?? null;
  const price = defaultVariant?.price ?? null;
  const hasImage = product.image && product.image.trim() !== '';

  const scarcity = getScarcityDisplay(product);
  const badgeHtml = scarcity.key === 'ok'
    ? ''
    : `<span class="pdp-badge ${scarcity.badgeClass}">${_escape(scarcity.label)}</span>`;
  const stockHtml = _stockHtml(scarcity);

  const concentrationHtml = product.concentration
    ? `<span class="pdp-concentration">${_escape(product.concentration)}</span>`
    : '';

  const notesHtml = (product.notes ?? [])
    .map(n => `<span class="note-tag">${_escape(n)}</span>`)
    .join('');

  const guidanceHtml = getGuidanceBadges(product)
    .map(g => `<span class="guidance-chip guidance-chip--${g.key}">${_escape(g.label)}</span>`)
    .join('');

  const whyHtml = buildWhyHtml(product);
  const fragranceProfileHtml = buildFragranceProfileHtml(product);

  const sizesHtml = [3, 5, 10]
    .map(ml => {
      const variant = variants.find(v => v.size === ml);
      if (!variant) return '';
      const disabled = variant.soldOut || variant.availability <= 0 || !_validVariantId(variant.variant_id);
      return `
        <button
          class="pdp-size-btn ${ml === defaultSize ? 'pdp-size-btn--active' : ''} ${disabled ? 'pdp-size-btn--disabled' : ''}"
          data-size="${ml}"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
          aria-pressed="${ml === defaultSize}"
          aria-label="${ml}ml - $${variant.price} MXN${disabled ? ' agotado' : ''}">
          <span class="pdp-size-ml">${ml}ml${ml === 5 ? ' · recomendado' : ''}</span>
          <span class="pdp-size-price">$${variant.price}</span>
          <span class="pdp-size-label">${disabled ? 'Agotado' : _sizeLabel(ml)}</span>
        </button>`;
    }).join('');

  return `
    <a href="/" class="pdp-back" aria-label="Volver al catálogo">
      <span aria-hidden="true">←</span> Volver
    </a>

    <section class="pdp-hero" aria-labelledby="pdp-name">
      <div class="pdp-hero-img">
        ${badgeHtml}
        <div class="pdp-img-wrap">
          ${hasImage
            ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}"
                   class="pdp-img" loading="eager" decoding="async"
                   onerror="this.parentElement.classList.add('pdp-img-wrap--fallback');this.remove()">`
            : '<div class="pdp-img-wrap--fallback"></div>'}
        </div>
      </div>

      <div class="pdp-hero-info">
        <p class="pdp-house">${_escape(product.house ?? '')}</p>
        <div class="pdp-title-row">
          <h1 class="pdp-name" id="pdp-name">${_escape(product.name)}</h1>
          ${concentrationHtml}
        </div>

        ${product.story ? `<p class="pdp-story">${_escape(product.story)}</p>` : ''}

        ${notesHtml ? `<div class="pdp-notes card-notes">${notesHtml}</div>` : ''}
        ${guidanceHtml ? `<div class="pdp-guidance" aria-label="Recomendado para">${guidanceHtml}</div>` : ''}

        <div class="pdp-buybar" aria-label="Compra rápida">
          ${variants.length
            ? '<div class="pdp-sizes-label">Elige presentación</div>'
            : '<div class="pdp-price-consult">Precio disponible por consulta personalizada.</div>'}

          <div class="pdp-sizes" role="group" aria-label="Seleccionar presentación" ${variants.length ? '' : 'hidden'}>
            ${sizesHtml}
          </div>

          <div class="pdp-price-row">
            <span class="pdp-price" id="pdp-price">${formatPrice(price, 'Consultar precio')}</span>
            <span class="pdp-price-unit">${defaultSize ? `${defaultSize}ml` : 'WhatsApp'}</span>
          </div>

          ${stockHtml}

          <div class="pdp-actions">
            <button class="btn-primary pdp-btn-add" id="pdp-btn-add"
              ${_isOrderableVariant(defaultVariant) ? '' : 'disabled aria-disabled="true"'}
              aria-label="${defaultVariant ? `Agregar ${_escape(product.name)} ${defaultSize}ml al carrito` : 'Precio por consultar'}">
              ${_isOrderableVariant(defaultVariant) ? 'Agregar' : 'Agotado'}
            </button>
            <button class="pdp-btn-wa" id="pdp-btn-wa"
              aria-label="Preparar pedido de ${_escape(product.name)} por WhatsApp">
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="pdp-intelligence">
      ${whyHtml}
      ${fragranceProfileHtml}
    </section>

    <section class="pdp-related" id="pdp-related" hidden aria-labelledby="pdp-related-h">
      <h2 class="pdp-section-h" id="pdp-related-h">Si te gusta esto...</h2>
      <div class="pdp-related-row" id="pdp-related-row"></div>
    </section>
  `;
}

/* ── Hydrate page interactivity (cart/variant/WhatsApp/related) */
export function hydrateProductPage(root, product, deps = {}) {
  if (!root || !product) return;

  primeImageStates(root);

  let selectedSize = getDefaultVariant(product)?.size ?? null;

  /* Variant selection */
  root.querySelectorAll('.pdp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSize = Number(btn.dataset.size);
      _updateBuyUI(root, product, selectedSize);
    });
  });

  /* Add to cart */
  root.querySelector('#pdp-btn-add')?.addEventListener('click', async () => {
    const variant = getVariantForSize(product, selectedSize);
    if (selectedSize === null || getPriceForSize(product, selectedSize) === null || !_isOrderableVariant(variant)) {
      showToast('Precio por confirmar. Escríbenos por WhatsApp.');
      return;
    }
    const cart = deps.cart ?? window.__rd?.cart;
    await cart?.add?.(product.id, selectedSize);
    deps.openCart?.() ?? window.__rd?.ui?.openCart?.();
  });

  /* WhatsApp */
  root.querySelector('#pdp-btn-wa')?.addEventListener('click', async () => {
    const variant = getVariantForSize(product, selectedSize);
    if (!_isOrderableVariant(variant)) {
      showToast('Apartamos tu pedido y te llevamos a WhatsApp para confirmar.');
      deps.openCart?.() ?? window.__rd?.ui?.openCart?.();
      return;
    }
    const cart = deps.cart ?? window.__rd?.cart;
    await cart?.add?.(product.id, selectedSize);
    showToast('Apartamos tu pedido y te llevamos a WhatsApp para confirmar.');
    deps.openCart?.() ?? window.__rd?.ui?.openCart?.();
  });
}

/* ── Related rail (lazy, defensive) ─────────────────────────── */
export function renderRelated(root, seed, products) {
  const slot = root.querySelector('#pdp-related');
  const row = root.querySelector('#pdp-related-row');
  if (!slot || !row) return;

  const related = getRelatedProducts(seed, products, { limit: 4 });
  if (!related.length) {
    slot.hidden = true;
    return;
  }

  row.innerHTML = related.map(_relatedCard).join('');
  slot.hidden = false;

  Tracker.recommendationView(related, { railId: 'pdp_related', railTitle: 'Si te gusta esto...' });
  primeImageStates(slot);

  row.querySelectorAll('.pdp-related-card').forEach(card => {
    card.addEventListener('click', () => {
      const product = related.find(item => String(item.id) === card.dataset.productId);
      if (!product) return;
      const position = Number(card.dataset.position) + 1;
      Tracker.recommendationClicked(product, position, { railId: 'pdp_related', railTitle: 'Si te gusta esto...' });
      window.location.href = productPageUrl(product);
    });
  });
}

/* ── URL helper (shared between modal CTA and PDP nav) ──────── */
export function productPageUrl(product) {
  const slug = product?.slug ?? product?.id;
  return `/perfume/${encodeURIComponent(String(slug ?? ''))}`;
}

/* ── Read slug from current URL (defensive) ─────────────────── */
export function readSlugFromLocation(pathname = (typeof window !== 'undefined' ? window.location.pathname : '')) {
  const m = String(pathname || '').match(/\/perfume\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/* ── Find product by slug, falling back to id ───────────────── */
export function findProductBySlug(products, slug) {
  if (!Array.isArray(products) || !slug) return null;
  const target = String(slug).toLowerCase();
  return (
    products.find(p => String(p?.slug ?? '').toLowerCase() === target) ||
    products.find(p => String(p?.id ?? '').toLowerCase() === target) ||
    null
  );
}

/* ── Internals ──────────────────────────────────────────────── */

function _notFoundHtml() {
  return `
    <div class="pdp-empty premium-empty">
      <div class="sf-empty-icon" aria-hidden="true">R</div>
      <h1 class="sf-empty-title">No encontramos esa fragancia</h1>
      <p class="sf-empty-desc">El enlace puede haber expirado o el perfume ya no está disponible.</p>
      <a class="btn-ghost" href="/">Volver al catálogo</a>
    </div>`;
}

function _updateBuyUI(root, product, selectedSize) {
  const price = getPriceForSize(product, selectedSize);
  const variant = getVariantForSize(product, selectedSize);

  const priceEl = root.querySelector('#pdp-price');
  const unitEl = root.querySelector('.pdp-price-unit');
  if (priceEl) priceEl.textContent = formatPrice(price, 'Consultar precio');
  if (unitEl) unitEl.textContent = selectedSize ? `${selectedSize}ml` : 'WhatsApp';

  const addBtn = root.querySelector('#pdp-btn-add');
  if (addBtn) {
    const disabled = !_isOrderableVariant(variant);
    addBtn.disabled = disabled;
    addBtn.setAttribute('aria-disabled', String(disabled));
    addBtn.textContent = disabled ? 'Agotado' : 'Agregar';
  }

  root.querySelectorAll('.pdp-size-btn').forEach(btn => {
    const active = Number(btn.dataset.size) === selectedSize;
    btn.classList.toggle('pdp-size-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function _relatedCard(product, idx) {
  const price = getDisplayVariant(product)?.price ?? null;
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <button class="pdp-related-card" data-product-id="${_escape(product.id)}" data-position="${idx}"
      aria-label="Ver ${_escape(product.name)}">
      <span class="pdp-related-img">
        ${hasImage
          ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" loading="lazy" decoding="async"
                 onerror="this.parentElement.classList.add('pdp-related-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="pdp-related-house">${_escape(product.house ?? '')}</span>
      <span class="pdp-related-name">${_escape(product.name)}</span>
      <span class="pdp-related-price">${formatPrice(price, 'Ver')}</span>
    </button>`;
}

function _stockHtml(scarcity) {
  if (scarcity.state === 'sold_out') {
    return `<p class="card-stock pdp-stock">
      <span class="stock-dot" style="background:var(--danger)"></span>Agotado
    </p>`;
  }
  return `<p class="card-stock pdp-stock card-stock--${scarcity.key}">
    <span class="stock-dot"></span>${_escape(scarcity.label)}
  </p>`;
}

function _sizeLabel(ml) {
  if (ml === 3) return 'Prueba';
  if (ml === 5) return 'Popular';
  if (ml === 10) return 'Grande';
  return '';
}

function _isOrderableVariant(variant) {
  return Boolean(variant && !variant.soldOut && variant.availability > 0 && _validVariantId(variant.variant_id));
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}

function _escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
