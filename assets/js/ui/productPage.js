/* =============================================================
   RDECANTS — PRODUCT DETAIL PAGE
   Editorial fragrance experience for /perfume/{slug}.

   Order (top → bottom):
     A. Hero editorial (image + name + emotional sentence + notes +
        chips + optional "Muy solicitado" badge + price-from + a
        single "Comprar" CTA — buy decision possible above the fold)
     B. ¿Por qué te puede gustar? (ONE fused sell/guide section:
        plain-language lead + up to 4 why bullets + "best for" chips
        + a compact "no es para ti si…" line)
     CB. Combina bien con (collection pairs, hydrated async)
     C. Perfil olfativo completo — collapsed <details>, opt-in:
        ¿Cuándo usarlo? checklist + Perfil (score bars with bands)
     D. Buy section (price + variants + Add + WhatsApp)
     E. Si te gusta esto... (related)
   The top sells/guides; the technical detail is opt-in and lower.
   A sticky mini-buy CTA appears after the hero scrolls out and
   hides when the real buy section is in view.

   Defensive: every section renders nothing if its data is missing.
   ============================================================= */

import { primeImageStates } from './images.js';
import { genderBadgeHtml } from './genderBadge.js';
import { Tracker } from '../tracking/tracker.js';
import {
  getDefaultVariant,
  getPriceForSize,
  getDisplayVariant,
  getVariantForSize,
  getValidVariants,
  getEntryVariant,
  formatPrice,
  getSizeLabel,
  PRIMARY_SIZES,
} from '../utils/prices.js';
import { getScarcityDisplay } from '../utils/scarcity.js';
import { getDisplayBadges } from '../utils/guidance.js';
import { getRelatedProducts } from '../recommendations/upsells.js';
import { getReasons } from '../recommendations/reasoning.js';
import { buildFragranceProfileHtml } from './fragranceProfile.js';
import { getNoviceLead, getReturningUserLine } from './pdpNovice.js';
import { MAX_PDP_WHY_REASONS } from './displayLimits.js';
import {
  resolveDiscoverySets,
  renderDiscoverySetsFallback,
} from './discoverySets.js';
import { Personalization, filterDisliked } from '../recommendations/personalization.js';
import {
  getCollectionPairs,
  getComplementReason,
} from '../recommendations/crossSell.js';
import { getConfidenceBadge } from './pdpConfidence.js';
import { showToast } from './toast.js';

const WHATSAPP_NUMBER = '5219516513018';

