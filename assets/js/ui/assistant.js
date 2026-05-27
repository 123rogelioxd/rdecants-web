/* =============================================================
   RDECANTS — GUIDED ASSISTANT (UI)
   Premium inline picker (NOT a floating chatbot). A compact set of
   guided questions with sensible defaults, so a beginner can get
   2–4 confident recommendations in one or two taps.

   Logic + matching live in recommendations/assistant.js — this file
   only renders and wires interactions.
   ============================================================= */

import { ASSISTANT_QUESTIONS, getAssistantRecommendations } from '../recommendations/assistant.js?v=1.0.13';
import { CatalogProvider } from '../providers/catalog.js?v=1.0.13';
import { Tracker } from '../tracking/tracker.js';
import { openProductModal } from './modal.js?v=1.0.13';
import { primeImageStates } from './images.js';
import { formatPrice } from '../utils/prices.js?v=1.0.13';

const RAIL_CONTEXT = { railId: 'assistant', railTitle: 'Asistente de fragancias' };

/* Default answer = first option of each question (frictionless start). */
const _answers = Object.fromEntries(ASSISTANT_QUESTIONS.map(q => [q.id, q.options[0].value]));

let _root = null;
let _lastResults = [];

export function setupAssistant(containerId = 'assistant') {
  _root = document.getElementById(containerId);
  if (!_root) return;
  _renderShell();
  _bindForm();
}

/* ── Shell ─────────────────────────────────────────────────── */
function _renderShell() {
  _root.innerHTML = `
    <div class="container">
      <div class="asst-head fade-up">
        <p class="section-label">Asistente de fragancias</p>
        <h2 class="section-title">Encuentra tu<br><em>match ideal</em></h2>
        <p class="asst-sub">Responde unas preguntas rápidas y te sugerimos opciones pensadas para ti.</p>
      </div>

      <form class="asst-form fade-up" id="asst-form" aria-label="Preguntas guiadas">
        ${ASSISTANT_QUESTIONS.map(_questionBlock).join('')}
        <div class="asst-actions">
          <button type="submit" class="btn-primary asst-submit">Ver mis recomendaciones</button>
        </div>
      </form>

      <div class="asst-results" id="asst-results" hidden></div>
    </div>
  `;
}

function _questionBlock(q) {
  return `
    <fieldset class="asst-q" data-q="${q.id}">
      <legend class="asst-q-label">${q.label}</legend>
      <div class="asst-chips" role="group" aria-label="${q.label}">
        ${q.options.map(opt => `
          <button type="button" class="asst-chip ${opt.value === _answers[q.id] ? 'asst-chip--active' : ''}"
            data-q="${q.id}" data-value="${opt.value}"
            aria-pressed="${opt.value === _answers[q.id]}">${opt.label}</button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

/* ── Interactions ──────────────────────────────────────────── */
function _bindForm() {
  const form = _root.querySelector('#asst-form');
  if (!form) return;

  form.addEventListener('click', (event) => {
    const chip = event.target.closest('.asst-chip');
    if (!chip) return;
    Tracker.assistantStarted(_answers);
    const { q, value } = chip.dataset;
    _answers[q] = value;
    form.querySelectorAll(`.asst-chip[data-q="${q}"]`).forEach(btn => {
      const active = btn === chip;
      btn.classList.toggle('asst-chip--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    Tracker.assistantStarted(_answers);
    await _generate();
  });
}

async function _generate() {
  const resultsEl = _root.querySelector('#asst-results');
  const submit = _root.querySelector('.asst-submit');
  if (!resultsEl) return;

  submit?.classList.add('is-loading');
  if (submit) submit.disabled = true;

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const results = getAssistantRecommendations(_answers, products);
  _lastResults = results;
  Tracker.assistantCompleted(results, _answers);

  submit?.classList.remove('is-loading');
  if (submit) submit.disabled = false;

  if (!results.length) {
    resultsEl.innerHTML = `
      <div class="asst-empty">
        <p class="asst-empty-title">Aún no encontramos un match exacto</p>
        <p class="asst-empty-desc">Ajusta tus respuestas o explora la colección completa.</p>
        <button type="button" class="btn-ghost asst-empty-cta" id="asst-explore">Ver catálogo</button>
      </div>`;
    resultsEl.hidden = false;
    resultsEl.querySelector('#asst-explore')?.addEventListener('click', () => window.__rd?.ui?.scrollToCatalog?.());
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  resultsEl.innerHTML = `
    <p class="asst-results-label">Pensado para ti</p>
    <div class="asst-results-grid">
      ${results.map(_resultCard).join('')}
    </div>`;
  resultsEl.hidden = false;

  primeImageStates(resultsEl);
  Tracker.recommendationView(results.map(r => r.product), RAIL_CONTEXT);
  _bindResults(resultsEl, results);
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _resultCard(result, idx) {
  const { product, variant, matchTier, reasons, useCase } = result;
  const canAdd = Boolean(variant);
  const hasImage = product.image && product.image.trim() !== '';
  const reasonsHtml = reasons.map(r => `<li>${r}</li>`).join('');

  return `
    <article class="asst-card" data-product-id="${product.id}" data-position="${idx}">
      <div class="asst-card-media">
        <span class="asst-match asst-match--${matchTier.key}">${matchTier.label}</span>
        <span class="asst-card-img">
          ${hasImage
            ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async"
                 onerror="this.parentElement.classList.add('asst-card-img--fallback');this.remove()">`
            : ''}
        </span>
      </div>
      <div class="asst-card-body">
        <p class="asst-card-house">${product.house ?? ''}</p>
        <h3 class="asst-card-name">${product.name}</h3>
        ${useCase ? `<p class="asst-card-usecase">${useCase}</p>` : ''}
        ${reasonsHtml ? `<ul class="asst-card-reasons">${reasonsHtml}</ul>` : ''}
        <div class="asst-card-foot">
          <span class="asst-card-price">${canAdd ? `${formatPrice(variant.price)} <small>/ ${variant.size}ml</small>` : 'Consultar'}</span>
          <div class="asst-card-actions">
            <button type="button" class="asst-card-detail" data-action="detail">Ver</button>
            ${canAdd
              ? `<button type="button" class="btn-primary asst-card-add" data-action="add">Agregar</button>`
              : ''}
          </div>
        </div>
      </div>
    </article>
  `;
}

function _bindResults(resultsEl, results) {
  resultsEl.querySelectorAll('.asst-card').forEach(card => {
    const result = results.find(r => String(r.product.id) === card.dataset.productId);
    if (!result) return;
    const position = Number(card.dataset.position) + 1;

    card.querySelector('[data-action="detail"]')?.addEventListener('click', () => {
      Tracker.recommendationClicked(result.product, position, RAIL_CONTEXT);
      openProductModal(result.product);
    });

    card.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      if (!result.variant) return;
      Tracker.recommendationClicked(result.product, position, RAIL_CONTEXT);
      window.__rd?.cart?.add(result.product.id, result.variant.size);
      window.__rd?.ui?.openCart?.();
    });
  });
}
