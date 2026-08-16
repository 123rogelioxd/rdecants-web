/* =============================================================
   RDECANTS — STOREFRONT PROMOTION

   The active campaign banner, between the packs and "Prefiero elegir yo".

   ── What it exists to replace ──────────────────────────────────────
   Running the "Dinámica 300 miembros" used to mean editing static HTML in
   this repository, committing a flyer and redeploying. It now reads
   /api/web/promotion, which R Supply OS builds from a MarketingCampaign
   that already owns the lifecycle — so the banner appears when the campaign
   starts, disappears when it expires, and changes when Roger changes it,
   with no deploy of either repository.

   ── What it is not ────────────────────────────────────────────────
   Not the hero. Not a full-screen flyer. Not a countdown. The uploaded
   creative can be prominent inside the card, but the section still has to
   read as RDECANTS — ivory, taupe, near-black type, one restrained CTA —
   rather than as an injected Facebook post. There is deliberately no red,
   no urgency copy and no discount graphic: the campaign's own creative
   carries whatever visual noise it carries, inside a frame that does not.

   ── Failure ───────────────────────────────────────────────────────
   Every failure mode is the same instruction: remove the section. Feature
   off, table not migrated, endpoint down, nothing scheduled, campaign
   paused — the home is simply one section shorter, with no gap and no
   error. See providers/catalog.js, which collapses all five to `null`.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }         from '../tracking/tracker.js';

export async function renderPromotion(sectionId = 'promocion') {
  const section = document.getElementById(sectionId);
  if (!section) return;

  let promotion = null;
  try {
    promotion = await CatalogProvider.getPromotion();
  } catch {
    promotion = null;
  }

  if (!promotion) {
    section.remove();
    return;
  }

  section.hidden = false;
  section.innerHTML = _card(promotion);
  _bind(section, promotion);

  Tracker.promotionViewed(promotion);
}

/* Pure: the card's markup. Exported for the renderer test, which asserts the
   responsive sources and the absence of a fabricated discount. */
export function _card(promotion) {
  const { mobile, desktop } = promotion.image ?? {};

  /* <picture> with one media-switched source, so a phone downloads the
     mobile crop and never the desktop one. Both fall back to whichever
     creative exists — the backend already substitutes one for the other, so
     a promotion uploaded in a hurry is never half-rendered. */
  const figure = mobile || desktop
    ? `<figure class="promo-figure">
         <picture>
           ${desktop ? `<source media="(min-width: 768px)" srcset="${_escape(desktop)}">` : ''}
           <img src="${_escape(mobile || desktop)}" alt="" loading="lazy" decoding="async">
         </picture>
       </figure>`
    : '';

  const cta = promotion.cta
    ? `<a class="btn-primary promo-cta" href="${_escape(promotion.cta.url)}" data-promo-cta>
         ${_escape(promotion.cta.label)}
       </a>`
    : '';

  /* `.container` is the storefront's own gutter wrapper — every other section
     uses it, so the banner lines up with the packs above and the tiles below
     instead of being a slightly different width. */
  return `
    <div class="container">
      <article class="promo-card">
        <p class="promo-kicker">Promoción activa</p>
        <h2 class="promo-title">${_escape(promotion.headline)}</h2>
        ${promotion.body ? `<p class="promo-body">${_escape(promotion.body)}</p>` : ''}
        ${figure}
        ${cta}
      </article>
    </div>`;
}

function _bind(section, promotion) {
  section.querySelector('[data-promo-cta]')
    ?.addEventListener('click', () => Tracker.promotionClicked(promotion));
}

function _escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
