/* =============================================================
   RDECANTS — DYNAMIC SMART BUNDLES (logic)
   Builds curated kits on the fly from the live catalog using the
   shared taxonomy + operational scoring. Each template defines an
   intent (mood / use-case / climate); the actual fragrances are
   chosen from real, sellable inventory.

   Operational rules (reused, not duplicated):
     • never include sold-out products
     • prefer healthy stock + featured + rotation (operational score)
     • avoid leaning on nearly-gone stock

   Honesty note: dynamic bundles are groupings of individual decants
   added at their normal price. There is no backend bundle discount,
   so we show the real total and DO NOT fabricate a "savings" figure.
   ============================================================= */

import {
  USE_CASE_PROFILES,
  SCENT_FAMILIES,
  CLIMATES,
  productSignals,
  scoreProfileMatch,
} from './taxonomy.js?v=1.0.13';
import { isSellable, getOperationalScore, getAovSignal } from './scoring.js?v=1.0.13';
import { getDefaultVariant } from '../utils/prices.js?v=1.0.13';

const DEFAULT_SIZE = 3;
const MIN_ITEMS = 2;

const _profileByKey = new Map(USE_CASE_PROFILES.map(p => [p.key, p]));

export const BUNDLE_TEMPLATES = [
  {
    id: 'calor-tropical',
    title: 'Kit Calor Tropical',
    description: 'Frescura cítrica y marina para los días de más calor.',
    why: 'Perfiles ligeros y luminosos que rinden bien con el sol y la humedad.',
    families: ['fresco'],
    useCases: ['tropical'],
    climate: 'calido',
    size: 3,
  },
  {
    id: 'oficina-clean',
    title: 'Oficina Clean Starter',
    description: 'Aromas limpios y discretos, ideales para el día a día profesional.',
    why: 'Estelas sobrias que proyectan cerca: presencia sin invadir la sala.',
    families: ['fresco'],
    useCases: ['oficina', 'diario'],
    size: 3,
  },
  {
    id: 'seduccion-nocturna',
    title: 'Seducción Nocturna',
    description: 'Dulces y envolventes, pensados para dejar rastro de noche.',
    why: 'Notas cálidas y golosas que ganan cumplidos en salidas y citas.',
    families: ['dulce'],
    useCases: ['seductor', 'fiesta'],
    climate: 'frio',
    size: 3,
  },
  {
    id: 'fresh-luxury',
    title: 'Fresh Luxury Starter',
    description: 'Una entrada elegante al lujo: fresco, pulido y versátil.',
    why: 'Progresión de lo fresco a lo refinado para empezar con buen gusto.',
    families: ['fresco'],
    useCases: ['elegante', 'diario'],
    progression: true,
    size: 3,
  },
  {
    id: 'arabic-intensity',
    title: 'Arabic Intensity Pack',
    description: 'Intensos, resinosos y de gran proyección al estilo árabe.',
    why: 'Oud, ámbar y especias para quien busca máxima presencia.',
    families: ['intenso'],
    useCases: ['seductor', 'elegante'],
    climate: 'frio',
    progression: true,
    size: 3,
  },
];

export function generateBundles(products, { limit = BUNDLE_TEMPLATES.length } = {}) {
  if (!Array.isArray(products) || !products.length) return [];

  const sellable = products.filter(isSellable);
  if (!sellable.length) return [];

  return BUNDLE_TEMPLATES
    .map(template => _buildBundle(template, sellable))
    .filter(Boolean)
    .slice(0, limit);
}

function _buildBundle(template, sellable) {
  const ranked = sellable
    .map(product => ({
      product,
      score: _scoreForTemplate(product, productSignals(product), template),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      getOperationalScore(b.product) - getOperationalScore(a.product) ||
      getAovSignal(b.product) - getAovSignal(a.product));

  const items = _pickDistinct(ranked, template.size ?? 3);
  if (items.length < MIN_ITEMS) return null;

  const ordered = template.progression ? _orderByIntensity(items) : items;
  const total = ordered.reduce((sum, p) => sum + (getDefaultVariant(p)?.price ?? 0), 0);

  return {
    id: template.id,
    title: template.title,
    description: template.description,
    why: template.why,
    items: ordered,
    size: ordered.length,
    total,
    savings: null, // no real bundle discount exists — never fabricated
  };
}

function _scoreForTemplate(product, signals, template) {
  let score = 0;
  (template.families ?? []).forEach(key => {
    const family = SCENT_FAMILIES[key];
    if (family) score += scoreProfileMatch(family, signals);
  });
  (template.useCases ?? []).forEach(key => {
    const profile = _profileByKey.get(key);
    if (profile) score += scoreProfileMatch(profile, signals);
  });
  if (template.climate && CLIMATES[template.climate]) {
    score += scoreProfileMatch(CLIMATES[template.climate], signals);
  }
  return score;
}

/* Prefer variety: distinct houses first, then fill if short. */
function _pickDistinct(ranked, size) {
  const chosen = [];
  const houses = new Set();

  for (const { product } of ranked) {
    if (chosen.length >= size) break;
    const house = String(product.house ?? '').toLowerCase();
    if (house && houses.has(house)) continue;
    houses.add(house);
    chosen.push(product);
  }

  if (chosen.length < size) {
    for (const { product } of ranked) {
      if (chosen.length >= size) break;
      if (!chosen.includes(product)) chosen.push(product);
    }
  }

  return chosen;
}

/* Light → bold, for "beginner progression" templates. */
function _orderByIntensity(items) {
  return [...items].sort((a, b) =>
    scoreProfileMatch(SCENT_FAMILIES.intenso, productSignals(a)) -
    scoreProfileMatch(SCENT_FAMILIES.intenso, productSignals(b)));
}

export { DEFAULT_SIZE };