/* ── Public: build the page HTML ─────────────────────────────── */
export function buildProductPageHtml(product) {
  if (!product) return _notFoundHtml();

  const variants = getValidVariants(product);
  const defaultVariant = getDefaultVariant(product) || getDisplayVariant(product);
  const defaultSize = defaultVariant?.size ?? null;
  const defaultPrice = defaultVariant?.price ?? null;
  /* Entry presentation for "Desde {size}ml" — always a selectable size
     (3/5/10ml), never the 2ml cart-completer, so the price shown is one
     the customer can actually buy. */
  const entryVariant = getEntryVariant(product);
  const lowestPrice = entryVariant?.price ?? null;
  const hasImage = product.image && product.image.trim() !== '';

  const scarcity = getScarcityDisplay(product);
  const badgeHtml = scarcity.key === 'ok'
    ? ''
    : `<span class="pdp-badge ${scarcity.badgeClass}">${_escape(scarcity.label)}</span>`;
  const stockHtml = _stockHtml(scarcity);

  const concentrationHtml = product.concentration
    ? `<span class="pdp-concentration">${_escape(product.concentration)}</span>`
    : '';
  const genderHtml = genderBadgeHtml(product, { compact: false, className: 'pdp-gender' });

  const guidanceHtml = getDisplayBadges(product, { context: 'product_detail' })
    .map(g => `<span class="guidance-chip guidance-chip--${_escape(g.key)}">${_escape(g.label)}</span>`)
    .join('');

  const confBadge = getConfidenceBadge(product);
  const confBadgeHtml = confBadge
    ? `<span class="pdp-conf-badge pdp-conf-badge--${confBadge.key}">${_escape(confBadge.label)}</span>`
    : '';

  return `
    <a href="/" class="pdp-back" aria-label="Volver al catálogo">
      <span aria-hidden="true">←</span> Volver
    </a>

    <!-- A. Hero editorial — no buy controls here -->
    <section class="pdp-hero" id="pdp-hero" aria-labelledby="pdp-name">
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
        ${confBadgeHtml}
        <div class="pdp-title-row">
          <h1 class="pdp-name" id="pdp-name">${_escape(product.name)}</h1>
          <div class="pdp-meta-chips">
            ${genderHtml}
            ${concentrationHtml}
          </div>
        </div>

        ${product.story ? `<p class="pdp-story">${_escape(product.story)}</p>` : ''}
        ${guidanceHtml ? `<div class="pdp-guidance" aria-label="Recomendado para">${guidanceHtml}</div>` : ''}

        <div class="pdp-hero-actions">
          ${entryVariant
            ? `<span class="pdp-hero-price">Desde ${entryVariant.size}ml · <strong>${formatPrice(entryVariant.price)}</strong></span>`
            : ''}
          <button class="pdp-jump-buy" type="button" data-jump="#pdp-buy">
            Elige presentación
          </button>
        </div>
      </div>
    </section>

    <!-- B. ¿Por qué te puede gustar? — fused sell/guide section -->
    ${_whyYouMightLikeBlock(product)}

    <!-- C. Buy section — el usuario compra primero, justo tras el "por qué" -->
    <section class="pdp-buy" id="pdp-buy" aria-labelledby="pdp-buy-h">
      <h2 class="pdp-section-h" id="pdp-buy-h">Lo quiero</h2>
      <div class="pdp-buybar" aria-label="Compra rápida">
        ${variants.length
          ? '<div class="pdp-sizes-label">Elige presentación</div>'
          : '<div class="pdp-price-consult">Precio disponible por consulta personalizada.</div>'}

        <div class="pdp-sizes" role="group" aria-label="Seleccionar presentación" ${variants.length ? '' : 'hidden'}>
          ${_sizesHtml(variants, defaultSize, product)}
        </div>

        ${lowestPrice !== null ? `
          <p class="pdp-value-prop">Una botella completa cuesta miles — pruébalo desde ${formatPrice(lowestPrice)}.</p>
        ` : ''}

        <div class="pdp-price-row">
          <span class="pdp-price" id="pdp-price">${formatPrice(defaultPrice, 'Consultar precio')}</span>
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
            aria-label="Consultar ${_escape(product.name)} por WhatsApp">
            Consultar por WhatsApp
          </button>
        </div>
      </div>
    </section>

    <!-- D. Recomendaciones — una sola zona: "Combina bien con" + "Si te gusta esto" -->
    <section class="pdp-pairs" id="pdp-pairs" hidden aria-labelledby="pdp-pairs-h"></section>

    <section class="pdp-related" id="pdp-related" hidden aria-labelledby="pdp-related-h">
      <h2 class="pdp-section-h" id="pdp-related-h">Si te gusta esto...</h2>
      <div class="pdp-related-row" id="pdp-related-row"></div>
    </section>

    <!-- E. Perfil olfativo completo — colapsado, opt-in, al final -->
    ${_technicalBlock(product)}

    <!-- Sticky mini-buy CTA — appears after hero scrolls out -->
    <div class="pdp-sticky-cta" id="pdp-sticky-cta" aria-hidden="true">
      <div class="pdp-sticky-cta-info">
        <span class="pdp-sticky-cta-name">${_escape(product.name)}</span>
        <span class="pdp-sticky-cta-price">${formatPrice(defaultPrice, 'Consultar')}</span>
      </div>
      <button class="btn-primary pdp-sticky-cta-btn" type="button" data-jump="#pdp-buy">
        Comprar
      </button>
    </div>
  `;
}

