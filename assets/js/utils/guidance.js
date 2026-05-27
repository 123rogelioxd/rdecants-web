/* =============================================================
   RDECANTS — PURCHASE GUIDANCE
   Beginner-friendly orientation badges derived ONLY from real
   catalog metadata (notes, description, operational badge, house).
   Goal: reduce decision paralysis with a lightweight hint about
   when/how to wear a fragrance. No AI, no fabricated data.

   Each product surfaces at most MAX_BADGES guidance chips, picked
   by score so we never clutter the card.
   ============================================================= */

const MAX_BADGES = 2;
const MIN_SCORE = 3;

const NOTE_WEIGHT = 3;
const BADGE_WEIGHT = 2;
const TEXT_WEIGHT = 1;

const PROFILES = [
  {
    key: 'diario',
    label: 'Diario',
    notes: ['citrico', 'bergamota', 'cedro', 'manzana', 'mineral', 'lavanda', 'jengibre'],
    badges: ['diario', 'daily', 'versatil'],
    text: ['diario', 'versatil', 'todos los dias', 'discreto', 'limpio', 'atemporal', 'facil de usar'],
  },
  {
    key: 'oficina',
    label: 'Oficina',
    notes: ['vetiver', 'cedro', 'te verde', 'salvia', 'bergamota', 'iris'],
    badges: ['oficina', 'office'],
    text: ['oficina', 'trabajo', 'formal', 'sobrio', 'profesional', 'discreto'],
  },
  {
    key: 'fiesta',
    label: 'Fiesta',
    notes: ['vainilla', 'miel', 'tonka', 'canela', 'ron', 'azucar', 'caramelo'],
    badges: ['fiesta', 'night', 'noche'],
    text: ['noche', 'fiesta', 'salidas', 'dulce', 'rastro', 'intenso', 'antro', 'reventon'],
  },
  {
    key: 'tropical',
    label: 'Tropical',
    notes: ['coco', 'pina', 'mango', 'marino', 'menta', 'citrico', 'frutas tropicales'],
    badges: ['verano', 'summer', 'tropical', 'fresco'],
    text: ['tropical', 'verano', 'playa', 'calor', 'fresco', 'acuatico', 'vacaciones'],
  },
  {
    key: 'seductor',
    label: 'Seductor',
    notes: ['oud', 'cuero', 'tabaco', 'ambar', 'vainilla', 'pachuli'],
    badges: ['seductor', 'sensual'],
    text: ['seductor', 'sensual', 'conquista', 'cumplidos', 'magnetico', 'noche', 'cita'],
  },
  {
    key: 'elegante',
    label: 'Elegante',
    notes: ['iris', 'sandalo', 'incienso', 'ambar gris', 'musgo', 'flor de azahar'],
    badges: ['elegante', 'lujo', 'nicho', 'luxury'],
    text: ['elegante', 'sofisticado', 'refinado', 'lujo', 'atemporal', 'clasico', 'exclusivo'],
  },
];

export function getGuidanceBadges(product) {
  if (!product) return [];

  const notes = (product.notes ?? []).map(_norm);
  const badge = _norm(product.badge);
  const text = _productText(product);

  return PROFILES
    .map(profile => ({
      key: profile.key,
      label: profile.label,
      score: _scoreProfile(profile, { notes, badge, text }),
    }))
    .filter(item => item.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_BADGES)
    .map(({ key, label }) => ({ key, label }));
}

function _scoreProfile(profile, { notes, badge, text }) {
  let score = 0;

  score += _countMatches(profile.notes, term =>
    notes.some(note => note.includes(term))) * NOTE_WEIGHT;

  score += _countMatches(profile.badges, term =>
    badge.includes(term)) * BADGE_WEIGHT;

  score += _countMatches(profile.text, term =>
    text.includes(term)) * TEXT_WEIGHT;

  return score;
}

function _countMatches(terms = [], predicate) {
  return terms.reduce((sum, raw) => sum + (predicate(_norm(raw)) ? 1 : 0), 0);
}

function _productText(product) {
  // Badge is scored separately via BADGE_WEIGHT; keep it out here to
  // avoid double-counting an operational tag.
  return _norm([
    product.desc,
    product.story,
    ...(product.notes ?? []),
  ].join(' '));
}

function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
