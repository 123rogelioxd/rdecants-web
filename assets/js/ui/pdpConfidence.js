/* =============================================================
   RDECANTS — PDP CONFIDENCE BADGE
   A single honest, metadata-driven trust signal surfaced in the
   hero ("Muy solicitado", "Compra segura"…). Nothing is fabricated.

   getConfidenceBadge(product) → { key, label } | null
     Single most-relevant label, derived from score thresholds +
     operational backend signals (high demand / featured). Returns
     null when nothing is clearly supported (badge simply hidden).

   This module used to also assemble a full "confidence layer"
   (why-bullets, popularity line, choose/skip comparison). That block
   duplicated the sell/guide section and the "no es para ti si…" line,
   so it was removed; only the badge remains.
   ============================================================= */

import { getScoreSummary } from './fragranceProfile.js?v=1.0.1';
import { hasHighDemand } from '../utils/scarcity.js?v=1.0.13';

/* ── Thresholds (conservative — only show when clearly supported) */
const HIGH      = 67;
const VERY_HIGH = 78;

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

/* ── Helpers ────────────────────────────────────────────────────── */
function _scores(fragrance) {
  if (!fragrance) return {};
  return Object.fromEntries(getScoreSummary(fragrance).map(s => [s.key, s.pct]));
}
