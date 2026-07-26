/* =============================================================
   RDECANTS — DISCOVERY SETS
   Novice conversion layer: "¿No sabes cuál elegir? — Prueba 3."

   Hardcoded set config (owner-maintained) backed by live catalog.
   Logic: score catalog products against each set's taxonomy profile,
   pick top 3 sellable products, compute honest per-item pricing.
   No artificial discount. No new recommendation engine — reuses
   taxonomy + scoring imports directly.

   Pure exports (DOM-free, unit-testable):
     DISCOVERY_SET_TEMPLATES  — config array
     resolveDiscoverySets(products)  → resolved set objects
     buildDiscoverySetsHtml(sets)    → HTML string

   UI exports:
     setupDiscoverySets(containerId)           — home page mount
     renderDiscoverySetsFallback(root, sets)   — PDP fallback
   ============================================================= */

import { isSellable, getOperationalScore } from '../recommendations/scoring.js';
import { Personalization, filterDisliked } from '../recommendations/personalization.js';
import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  productSignals,
  scoreProfileMatch,
} from '../recommendations/taxonomy.js';
import { HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE } from '../recommendations/engine.js';
import { getPriceForSize, getVariantForSize, formatPrice } from '../utils/prices.js';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from './images.js';

const MIN_PRODUCTS = 2;
/* Kits visible on mobile before "Ver más kits" reveals the rest. */
const MOBILE_VISIBLE_SETS = 3;
const _profileByKey = new Map(USE_CASE_PROFILES.map(p => [p.key, p]));

/* ── Set config — maintained by hand ───────────────────────────── */
export const DISCOVERY_SET_TEMPLATES = [
  {
    id: 'frescos',
    name: 'Set Frescos',
    theme: 'Frescos · Ligeros · Para empezar',
    copy: 'El punto de partida perfecto. Limpios, fáciles de usar, bienvenidos en cualquier situación.',
    families: ['fresco'],
    useCases: ['diario', 'tropical'],
  },
  {
    id: 'oficina',
    name: 'Set Oficina',
    theme: 'Profesionales · Discretos',
    copy: 'Aromas que funcionan en el trabajo sin invadir el espacio de nadie. Siempre bien recibidos.',
    families: ['fresco'],
    useCases: ['oficina', 'diario'],
  },
  {
    id: 'citas',
    name: 'Set Citas',
    theme: 'Seductores · Para lucirse',
    copy: 'Fragancias que llaman la atención. Para cuando quieres dejar rastro y recibir cumplidos.',
    useCases: ['seductor'],
    families: ['dulce'],
  },
  {
    id: 'noches',
    name: 'Set Noches',
    theme: 'Intensos · Para salir',
    copy: 'Proyección, rastro y presencia. Para noches largas donde quieres ser recordado.',
    useCases: ['fiesta', 'seductor'],
    families: ['dulce', 'intenso'],
  },
  {
    id: 'verano',
    name: 'Set Verano',
    theme: 'Veraniegos · Clima cálido',
    copy: 'Ligeros y refrescantes. Pensados para el calor, la playa y las terrazas de verano.',
    families: ['fresco'],
    useCases: ['tropical'],
  },
  {
    id: 'bestsellers',
    name: 'Más Recomendados',
    theme: 'Populares para empezar',
    copy: 'Los tres más solicitados del catálogo. Buen punto de partida si todavía no sabes qué quieres.',
    bestsellers: true,
  },
];

/* ── Pure logic ─────────────────────────────────────────────────── */

export function resolveDiscoverySets(products, { limit = DISCOVERY_SET_TEMPLATES.length } = {}) {
  if (!Array.isArray(products) || !products.length) return [];

  const sellable = products.filter(isSellable);
  if (!sellable.length) return [];

  return DISCOVERY_SET_TEMPLATES
    .slice(0, limit)
    .map(template => _buildSet(template, sellable))
    .filter(Boolean);
}

