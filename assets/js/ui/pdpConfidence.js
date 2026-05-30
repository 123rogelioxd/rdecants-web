/* =============================================================
   RDECANTS — PDP CONFIDENCE LAYER
   Reduces purchase hesitation near the buy area with honest,
   metadata-driven signals. Nothing is fabricated.

   Five outputs, all pure / DOM-free:

   getConfidenceBadge(product)       → { key, label } | null
     Single most-relevant label ("Compra segura", "Muy solicitado"…).
     Derived from score thresholds + operational backend signals.

   getWhyChooseThis(product)         → string[]
     Short CHARACTER bullets (duration, ease, projection…) at
     most 3. Different from A2's use-case chips intentionally.

   getPopularitySignal(product)      → string | null
     Only when hasHighDemand() or featured — real backend flags.
     Returns null otherwise (hidden, never fabricated).

   getComparisonHelper(product)      → { choose: string[], skip: string[] }
     Decision-point rephrasing. "Choose this if…" from context tags
     + scores. "Better skip if…" from scores. Max 2 each.

   buildConfidenceHtml(product)      → HTML string
     Assembles all of the above into one compact block.
     Returns '' if nothing meaningful to show (always safe to call).
   ============================================================= */

import { getScoreSummary } from './fragranceProfile.js?v=1.0.1';
import { hasHighDemand } from '../utils/scarcity.js?v=1.0.13';

/* ── Thresholds (conservative — only show when clearly supported) */
const HIGH      = 67;
const VERY_HIGH = 78;
const LOW       = 25;

/* ── Confidence badge ────────────────────────────────────────────── */
export function getConfidenceBadge(product) {
  const f        = product?.fragrance ?? null;
  const demand   = hasHighDemand(product);
  const featured = Boolean(product?.featured);
  const scores   = _scores(f);

  const versatile   = (scores.versatility ?? 0) >= 60;
  const longLasting = (scores.longevity   ?? 0) >= HIGH;
  const notTooLoud  = (scores.projection  ?? 0) < VERY_HIGH;
  const beginnerSafe = versatile && notTooLoud;

  if (demand && featured)    return { key: 'top',       label: 'De los más pedidos' };
  if (demand)                return { key: 'demand',    label: 'Muy solicitado' };
  if (featured && versatile) return { key: 'popular',   label: 'Elección popular' };
  if (beginnerSafe && (scores.versatility ?? 0) >= 70)
                             return { key: 'safe',      label: 'Compra segura' };
  if (beginnerSafe)          return { key: 'beginner',  label: 'Ideal para empezar' };
  if (longLasting && featured)
                             return { key: 'lasting',   label: 'Duración excepcional' };
  return null;
}

/* ── Why choose this (CHARACTER bullets, not use-case chips) ─────── */
export function getWhyChooseThis(product) {
  const f      = product?.fragrance ?? null;
  const scores = _scores(f);
  const ctx    = _normSet(f?.recommended_context_tags);
  const bullets = [];

  /* Context-specific bullets first (most user-relevant) */
  if (['office','oficina','work','trabajo'].some(t => ctx.has(t)))
    bullets.push('Apto para la oficina');
  if (['date','date-night','citas','night','noche'].some(t => ctx.has(t)))
    bullets.push('Perfecto para salidas');
  /* Character bullets from scores */
  if ((scores.versatility ?? 0) >= 60) bullets.push('Fácil de usar');
  if ((scores.longevity   ?? 0) >= HIGH) bullets.push('Larga duración');
  if ((scores.projection  ?? 0) >= HIGH && (scores.projection ?? 0) < VERY_HIGH)
    bullets.push('Presencia notable sin ser excesivo');
  if ((scores.freshness   ?? 0) >= 70) bullets.push('Refrescante y limpio');
  /* Operational signal last */
  if (hasHighDemand(product)) bullets.push('Muy solicitado en el catálogo');

  return [...new Set(bullets)].slice(0, 3);
}

/* ── Popularity signal (real backend flags only) ─────────────────── */
export function getPopularitySignal(product) {
  if (hasHighDemand(product)) return 'Muy solicitado entre nuestros clientes.';
  return null;
}

