/* =============================================================
   RDECANTS — PRODUCT DETAIL PAGE
   Editorial fragrance experience for /perfume/{slug}.

   Order (top → bottom):
     A. Hero editorial (image + name + emotional sentence + chips,
        NO buy controls — modal already handles "lo compro fast")
     B. ¿Por qué esta fragancia? (why bullets)
     C. Profile summary card (Familia / Vibra / Ideal para / Clima
        / Proyección · Duración text labels)
     D. ¿Es para mí? (mini interactive verdict, metadata-only)
     E. ¿Cuándo usarlo? (context checklist)
     F. Perfil (score bars with text bands)
     G. Buy section (price + variants + Add + WhatsApp)
     H. Si te gusta esto... (related)
   A sticky mini-buy CTA appears after the hero scrolls out and
   hides when the real buy section is in view.

   Defensive: every section renders nothing if its data is missing.
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
import {
  buildFragranceProfileHtml,
  getProfileSummary,
  getScoreSummary,
} from './fragranceProfile.js?v=1.0.1';
import { showToast } from './toast.js';

/* ── Public: build the page HTML ─────────────────────────────── */
export function buildProductPageHtml(product) {
  if (!product) return _notFoundHtml();

  const variants = getValidVariants(product);
  const defaultVariant = getDefaultVariant(product) || getDisplayVariant(product);
  const defaultSize = defaultVariant?.size ?? null;
  const defaultPrice = defaultVariant?.price ?? null;
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
        <div class="pdp-title-row">
          <h1 class="pdp-name" id="pdp-name">${_escape(product.name)}</h1>
          ${concentrationHtml}
        </div>

        ${product.story ? `<p class="pdp-story">${_escape(product.story)}</p>` : ''}

        ${notesHtml ? `<div class="pdp-notes card-notes">${notesHtml}</div>` : ''}
        ${guidanceHtml ? `<div class="pdp-guidance" aria-label="Recomendado para">${guidanceHtml}</div>` : ''}

        <div class="pdp-hero-actions">
          <button class="btn-ghost pdp-jump-buy" type="button" data-jump="#pdp-buy">
            Comprar ${defaultPrice !== null ? `· ${formatPrice(defaultPrice)}` : ''}
          </button>
          <button class="btn-ghost pdp-jump-fit" type="button" data-jump="#pdp-fit">
            ¿Es para mí?
          </button>
        </div>
      </div>
    </section>

    <!-- B. Why -->
    ${_whyEditorialBlock(product)}

    <!-- C. Profile summary -->
    ${_profileSummaryBlock(product)}

    <!-- D. ¿Es para mí? interactive verdict -->
    ${_fitQuizBlock(product)}

    <!-- E. ¿Cuándo usarlo? + F. Perfil (score bars) -->
    <section class="pdp-intelligence">
      ${buildFragranceProfileHtml(product)}
    </section>

    <!-- G. Buy section -->
    <section class="pdp-buy" id="pdp-buy" aria-labelledby="pdp-buy-h">
      <h2 class="pdp-section-h" id="pdp-buy-h">Lo quiero</h2>
      <div class="pdp-buybar" aria-label="Compra rápida">
        ${variants.length
          ? '<div class="pdp-sizes-label">Elige presentación</div>'
          : '<div class="pdp-price-consult">Precio disponible por consulta personalizada.</div>'}

        <div class="pdp-sizes" role="group" aria-label="Seleccionar presentación" ${variants.length ? '' : 'hidden'}>
          ${_sizesHtml(variants, defaultSize)}
        </div>

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
            aria-label="Preparar pedido de ${_escape(product.name)} por WhatsApp">
            WhatsApp
          </button>
        </div>
      </div>
    </section>

    <!-- H. Related -->
    <section class="pdp-related" id="pdp-related" hidden aria-labelledby="pdp-related-h">
      <h2 class="pdp-section-h" id="pdp-related-h">Si te gusta esto...</h2>
      <div class="pdp-related-row" id="pdp-related-row"></div>
    </section>

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

  /* Add to cart */
  root.querySelector('#pdp-btn-add')?.addEventListener('click', async () => {
    const variant = getVariantForSize(product, selectedSize);
    if (selectedSize === null || getPriceForSize(product, selectedSize) === null || !_isOrderableVariant(variant)) {
      showToast('Precio por confirmar. Escríbenos por WhatsApp.');
      return;
    }
    const cart = deps.cart ?? window.__rd?.cart;
    await cart?.add?.(product.id, selectedSize);
    (deps.openCart ?? window.__rd?.ui?.openCart)?.();
  });

  /* WhatsApp */
  root.querySelector('#pdp-btn-wa')?.addEventListener('click', async () => {
    const variant = getVariantForSize(product, selectedSize);
    if (!_isOrderableVariant(variant)) {
      showToast('Apartamos tu pedido y te llevamos a WhatsApp para confirmar.');
      (deps.openCart ?? window.__rd?.ui?.openCart)?.();
      return;
    }
    const cart = deps.cart ?? window.__rd?.cart;
    await cart?.add?.(product.id, selectedSize);
    showToast('Apartamos tu pedido y te llevamos a WhatsApp para confirmar.');
    (deps.openCart ?? window.__rd?.ui?.openCart)?.();
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

  /* "¿Es para mí?" interactive verdict */
  _setupFitQuiz(root, product);
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

function _whyEditorialBlock(product) {
  const html = buildWhyHtml(product);
  if (!html) return '';
  return `<section class="pdp-why" aria-labelledby="pdp-why-h">
    <h2 class="pdp-section-h" id="pdp-why-h">¿Por qué esta fragancia?</h2>
    ${html}
  </section>`;
}

function _profileSummaryBlock(product) {
  const summary = getProfileSummary(product.fragrance);
  if (!summary) return '';

  const scores = getScoreSummary(product.fragrance);
  const projection = scores.find(s => s.key === 'projection');
  const longevity = scores.find(s => s.key === 'longevity');

  const rows = [
    summary.family ? _summaryRow('Familia', summary.family) : '',
    summary.vibe.length ? _summaryRow('Vibra', summary.vibe.join(' · ')) : '',
    summary.bestFor.length ? _summaryRow('Ideal para', summary.bestFor.join(' · ')) : '',
    summary.climate ? _summaryRow('Clima', summary.climate) : '',
    (projection || longevity)
      ? _summaryRow(
          'Carácter',
          [
            projection ? `Proyección ${projection.band.toLowerCase()}` : null,
            longevity ? `duración ${longevity.band.toLowerCase()}` : null,
          ].filter(Boolean).join(' · ')
        )
      : '',
  ].filter(Boolean).join('');

  if (!rows) return '';

  return `
    <section class="pdp-summary" aria-labelledby="pdp-summary-h">
      <h2 class="pdp-section-h" id="pdp-summary-h">Resumen del perfil</h2>
      <dl class="pdp-summary-rows">${rows}</dl>
    </section>`;
}

function _summaryRow(label, value) {
  return `
    <div class="pdp-summary-row">
      <dt>${_escape(label)}</dt>
      <dd>${_escape(value)}</dd>
    </div>`;
}

function _fitQuizBlock(product) {
  const f = product.fragrance;
  if (!f) return '';

  /* Each question maps to a metadata-driven predicate evaluated at click
     time by _setupFitQuiz. We render the questions; the verdict is empty
     until the user answers at least one. */
  const questions = [
    { key: 'fresh',    text: '¿Buscas algo fresco?' },
    { key: 'daily',    text: '¿Lo quieres para diario?' },
    { key: 'standout', text: '¿Quieres que llame atención?' },
  ];

  return `
    <section class="pdp-fit" id="pdp-fit" aria-labelledby="pdp-fit-h">
      <h2 class="pdp-section-h" id="pdp-fit-h">¿Es para mí?</h2>
      <p class="pdp-fit-intro">Contesta rápido y te decimos si encaja contigo.</p>
      <ul class="pdp-fit-questions" role="list">
        ${questions.map(q => `
          <li class="pdp-fit-q" data-q="${q.key}">
            <span class="pdp-fit-q-text">${_escape(q.text)}</span>
            <span class="pdp-fit-q-actions" role="group" aria-label="${_escape(q.text)}">
              <button class="pdp-fit-yes" type="button" data-answer="yes" aria-pressed="false">Sí</button>
              <button class="pdp-fit-no" type="button" data-answer="no" aria-pressed="false">No</button>
            </span>
          </li>`).join('')}
      </ul>
      <p class="pdp-fit-verdict" id="pdp-fit-verdict" aria-live="polite"></p>
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

export function evaluateFitAnswers(product, answers) {
  /* Pure: given answers, return a verdict object. Exported so the test
     suite can assert the metadata logic without touching the DOM. */
  const f = product?.fragrance ?? null;
  if (!f) return null;

  const scores = Object.fromEntries(getScoreSummary(f).map(s => [s.key, s.pct]));
  const moods = _normSet(f.mood_tags);
  const styles = _normSet(f.style_tags);
  const contexts = _normSet(f.recommended_context_tags);
  const family = String(f.scent_family_normalized ?? '').toLowerCase();

  const checks = {
    fresh: () => (scores.freshness ?? 0) >= 55
      || ['fresh', 'aquatic', 'acuatico', 'citrus', 'citrico'].some(k => family.includes(k))
      || ['clean', 'fresh', 'cool'].some(k => moods.has(k)),
    daily: () => (scores.versatility ?? 0) >= 55
      || ['daily', 'daily-use', 'office', 'casual', 'work'].some(k => contexts.has(k))
      || styles.has('minimal') || styles.has('versatile'),
    standout: () => (scores.projection ?? 0) >= 60
      || ['sensual', 'powerful', 'intense', 'mysterious', 'confident'].some(k => moods.has(k))
      || styles.has('bold') || styles.has('luxurious')
      || ['night', 'party', 'date', 'date-night'].some(k => contexts.has(k)),
  };

  let yesAsked = 0;
  let matches = 0;
  const detail = [];

  Object.entries(answers).forEach(([key, answer]) => {
    if (answer !== 'yes' && answer !== 'no') return;
    const matchesProduct = checks[key]?.() ?? false;
    if (answer === 'yes') {
      yesAsked += 1;
      if (matchesProduct) {
        matches += 1;
        detail.push(_fitPositiveLabel(key));
      } else {
        detail.push(_fitNegativeLabel(key));
      }
    } else if (matchesProduct) {
      /* User said "no" but the product leans this way — soft warning. */
      detail.push(_fitContraLabel(key));
    }
  });

  if (yesAsked === 0 && detail.length === 0) return { tone: 'idle', headline: '', detail: '' };

  let tone = 'mixed';
  let headline = 'Tal vez te convenga revisar otras opciones.';
  if (yesAsked > 0 && matches === yesAsked) {
    tone = 'positive';
    headline = 'Sí, este va contigo.';
  } else if (yesAsked > 0 && matches === 0) {
    tone = 'negative';
    headline = 'Probablemente te conviene algo distinto.';
  } else if (yesAsked > 0) {
    tone = 'mixed';
    headline = `Coincide en ${matches} de ${yesAsked} cosas que buscas.`;
  }

  return { tone, headline, detail: detail.join(' · ') };
}

function _setupFitQuiz(root, product) {
  const section = root.querySelector('#pdp-fit');
  const verdict = root.querySelector('#pdp-fit-verdict');
  if (!section || !verdict) return;

  const answers = { fresh: null, daily: null, standout: null };

  section.querySelectorAll('.pdp-fit-q').forEach(li => {
    const key = li.dataset.q;
    li.querySelectorAll('button[data-answer]').forEach(btn => {
      btn.addEventListener('click', () => {
        const answer = btn.dataset.answer;
        answers[key] = answers[key] === answer ? null : answer;

        li.querySelectorAll('button[data-answer]').forEach(b => {
          const isSelected = answers[key] === b.dataset.answer;
          b.setAttribute('aria-pressed', String(isSelected));
          b.classList.toggle('pdp-fit-btn--selected', isSelected);
        });

        const result = evaluateFitAnswers(product, answers);
        _renderFitVerdict(verdict, result);
      });
    });
  });
}

function _renderFitVerdict(el, result) {
  if (!el) return;
  if (!result || result.tone === 'idle') {
    el.textContent = '';
    el.removeAttribute('data-tone');
    return;
  }
  el.dataset.tone = result.tone;
  el.innerHTML = `
    <strong class="pdp-fit-verdict-h">${_escape(result.headline)}</strong>
    ${result.detail ? `<span class="pdp-fit-verdict-d">${_escape(result.detail)}</span>` : ''}
  `;
}

/* ── Pure rendering helpers ─────────────────────────────────── */

function _sizesHtml(variants, defaultSize) {
  return [3, 5, 10]
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

function _normSet(list) {
  return new Set((Array.isArray(list) ? list : []).map(s => String(s ?? '').toLowerCase().trim()));
}

function _fitPositiveLabel(key) {
  return ({
    fresh:    'Tiene un alma fresca',
    daily:    'Versátil para el día a día',
    standout: 'Llama la atención',
  })[key] ?? '';
}
function _fitNegativeLabel(key) {
  return ({
    fresh:    'no es lo más fresco del catálogo',
    daily:    'es más para ocasiones puntuales',
    standout: 'es más discreto que llamativo',
  })[key] ?? '';
}
function _fitContraLabel(key) {
  return ({
    fresh:    'avisa: este sí tiende a fresco',
    daily:    'avisa: este se siente cómodo a diario',
    standout: 'avisa: este sí proyecta',
  })[key] ?? '';
}
