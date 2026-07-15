/* =============================================================
   RDECANTS — GUIDE BAR
   The catalog's control layer: intent shortcuts + a compact, opt-in
   finder that asks ONE question at a time. Both hand their answers to
   SearchBar.applyGuide(), which re-ranks the SAME catalog grid in place
   (top pick pinned) — there is no separate results view. This is the
   "guided catalog": guidance and browsing are one surface.

   The finder is a deterministic, auditable stepper over the shared
   ASSISTANT_QUESTIONS and the one beginner-safe ranking engine — no
   second taxonomy, no chatbot, no LLM. Selecting an answer advances to
   the next step; the last answer applies the recommendation and brings
   the re-ranked catalog into view.
   ============================================================= */

import { SearchBar } from './searchbar.js';
import { ASSISTANT_QUESTIONS } from '../recommendations/assistant.js';
import { Tracker } from '../tracking/tracker.js';

/* Intent shortcuts → preset finder answers. Every chip drives the grid the
   same way (applyGuide); none is a dead button. "Regalo" has no inherent
   scent/occasion signal, so it opens the finder for the giver to answer. */
const INTENTS = [
  { key: 'diario',  label: 'Para diario', answers: { occasion: 'dia' } },
  { key: 'citas',   label: 'Citas',       answers: { occasion: 'cita' } },
  { key: 'calor',   label: 'Calor',       answers: { family: 'fresco', climate: 'calido' } },
  { key: 'noche',   label: 'Noche',       answers: { occasion: 'noche' } },
  { key: 'oficina', label: 'Oficina',     answers: { occasion: 'oficina' } },
  { key: 'regalo',  label: 'Regalo',      answers: null },
];

let _root = null;
let _step = 0;
const _answers = {};   /* filled as the visitor answers; empty = clean start */

export function setupGuide(containerId = 'guide') {
  _root = document.getElementById(containerId);
  if (!_root) return;
  _render();
  _bind();
}

function _render() {
  _root.innerHTML = `
    <div class="container">
      <div class="guide-head fade-up">
        <p class="section-label">Empieza por aquí</p>
        <h2 class="guide-title" id="guide-title">¿Para qué lo quieres?</h2>
      </div>

      <div class="guide-chips" role="group" aria-label="Descubre por intención">
        ${INTENTS.map(i => `<button class="guide-chip" type="button" data-intent="${i.key}">${i.label}</button>`).join('')}
      </div>

      <div class="guide-finder">
        <button class="guide-finder-toggle" id="guide-finder-toggle" type="button"
          aria-expanded="false" aria-controls="guide-stepper">
          ¿No sabes cuál? Responde 3 preguntas y te recomendamos <span aria-hidden="true">→</span>
        </button>
        <div class="guide-stepper" id="guide-stepper" role="group" aria-label="Encuentra tu fragancia" aria-live="polite" hidden></div>
      </div>
    </div>`;
}

function _bind() {
  /* Intent chips → apply preset answers to the catalog. */
  _root.querySelectorAll('.guide-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const intent = INTENTS.find(i => i.key === chip.dataset.intent);
      if (!intent) return;
      if (!intent.answers) { _openStepper(); return; }   /* Regalo → open finder */
      _apply(intent.answers, `intent:${intent.key}`);
    });
  });

  /* Finder disclosure. */
  const toggle = _root.querySelector('#guide-finder-toggle');
  toggle?.addEventListener('click', () => {
    const stepper = _root.querySelector('#guide-stepper');
    if (stepper.hidden) _openStepper();
    else _closeStepper();
  });

  /* Stepper interaction (delegated). */
  const stepper = _root.querySelector('#guide-stepper');
  stepper?.addEventListener('click', event => {
    const option = event.target.closest('.gs-option');
    if (option) {
      const q = ASSISTANT_QUESTIONS[_step];
      _answers[q.id] = option.dataset.value;
      if (_step < ASSISTANT_QUESTIONS.length - 1) { _step += 1; _renderStep(); }
      else _finish();
      return;
    }
    if (event.target.closest('#gs-back')) {
      if (_step === 0) _closeStepper();
      else { _step -= 1; _renderStep(); }
    }
  });
}

function _openStepper() {
  _step = 0;
  const stepper = _root.querySelector('#guide-stepper');
  const toggle = _root.querySelector('#guide-finder-toggle');
  stepper.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  _renderStep();
  _root.querySelector('.guide-finder')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _closeStepper() {
  const stepper = _root.querySelector('#guide-stepper');
  const toggle = _root.querySelector('#guide-finder-toggle');
  stepper.hidden = true;
  stepper.innerHTML = '';
  toggle?.setAttribute('aria-expanded', 'false');
}

function _renderStep() {
  const stepper = _root.querySelector('#guide-stepper');
  const total = ASSISTANT_QUESTIONS.length;
  const q = ASSISTANT_QUESTIONS[_step];

  stepper.innerHTML = `
    <div class="gs-top">
      <div class="gs-progress" aria-hidden="true">
        ${ASSISTANT_QUESTIONS.map((_, i) => `<span class="gs-dot ${i <= _step ? 'gs-dot--on' : ''}"></span>`).join('')}
      </div>
      <span class="gs-count">Paso ${_step + 1} de ${total}</span>
    </div>
    <div class="gs-step-body">
      <p class="gs-q">${q.label}</p>
      <div class="gs-options" role="group" aria-label="${q.label}">
        ${q.options.map(o => `
          <button type="button" class="gs-option ${_answers[q.id] === o.value ? 'gs-option--active' : ''}"
            data-value="${o.value}">${o.label}</button>`).join('')}
      </div>
    </div>
    <div class="gs-nav">
      <button type="button" class="gs-back" id="gs-back">
        ${_step === 0 ? 'Cancelar' : '← Atrás'}
      </button>
    </div>`;

  /* Move focus to the first option so keyboard users land on the choice. */
  requestAnimationFrame(() => stepper.querySelector('.gs-option')?.focus());
}

/* Last answer chosen → apply the full answer set and reveal the result. */
function _finish() {
  _apply({ ..._answers }, 'finder');
  _closeStepper();
}

/* Hand answers to the catalog and bring the re-ranked grid into view. The
   recommendation IS the re-ranked catalog (top pick pinned) — not a separate
   module that appears below. */
function _apply(answers, source) {
  try { Tracker.assistantStarted?.(answers); } catch { /* tracking is best-effort */ }
  SearchBar.applyGuide(answers);
  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
