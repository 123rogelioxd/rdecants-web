/* =============================================================
   RDECANTS — DYNAMIC HERO

   The hero used to be frozen HTML: changing the headline, the campaign or
   the perfume it points at meant editing this repository and deploying it.
   It now reads the `hero` slot of /api/web/merchandising, so Roger changes
   what the store opens with from R Supply OS and it is live within a minute.

   ── What a hero placement may change, and what it may not ──────────
   It may change WORDS and DESTINATIONS: headline, supporting line, either
   CTA, and which perfume the hero points at.

   It may NOT change the photograph. The hero image is art-directed — two
   purpose-built crops (4:3 full-bleed for a phone, 5:4 for the desktop
   column) across AVIF/WebP/JPEG at four widths, preloaded as the LCP
   element. Substituting a 400×500 catalogue photo would swap a designed
   frame for one `object-fit` will crop badly, and would cost the preload.
   A featured perfume is surfaced as a line under the CTAs instead, which
   is the part that actually needs to rotate.

   Every field is optional and every one falls back to the copy already in
   the HTML, so an empty, switched-off or un-migrated backend leaves the
   hero exactly as it ships.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';
import { Tracker } from '../tracking/tracker.js';

/**
 * Pure: what the hero should display, given a placement and the defaults
 * already rendered in the HTML. Exported so the precedence is testable
 * without a DOM.
 */
export function resolveHero(placement, defaults = {}) {
  const text = value => {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };

  const product = placement?.product ?? null;

  return {
    headline: text(placement?.headline) ?? defaults.headline ?? null,
    body: text(placement?.body) ?? defaults.body ?? null,
    primary: placement?.cta?.label && placement?.cta?.url
      ? { label: text(placement.cta.label), url: placement.cta.url }
      : null,
    secondary: placement?.secondaryCta?.label && placement?.secondaryCta?.url
      ? { label: text(placement.secondaryCta.label), url: placement.secondaryCta.url }
      : null,
    /* Only a product that can actually be bought is worth pointing at. */
    product: product && product.variants?.length ? product : null,
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

  if (resolved.product) _appendFeatured(hero, resolved.product);
}

/* The featured perfume, as one line under the actions. Deliberately not a
   card: a second product card in the hero competes with the CTAs, which is
   the one thing the hero must not do. */
function _appendFeatured(hero, product) {
  const actions = hero.querySelector('.hero-actions');
  if (!actions || hero.querySelector('.hero-featured')) return;

  const link = document.createElement('a');
  link.className = 'hero-featured';
  link.href = `/product.html?id=${encodeURIComponent(product.id)}`;
  link.dataset.cta = 'hero-featured';

  const house = document.createElement('span');
  house.className = 'hero-featured-house';
  house.textContent = product.house ?? '';

  const name = document.createElement('strong');
  name.textContent = product.name ?? '';

  /* textContent throughout — the product name comes from the catalogue and
     the surrounding copy from an operator, and neither is worth trusting to
     innerHTML for the sake of a bold tag. */
  link.append(house, name);
  link.addEventListener('click', () => Tracker.heroCtaClicked('hero-featured'));

  actions.insertAdjacentElement('afterend', link);
}