/* ── Hydrate page interactivity ──────────────────────────────── */
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

  /* Add to cart — same behavior as the catalog card and the quick-view modal:
     an actionable toast, never a forced-open drawer, so the customer keeps
     their place on the page (and can open the cart on their own terms). */
  root.querySelector('#pdp-btn-add')?.addEventListener('click', async () => {
    const variant = getVariantForSize(product, selectedSize);
    if (selectedSize === null || getPriceForSize(product, selectedSize) === null || !_isOrderableVariant(variant)) {
      showToast('Precio por confirmar. Escríbenos por WhatsApp.');
      return;
    }
    const cart = deps.cart ?? window.__rd?.cart;
    await cart?.add?.(product.id, selectedSize);
  });

  /* WhatsApp — opens a direct product inquiry, same pattern as the modal's
     WhatsApp button (never a hidden add-to-cart). Consistent label, consistent
     action, everywhere the button appears. */
  root.querySelector('#pdp-btn-wa')?.addEventListener('click', () => {
    const variant = getVariantForSize(product, selectedSize);
    const house = product.house ? `${product.house} ` : '';
    const sizeText = variant?.size ? ` — ${variant.size}ml` : '';
    const priceText = (variant && variant.price) ? ` (${formatPrice(variant.price)})` : '';
    const message = [
      'Hola 👋',
      '',
      `Me interesa este decant: ${house}${product.name}${sizeText}${priceText}.`,
      '',
      '¿Me ayudas a confirmar disponibilidad, envío y forma de pago?',
    ].join('\n');
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    Tracker.productClicked(product, 'pdp_whatsapp_direct');
    const opened = window.open(url, '_blank');
    if (!opened) window.location.href = url;
  });

  /* Smooth-scroll buttons (hero "Comprar" / "¿Es para mí?" / sticky CTA) */
  root.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = root.querySelector(btn.dataset.jump);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* Sticky CTA visibility — show after hero leaves viewport, hide while
     the real buy section is on screen so it never covers content. */
  _setupStickyCta(root);

  /* Returning-user line — only if local taste signal already supports it.
     Built at hydrate time because it reads localStorage (not in SSR/tests). */
  _setupReturningLine(root, product, deps);
}

function _setupReturningLine(root, product, deps = {}) {
  const el = root.querySelector('#pdp-returning');
  if (!el) return;
  const personalization = deps.personalization ?? Personalization;
  let taste;
  try { taste = personalization?.getTaste?.(); } catch { taste = null; }
  if (!taste) return;
  const line = getReturningUserLine(product, taste);
  if (!line) return;
  el.textContent = line;
  el.hidden = false;
}

