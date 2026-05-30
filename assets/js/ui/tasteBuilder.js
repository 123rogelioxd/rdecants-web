/* =============================================================
   RDECANTS — TASTE BUILDER
   Fast, swipe-style preference capture: one fragrance at a time,
   ❤️ / 👎 / Skip. No account, no backend, 60 s onboarding.

   Signal strength vs a passive view:
     Like    → 3× mood/house weight + added to taste.likes
     Dislike → −2× mood/house weight + added to taste.dislikes
     Skip    → no personalization change; only tracking event

   Pure exports (DOM-free, unit-testable):
     buildTasteQueue(products, taste, opts)  → product[]
     buildTasteCardHtml(product, idx, total) → HTML string

   UI export:
     setupTasteBuilder(containerId)          → home page mount
   ============================================================= */

import { isSellable, getOperationalScore } from '../recommendations/scoring.js?v=1.0.13';
import { Personalization } from '../recommendations/personalization.js?v=1.0.13';
import { getGuidanceBadges } from '../utils/guidance.js?v=1.0.13';
import { formatPrice, getDisplayVariant } from '../utils/prices.js?v=1.0.13';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from './images.js';

const QUEUE_LIMIT = 10;
const MIN_QUEUE   = 2;

/* ── Pure: build ordered queue of unrated sellable products ─────── */
export function buildTasteQueue(products, taste, { limit = QUEUE_LIMIT } = {}) {
  if (!Array.isArray(products) || !products.length) return [];

  const likedIds    = new Set((taste?.likes    ?? []).map(String));
  const dislikedIds = new Set((taste?.dislikes ?? []).map(String));

  const eligible = products.filter(
    p => isSellable(p) && !likedIds.has(String(p.id)) && !dislikedIds.has(String(p.id))
  );
  if (!eligible.length) return [];

  const sorted = eligible
    .slice()
    .sort((a, b) => getOperationalScore(b) - getOperationalScore(a));

  /* Prefer house variety: one product per house first, then backfill. */
  const chosen     = [];
  const usedHouses = new Set();
  for (const p of sorted) {
    if (chosen.length >= limit) break;
    const house = String(p.house ?? '').toLowerCase();
    if (!house || !usedHouses.has(house)) {
      usedHouses.add(house);
      chosen.push(p);
    }
  }
  for (const p of sorted) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(p)) chosen.push(p);
  }

  return chosen;
}

/* ── Pure: build one card's HTML ────────────────────────────────── */
export function buildTasteCardHtml(product, idx, total) {
  const hasImage = Boolean(product.image && product.image.trim());
  const variant  = getDisplayVariant(product);
  const hints    = _cardHints(product);

  const hintHtml = hints.length
    ? `<div class="tb-hints">${hints.map(h => `<span class="tb-hint">${_esc(h)}</span>`).join('')}</div>`
    : '';

  const priceHtml = variant?.price
    ? `<p class="tb-price">desde ${formatPrice(variant.price)}</p>`
    : '';

  return `
    <div class="tb-card" data-product-id="${_esc(String(product.id))}">
      <div class="tb-card-img${hasImage ? '' : ' tb-card-img--fallback'}">
        ${hasImage
          ? `<img src="${_esc(product.image)}" alt="${_esc(product.name)}"
               loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('tb-card-img--fallback');this.remove()">`
          : ''}
      </div>
      <div class="tb-card-body">
        <p class="tb-card-house">${_esc(product.house ?? '')}</p>
        <h3 class="tb-card-name">${_esc(product.name)}</h3>
        ${hintHtml}
        ${priceHtml}
      </div>
      <div class="tb-actions" role="group" aria-label="¿Te gusta ${_esc(product.name)}?">
        <button class="tb-btn tb-btn--dislike" data-action="dislike"
          aria-label="No me gusta ${_esc(product.name)}">
          <span aria-hidden="true">👎</span>
        </button>
        <button class="tb-btn tb-btn--skip" data-action="skip"
          aria-label="Saltar ${_esc(product.name)}">
          Saltar
        </button>
        <button class="tb-btn tb-btn--like" data-action="like"
          aria-label="Me gusta ${_esc(product.name)}">
          <span aria-hidden="true">❤️</span>
        </button>
      </div>
      <p class="tb-progress" aria-live="polite">${idx + 1} de ${total}</p>
    </div>`;
}

/* ── UI: home page mount ────────────────────────────────────────── */
export async function setupTasteBuilder(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  let products = [];
  try {
    const { CatalogProvider } = await import('../providers/catalog.js?v=1.0.16');
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const taste = Personalization.getTaste();
  const queue = buildTasteQueue(products, taste);

  if (queue.length < MIN_QUEUE) { root.hidden = true; return; }

  root.hidden = false;
  root.innerHTML = `
    <div class="container">
      <div class="tb-head fade-up">
        <p class="section-label">Descubre tu estilo</p>
        <h2 class="section-title">¿Te gusta?</h2>
        <p class="tb-intro">Dinos qué sientes con cada fragancia.<br>En 60 segundos conocemos tu estilo.</p>
      </div>
      <div class="tb-stage" id="tb-stage" aria-live="polite"></div>
    </div>`;

  _run(root, queue);
}

/* ── Internal: card loop ────────────────────────────────────────── */
function _run(root, queue) {
  const stage = root.querySelector('#tb-stage');
  if (!stage) return;

  let current = 0;

  function render() {
    if (current >= queue.length) { _showDone(stage); return; }

    const product = queue[current];
    stage.innerHTML = buildTasteCardHtml(product, current, queue.length);
    primeImageStates(stage);

    stage.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        /* Prevent double-fire: the exit CSS class sets pointer-events:none,
           but guard here too for safety. */
        if (stage.querySelector('.tb-card')?.classList.contains('tb-exit--' + action)) return;

        _handleAction(action, product);
        const card = stage.querySelector('.tb-card');
        _animateExit(card, action, () => { current++; render(); });
      });
    });
  }

  render();
}

function _handleAction(action, product) {
  if (action === 'like') {
    Personalization.recordLike(product);
    Tracker.tasteLike(product);
  } else if (action === 'dislike') {
    Personalization.recordDislike(product);
    Tracker.tasteDislike(product);
  } else {
    Tracker.tasteSkip(product);
  }
}

function _animateExit(card, action, onDone) {
  if (!card) { onDone(); return; }
  let called = false;
  const fire = () => { if (!called) { called = true; onDone(); } };
  card.classList.add(`tb-exit--${action}`);
  card.addEventListener('transitionend', fire, { once: true });
  setTimeout(fire, 380); // fallback if transition doesn't fire (e.g. prefers-reduced-motion)
}

function _showDone(stage) {
  stage.innerHTML = `
    <div class="tb-done">
      <p class="tb-done-icon" aria-hidden="true">✦</p>
      <p class="tb-done-h">Ya sabemos más sobre tu estilo.</p>
      <p class="tb-done-copy">Tus preferencias mejoran tus recomendaciones.</p>
      <button class="btn-primary tb-done-cta" type="button"
        onclick="document.getElementById('recommendation-rails')?.scrollIntoView({behavior:'smooth'})">
        Ver mis recomendaciones
      </button>
    </div>`;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function _cardHints(product) {
  const badges = getGuidanceBadges(product).slice(0, 2);
  if (badges.length) return badges.map(b => b.label);
  const family = product.fragrance?.scent_family_normalized;
  return family ? [_titleCase(String(family).replace(/[-_]+/g, ' '))] : [];
}

function _titleCase(str) {
  return String(str ?? '').replace(/\b\w/g, c => c.toUpperCase());
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
