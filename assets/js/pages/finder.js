/* =============================================================
   RDECANTS — GUIDED FINDER PAGE ENTRY (/elegir.html)

   Three questions a beginner can actually answer, then THREE
   recommendations — not twenty-eight. Handing someone the whole ranked
   catalog and calling it a recommendation is just the catalog with extra
   steps; each pick here answers a different worry (best fit / hardest to
   dislike / gets noticed) and says in plain words why it is there.

   The ranking is the same deterministic engine the catalog uses
   (recommendations/assistant.js). This file only asks and renders.
   ============================================================= */

import { bootstrapShell }        from '../core/shell.js';
import {
  ASSISTANT_QUESTIONS,
  getBeginnerPicks,
  suggestedStarterMl,
}                                from '../recommendations/assistant.js';
import { CatalogProvider }       from '../providers/catalog.js';
import { buildCatalogUrl,
         stashGuideHandoff }     from '../catalog/intents.js';
import { formatPrice,
         getVariantForSize,
         getOrderableVariants }  from '../utils/prices.js';
import { openProductModal }      from '../ui/modal.js';
import { primeImageStates }      from '../ui/images.js';
import { Tracker }               from '../tracking/tracker.js';
import { AppState }              from '../core/state.js';

/* The set is three small decants — the cheapest honest way to try all
   three recommendations. No invented discount: it is the sum of its parts. */
const SET_SIZE_ML = 3;

let _root = null;
let _step = 0;
let _picks = [];
const _answers = {};

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  _root = document.getElementById('finder-root');
  if (_root) {
    _renderStep({ focus: false });
    _root.addEventListener('click', _onClick);
  }

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

/* ── Interaction ─────────────────────────────────────────────── */

function _onClick(event) {
  const chip = event.target.closest('.finder-chip');
  if (chip) {
    _answers[chip.dataset.group] = chip.dataset.value;
    _renderStep({ focus: false });
    return;
  }

  const option = event.target.closest('.finder-option');
  if (option) {
    _answers[ASSISTANT_QUESTIONS[_step].id] = option.dataset.value;
    _advance();
    return;
  }

  if (event.target.closest('#finder-next')) { _advance(); return; }

  if (event.target.closest('#finder-back')) {
    if (_step === 0) { window.location.href = '/'; return; }
    _step -= 1;
    _renderStep({ focus: true });
    return;
  }

  const add = event.target.closest('[data-add-pick]');
  if (add) { _addPick(add.dataset.addPick, add); return; }

  if (event.target.closest('#pick-set-add')) { _addSet(event.target.closest('#pick-set-add')); return; }

  const detail = event.target.closest('[data-open-pick]');
  if (detail) {
    const pick = _picks.find(p => String(p.product.id) === detail.dataset.openPick);
    if (pick) openProductModal(pick.product);
  }
}

function _advance() {
  if (_step < ASSISTANT_QUESTIONS.length - 1) {
    _step += 1;
    _renderStep({ focus: true });
    return;
  }
  _finish();
}

/* ── Questions ───────────────────────────────────────────────── */

function _isStepAnswered(question) {
  if (question.groups) return question.groups.every(group => _answers[group.id]);
  return Boolean(_answers[question.id]);
}