function _buildSet(template, sellable) {
  let ranked;

  if (template.bestsellers) {
    ranked = sellable
      .slice()
      .sort((a, b) => getOperationalScore(b) - getOperationalScore(a));
  } else {
    ranked = sellable
      .map(p => ({ p, score: _scoreForTemplate(productSignals(p), template) }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score || getOperationalScore(b.p) - getOperationalScore(a.p))
      .map(e => e.p);
  }

  if (ranked.length < MIN_PRODUCTS) return null;

  const resolved = ranked.slice(0, 3);
  const total = resolved.reduce((sum, p) => {
    const price = getPriceForSize(p, 3) ?? p.variants?.[0]?.price ?? 0;
    return sum + Number(price);
  }, 0);

  return {
    id: template.id,
    name: template.name,
    theme: template.theme,
    copy: template.copy,
    products: resolved,
    total,
    itemSize: 3,
  };
}

function _scoreForTemplate(signals, template) {
  let score = 0;
  (template.families ?? []).forEach(key => {
    const family = SCENT_FAMILIES[key];
    if (family) score += scoreProfileMatch(family, signals);
  });
  (template.useCases ?? []).forEach(key => {
    const profile = _profileByKey.get(key);
    if (profile) score += scoreProfileMatch(profile, signals);
  });
  return score;
}

/* ── The personalized set ───────────────────────────────────────────
   The templates above are EDITORIAL: hand-maintained themes scored against a
   legacy taxonomy, with no idea who the customer is. That is fine on the home
   page and on a PDP, where nobody has answered anything.

   Inside the personalized catalog it was a defect. "Set Noches" was chosen by
   a hardcoded intent map (occasion 'noche' → the 'noches' template) and filled
   with the top 3 by keyword score — so a customer who answered Mujer was
   offered Naxos, 9PM and Stronger With You Intensely, three products the
   engine had just excluded for being masculine, with a button that added them
   to the cart. A recommendation surface cannot contain a shortcut around its
   own rules.

   So in personalized mode there is no template at all. The set IS the top
   three recommendations — the same rows the grid ranks, which have already
   passed eligibility, gender, stock, the compatibility threshold and the
   confidence gate — and it only exists when three of them can actually be
   bought in the starter size. Fewer than three: no set.

   The total is the sum of the SAME variants Cart.addBundle will resolve
   (`getVariantForSize(product, itemSize)` at ratio 1), so the price shown is
   the price charged. */

export const PERSONALIZED_SET_SIZE_ML = 3;
export const PERSONALIZED_SET_COUNT = 3;

export function buildPersonalizedSet(recommendations = [], {
  sizeMl = PERSONALIZED_SET_SIZE_ML,
  count = PERSONALIZED_SET_COUNT,
} = {}) {
  if (!Array.isArray(recommendations)) return null;

  const members = [];
  for (const rec of recommendations) {
    const product = rec?.product;
    if (!product) continue;

    /* Re-verify rather than trust the caller: this function must be safe to
       call from any surface, and the whole point is that nothing reaches a
       cart button without passing the same gates twice. */
    const compatibility = Number(rec.compatibility ?? rec.matchScore);
    const confidence = Number(rec.confidence);
    if (!(compatibility >= HIGH_MATCH_THRESHOLD)) continue;
    if (!(confidence >= MIN_CONFIDENCE)) continue;
    if (!isSellable(product)) continue;

    const variant = getVariantForSize(product, sizeMl);
    if (!_isOrderableVariant(variant)) continue;
    if (members.some(m => String(m.product.id) === String(product.id))) continue;

    members.push({ product, variant });
    if (members.length === count) break;
  }

  if (members.length < count) return null;

  return {
    id: 'recomendado',
    name: `Tus ${count} recomendaciones`,
    theme: 'Tus coincidencias más altas',
    copy: `Las ${count} fragancias con mayor compatibilidad según tus respuestas, en ${sizeMl} ml.`,
    products: members.map(m => m.product),
    variants: members.map(m => m.variant),
    total: members.reduce((sum, m) => sum + Number(m.variant.price), 0),
    itemSize: sizeMl,
    personalized: true,
  };
}

function _isOrderableVariant(variant) {
  if (!variant || variant.soldOut || !(Number(variant.availability) > 0)) return false;
  if (!Number.isFinite(Number(variant.price)) || Number(variant.price) <= 0) return false;
  const id = String(variant.variant_id ?? '').trim();
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}

/* ── Pure HTML builder ──────────────────────────────────────────── */

export function buildDiscoverySetsHtml(sets) {
  if (!sets.length) return '';
  return `<div class="ds-grid">${sets.map(_setCard).join('')}</div>`;
}

function _setCard(set) {
  const items = set.products.map(p => {
    const price = getPriceForSize(p, 3) ?? p.variants?.[0]?.price ?? 0;
    return `
      <li class="ds-card-item">
        <span class="ds-card-item-house">${_esc(p.house ?? '')}</span>
        <span class="ds-card-item-name">${_esc(p.name)}</span>
        <span class="ds-card-item-price">${formatPrice(price, '—')}</span>
      </li>`;
  }).join('');

  return `
    <article class="ds-card" data-set-id="${_esc(set.id)}">
      <p class="ds-card-theme">${_esc(set.theme)}</p>
      <h3 class="ds-card-name">${_esc(set.name)}</h3>
      <p class="ds-card-copy">${_esc(set.copy)}</p>
      <ul class="ds-card-items" aria-label="Fragancias incluidas en ${_esc(set.name)}">
        ${items}
      </ul>
      <div class="ds-card-foot">
        <div class="ds-card-price">
          <span class="ds-card-price-label">3 decants · 3ml c/u</span>
          <strong class="ds-card-price-total">${formatPrice(set.total, 'Consultar')}</strong>
        </div>
        <button class="btn-primary ds-card-add" data-set-id="${_esc(set.id)}"
          aria-label="Agregar ${_esc(set.name)} al carrito">
          Probar los 3
        </button>
      </div>
    </article>`;
}

/* Compact contextual-kit card — a fraction of a viewport, not an editorial
   card. Used ONLY by the post-recommendation kit prompt (renderContextualKit),
   never as a standing homepage section. Pure + unit-testable, mirroring
   buildDiscoverySetsHtml's shape (same data-set-id contract for _bindSetActions,
   same escaping). */
export function buildCompactKitHtml(set) {
  if (!set) return '';

  const items = set.products.map(p => {
    const hasImage = Boolean(p.image && p.image.trim());
    return `
      <li class="ck-mini-item">
        <span class="ck-mini-img${hasImage ? '' : ' ck-mini-img--fallback'}">
          ${hasImage ? `<img src="${_esc(p.image)}" alt="" loading="lazy" decoding="async">` : ''}
        </span>
        <span class="ck-mini-name">${_esc(p.name)}</span>
      </li>`;
  }).join('');

  return `
    <div class="ck-compact" data-set-id="${_esc(set.id)}">
      <ul class="ck-mini-list" aria-label="Fragancias incluidas en ${_esc(set.name)}">${items}</ul>
      <div class="ck-compact-foot">
        <span class="ck-compact-meta">3 decants de 3&nbsp;ml</span>
        <span class="ck-compact-price">${formatPrice(set.total, 'Consultar')}</span>
        <button class="btn-primary ck-compact-add" data-set-id="${_esc(set.id)}"
          aria-label="Agregar ${_esc(set.name)} al carrito">
          Agregar set
        </button>
      </div>
    </div>`;
}

/* ── UI — home page mount ───────────────────────────────────────── */

export async function setupDiscoverySets(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  let products = [];
  try {
    const { CatalogProvider } = await import('../providers/catalog.js');
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const taste = Personalization.getTaste();
  const eligible = filterDisliked(products, taste, { minCount: 3 });
  const sets = resolveDiscoverySets(eligible);
  if (!sets.length) { root.hidden = true; return; }

  /* Mobile shows the first MOBILE_VISIBLE_SETS kits; the rest stay behind
     "Ver más kits" (CSS-driven via .ds-more / .ds-grid.is-expanded). */
  const moreHtml = sets.length > MOBILE_VISIBLE_SETS
    ? `<button type="button" class="ds-more" id="ds-more">Ver más kits</button>`
    : '';

  root.hidden = false;
  root.innerHTML = `
    <div class="container">
      <div class="ds-head fade-up">
        <p class="section-label">Kits para empezar</p>
        <h2 class="section-title">¿No sabes<br><em>cuál elegir?</em></h2>
        <p class="ds-head-copy">Combina 3 decants de 3ml y pruébalos antes de invertir en el frasco completo.</p>
      </div>
      ${buildDiscoverySetsHtml(sets)}
      ${moreHtml}
    </div>`;

  primeImageStates(root);
  sets.forEach(s => Tracker.discoverySetViewed(s));
  _bindSetActions(root, sets);
  _bindShowMore(root);
}

/* ── UI — PDP fallback when no related products exist ───────────── */

export function renderDiscoverySetsFallback(slot, sets) {
  if (!slot || !sets.length) return;

  const headingEl = slot.querySelector('[id$="-related-h"], h2');
  if (headingEl) headingEl.textContent = '¿No sabes cuál elegir?';

  const row = slot.querySelector('[id$="-related-row"]');
  if (row) {
    row.innerHTML = buildDiscoverySetsHtml(sets.slice(0, 2));
    row.classList.add('ds-pdp-fallback');
  }

  slot.hidden = false;
  primeImageStates(slot);

  if (row) _bindSetActions(row, sets.slice(0, 2));
  sets.slice(0, 2).forEach(s => Tracker.discoverySetViewed(s));
}

/* ── Shared event binding ───────────────────────────────────────── */

function _bindSetActions(root, sets) {
  root.querySelectorAll('.ds-card-add').forEach(btn => {
    const set = sets.find(s => s.id === btn.dataset.setId);
    if (!set) return;
    btn.addEventListener('click', async () => {
      Tracker.discoverySetAdded(set);
      await window.__rd?.cart?.addBundle?.({
        id: set.id,
        title: set.name,
        items: set.products,
        itemSize: set.itemSize,
        originalTotal: set.total,
        total: set.total,
        savings: 0,
      });
      /* No forced cart open — the "Kit agregado · Ver carrito" toast keeps the
         customer browsing, consistent with single-product adds. */
    });
  });

  root.querySelectorAll('.ds-card').forEach(card => {
    const set = sets.find(s => s.id === card.dataset.setId);
    if (!set) return;
    card.addEventListener('click', e => {
      if (!e.target.closest('.ds-card-add')) {
        Tracker.discoverySetClicked(set, 'card');
      }
    });
  });
}

/* ── Contextual kit prompt (post-recommendation only) ───────────── */

/* Rendered by the catalog AFTER a guided recommendation — never as a standing
   homepage section, and never from an editorial template.

   `recommendations` are the engine's own ranked rows for the answers on
   screen. If three of them cannot be bought in the starter size, nothing is
   rendered: there is deliberately NO fallback to a themed kit here, because a
   fallback is exactly how a masculine set ended up under a "Mujer" result. */
export async function renderContextualKit(slot, { recommendations = [] } = {}) {
  if (!slot) return;

  const set = buildPersonalizedSet(recommendations);

  if (!set) { slot.hidden = true; slot.innerHTML = ''; return; }

  /* Compact — a fraction of a viewport, not another editorial card. The
     finder answers were already explained above; this only adds the offer. */
  slot.hidden = false;
  slot.innerHTML = `
    <div class="ck-inner">
      <p class="ck-kicker">¿Prefieres probar los tres?</p>
      ${buildCompactKitHtml(set)}
    </div>`;

  primeImageStates(slot);
  Tracker.discoverySetViewed(set);
  _bindCompactKitActions(slot, set);
}

function _bindCompactKitActions(root, set) {
  root.querySelector('.ck-compact-add')?.addEventListener('click', async () => {
    Tracker.discoverySetAdded(set);
    await window.__rd?.cart?.addBundle?.({
      id: set.id,
      title: set.name,
      items: set.products,
      itemSize: set.itemSize,
      originalTotal: set.total,
      total: set.total,
      savings: 0,
    });
    /* No forced cart open — the "Kit agregado · Ver carrito" toast keeps the
       customer browsing, consistent with single-product adds. */
  });

  root.querySelector('.ck-compact')?.addEventListener('click', e => {
    if (!e.target.closest('.ck-compact-add')) Tracker.discoverySetClicked(set, 'contextual_compact');
  });
}

/* `_pickSetForAnswers` used to live here: a hardcoded intent map
   (occasion 'noche' → the 'noches' template, family 'dulce' → 'citas', …)
   that chose an editorial kit from an answer and then ignored every other
   answer the customer had given. Deleted — the personalized surface builds
   its set from the ranking, and the editorial kits stay on the surfaces
   where nobody has answered anything. */

/* "Ver más kits" — reveal the kits hidden on mobile beyond MOBILE_VISIBLE_SETS. */
function _bindShowMore(root) {
  const btn = root.querySelector('#ds-more');
  if (!btn) return;
  btn.addEventListener('click', () => {
    root.querySelector('.ds-grid')?.classList.add('is-expanded');
    btn.remove();
  });
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