/* ── Comparison helper ("Choose this if / Skip this if") ────────── */
const CHOOSE_MAP = {
  office:      'Necesitas una fragancia discreta para el trabajo',
  daily:       'Quieres tu aroma de todos los días',
  date:        'Quieres destacar en una cita o salida nocturna',
  night:       'Buscas proyección para la noche',
  summer:      'Tu clima es cálido o estás en verano',
  versatile:   'Prefieres algo versátil que funcione en cualquier momento',
  longlasting: 'La duración es lo que más valoras',
};

export function getComparisonHelper(product) {
  const f      = product?.fragrance ?? null;
  const scores = _scores(f);
  const ctx    = _normSet(f?.recommended_context_tags);

  const choose = [];
  if (['office','oficina','work','trabajo'].some(t => ctx.has(t)))
    choose.push(CHOOSE_MAP.office);
  if (['daily','daily-use','diario','casual'].some(t => ctx.has(t)))
    choose.push(CHOOSE_MAP.daily);
  if (['date','date-night','citas','night','noche'].some(t => ctx.has(t)))
    choose.push(CHOOSE_MAP.date);
  if ((scores.versatility ?? 0) >= 70 && !choose.length)
    choose.push(CHOOSE_MAP.versatile);
  if ((scores.longevity ?? 0) >= VERY_HIGH)
    choose.push(CHOOSE_MAP.longlasting);

  const skip = [];
  const family = _normStr(f?.scent_family_normalized);
  if ((scores.sweetness ?? 0) >= 70)
    skip.push('No te gustan los aromas dulces o empalagosos');
  if ((scores.projection ?? 0) >= VERY_HIGH)
    skip.push('Prefieres algo muy discreto o ligero');
  if ((scores.freshness ?? 0) >= 75)
    skip.push('Buscas algo cálido e intenso');
  else if (
    (scores.freshness ?? 100) <= LOW &&
    ['oriental','amber','ambar','leather','cuero','oud'].some(k => family.includes(k))
  ) skip.push('Prefieres aromas frescos y ligeros');

  return {
    choose: choose.slice(0, 2),
    skip:   skip.slice(0, 2),
  };
}

/* ── Assembler ───────────────────────────────────────────────────── */
export function buildConfidenceHtml(product) {
  const badge      = getConfidenceBadge(product);
  const bullets    = getWhyChooseThis(product);
  const popularity = getPopularitySignal(product);
  const { choose, skip } = getComparisonHelper(product);

  /* Nothing to show — hide section entirely. */
  if (!badge && !bullets.length && !popularity && !choose.length && !skip.length) return '';

  const badgeHtml = badge
    ? `<p class="pdp-conf-badge pdp-conf-badge--${badge.key}">${_esc(badge.label)}</p>`
    : '';

  const bulletsHtml = bullets.length
    ? `<ul class="pdp-conf-bullets">
        ${bullets.map(b => `<li>${_esc(b)}</li>`).join('')}
      </ul>`
    : '';

  const popularityHtml = popularity
    ? `<p class="pdp-conf-popularity">${_esc(popularity)}</p>`
    : '';

  const compareHtml = (choose.length || skip.length) ? `
    <div class="pdp-conf-compare">
      ${choose.length ? `
        <div class="pdp-conf-choose">
          <p class="pdp-conf-compare-h">Elige este si…</p>
          <ul>${choose.map(c => `<li>${_esc(c)}</li>`).join('')}</ul>
        </div>` : ''}
      ${skip.length ? `
        <div class="pdp-conf-skip">
          <p class="pdp-conf-compare-h">Mejor otro si…</p>
          <ul>${skip.map(s => `<li>${_esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
    </div>` : '';

  return `
    <section class="pdp-confidence" id="pdp-confidence" aria-label="¿Por qué elegirlo?">
      ${badgeHtml}
      ${bulletsHtml}
      ${popularityHtml}
      ${compareHtml}
    </section>`;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function _scores(fragrance) {
  if (!fragrance) return {};
  return Object.fromEntries(getScoreSummary(fragrance).map(s => [s.key, s.pct]));
}

function _normSet(list) {
  return new Set((Array.isArray(list) ? list : []).map(_normStr));
}

function _normStr(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
