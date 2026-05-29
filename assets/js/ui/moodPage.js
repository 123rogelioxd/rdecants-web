/* =============================================================
   RDECANTS — MOOD PAGE
   Renders /mood/{slug} as a curated fragrance collection.

   Sections:
     1. Hero (title, tagline, chips)
     2. Why this mood
     3. Featured fragrances (up to 4 hero cards)
     4. More recommendations (grid)
     5. Discovery — related moods
     6. Catalog CTA

   Pure HTML builder + DOM hydrator. Defensive everywhere.
   ============================================================= */

import { primeImageStates } from './images.js';
import { Tracker } from '../tracking/tracker.js';
import { getDisplayVariant, formatPrice } from '../utils/prices.js?v=1.0.13';
import { rankProductsForMood } from '../moods/engine.js?v=1.0.0';
import {
  MOODS,
  findMoodBySlug,
  getRelatedMoods,
  moodPageUrl,
  readMoodSlugFromLocation,
} from '../moods/catalog.js?v=1.0.0';
import { productPageUrl } from './productPage.js?v=1.0.1';

/* Re-export for callers (page bootstrap, tests, modal). */
export { findMoodBySlug, moodPageUrl, readMoodSlugFromLocation, MOODS };

/* ── Public: build the page HTML for a mood ──────────────────── */
export function buildMoodPageHtml(mood, products = []) {
  if (!mood) return _notFoundHtml();

  const ranked = rankProductsForMood(products, mood, { limit: 12 });
  const featured = ranked.slice(0, 4);
  const more = ranked.slice(4, 12);
  const related = getRelatedMoods(mood);

  return `
    <a href="/" class="mood-back" aria-label="Volver al inicio">
      <span aria-hidden="true">←</span> Volver
    </a>

    <!-- 1. Hero -->
    <section class="mood-hero" id="mood-hero" aria-labelledby="mood-title">
      <p class="mood-eyebrow">${_escape(mood.eyebrow ?? 'Colección')}</p>
      <h1 class="mood-title" id="mood-title">${_escape(mood.title)}</h1>
      <p class="mood-tagline">${_escape(mood.tagline ?? '')}</p>
      ${mood.description ? `<p class="mood-description">${_escape(mood.description)}</p>` : ''}
      ${mood.chips?.length
        ? `<div class="mood-chips" aria-label="Etiquetas">
             ${mood.chips.map(c => `<span class="mood-chip">${_escape(c)}</span>`).join('')}
           </div>`
        : ''}
      <div class="mood-hero-actions">
        <a class="btn-primary" href="#mood-featured">Ver fragancias</a>
        ${related.length
          ? `<a class="btn-ghost" href="#mood-discover">Otros moods</a>`
          : ''}
      </div>
    </section>

    <!-- 2. Why this mood -->
    ${_whyBlock(mood)}

    <!-- 3. Featured fragrances -->
    ${_featuredBlock(mood, featured)}

    <!-- 4. More recommendations -->
    ${_moreBlock(more)}

    <!-- 5. Discovery — related moods -->
    ${_discoverBlock(mood, related)}

    <!-- 6. Catalog CTA -->
    <section class="mood-catalog-cta">
      <p>¿Prefieres ver todo el catálogo?</p>
      <a class="btn-ghost" href="/#catalog">Ver catálogo completo</a>
    </section>
  `;
}

