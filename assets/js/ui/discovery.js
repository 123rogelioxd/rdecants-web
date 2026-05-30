/* =============================================================
   RDECANTS — DISCOVERY UI
   "¿Conoces alguno de estos?" — anchor-based discovery picker.

   UX flow:
     1. Up to five anchor chips (image + house + name), horizontal.
     2. Tap an anchor → show up to four similar products below.
     3. Tap the same anchor again → collapse results.
     4. Tap a recommendation card → open product modal.

   Logic lives in recommendations/discovery.js.
   Pattern mirrors ui/assistant.js: setup*(containerId) → render → bind.
   ============================================================= */

import { getAnchorProducts, getDiscoveryRecommendations } from '../recommendations/discovery.js?v=1.0.0';
import { Personalization, filterDisliked } from '../recommendations/personalization.js?v=1.0.13';
import { CatalogProvider }  from '../providers/catalog.js?v=1.0.16';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from './modal.js?v=1.0.17';
import { primeImageStates } from './images.js';
import { getDefaultVariant, formatPrice } from '../utils/prices.js?v=1.0.13';

const RAIL_CONTEXT = { railId: 'discovery', railTitle: 'Empieza por lo que ya conoces' };
const MIN_ANCHORS  = 2;

let _root      = null;
let _products  = [];
let _activeId  = null;

export async function setupDiscovery(containerId = 'discovery') {
  _root = document.getElementById(containerId);
  if (!_root) return;

  try {
    _products = await CatalogProvider.getProducts();
  } catch {
    _products = [];
  }

  const anchors = getAnchorProducts(_products, { limit: 5 });
  if (anchors.length < MIN_ANCHORS) {
    _root.hidden = true;
    return;
  }

  _render(anchors);
}

/* ── Shell ─────────────────────────────────────────────────── */
function _render(anchors) {
  _root.hidden = false;
  _root.innerHTML = `
    <div class="container">
      <div class="disc-head fade-up">
        <p class="section-label">Descubrimiento</p>
        <h2 class="section-title">¿Conoces<br><em>alguno de estos?</em></h2>
        <p class="disc-sub">Toca el que ya conoces para ver opciones similares.</p>
      </div>

      <div class="disc-anchors fade-up" role="group" aria-label="Fragancias ancla">
        ${anchors.map(_anchorChip).join('')}
      </div>

      <div class="disc-results" id="disc-results" hidden aria-live="polite"></div>
    </div>
  `;

  primeImageStates(_root);
  _bindAnchors(anchors);
}

function _anchorChip(product) {
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <button class="disc-anchor" data-product-id="${_esc(product.id)}"
      aria-pressed="false" aria-label="Conozco ${_esc(product.name)}">
      <span class="disc-anchor-img${hasImage ? '' : ' disc-anchor-img--fallback'}">
        ${hasImage
          ? `<img src="${_esc(product.image)}" alt="${_esc(product.name)}"
               loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('disc-anchor-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="disc-anchor-info">
        <span class="disc-anchor-house">${_esc(product.house ?? '')}</span>
        <span class="disc-anchor-name">${_esc(product.name)}</span>
      </span>
    </button>
  `;
}

/* ── Interactions ──────────────────────────────────────────── */
function _bindAnchors(anchors) {
  _root.querySelectorAll('.disc-anchor').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.productId;

      /* Toggle: second tap on same anchor collapses results */
      if (_activeId === id) {
        _activeId = null;
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('disc-anchor--active');
        _hideResults();
        return;
      }

      _activeId = id;
      _root.querySelectorAll('.disc-anchor').forEach(b => {
        const active = b === btn;
        b.classList.toggle('disc-anchor--active', active);
        b.setAttribute('aria-pressed', String(active));
      });

      const anchor = anchors.find(p => String(p.id) === id);
      if (!anchor) return;

      Tracker.discoveryAnchorSelected(anchor);
      _showRecs(anchor);
    });
  });
}

function _showRecs(anchor) {
  const el = _root.querySelector('#disc-results');
  if (!el) return;

  const taste = Personalization.getTaste();
  const eligible = filterDisliked(_products, taste, { minCount: 2 });
  const recs = getDiscoveryRecommendations(anchor, eligible, { limit: 4 });

  if (!recs.length) {
    el.innerHTML = `
      <p class="disc-empty">Seguimos ampliando el catálogo — aquí aparecerán más opciones pronto.</p>`;
    el.hidden = false;
    return;
  }

  el.innerHTML = `
    <p class="disc-results-label">
      Si te gusta <strong>${_esc(anchor.name)}</strong>, también puede gustarte:
    </p>
    <div class="disc-recs-row">
      ${recs.map(_recCard).join('')}
    </div>
  `;
  el.hidden = false;

  primeImageStates(el);
  Tracker.recommendationView(recs, RAIL_CONTEXT);
  _bindRecs(el, recs);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _hideResults() {
  const el = _root.querySelector('#disc-results');
  if (el) { el.hidden = true; el.innerHTML = ''; }
}

function _recCard(product, idx) {
  const variant  = getDefaultVariant(product);
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <button class="disc-rec-card" data-product-id="${_esc(product.id)}" data-position="${idx}"
      aria-label="Ver ${_esc(product.name)}">
      <span class="disc-rec-img${hasImage ? '' : ' disc-rec-img--fallback'}">
        ${hasImage
          ? `<img src="${_esc(product.image)}" alt="${_esc(product.name)}"
               loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('disc-rec-img--fallback');this.remove()">`
          : ''}
      </span>
      <span class="disc-rec-house">${_esc(product.house ?? '')}</span>
      <span class="disc-rec-name">${_esc(product.name)}</span>
      <span class="disc-rec-price">${variant ? formatPrice(variant.price) : 'Consultar'}</span>
    </button>
  `;
}

function _bindRecs(el, recs) {
  el.querySelectorAll('.disc-rec-card').forEach(card => {
    const product  = recs.find(p => String(p.id) === card.dataset.productId);
    if (!product) return;
    const position = Number(card.dataset.position) + 1;
    card.addEventListener('click', () => {
      Tracker.recommendationClicked(product, position, RAIL_CONTEXT);
      openProductModal(product);
    });
  });
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