function _renderStep({ focus = false } = {}) {
  const total = ASSISTANT_QUESTIONS.length;
  const question = ASSISTANT_QUESTIONS[_step];
  const pct = Math.round(((_step + 1) / total) * 100);
  const answered = _isStepAnswered(question);

  const body = question.groups
    ? question.groups.map(group => `
        <div class="finder-group">
          <span class="finder-group-label">${group.label}</span>
          <div class="finder-chips" role="group" aria-label="${group.label}">
            ${group.options.map(option => `
              <button type="button" class="finder-chip"
                data-group="${group.id}" data-value="${option.value}"
                aria-pressed="${_answers[group.id] === option.value}">${option.label}</button>`).join('')}
          </div>
        </div>`).join('')
    : `<div class="finder-options" role="group" aria-labelledby="finder-question">
        ${question.options.map(option => `
          <button type="button" class="finder-option" data-value="${option.value}"
            aria-pressed="${_answers[question.id] === option.value}">${option.label}</button>`).join('')}
      </div>`;

  /* A compound step cannot auto-advance — the customer has two choices to
     make — so it gets an explicit Continue. Single-choice steps advance on
     the answer itself and never show a redundant button. */
  const nextButton = question.groups
    ? `<button type="button" class="btn-primary finder-next" id="finder-next" ${answered ? '' : 'disabled'}>
         Continuar
       </button>`
    : '';

  _root.innerHTML = `
    <div class="finder-progress">
      <span>Paso ${_step + 1} de ${total}</span>
      <span class="finder-bar" role="progressbar"
        aria-valuenow="${_step + 1}" aria-valuemin="1" aria-valuemax="${total}"
        aria-label="Progreso de las preguntas"><span style="width:${pct}%"></span></span>
    </div>

    <h2 class="finder-q" id="finder-question">${question.label}</h2>

    ${body}
    ${nextButton}

    <div class="finder-nav">
      <button type="button" class="btn-ghost" id="finder-back">
        ${_step === 0 ? 'Volver al inicio' : 'Atrás'}
      </button>
      <a class="finder-skip" href="/catalogo.html">Prefiero ver todo el catálogo</a>
    </div>`;

  if (focus) _root.querySelector('.finder-option, .finder-chip')?.focus({ preventScroll: true });
}

/* ── Results ─────────────────────────────────────────────────── */

async function _finish() {
  try { Tracker.assistantStarted?.({ ..._answers }); } catch { /* best-effort */ }

  _root.innerHTML = `
    <div class="finder-progress"><span>Buscando tus opciones…</span></div>
    <div class="picks-grid">
      ${'<li class="card-skeleton" aria-hidden="true"><div class="card-skeleton-body"><div class="card-skeleton-line card-skeleton-line--short"></div><div class="card-skeleton-line card-skeleton-line--wide"></div></div></li>'.repeat(3)}
    </div>`;

  let products = [];
  try { products = await CatalogProvider.getProducts(); } catch { products = []; }

  _picks = getBeginnerPicks(_answers, products);
  _renderPicks();
}

function _renderPicks() {
  if (!_picks.length) {
    _root.innerHTML = `
      <div class="picks-empty">
        <p class="pick-set-title">Aún no tenemos un match exacto</p>
        <p class="pick-set-note">Ajusta tus respuestas o revisa el catálogo completo; también podemos recomendarte por WhatsApp.</p>
        <div class="finder-nav" style="justify-content:center;gap:16px;">
          <a class="btn-primary" href="/catalogo.html">Ver catálogo</a>
          <a class="finder-skip" href="https://wa.me/5219516513018" target="_blank" rel="noopener">Pedir ayuda por WhatsApp</a>
        </div>
      </div>`;
    return;
  }

  const starterMl = suggestedStarterMl(_answers.age);

  _root.innerHTML = `
    <div class="finder-progress"><span>Tus recomendaciones</span></div>

    <ul class="picks-grid">
      ${_picks.map(pick => _pickCard(pick)).join('')}
    </ul>

    ${_picks.length >= 2 ? _setOffer(starterMl) : ''}

    <div class="picks-more">
      <a class="btn-outline" href="${buildCatalogUrl(_answers)}" id="picks-more-link">Ver más opciones</a>
    </div>`;

  primeImageStates(_root);

  /* The catalog page can re-rank even if a host redirect eats the query. */
  stashGuideHandoff({ ..._answers });
}