/* ── Hydrate interactions ───────────────────────────────────── */
export function hydrateMoodPage(root, mood, products = []) {
  if (!root || !mood) return;

  primeImageStates(root);

  /* Featured + grid cards → product page */
  root.querySelectorAll('[data-product-id]').forEach((card, idx) => {
    card.addEventListener('click', () => {
      const id = card.dataset.productId;
      const product = (products || []).find(p => String(p.id) === String(id));
      if (!product) return;
      Tracker.recommendationClicked(product, idx + 1, {
        railId: `mood_${mood.slug}`,
        railTitle: mood.title,
      });
      window.location.href = productPageUrl(product);
    });
  });

  /* Smooth-scroll anchors (hero "Ver fragancias" / "Otros moods") */
  root.querySelectorAll('a[href^="#mood-"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const target = root.querySelector('#' + id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* Track exposure once */
  const featured = rankProductsForMood(products, mood, { limit: 12 }).slice(0, 4);
  if (featured.length) {
    Tracker.recommendationView(featured, {
      railId: `mood_${mood.slug}`,
      railTitle: mood.title,
    });
  }
}

/* ── Editorial blocks ───────────────────────────────────────── */

function _whyBlock(mood) {
  const list = Array.isArray(mood.why) ? mood.why.filter(Boolean) : [];
  if (!list.length) return '';
  return `
    <section class="mood-why" aria-labelledby="mood-why-h">
      <h2 class="mood-section-h" id="mood-why-h">¿Por qué elegir ${_escape(mood.title)}?</h2>
      <ul class="mood-why-list">
        ${list.map(item => `<li><span class="mood-why-dot" aria-hidden="true"></span>${_escape(item)}</li>`).join('')}
      </ul>
    </section>`;
}

function _featuredBlock(mood, featured) {
  if (!featured.length) {
    return `
      <section class="mood-featured mood-featured--empty" id="mood-featured">
        <h2 class="mood-section-h">Pronto curaremos esta colección</h2>
        <p class="mood-empty-copy">
          Aún no hay fragancias en catálogo que encajen con este mood.
          Vuelve pronto o explora el catálogo completo.
        </p>
      </section>`;
  }
  return `
    <section class="mood-featured" id="mood-featured" aria-labelledby="mood-featured-h">
      <h2 class="mood-section-h" id="mood-featured-h">Fragancias destacadas</h2>
      <div class="mood-featured-grid">
        ${featured.map((p, i) => _featuredCard(p, i)).join('')}
      </div>
    </section>`;
}

function _moreBlock(more) {
  if (!more.length) return '';
  return `
    <section class="mood-more" aria-labelledby="mood-more-h">
      <h2 class="mood-section-h" id="mood-more-h">Más recomendaciones</h2>
      <div class="mood-more-grid">
        ${more.map((p, i) => _gridCard(p, i)).join('')}
      </div>
    </section>`;
}

function _discoverBlock(mood, related) {
  if (!related.length) return '';
  return `
    <section class="mood-discover" id="mood-discover" aria-labelledby="mood-discover-h">
      <h2 class="mood-section-h" id="mood-discover-h">
        Si te gusta ${_escape(mood.title)} también podría gustarte:
      </h2>
      <div class="mood-discover-row">
        ${related.map(r => `
          <a class="mood-discover-card" href="${moodPageUrl(r)}">
            <span class="mood-discover-eyebrow">${_escape(r.eyebrow ?? 'Colección')}</span>
            <span class="mood-discover-title">${_escape(r.title)}</span>
            <span class="mood-discover-tagline">${_escape(r.tagline ?? '')}</span>
            <span class="mood-discover-arrow" aria-hidden="true">→</span>
          </a>
        `).join('')}
      </div>
    </section>`;
}

/* ── Card templates ─────────────────────────────────────────── */

function _featuredCard(product, idx) {
  const price = getDisplayVariant(product)?.price ?? null;
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <article class="mood-feature-card" data-product-id="${_escape(product.id)}" data-position="${idx}"
      role="button" tabindex="0" aria-label="Ver ${_escape(product.name)}">
      <div class="mood-feature-img">
        ${hasImage
          ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" loading="lazy" decoding="async"
                 onerror="this.parentElement.classList.add('mood-feature-img--fallback');this.remove()">`
          : ''}
      </div>
      <div class="mood-feature-info">
        <p class="mood-feature-house">${_escape(product.house ?? '')}</p>
        <h3 class="mood-feature-name">${_escape(product.name)}</h3>
        ${product.concentration ? `<span class="mood-feature-conc">${_escape(product.concentration)}</span>` : ''}
        <p class="mood-feature-price">${formatPrice(price, 'Ver detalles')}</p>
      </div>
    </article>`;
}

function _gridCard(product, idx) {
  const price = getDisplayVariant(product)?.price ?? null;
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <button class="mood-grid-card" data-product-id="${_escape(product.id)}" data-position="${idx}"
      aria-label="Ver ${_escape(product.name)}">
      <span class="mood-grid-img">
        ${hasImage
          ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" loading="lazy" decoding="async"
                 onerror="this.parentElement.classList.add('mood-grid-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="mood-grid-house">${_escape(product.house ?? '')}</span>
      <span class="mood-grid-name">${_escape(product.name)}</span>
      <span class="mood-grid-price">${formatPrice(price, 'Ver')}</span>
    </button>`;
}

/* ── Fallbacks ──────────────────────────────────────────────── */

function _notFoundHtml() {
  const list = MOODS.slice(0, 6).map(m => `
    <a class="mood-discover-card" href="${moodPageUrl(m)}">
      <span class="mood-discover-eyebrow">Colección</span>
      <span class="mood-discover-title">${_escape(m.title)}</span>
      <span class="mood-discover-tagline">${_escape(m.tagline ?? '')}</span>
    </a>`).join('');
  return `
    <div class="mood-empty premium-empty">
      <div class="sf-empty-icon" aria-hidden="true">R</div>
      <h1 class="sf-empty-title">No encontramos ese mood</h1>
      <p class="sf-empty-desc">El enlace puede haber expirado. Explora las colecciones disponibles:</p>
      <div class="mood-discover-row" style="margin-top:18px;">${list}</div>
      <a class="btn-ghost" href="/" style="margin-top:18px;">Volver al inicio</a>
    </div>`;
}

function _escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
