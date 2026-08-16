/* =============================================================
   RDECANTS — GUIDED FINDER PAGE ENTRY (/elegir.html)

   Four questions a beginner can actually answer, then up to THREE
   recommendations in strict score order: #1, #2, #3.

   Two things changed here, and both were correctness problems:

   1. The three cards used to be labelled "La mejor para ti" / "La opción
      más segura" / "La que más destaca", and cards two and three were
      chosen by a SECOND pass that scanned the whole ranked list for the
      highest versatility or projection — ignoring the ranking and the
      gender tier it had just computed. So the third card could be a
      product the engine had ranked last. Now the three cards are literally
      ranks 1–3 of one order.

   2. The handoff to the catalog carried one query parameter. Every answer
      is serialized now (see catalog/intents.js), so "Ver más opciones"
      ranks the full catalog against the SAME question the three picks
      answered, and the answers survive a reload, a shared link and a host
      redirect that eats the query string.

   Ranking itself is entirely in recommendations/engine.js. This file asks
   and renders.
   ============================================================= */

import { bootstrapShell }        from '../core/shell.js';
import {
  ASSISTANT_QUESTIONS,
  questionAnswerIds,
  getFinderResult,
  suggestedStarterMl,
}                                from '../recommendations/assistant.js';
import { ANSWER_LABELS }         from '../recommendations/engine.js';
import { CatalogProvider }       from '../providers/catalog.js';
import { buildCatalogUrl,
         stashGuideHandoff,
         readGuideFromQuery }    from '../catalog/intents.js';
import { formatPrice,
         getVariantForSize,
         getOrderableVariants }  from '../utils/prices.js';
import { openProductModal }      from '../ui/modal.js';
import { primeImageStates }      from '../ui/images.js';
import { genderBadgeHtml }       from '../ui/genderBadge.js';
import { Tracker }               from '../tracking/tracker.js';
import { AppState }              from '../core/state.js';

/* The set is three small decants — the cheapest honest way to try all
   three recommendations. No invented discount: it is the sum of its parts. */
const SET_SIZE_ML = 3;

