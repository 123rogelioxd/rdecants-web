/* =============================================================
   RDECANTS — DYNAMIC HERO

   The hero used to be frozen HTML: changing the headline, the campaign or
   the perfume it points at meant editing this repository and deploying it.
   It now reads the `hero` slot of /api/web/merchandising, so Roger changes
   what the store opens with from R Supply OS and it is live within a minute.

   ── What a hero placement may change, and what it may not ──────────
   It may change WORDS and DESTINATIONS: headline, supporting line, and
   either CTA.

   It may NOT change the photograph. The hero image is art-directed — two
   purpose-built crops (4:3 full-bleed for a phone, 5:4 for the desktop
   column) across AVIF/WebP/JPEG at four widths, preloaded as the LCP
   element. Substituting a 400×500 catalogue photo would swap a designed
   frame for one `object-fit` will crop badly, and would cost the preload.

   It may NOT name a perfume either, and that is the correction this file
   carries. A hero placement used to print its product's brand and name as
   a line under the CTAs, on the reasoning that "the part that needs to
   rotate" was the perfume. In production that produced a hero whose
   photograph showed Sauvage and whose caption read RASASI HAWAS ICE —
   two different fragrances in one frame, presented as if they were the
   same offer. There is no arrangement of that line that fixes it while
   the photograph stays fixed, so the line is gone.

   The hero is now exactly: value proposition, primary CTA, secondary CTA,
   trust signals, art-directed image. The backend may still POINT the hero
   slot at a product — that pointer is what tracks which perfume the
   opening copy was written for — but nothing about the product reaches
   the page.

   Every field is optional and every one falls back to the copy already in
   the HTML, so an empty, switched-off or un-migrated backend leaves the
   hero exactly as it ships.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';

/**
 * Pure: what the hero should display, given a placement and the defaults
 * already rendered in the HTML. Exported so the precedence is testable
 * without a DOM.
 *
 * Words and destinations only. The placement's `product` is deliberately not
 * read: see the header note on why a perfume name under an art-directed
 * photograph of a different perfume cannot be made correct.
 */
export function resolveHero(placement, defaults = {}) {
  const text = value => {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };

  return {
    headline: text(placement?.headline) ?? defaults.headline ?? null,
    body: text(placement?.body) ?? defaults.body ?? null,
    primary: placement?.cta?.label && placement?.cta?.url
      ? { label: text(placement.cta.label), url: placement.cta.url }
      : null,
    secondary: placement?.secondaryCta?.label && placement?.secondaryCta?.url
      ? { label: text(placement.secondaryCta.label), url: placement.secondaryCta.url }
      : null,
  };
}

export async function renderHero(root = document) {
  const hero = root.querySelector('.hero');
  if (!hero) return;

  const placements = await CatalogProvider.getMerchandising('hero');
  const placement = placements[0] ?? null;
  if (!placement) return;

  const resolved = resolveHero(placement);

  const title = hero.querySelector('.hero-title');
  if (title && resolved.headline) title.textContent = resolved.headline;

  /* An override only applies when the operator actually wrote one, and it
     then owns the whole line. The guard matters whenever the shipped line
     contains live markup: it used to carry a `data-entry-price` span, and
     replacing its text would have frozen the price at whatever was rendered.
     The 2026-08 hero states the promise instead of a number, so there is
     nothing live in it today — the rule stands for the day there is. */
  const desc = hero.querySelector('.hero-desc');
  if (desc && resolved.body) desc.textContent = resolved.body;

  const primary = hero.querySelector('.hero-cta');
  if (primary && resolved.primary) {
    primary.href = resolved.primary.url;
    const label = primary.querySelector('.hero-cta-main');
    if (label) {
      /* Keep the decorative spark; replace only the words before it. */
      const spark = label.querySelector('.hero-cta-spark');
      label.textContent = resolved.primary.label;
      if (spark) label.appendChild(spark);
    }
    primary.querySelector('.hero-cta-note')?.remove();
  }

  const secondary = hero.querySelector('.hero-actions .btn-outline');
  if (secondary && resolved.secondary) {
    secondary.href = resolved.secondary.url;
    secondary.textContent = resolved.secondary.label;
  }
}