function _pickCard(pick) {
  const { product, role, label, blurb } = pick;
  const variant = pick.suggestedVariant ?? pick.variant;
  const orderable = _isOrderable(variant);
  const reason = pick.reasons?.[0] ?? '';

  return `
    <li>
      <article class="pick-card ${role === 'best' ? 'pick-card--best' : ''}">
        <p class="pick-label">${label}</p>
        <div class="pick-media" data-open-pick="${product.id}" role="button" tabindex="0"
             aria-label="Ver detalle de ${product.name}">
          ${product.image
            ? `<img src="${product.image}" alt="${product.name}" width="400" height="300" loading="lazy" decoding="async">`
            : ''}
        </div>
        <div class="pick-body">
          <p class="pick-house">${product.house}</p>
          <h3 class="pick-name">${product.name}</h3>
          ${blurb ? `<p class="pick-blurb">${blurb}</p>` : ''}
          ${reason ? `<p class="pick-why">${reason}</p>` : ''}
          <div class="pick-buy">
            <span class="pick-price">${variant ? formatPrice(variant.price) : 'Consultar'} <small>· ${variant?.size ?? '—'} ml</small></span>
            <button type="button" class="pick-action" data-add-pick="${product.id}" ${orderable ? '' : 'disabled'}>
              ${orderable ? `Probar ${variant.size} ml` : 'Agotado'}
            </button>
          </div>
        </div>
      </article>
    </li>`;
}

/* Offered BEFORE the long list: someone who cannot choose between three
   should be able to take all three, not scroll past twelve more products. */
function _setOffer(starterMl) {
  const lines = _picks.map(pick => _setVariant(pick, starterMl)).filter(Boolean);
  if (lines.length < 2) return '';

  const total = lines.reduce((sum, v) => sum + (Number(v.price) || 0), 0);
  const sizes = [...new Set(lines.map(v => v.size))];
  const sizeLabel = sizes.length === 1 ? `${sizes[0]} ml` : 'tamaño pequeño';

  return `
    <div class="pick-set">
      <div class="pick-set-copy">
        <p class="pick-set-title">¿No quieres elegir sólo uno? Prueba tus tres recomendaciones.</p>
        <p class="pick-set-note">${lines.length} decants de ${sizeLabel} · ${formatPrice(total)} en total</p>
      </div>
      <button type="button" class="btn-primary" id="pick-set-add">Agregar los ${lines.length}</button>
    </div>`;
}

/* The smallest orderable presentation at or below the starter size. */
function _setVariant(pick, starterMl) {
  const exact = getVariantForSize(pick.product, SET_SIZE_ML);
  if (_isOrderable(exact)) return exact;
  const starter = getVariantForSize(pick.product, starterMl);
  if (_isOrderable(starter)) return starter;
  const orderable = getOrderableVariants(pick.product) ?? [];
  return orderable.find(_isOrderable) ?? null;
}

async function _addPick(productId, button) {
  const pick = _picks.find(p => String(p.product.id) === String(productId));
  const variant = pick?.suggestedVariant ?? pick?.variant;
  if (!pick || !_isOrderable(variant)) return;

  button.disabled = true;
  try {
    await window.__rd?.cart?.add(pick.product.id, variant.size);
    Tracker.productClicked(pick.product, `finder_pick_${pick.role}`);
  } finally {
    button.disabled = false;
  }
}

async function _addSet(button) {
  const starterMl = suggestedStarterMl(_answers.age);
  button.disabled = true;
  try {
    for (const pick of _picks) {
      const variant = _setVariant(pick, starterMl);
      if (!_isOrderable(variant)) continue;
      /* Sequential on purpose: the cart reconciles shared millilitre
         availability per line, and parallel adds would race that check. */
      await window.__rd?.cart?.add(pick.product.id, variant.size);
    }
    Tracker.emit('finder_set_added', { count: _picks.length });
  } finally {
    button.disabled = false;
  }
}

function _isOrderable(variant) {
  if (!variant || variant.soldOut || !(variant.availability > 0)) return false;
  const id = String(variant.variant_id ?? '').trim();
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}
