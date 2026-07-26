/* =============================================================
   RDECANTS — "PARA QUIÉN" BADGE
   One compact, accessible badge reused by every surface that shows a
   product: catalog cards, finder picks, "Más vendidos", the quick-view
   modal and the product page.

   Rules it follows:
     • ICON PLUS TEXT, always. An icon alone is not a label — a customer
       who has not learnt the glyph cannot read it, and neither can a
       screen reader.
     • SVG from the project's own line-icon set at the same 1.6 stroke
       weight as the rest of the interface. No emoji: the surrounding
       iconography is consistent line art, and ♂/♀ render as colour emoji
       on Android and as a serif glyph on Windows.
     • Nothing is ever guessed. The label comes from the normalized
       `gender_profile`; when there is no gender metadata the badge is
       simply not rendered, rather than saying "Unisex" by default.
   ============================================================= */

import { getGenderDisplay } from '../utils/gender.js';

/* 20×20 line icons on a 24 grid, matching the header/nav set. */
const ICONS = {
  masculine: '<circle cx="10.5" cy="14" r="5.2"/><path d="M15.5 9 21 3.5M16.4 3.5H21V8" stroke-linecap="round" stroke-linejoin="round"/>',
  feminine: '<circle cx="12" cy="9.4" r="5.2"/><path d="M12 14.6V21M9 18.2h6" stroke-linecap="round"/>',
  unisex: '<circle cx="12" cy="12" r="6.2"/><path d="M12 5.8v12.4" stroke-linecap="round"/><path d="M12 5.8a6.2 6.2 0 0 0 0 12.4Z" fill="currentColor" stroke="none"/>',
};

/**
 * Badge markup for a product, or '' when the metadata cannot support one.
 *
 * @param {object|string} product  product, or a canonical gender string
 * @param {{compact?: boolean, className?: string}} [options]
 *        compact — icon + text at card scale (the default)
 */
export function genderBadgeHtml(product, { compact = true, className = '' } = {}) {
  const display = getGenderDisplay(product);
  if (!display) return '';

  const classes = [
    'gender-badge',
    `gender-badge--${display.key}`,
    compact ? 'gender-badge--compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return `<span class="${classes}">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">${ICONS[display.key]}</svg>`
    /* The visible text is the label. `Para` is only for assistive tech, so
       the badge is announced as "Para Mujer" rather than a bare "Mujer". */
    + `<span class="sf-sr-only">Para </span>${display.label}`
    + '</span>';
}

/** Plain label, for aria-labels and tracking payloads. */
export function genderBadgeLabel(product) {
  return getGenderDisplay(product)?.label ?? '';
}
