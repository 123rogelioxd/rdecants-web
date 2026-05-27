/* =============================================================
   RDECANTS — "¿POR QUÉ ESTA FRAGANCIA?" (reusable view)
   A small, reusable presentational helper around the deterministic
   reasoning engine. Returns markup (or '' when there's nothing
   meaningful to say) so any surface — modal, cards, assistant — can
   drop in the same elegant explanation without duplicating logic.
   ============================================================= */

import { getReasons } from '../recommendations/reasoning.js?v=1.0.13';

export function buildWhyHtml(product, { heading = '¿Por qué esta fragancia?', limit = 2 } = {}) {
  const reasons = getReasons(product, { limit });
  if (!reasons.length) return '';

  return `
    <div class="why-block" aria-label="${heading}">
      <p class="why-heading">${heading}</p>
      <ul class="why-list">
        ${reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>`;
}
