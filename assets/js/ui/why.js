/* =============================================================
   RDECANTS - "WHY THIS FRAGRANCE?" (reusable view)
   Presentational helper around the deterministic reasoning engine.
   Returns markup, or an empty string when curated metadata does not
   provide anything specific enough to say.
   ============================================================= */

import { getReasons } from '../recommendations/reasoning.js';
import { MAX_MODAL_WHY_REASONS } from './displayLimits.js';

export function buildWhyHtml(product, { heading = '¿Por qué esta fragancia?', limit = MAX_MODAL_WHY_REASONS } = {}) {
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