let _root = null;
let _step = 0;
let _picks = [];
let _result = null;
let _products = [];
let _answers = {};

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  _root = document.getElementById('finder-root');
  if (_root) {
    /* Answers can arrive in the URL — from "Cambiar respuestas" on the
       catalog, or from a shared link. Resuming with them prefilled beats
       making someone answer four questions again to change one. */
    _answers = readGuideFromQuery(window.location.search) ?? {};
    if (_isComplete()) _finish();
    else _renderStep({ focus: false });
    _root.addEventListener('click', _onClick);
    _root.addEventListener('keydown', _onKeydown);
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

  /* "Cambiar respuestas" — back to the questions with everything kept. */
  const edit = event.target.closest('[data-edit-step]');
  if (edit) {
    _step = Number(edit.dataset.editStep) || 0;
    _renderStep({ focus: true });
    return;
  }

  /* The single, explicit relaxation the engine offered. Never automatic. */
  const relax = event.target.closest('[data-relax]');
  if (relax) {
    delete _answers[relax.dataset.relax];
    _finish();
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

/* The pick media is a button-role div; Enter/Space must open it too. */
function _onKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const media = event.target.closest('[data-open-pick]');
  if (!media) return;
  event.preventDefault();
  const pick = _picks.find(p => String(p.product.id) === media.dataset.openPick);
  if (pick) openProductModal(pick.product);
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
  return questionAnswerIds(question).every(id => _answers[id]);
}

function _isComplete() {
  return ASSISTANT_QUESTIONS.every(_isStepAnswered);
}

function _renderStep({ focus = false } = {}) {
  _setFrame('questions');
  const total = ASSISTANT_QUESTIONS.length;
  const question = ASSISTANT_QUESTIONS[_step];
  const pct = Math.round(((_step + 1) / total) * 100);
  const answered = _isStepAnswered(question);

  const body = question.groups
    ? question.groups.map(group => `
        <div class="finder-group">
          <span class="finder-group-label" id="finder-group-${group.id}">${group.label}</span>
          <div class="finder-chips" role="group" aria-labelledby="finder-group-${group.id}">
            ${group.options.map(option => `
              <button type="button" class="finder-chip"
                data-group="${group.id}" data-value="${option.value}"
                aria-pressed="${_answers[group.id] === option.value}">${option.label}</button>`).join('')}
          </div>
        </div>`).join('')
    : `<div class="finder-options" role="group" aria-labelledby="finder-question">
        ${question.options.map(option => `
          <button type="button" class="finder-option" data-value="${option.value}"
            aria-pressed="${_answers[question.id] === option.value}">
            <span class="finder-option-copy">
              <span class="finder-option-label">${option.label}</span>
              ${option.hint ? `<span class="finder-option-hint">${option.hint}</span>` : ''}
            </span>
          </button>`).join('')}
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
    <ul class="picks-grid">
      ${'<li><div class="card-skeleton" aria-hidden="true"><div class="card-skeleton-body"><div class="card-skeleton-line card-skeleton-line--short"></div><div class="card-skeleton-line card-skeleton-line--wide"></div></div></div></li>'.repeat(3)}
    </ul>`;

  try { _products = await CatalogProvider.getProducts(); } catch { _products = []; }

  _result = getFinderResult(_answers, _products);
  _picks = _result.picks;
  _renderPicks();
}

/* "Para ti: Mujer · 15–18 · Noche · Que destaque", with one button back to
   the questions. Every answer that shaped the ranking is listed — if a chip
   is not here, it did not affect the result. */
function _answerSummary() {
  const steps = new Map();
  ASSISTANT_QUESTIONS.forEach((question, index) => {
    for (const id of questionAnswerIds(question)) steps.set(id, index);
  });

  const chips = ['gender', 'age', 'occasion', 'goal', 'climate', 'family']
    .filter(key => _answers[key])
    .map(key => {
      const label = ANSWER_LABELS[key]?.[_answers[key]] ?? _answers[key];
      const step = steps.get(key);
      return step === undefined
        ? `<span class="picks-chip">${label}</span>`
        : `<button type="button" class="picks-chip picks-chip--edit" data-edit-step="${step}"
             aria-label="Cambiar ${label}">${label}</button>`;
    });

  if (!chips.length) return '';

  return `
    <div class="picks-summary">
      <p class="picks-summary-line"><span class="picks-summary-label">Para ti</span>${chips.join('<span class="picks-chip-sep" aria-hidden="true">·</span>')}</p>
      <button type="button" class="picks-summary-edit" data-edit-step="0">Cambiar respuestas</button>
    </div>`;
}

/* The question card is deliberately narrow (one question, one decision); the
   results are three product cards side by side and need a wider frame. */
function _setFrame(mode) {
  _root?.classList.toggle('finder-card--results', mode === 'results');
}

function _renderPicks() {
  if (!_picks.length) { _renderNoMatch(); return; }
  _setFrame('results');

  const starterMl = suggestedStarterMl(_answers.age);
  const partial = _picks.length < 3;

  _root.innerHTML = `
    ${_answerSummary()}

    <div class="finder-progress"><span>${_picks.length === 1 ? 'Tu recomendación' : 'Tus recomendaciones'}</span></div>

    ${_notices()}

    <ul class="picks-grid">
      ${_picks.map(pick => _pickCard(pick)).join('')}
    </ul>

    ${partial ? `
      <p class="picks-note">
        Sólo ${_picks.length === 1 ? 'una fragancia alcanza' : `${_picks.length} fragancias alcanzan`}
        la compatibilidad que pedimos para recomendarla con tus respuestas.
        Preferimos mostrarte ${_picks.length === 1 ? 'una' : 'menos'} antes que rellenar con opciones que no encajan.
      </p>` : ''}

    ${_picks.length >= 2 ? _setOffer(starterMl) : ''}

    <div class="picks-more">
      <a class="btn-outline" href="${buildCatalogUrl(_answers)}" id="picks-more-link">Ver más opciones compatibles</a>
    </div>`;

  primeImageStates(_root);

  /* The catalog page can re-rank even if a host redirect eats the query. */
  stashGuideHandoff({ ..._answers });
}

/* Honest notices, straight from the engine — never a silent fallback. */
function _notices() {
  const notices = _result?.notices ?? [];
  if (notices.includes('solo_perfiles_compatibles')) {
    return `<p class="picks-notice">
      Ahora mismo no tenemos ninguna fragancia catalogada como 100% unisex con stock.
      Estas son las de perfil más neutral que sí podemos preparar; su ficha indica hacia
      qué lado se inclinan.
    </p>`;
  }
  if (notices.includes('catalogo_vacio')) {
    return `<p class="picks-notice">No pudimos cargar el catálogo en este momento.</p>`;
  }
  return '';
}

/* No match: explain it, let them edit, and offer exactly ONE named
   condition to drop. The engine picks which one helps most; nothing is
   relaxed without the customer saying so. */
function _renderNoMatch() {
  _setFrame('questions');
  const relaxation = _result?.relaxation ?? null;
  const emptyCatalog = (_result?.notices ?? []).includes('catalogo_vacio');

  _root.innerHTML = `
    ${_answerSummary()}

    <div class="picks-empty">
      <p class="pick-set-title">
        ${emptyCatalog
          ? 'No pudimos cargar el catálogo'
          : 'Con estas respuestas no hay una coincidencia que podamos recomendarte'}
      </p>
      <p class="pick-set-note">
        ${emptyCatalog
          ? 'Vuelve a intentarlo en un momento o escríbenos por WhatsApp y te decimos qué hay disponible hoy.'
          : 'No vamos a presentarte una fragancia incompatible como si fuera perfecta. Puedes cambiar una respuesta o pedirnos ayuda directa.'}
      </p>

      ${relaxation ? `
        <button type="button" class="btn-primary" data-relax="${relaxation.dimension}">
          Buscar sin filtrar ${relaxation.label}
        </button>
        <p class="pick-set-note pick-set-note--tight">
          Encontramos ${relaxation.gained} ${relaxation.gained === 1 ? 'opción' : 'opciones'} si dejamos ${relaxation.label} de lado.
        </p>` : ''}

      <div class="finder-nav finder-nav--center">
        <button type="button" class="btn-ghost" data-edit-step="0">Cambiar respuestas</button>
        <a class="finder-skip" href="/catalogo.html">Ver todo el catálogo</a>
        <a class="finder-skip" href="https://wa.me/5219516513018" target="_blank" rel="noopener">Pedir ayuda por WhatsApp</a>
      </div>
    </div>`;
}

function _pickCard(pick) {
  const variant = pick.suggestedVariant ?? pick.variant;
  const orderable = _isOrderable(variant);
  const { product, rank, label, blurb, reason } = pick;

  return `
    <li>
      <article class="pick-card ${rank === 1 ? 'pick-card--best' : ''}">
        <p class="pick-label">${label}</p>
        <div class="pick-media${product.image ? '' : ' img-shell img-failed'}"
             style="--img-initial:${_brandInitialCss(product)}"
             data-open-pick="${product.id}" role="button" tabindex="0"
             aria-label="Ver detalle de ${product.name}">
          ${product.image
            ? `<img src="${product.image}" alt="${product.name}" width="400" height="300" loading="lazy" decoding="async">`
            : ''}
        </div>
        <div class="pick-body">
          <div class="card-topline">
            <p class="pick-house">${product.house}</p>
            ${genderBadgeHtml(product)}
          </div>
          <h3 class="pick-name">${product.name}</h3>
          ${reason ? `<p class="pick-why">${reason}</p>` : ''}
          ${blurb ? `<p class="pick-blurb">${blurb}</p>` : ''}
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
        <p class="pick-set-title">¿No quieres elegir sólo uno? Prueba tus ${lines.length === 3 ? 'tres' : 'dos'} recomendaciones.</p>
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
    Tracker.productClicked(pick.product, `finder_pick_${pick.rank}`);
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

/* The house initial shown when a product photo is missing or fails, so the
   rare fallback reads as intentional instead of as a broken page. Same
   treatment the catalog cards use. */
function _brandInitialCss(product) {
  const source = String(product?.house || product?.name || 'R').trim();
  const ch = source.charAt(0).toUpperCase();
  return `'${/[A-Z0-9À-Ý]/.test(ch) ? ch : 'R'}'`;
}
