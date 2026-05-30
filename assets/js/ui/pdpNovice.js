/* =============================================================
   RDECANTS — PDP NOVICE-FIRST GUIDANCE
   Builds the "sell / guide" layer that sits at the top of the
   product page so a first-timer understands the fragrance before
   the technical profile. Everything here is derived ONLY from real
   catalog metadata (scent family, mood / context tags, scores) —
   no AI, no fabrication. When metadata is thin we fall back to
   honest, brand-safe copy instead of inventing facts.

     getNoviceLead(product)       -> plain-language "why you might like it"
     getBestForChips(product)     -> ["Oficina","Diario","Apto principiante"…]
     getNegatives(product)        -> ["No es para ti si…"] (only when confident)
     getReturningUserLine(product, taste) -> personalization copy (optional)

   Pure & DOM-free so the test suite can assert the logic directly.
   ============================================================= */

import {
  getProfileSummary,
  getScoreSummary,
} from './fragranceProfile.js?v=1.0.1';
import { deriveProductMoods } from '../recommendations/personalization.js?v=1.0.13';

/* Score band thresholds (percent). Deliberately conservative so a
   chip / negative only appears when the metadata clearly supports it. */
const HIGH = 67;
const VERY_HIGH = 78;
const LOW = 25;
const MAX_CHIPS = 6;
const MAX_NEGATIVES = 2;

/* Context tag → beginner-friendly Spanish chip. Several raw tags fold
   into the same chip (summer + beach → "Verano"). */
const CONTEXT_CHIPS = [
  { key: 'office',  label: 'Oficina',     tags: ['office', 'oficina', 'work', 'trabajo', 'meetings', 'reuniones'] },
  { key: 'daily',   label: 'Diario',      tags: ['daily', 'daily-use', 'diario', 'casual', 'university', 'school', 'escuela'] },
  { key: 'date',    label: 'Cita',        tags: ['date', 'date-night', 'citas'] },
  { key: 'night',   label: 'Noche',       tags: ['night', 'noche', 'evening', 'party', 'fiesta'] },
  { key: 'summer',  label: 'Verano',      tags: ['summer', 'verano', 'warm-weather', 'hot-weather', 'beach', 'playa'] },
  { key: 'cold',    label: 'Clima frío',  tags: ['cold-weather', 'winter', 'invierno'] },
];

/* ── Best-for chips ─────────────────────────────────────────────── */
export function getBestForChips(product) {
  const f = product?.fragrance;
  if (!f) return [];

  const chips = [];
  const push = (key, label) => {
    if (!chips.some(c => c.key === key)) chips.push({ key, label });
  };

  const ctx = new Set((f.recommended_context_tags ?? []).map(_norm));
  for (const chip of CONTEXT_CHIPS) {
    if (chip.tags.some(t => ctx.has(t))) push(chip.key, chip.label);
  }

  const scores = _scoreMap(f);
  if ((scores.longevity ?? 0) >= HIGH) push('longlasting', 'Larga duración');
  if ((scores.projection ?? 0) >= HIGH) push('projection', 'Buena proyección');

  /* Beginner-safe = easy to wear (versatile) and not a projection beast. */
  if ((scores.versatility ?? 0) >= 60 && (scores.projection ?? 0) <= VERY_HIGH) {
    push('beginner', 'Apto principiante');
  }

  return chips.slice(0, MAX_CHIPS);
}

/* ── "No es para ti si…" — only confident, score-backed negatives ── */
export function getNegatives(product) {
  const f = product?.fragrance;
  if (!f) return [];

  const scores = _scoreMap(f);
  const family = _norm(f.scent_family_normalized);
  const negs = [];

  if ((scores.sweetness ?? 0) >= 70) {
    negs.push('No es para ti si no disfrutas los aromas dulces.');
  }
  if ((scores.projection ?? 0) >= VERY_HIGH) {
    negs.push('No es para ti si buscas algo muy discreto.');
  }
  if ((scores.freshness ?? 0) >= 75) {
    negs.push('No es para ti si quieres algo cálido e intenso.');
  } else if (
    (scores.freshness ?? 100) <= LOW &&
    ((scores.longevity ?? 0) >= 55 ||
      ['oriental', 'amber', 'ambar', 'leather', 'cuero', 'oud'].some(k => family.includes(k)))
  ) {
    negs.push('No es para ti si prefieres aromas frescos y ligeros.');
  }

  return negs.slice(0, MAX_NEGATIVES);
}

/* ── Plain-language "why you might like it" lead ────────────────── */
export function getNoviceLead(product) {
  const fallback =
    'Una forma fácil de descubrir si esta fragancia es para ti, sin comprar el frasco completo.';

  const f = product?.fragrance;
  if (!f) return fallback;

  const summary = getProfileSummary(f);
  const family = summary?.family ? summary.family.toLowerCase() : null;
  const vibe = summary?.vibe?.length ? summary.vibe[0].toLowerCase() : null;
  const context = summary?.bestFor?.length ? summary.bestFor[0].toLowerCase() : null;

  let descriptor = '';
  if (family && vibe) descriptor = `Un perfume ${family} de carácter ${vibe}`;
  else if (family) descriptor = `Un perfume ${family}`;
  else if (vibe) descriptor = `Un perfume de carácter ${vibe}`;

  if (!descriptor) return fallback;
  if (context) descriptor += `, cómodo para ${context}`;

  return `${descriptor}. Pruébalo en decant antes de invertir en el frasco completo.`;
}

/* ── Returning-user copy (optional, personalization-driven) ─────── */
const TASTE_PHRASE = {
  diario: 'diarios y versátiles',
  oficina: 'sobrios de oficina',
  fiesta: 'dulces de fiesta',
  tropical: 'frescos para el calor',
  seductor: 'intensos y seductores',
  elegante: 'elegantes y refinados',
};

export function getReturningUserLine(product, taste) {
  if (!product || !taste) return '';

  const topMoods = Object.entries(taste.moods ?? {})
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  if (!topMoods.length) return '';

  const productMoods = deriveProductMoods(product);
  const match = productMoods.find(m => topMoods.includes(m));
  if (!match || !TASTE_PHRASE[match]) return '';

  return `Por lo que has explorado, esto encaja con tu gusto por aromas ${TASTE_PHRASE[match]}.`;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function _scoreMap(fragrance) {
  return Object.fromEntries(getScoreSummary(fragrance).map(s => [s.key, s.pct]));
}

function _norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
