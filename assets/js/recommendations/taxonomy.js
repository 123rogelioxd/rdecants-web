/* =============================================================
   RDECANTS — RECOMMENDATION TAXONOMY
   The single source of truth for mood / use-case / scent-family
   definitions and the shared metadata-matching scorer.

   Everything that reasons about "what kind of fragrance is this"
   (guidance badges, the shopping assistant, smart bundles, the
   "why this fragrance" component) imports from here so the matching
   vocabulary never drifts or gets duplicated.

   All matching is deterministic and based on REAL catalog metadata
   (notes, description, operational badge). No AI, no fabrication.
   ============================================================= */

/* Use-case / mood profiles (also power the guidance badges). */
export const USE_CASE_PROFILES = [
  {
    key: 'diario',
    label: 'Diario',
    short: 'el día a día',
    notes: ['citrico', 'bergamota', 'cedro', 'manzana', 'mineral', 'lavanda', 'jengibre'],
    badges: ['diario', 'daily', 'versatil'],
    text: ['diario', 'versatil', 'todos los dias', 'discreto', 'limpio', 'atemporal', 'facil de usar'],
  },
  {
    key: 'oficina',
    label: 'Oficina',
    short: 'la oficina',
    notes: ['vetiver', 'cedro', 'te verde', 'salvia', 'bergamota', 'iris'],
    badges: ['oficina', 'office'],
    text: ['oficina', 'trabajo', 'formal', 'sobrio', 'profesional', 'discreto'],
  },
  {
    key: 'fiesta',
    label: 'Fiesta',
    short: 'la fiesta',
    notes: ['vainilla', 'miel', 'tonka', 'canela', 'ron', 'azucar', 'caramelo'],
    badges: ['fiesta', 'night', 'noche'],
    text: ['noche', 'fiesta', 'salidas', 'dulce', 'rastro', 'intenso', 'antro', 'reventon'],
  },
  {
    key: 'tropical',
    label: 'Tropical',
    short: 'el calor',
    notes: ['coco', 'pina', 'mango', 'marino', 'menta', 'citrico', 'frutas tropicales'],
    badges: ['verano', 'summer', 'tropical', 'fresco'],
    text: ['tropical', 'verano', 'playa', 'calor', 'fresco', 'acuatico', 'vacaciones'],
  },
  {
    key: 'seductor',
    label: 'Seductor',
    short: 'la noche',
    notes: ['oud', 'cuero', 'tabaco', 'ambar', 'vainilla', 'pachuli'],
    badges: ['seductor', 'sensual'],
    text: ['seductor', 'sensual', 'conquista', 'cumplidos', 'magnetico', 'noche', 'cita'],
  },
  {
    key: 'elegante',
    label: 'Elegante',
    short: 'ocasiones especiales',
    notes: ['iris', 'sandalo', 'incienso', 'ambar gris', 'musgo', 'flor de azahar'],
    badges: ['elegante', 'lujo', 'nicho', 'luxury'],
    text: ['elegante', 'sofisticado', 'refinado', 'lujo', 'atemporal', 'clasico', 'exclusivo'],
  },
];

/* Scent families — the "Fresco / Dulce / Intenso" assistant axis. */
export const SCENT_FAMILIES = {
  fresco: {
    key: 'fresco',
    label: 'Fresco',
    notes: ['citrico', 'bergamota', 'marino', 'menta', 'mineral', 'manzana', 'lavanda', 'te verde'],
    text: ['fresco', 'limpio', 'ligero', 'citrico', 'acuatico', 'azul'],
  },
  dulce: {
    key: 'dulce',
    label: 'Dulce',
    notes: ['vainilla', 'miel', 'tonka', 'canela', 'caramelo', 'azucar', 'ron', 'chocolate'],
    text: ['dulce', 'goloso', 'gourmand', 'postre', 'azucarado'],
  },
  intenso: {
    key: 'intenso',
    label: 'Intenso',
    notes: ['oud', 'cuero', 'tabaco', 'ambar', 'incienso', 'pachuli', 'especias', 'agarwood'],
    text: ['intenso', 'potente', 'denso', 'oriental', 'arabe', 'profundo'],
  },
};

/* Climate axis — "cálido / frío". */
export const CLIMATES = {
  calido: {
    key: 'calido',
    label: 'Clima cálido',
    notes: ['citrico', 'marino', 'menta', 'coco', 'pina', 'mineral', 'bergamota'],
    text: ['fresco', 'verano', 'calor', 'ligero', 'acuatico'],
  },
  frio: {
    key: 'frio',
    label: 'Clima frío',
    notes: ['vainilla', 'ambar', 'oud', 'cuero', 'tabaco', 'canela', 'incienso', 'especias'],
    text: ['intenso', 'calido', 'potente', 'invierno', 'envolvente'],
  },
};

const NOTE_WEIGHT = 3;
const BADGE_WEIGHT = 2;
const TEXT_WEIGHT = 1;

/* Normalized metadata for a product, computed once and reused. */
export function productSignals(product) {
  return {
    notes: (product?.notes ?? []).map(normalizeText).filter(Boolean),
    badge: normalizeText(product?.badge),
    text: normalizeText([product?.desc, product?.story, ...(product?.notes ?? [])].join(' ')),
  };
}

/* Deterministic match score of a profile (use-case / family / climate)
   against a product's signals. Profiles may omit badges/text. */
export function scoreProfileMatch(profile, signals) {
  let score = 0;
  score += _count(profile.notes, term => signals.notes.some(note => note.includes(term))) * NOTE_WEIGHT;
  score += _count(profile.badges, term => signals.badge.includes(term)) * BADGE_WEIGHT;
  score += _count(profile.text, term => signals.text.includes(term)) * TEXT_WEIGHT;
  return score;
}

export function normalizeText(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function _count(terms = [], predicate) {
  return (terms ?? []).reduce((sum, raw) => sum + (predicate(normalizeText(raw)) ? 1 : 0), 0);
}
