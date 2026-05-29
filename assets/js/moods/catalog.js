/* =============================================================
   RDECANTS — MOOD CATALOG
   Single source of truth for curated mood collections.
   Adding a new mood is a DATA change here, no UI rewrite needed.
   Every mood is metadata-driven (see moods/engine.js).
   ============================================================= */

export const MOODS = [
  {
    slug: 'calor-tropical',
    title: 'Calor Tropical',
    eyebrow: 'Colección',
    tagline: 'Fragancias frescas, limpias y brillantes para días cálidos.',
    description: 'Aromas que conviven con el sol: marino, cítrico, mineral. Para usar todos los días sin sentirte pesado.',
    chips: ['Calor', 'Verano', 'Diario', 'Fresco'],
    why: [
      'Funciona en climas cálidos',
      'No resulta pesado',
      'Ideal para uso diario',
      'Sensación limpia y energética',
    ],
    match: {
      families: ['fresh', 'aquatic', 'citrus', 'aromatic'],
      moods: ['clean', 'fresh', 'cool'],
      contexts: ['warm-weather', 'hot-weather', 'summer', 'beach', 'daily'],
      notes: ['marino', 'coco', 'citrico', 'menta', 'mineral', 'bergamota', 'mandarina', 'acuatico'],
      legacyKey: 'tropical',
      scoreFloor: { freshness: 55 },
    },
    related: ['verano-playa', 'fresh-office', 'citas-nocturnas'],
  },
  {
    slug: 'noche-seduccion',
    title: 'Noche / Seducción',
    eyebrow: 'Colección',
    tagline: 'Densas, oscuras y magnéticas. Pensadas para dejar huella en la noche.',
    description: 'Composiciones cálidas con proyección que se nota. Para citas, eventos y noches que importan.',
    chips: ['Noche', 'Sensual', 'Intenso', 'Cita'],
    why: [
      'Proyección fuerte',
      'Notas cálidas y envolventes',
      'Ideal para citas y eventos',
      'Ese rastro que se recuerda',
    ],
    match: {
      families: ['oriental', 'amber', 'leather', 'gourmand', 'amber-fougere'],
      moods: ['sensual', 'mysterious', 'confident', 'intense', 'powerful'],
      contexts: ['night', 'date', 'party', 'date-night', 'evening'],
      styles: ['bold', 'luxurious'],
      notes: ['vainilla', 'oud', 'ambar', 'tabaco', 'cuero', 'tonka', 'canela', 'miel'],
      legacyKey: 'seductor',
      scoreFloor: { projection: 60 },
    },
    related: ['citas-nocturnas', 'lujo-elegante', 'calor-tropical'],
  },
  {
    slug: 'fresh-office',
    title: 'Fresh Office',
    eyebrow: 'Colección',
    tagline: 'Limpias, versátiles y profesionales. Tu firma para cada reunión.',
    description: 'Discretas pero presentes: vetiver, cedro, té verde, bergamota. Funcionan con cualquier outfit.',
    chips: ['Oficina', 'Profesional', 'Diario', 'Limpio'],
    why: [
      'Discreta pero presente',
      'Combina con cualquier outfit',
      'Apropiada para trabajo y reuniones',
      'Fácil de usar todos los días',
    ],
    match: {
      families: ['aromatic', 'fresh', 'citrus', 'woody'],
      moods: ['clean', 'confident', 'cool'],
      contexts: ['office', 'daily', 'meetings', 'work', 'formal'],
      styles: ['minimal', 'modern', 'sophisticated'],
      notes: ['vetiver', 'cedro', 'bergamota', 'te verde', 'iris', 'salvia'],
      legacyKey: 'oficina',
    },
    related: ['calor-tropical', 'lujo-elegante', 'verano-playa'],
  },
  {
    slug: 'lujo-elegante',
    title: 'Lujo Elegante',
    eyebrow: 'Colección',
    tagline: 'Composiciones nicho, sofisticadas y atemporales. Para quien sabe.',
    description: 'Casas exclusivas, ingredientes nicho, perfiles que no se cruzan en cada esquina. Refinado y memorable.',
    chips: ['Lujo', 'Nicho', 'Sofisticado', 'Elegante'],
    why: [
      'Ingredientes nicho y casas exclusivas',
      'Composiciones únicas',
      'Sensación de exclusividad',
      'Atemporal y refinado',
    ],
    match: {
      moods: ['sophisticated', 'mysterious'],
      styles: ['sophisticated', 'luxurious', 'elegant', 'bold'],
      houses: ['xerjoff', 'creed', 'initio', 'parfums de marly', 'amouage', 'nishane', 'kilian', 'roja'],
      notes: ['iris', 'sandalo', 'incienso', 'ambar gris', 'musgo', 'oud'],
      legacyKey: 'elegante',
    },
    related: ['noche-seduccion', 'fresh-office', 'citas-nocturnas'],
  },
  {
    slug: 'verano-playa',
    title: 'Verano Playa',
    eyebrow: 'Colección',
    tagline: 'Sal, sol y brisa. Aromas que evocan vacaciones y libertad.',
    description: 'Acuáticos, solares y frutales: la energía de la playa metida en un decant.',
    chips: ['Verano', 'Playa', 'Vacaciones', 'Acuático'],
    why: [
      'Notas acuáticas y solares',
      'Refrescante bajo el calor',
      'Energía de vacaciones',
      'Ligero, nunca abrumador',
    ],
    match: {
      families: ['aquatic', 'fresh', 'citrus'],
      moods: ['clean', 'fresh', 'playful', 'energetic'],
      contexts: ['summer', 'beach', 'warm-weather', 'hot-weather', 'travel', 'outdoor'],
      notes: ['marino', 'coco', 'pina', 'mango', 'citrico', 'frutas tropicales', 'mineral'],
      legacyKey: 'tropical',
      scoreFloor: { freshness: 60 },
    },
    related: ['calor-tropical', 'fresh-office', 'citas-nocturnas'],
  },
  {
    slug: 'citas-nocturnas',
    title: 'Citas Nocturnas',
    eyebrow: 'Colección',
    tagline: 'Sensuales y magnéticas. El detalle que cambia la noche.',
    description: 'Cálidas, envolventes, ligeramente dulces. Para acercarse, para recordar, para conquistar.',
    chips: ['Citas', 'Sensual', 'Noche', 'Magnético'],
    why: [
      'Cálidas y envolventes',
      'Dejan rastro memorable',
      'Romance y cercanía',
      'Diseñadas para la noche',
    ],
    match: {
      moods: ['sensual', 'romantic', 'mysterious', 'confident'],
      contexts: ['date', 'date-night', 'night', 'evening', 'party'],
      notes: ['vainilla', 'ambar', 'oud', 'rosa', 'jazmin', 'tonka', 'pachuli'],
      legacyKey: 'seductor',
      scoreFloor: { projection: 50 },
    },
    related: ['noche-seduccion', 'lujo-elegante', 'calor-tropical'],
  },
];

export function findMoodBySlug(slug) {
  if (!slug) return null;
  const target = String(slug).toLowerCase();
  return MOODS.find(m => m.slug === target) || null;
}

export function getRelatedMoods(mood) {
  if (!mood?.related) return [];
  return mood.related
    .map(slug => findMoodBySlug(slug))
    .filter(Boolean);
}

export function moodPageUrl(mood) {
  const slug = typeof mood === 'string' ? mood : mood?.slug;
  return `/mood/${encodeURIComponent(String(slug ?? ''))}`;
}

export function readMoodSlugFromLocation(pathname = (typeof window !== 'undefined' ? window.location.pathname : '')) {
  const m = String(pathname || '').match(/\/mood\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
