/* =============================================================
   RDECANTS — DISCOVERY SHORTCUTS + SCROLL LINKS
   Turns the "¿Para qué lo quieres?" chips and the hero / header
   entry points into REAL behavior — never decorative buttons.

   • data-shortcut chips → apply a real catalog filter OR launch the
     guided finder with a pre-selected answer.
   • data-scroll elements (hero CTAs, header nav) → smooth-scroll to a
     section, optionally focusing the finder for keyboard users.

   NOTE: SearchBar and the finder hold module-level state, so we import
   them with the SAME ?v= query the rest of the graph uses — a different
   query string would load a second, un-initialised module instance.
   ============================================================= */

import { SearchBar } from './searchbar.js?v=2026.06.04.2';
import { presetFinder } from './assistant.js?v=2026.06.04.2';

/* Each shortcut resolves to a real action. 'mood' filters the live catalog;
   'finder' launches the guided flow with an occasion/gender pre-selected. */
const SHORTCUT_MAP = {
  diario:  { type: 'mood',   value: 'diario' },
  citas:   { type: 'finder', answers: { occasion: 'cita' } },
  calor:   { type: 'mood',   value: 'fresco' },
  noche:   { type: 'mood',   value: 'fiesta' },
  oficina: { type: 'finder', answers: { occasion: 'oficina' } },
  regalo:  { type: 'finder', answers: { gender: 'any' } },
};

export function setupShortcuts() {
  _bindScrollLinks();
  _bindShortcutChips();
}

function _bindScrollLinks() {
  document.querySelectorAll('[data-scroll]').forEach(el => {
    el.addEventListener('click', (event) => {
      const target = document.getElementById(el.dataset.scroll);
      if (!target) return;
      event.preventDefault();
      _scrollToEl(target);
      if (el.hasAttribute('data-focus-finder')) {
        /* Move keyboard focus to the first finder question after the scroll. */
        window.setTimeout(() => target.querySelector('.asst-chip')?.focus(), 420);
      }
    });
  });
}

function _bindShortcutChips() {
  document.querySelectorAll('.shortcut-chip[data-shortcut]').forEach(chip => {
    chip.addEventListener('click', () => {
      const rule = SHORTCUT_MAP[chip.dataset.shortcut];
      if (!rule) return;

      if (rule.type === 'mood') {
        /* SearchBar._run() emits filter_applied — no double tracking here. */
        SearchBar.applyMood(rule.value);
        _scrollToId('catalog');
      } else {
        presetFinder(rule.answers);
      }
    });
  });
}

function _scrollToId(id) {
  const el = document.getElementById(id);
  if (el) _scrollToEl(el);
}

function _scrollToEl(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
