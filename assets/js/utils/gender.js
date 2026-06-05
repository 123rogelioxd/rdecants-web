/* =============================================================
   RDECANTS - GENDER NORMALIZATION
   Central compatibility rules for catalog filters and recommendations.
   ============================================================= */

const MASCULINE_VALUES = new Set([
  'hombre',
  'masculino',
  'male',
  'masculine',
  'men',
  'man',
  'm',
]);

const FEMININE_VALUES = new Set([
  'mujer',
  'femenino',
  'female',
  'feminine',
  'women',
  'woman',
  'dama',
  'f',
]);

const UNISEX_VALUES = new Set([
  'unisex',
  'mixto',
  'neutro',
  'neutral',
  'unisex/mixed',
  'mixed',
  'both',
]);

const UNISEX_MASCULINE_VALUES = new Set([
  'unisex inclinado masculino',
  'unisex masculino',
  'unisex masculine',
  'unisex male',
  'unisex men',
  'masculine leaning unisex',
  'male leaning unisex',
]);

const UNISEX_FEMININE_VALUES = new Set([
  'unisex inclinado femenino',
  'unisex femenino',
  'unisex feminine',
  'unisex female',
  'unisex women',
  'feminine leaning unisex',
  'female leaning unisex',
]);

const UNKNOWN_VALUES = new Set([
  'sin asignar',
  'no asignado',
  'unassigned',
  'unknown',
  'n/a',
  'na',
]);

export function normalizeGender(value) {
  const normalized = String(value ?? '').toLowerCase().trim();
  if (!normalized || normalized === 'any' || normalized === 'todos' || normalized === 'all') return 'unknown';
  if (UNKNOWN_VALUES.has(normalized)) return 'unknown';
  if (UNISEX_MASCULINE_VALUES.has(normalized)) return 'unisex_masculine';
  if (UNISEX_FEMININE_VALUES.has(normalized)) return 'unisex_feminine';
  if (MASCULINE_VALUES.has(normalized)) return 'masculine';
  if (FEMININE_VALUES.has(normalized)) return 'feminine';
  if (UNISEX_VALUES.has(normalized)) return 'unisex';
  return 'unknown';
}

export function getProductGender(product) {
  if (!product || typeof product !== 'object') return normalizeGender(product);

  return normalizeGender(
    product.gender ??
    product.gender_positioning ??
    product.gender_profile ??
    product.perfil_genero ??
    product.genero_orientado ??
    product.genero ??
    product.fragrance?.gender_positioning ??
    product.fragrance?.gender_profile ??
    product.fragrance?.gender ??
    product.fragrance?.perfil_genero ??
    null
  );
}

export function getGenderEligibility(product, selectedGender) {
  if (!selectedGender || selectedGender === 'any') {
    return { eligible: true, priority: 'primary', penalty: 0 };
  }

  const selected = normalizeGender(selectedGender);
  if (selected === 'unknown') {
    return { eligible: true, priority: 'primary', penalty: 0 };
  }

  const productGender = getProductGender(product);
  if (productGender === 'unknown') {
    return { eligible: true, priority: 'fallback', penalty: 30 };
  }

  const priority = _priorityFor(selected, productGender);
  if (priority === 'rejected') {
    return { eligible: false, priority, penalty: Infinity };
  }

  return {
    eligible: true,
    priority,
    penalty: priority === 'primary' ? 0 : 15,
  };
}

export function matchesGender(product, selectedGender) {
  if (!selectedGender || selectedGender === 'any') return true;

  const eligibility = getGenderEligibility(product, selectedGender);
  return eligibility.eligible && eligibility.priority !== 'fallback';
}

function _priorityFor(selected, productGender) {
  if (selected === 'feminine') {
    if (['feminine', 'unisex', 'unisex_feminine'].includes(productGender)) return 'primary';
    if (productGender === 'unisex_masculine') return 'secondary';
    return 'rejected';
  }

  if (selected === 'masculine') {
    if (['masculine', 'unisex', 'unisex_masculine'].includes(productGender)) return 'primary';
    if (productGender === 'unisex_feminine') return 'secondary';
    return 'rejected';
  }

  if (selected === 'unisex') {
    if (['unisex', 'unisex_masculine', 'unisex_feminine'].includes(productGender)) return 'primary';
    if (['masculine', 'feminine'].includes(productGender)) return 'secondary';
    return 'rejected';
  }

  if (selected === 'unisex_masculine') {
    if (['masculine', 'unisex', 'unisex_masculine'].includes(productGender)) return 'primary';
    if (productGender === 'unisex_feminine') return 'secondary';
    return 'rejected';
  }

  if (selected === 'unisex_feminine') {
    if (['feminine', 'unisex', 'unisex_feminine'].includes(productGender)) return 'primary';
    if (productGender === 'unisex_masculine') return 'secondary';
    return 'rejected';
  }

  return 'primary';
}
