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

import { isSellable, getOperationalScore } from '../recommendations/scoring.js?v=1.0.13';
import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  productSignals,
  scoreProfileMatch,
} from '../recommendations/taxonomy.js?v=1.0.13';
import { getPriceForSize, formatPrice } from '../utils/prices.js?v=1.0.13';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from './images.js';

const MIN_PRODUCTS = 2;
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

/* ── UI — home page mount ───────────────────────────────────────── */

export async function setupDiscoverySets(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  let products = [];
  try {
    const { CatalogProvider } = await import('../providers/catalog.js?v=1.0.16');
    products = await CatalogProvider.getProducts();
  } catch {
    products = [];
  }

  const sets = resolveDiscoverySets(products);
  if (!sets.length) { root.hidden = true; return; }

  root.hidden = false;
  root.innerHTML = `
    <div class="container">
      <div class="ds-head fade-up">
        <p class="section-label">Sets de descubrimiento</p>
        <h2 class="section-title">¿No sabes<br><em>cuál elegir?</em></h2>
        <p class="ds-head-copy">Elige un set de 3 fragancias en 3ml y prueba antes de invertir en el frasco.</p>
      </div>
      ${buildDiscoverySetsHtml(sets)}
    </div>`;

  primeImageStates(root);
  sets.forEach(s => Tracker.discoverySetViewed(s));
  _bindSetActions(root, sets);
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
      window.__rd?.ui?.openCart?.();
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

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
