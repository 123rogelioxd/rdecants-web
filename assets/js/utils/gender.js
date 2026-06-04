/* =============================================================
   RDECANTS — GENDER NORMALIZATION
   Central compatibility rules for catalog filters and recommendations.
   ============================================================= */

const MALE_VALUES = new Set([
  'hombre',
  'masculino',
  'male',
  'masculine',
  'men',
  'man',
  'm',
]);

const FEMALE_VALUES = new Set([
  'mujer',
  'femenino',
  'female',
  'feminine',
  'women',
  'woman',
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

export function normalizeGender(value) {
  const normalized = String(value ?? '').toLowerCase().trim();
  if (!normalized || normalized === 'any' || normalized === 'todos' || normalized === 'all') return 'unknown';
  if (MALE_VALUES.has(normalized)) return 'hombre';
  if (FEMALE_VALUES.has(normalized)) return 'mujer';
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

export function matchesGender(product, selectedGender) {
  if (!selectedGender || selectedGender === 'any') return true;

  const selected = normalizeGender(selectedGender);
  if (selected === 'unknown') return true;

  const productGender = getProductGender(product);
  if (productGender === 'unknown') return false;
  if (selected === 'unisex') return productGender === 'unisex';
  return productGender === selected || productGender === 'unisex';
}
