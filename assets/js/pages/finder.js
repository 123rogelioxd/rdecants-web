/* =============================================================
   RDECANTS — GUIDED FINDER PAGE ENTRY (/elegir.html)

   "Ayúdame a elegir" is its own route now, so the home never has to
   decide whether to show a questionnaire next to a catalog. One
   question per screen, three screens, then the catalog opens already
   ranked for the answers.

   Deterministic and auditable: the questions come from the shared
   ASSISTANT_QUESTIONS and the ranking from the one beginner-safe
   engine (recommendations/assistant.js). No second taxonomy, no
   chatbot.
   ============================================================= */

import { bootstrapShell }        from '../core/shell.js';
import { ASSISTANT_QUESTIONS }   from '../recommendations/assistant.js';
import { buildCatalogUrl,
         stashGuideHandoff }     from '../catalog/intents.js';
import { Tracker }               from '../tracking/tracker.js';
import { AppState }              from '../core/state.js';

let _root = null;
let _step = 0;
const _answers = {};

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  _root = document.getElementById('finder-root');
  if (_root) {
    /* No focus move on the first paint — the visitor has just arrived and
       should read the page, not be yanked past the heading. */
    _renderStep({ focus: false });
    _root.addEventListener('click', _onClick);
  }

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

function _onClick(event) {
  const option = event.target.closest('.finder-option');
  if (option) {
    const question = ASSISTANT_QUESTIONS[_step];
    _answers[question.id] = option.dataset.value;
    _advance();
    return;
  }

  if (event.target.closest('#finder-back')) {
    if (_step === 0) { window.location.href = '/'; return; }
    _step -= 1;
    _renderStep({ focus: true });
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

/* The recommendation IS the re-ranked catalog (top pick pinned), so the
   last answer hands over to the catalog page rather than rendering a
   third, separate results view. */
function _finish() {
  try { Tracker.assistantStarted?.({ ..._answers }); } catch { /* best-effort */ }
  /* Belt and braces: the answers travel in the URL, and are also parked for
     one read in case a host redirect strips the query (see intents.js). */
  stashGuideHandoff({ ..._answers });
  window.location.href = buildCatalogUrl(_answers);
}

function _renderStep({ focus = false } = {}) {
  const total = ASSISTANT_QUESTIONS.length;
  const question = ASSISTANT_QUESTIONS[_step];
  const pct = Math.round(((_step + 1) / total) * 100);

  _root.innerHTML = `
    <div class="finder-progress">
      <span>Paso ${_step + 1} de ${total}</span>
      <span class="finder-bar" role="progressbar"
        aria-valuenow="${_step + 1}" aria-valuemin="1" aria-valuemax="${total}"
        aria-label="Progreso de las preguntas"><span style="width:${pct}%"></span></span>
    </div>

    <h2 class="finder-q" id="finder-question">${question.label}</h2>

    <div class="finder-options" role="group" aria-labelledby="finder-question">
      ${question.options.map(option => `
        <button type="button" class="finder-option" data-value="${option.value}"
          aria-pressed="${_answers[question.id] === option.value}">
          ${option.label}
        </button>`).join('')}
    </div>

    <div class="finder-nav">
      <button type="button" class="btn-ghost" id="finder-back">
        ${_step === 0 ? 'Volver al inicio' : 'Atrás'}
      </button>
      <a class="finder-skip" href="/catalogo.html">Prefiero ver todo el catálogo</a>
    </div>`;

  /* After an answer, move focus to the first option of the next question so a
     keyboard user lands on the choice instead of back at the top of the page.
     Focused synchronously — a requestAnimationFrame callback never runs in a
     backgrounded tab, which would silently strand focus. */
  if (focus) _root.querySelector('.finder-option')?.focus({ preventScroll: true });
}