/* ── Related rail (lazy, defensive) ─────────────────────────── */
export function renderRelated(root, seed, products) {
  const slot = root.querySelector('#pdp-related');
  const row = root.querySelector('#pdp-related-row');
  if (!slot || !row) return;

  const taste = Personalization.getTaste();
  const eligible = filterDisliked(products, taste, { minCount: 4 });
  const related = getRelatedProducts(seed, eligible, { limit: 4 });
  if (!related.length) {
    const sets = resolveDiscoverySets(filterDisliked(products, taste, { minCount: 3 }));
    if (sets.length) {
      renderDiscoverySetsFallback(slot, sets);
    } else {
      slot.hidden = true;
    }
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

/* ── PDP "Combina bien con" (collection pairs) ───────────────── */
export function renderCollectionPairs(root, seed, products) {
  const slot = root.querySelector('#pdp-pairs');
  if (!slot) return;

  const taste = Personalization.getTaste();
  const eligible = filterDisliked(products, taste, { minCount: 3 });
  const pairs = getCollectionPairs([seed], eligible, taste, { limit: 2 });

  if (!pairs.length) { slot.hidden = true; return; }

  const reason = getComplementReason([seed]);

  slot.innerHTML = `
    <h2 class="pdp-section-h" id="pdp-pairs-h">Combina bien con</h2>
    ${reason ? `<p class="pdp-pairs-reason">${_escape(reason)} · Una buena combinación.</p>` : ''}
    <div class="pdp-pairs-row">
      ${pairs.map((p, idx) => _pairCard(p, idx)).join('')}
    </div>`;
  slot.hidden = false;

  primeImageStates(slot);
  Tracker.collectionBuilderViewed(pairs, 'pdp');

  slot.querySelectorAll('.pdp-pair-card').forEach(card => {
    const product = pairs.find(p => String(p.id) === card.dataset.productId);
    if (!product) return;
    const position = Number(card.dataset.position) + 1;
    card.addEventListener('click', () => {
      Tracker.collectionBuilderClicked(product, position, 'pdp');
      window.__rd?.ui?.openProductModal?.(product);
    });
    card.querySelector('.pdp-pair-add')?.addEventListener('click', e => {
      e.stopPropagation();
      Tracker.collectionBuilderAdded(product, position, 'pdp');
      const variant = product.variants?.find(v => v.size === 3) ?? product.variants?.[0];
      if (variant) window.__rd?.cart?.add?.(product.id, variant.size);
    });
  });
}

function _pairCard(product, idx) {
  const variant = product.variants?.find(v => v.size === 3) ?? product.variants?.[0];
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <div class="pdp-pair-card" role="button" tabindex="0"
      data-product-id="${_escape(String(product.id))}" data-position="${idx}"
      aria-label="Ver ${_escape(product.name)}">
      <span class="pdp-pair-img${hasImage ? '' : ' pdp-pair-img--fallback'}">
        ${hasImage
          ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}"
               loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('pdp-pair-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="pdp-pair-info">
        <span class="pdp-pair-house">${_escape(product.house ?? '')}</span>
        <span class="pdp-pair-name">${_escape(product.name)}</span>
        ${variant ? `<span class="pdp-pair-price">${formatPrice(variant.price)} · ${variant.size}ml</span>` : ''}
      </span>
      <button class="pdp-pair-add btn-primary" type="button"
        aria-label="Agregar ${_escape(product.name)} al carrito">+</button>
    </div>`;
}

/* ── URL helpers ─────────────────────────────────────────────── */
export function productPageUrl(product) {
  const slug = product?.slug ?? product?.id;
  return `/perfume/${encodeURIComponent(String(slug ?? ''))}`;
}

export function readSlugFromLocation(pathname = (typeof window !== 'undefined' ? window.location.pathname : '')) {
  const m = String(pathname || '').match(/\/perfume\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function findProductBySlug(products, slug) {
  if (!Array.isArray(products) || !slug) return null;
  const target = String(slug).toLowerCase();
  return (
    products.find(p => String(p?.slug ?? '').toLowerCase() === target) ||
    products.find(p => String(p?.id ?? '').toLowerCase() === target) ||
    null
  );
}

/* ── Editorial blocks ───────────────────────────────────────── */

/* Single fused sell/guide section. Merges what used to be three
   separate blocks (novice lead, "¿Por qué esta fragancia?" why bullets,
   and "no es para ti si…") into one, with no repeated information:
     · plain-language lead       (getNoviceLead)
     · up to 2 why bullets       (getReasons — deterministic engine) */
function _whyYouMightLikeBlock(product) {
  const lead = getNoviceLead(product);
  const reasons = getReasons(product, { limit: MAX_PDP_WHY_REASONS });

  const reasonsHtml = reasons.length
    ? `<ul class="why-list pdp-why-list">
        ${reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>`
    : '';

  return `
    <section class="pdp-novice" id="pdp-novice" aria-labelledby="pdp-novice-h">
      <h2 class="pdp-section-h" id="pdp-novice-h">¿Por qué te puede gustar?</h2>
      <p class="pdp-novice-lead">${_escape(lead)}</p>
      <p class="pdp-returning" id="pdp-returning" hidden></p>
      ${reasonsHtml}
    </section>`;
}

function _technicalBlock(product) {
  const html = [_pdpBadgeDetailHtml(product), _notesDetailHtml(product), buildFragranceProfileHtml(product)].filter(Boolean).join('');
  if (!html) return '';
  return `
    <details class="pdp-intelligence pdp-tech" id="pdp-tech">
      <summary class="pdp-tech-summary">
        <span class="pdp-tech-summary-t">Perfil olfativo completo</span>
        <span class="pdp-tech-summary-d">Notas, acordes y barras de intensidad</span>
      </summary>
      <div class="pdp-tech-body">${html}</div>
    </details>`;
}

function _pdpBadgeDetailHtml(product) {
  const heroKeys = new Set(getDisplayBadges(product, { context: 'product_detail' }).map(b => b.key));
  const extra = getDisplayBadges(product, { context: 'product_detail', limit: 6 })
    .filter(b => !heroKeys.has(b.key));
  if (!extra.length) return '';

  return `
    <section class="fp-block pdp-policy-badges" aria-labelledby="pdp-policy-badges-h">
      <h3 class="fp-heading" id="pdp-policy-badges-h">Tambien destaca por</h3>
      <div class="pdp-policy-badge-row">
        ${extra.map(b => `<span class="guidance-chip guidance-chip--${_escape(b.key)}">${_escape(b.label)}</span>`).join('')}
      </div>
    </section>`;
}

function _notesDetailHtml(product) {
  const notes = Array.isArray(product?.notes) ? product.notes.filter(Boolean) : [];
  if (!notes.length) return '';
  return `
    <section class="fp-block fp-notes" aria-labelledby="fp-notes-h">
      <h3 class="fp-heading" id="fp-notes-h">Notas</h3>
      <div class="card-notes">${notes.map(n => `<span class="note-tag">${_escape(n)}</span>`).join('')}</div>
    </section>`;
}

/* ── Interactivity helpers ──────────────────────────────────── */

function _setupStickyCta(root) {
  const sticky = root.querySelector('#pdp-sticky-cta');
  const hero = root.querySelector('#pdp-hero');
  const buy = root.querySelector('#pdp-buy');
  if (!sticky || !hero || !buy || typeof IntersectionObserver === 'undefined') return;

  const state = { heroVisible: true, buyVisible: false };

  const update = () => {
    const shouldShow = !state.heroVisible && !state.buyVisible;
    sticky.classList.toggle('pdp-sticky-cta--open', shouldShow);
    sticky.setAttribute('aria-hidden', String(!shouldShow));
    /* The floating WhatsApp button sits in the same corner as this bar's
       primary action — hide it only while the bar is actually visible. */
    document.body.classList.toggle('pdp-cta-visible', shouldShow);
  };

  new IntersectionObserver(entries => {
    entries.forEach(e => { state.heroVisible = e.isIntersecting; });
    update();
  }, { threshold: 0.15 }).observe(hero);

  new IntersectionObserver(entries => {
    entries.forEach(e => { state.buyVisible = e.isIntersecting; });
    update();
  }, { threshold: 0.2 }).observe(buy);
}

/* ── Pure rendering helpers ─────────────────────────────────── */

function _sizesHtml(variants, defaultSize, product = null) {
  return PRIMARY_SIZES
    .map(ml => {
      const variant = variants.find(v => v.size === ml);
      if (!variant) return '';
      const disabled = variant.soldOut || variant.availability <= 0 || !_validVariantId(variant.variant_id);
      const recommended = ml === 5;
      const label = getSizeLabel(ml, product);   /* 10 ml "Mejor valor" only when truly cheaper per ml */
      return `
        <button
          class="pdp-size-btn ${ml === defaultSize ? 'pdp-size-btn--active' : ''} ${recommended ? 'pdp-size-btn--recommended' : ''} ${disabled ? 'pdp-size-btn--disabled' : ''}"
          data-size="${ml}"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
          aria-pressed="${ml === defaultSize}"
          aria-label="${ml}ml - $${variant.price} MXN${label ? ` — ${label}` : ''}${disabled ? ' agotado' : ''}">
          ${recommended ? '<span class="pdp-size-flag">Recomendado</span>' : ''}
          <span class="pdp-size-ml">${ml}ml</span>
          <span class="pdp-size-price">$${variant.price}</span>
          <span class="pdp-size-label">${disabled ? 'Agotado' : label}</span>
        </button>`;
    }).join('');
}

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

  /* Keep the sticky CTA price in sync as the user picks a size. */
  const stickyPrice = root.querySelector('.pdp-sticky-cta-price');
  if (stickyPrice) stickyPrice.textContent = formatPrice(price, 'Consultar');

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
      <span class="stock-dot"></span>Agotado
    </p>`;
  }
  return `<p class="card-stock pdp-stock card-stock--${scarcity.key}">
    <span class="stock-dot"></span>${_escape(scarcity.label)}
  </p>`;
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
