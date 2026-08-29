import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window ?? { location: { hostname: 'localhost', pathname: '/' } };
globalThis.localStorage = globalThis.localStorage ?? { getItem() { return null; }, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-test' } });

const { mapApiProduct } = await import('../assets/js/providers/catalog.js');
const { bottleAffordance, bottlePresentationLine } = await import('../assets/js/pages/perfumes.js');
const { buildProductPageHtml } = await import('../assets/js/ui/productPage.js');

/**
 * One bottle on the shelf is one click.
 *
 * The reported catalogue read:
 *
 *     212 VIP BLACK SET EDP
 *     Desde $1,990 MXN
 *     Nuevo sellado
 *     [ Ver ofertas ]
 *
 * for a perfume with exactly ONE sealed flacon in stock — and the product page
 * it led to then said "1 ml · Nuevo sellado" under a heading reading "Perfume
 * completo", and told the visitor that Roger would confirm the price it had
 * just printed.
 *
 * Three separate claims are pinned below: the card names the real size, the
 * black button buys the exact offer rather than navigating, and a legitimately
 * small presentation is still shown at its real size — which is what proves
 * none of this was fixed by substituting a number in a template.
 */

const SEALED = {
  offer_key: 'linea_nuevo|100|100|1990',
  kind: 'bottle',
  ml: 100,
  bottle_ml: 100,
  size_ml: 100,
  remaining_percent: 100,
  condition: 'linea_nuevo',
  condition_label: 'Nuevo sellado',
  sealed: true,
  price: 1990,
  stock: 1,
  label: '100 ml · Nuevo sellado',
  size_label: '100 ml',
};

const SET_PRODUCT = {
  id: 'ch-212-vip-black-set', product_id: 144, name: '212 VIP BLACK SET EDP', house: 'CAROLINA HERRERA',
  variants: [], bottles: [SEALED],
  offer_kinds: { decants: false, bottles: true, both: false, primary: 'bottles' },
  purchase: {
    mode: 'add_to_cart',
    cta: 'Agregar al carrito',
    count: 1,
    direct: {
      kind: 'bottle', offer_key: SEALED.offer_key, variant_id: null, size_ml: 100, bottle_ml: 100,
      price: 1990, stock: 1, condition_label: 'Nuevo sellado',
      presentation: '100 ml · Nuevo sellado', size_label: '100 ml',
    },
    from_price: 1990,
    choices: [],
    bottles: {
      mode: 'add_to_cart', cta: 'Agregar al carrito', count: 1,
      direct: {
        kind: 'bottle', offer_key: SEALED.offer_key, variant_id: null, size_ml: 100, bottle_ml: 100,
        price: 1990, stock: 1, condition_label: 'Nuevo sellado',
        presentation: '100 ml · Nuevo sellado', size_label: '100 ml',
      },
      from_price: 1990,
      choices: [{
        kind: 'bottle', offer_key: SEALED.offer_key, variant_id: null, size_ml: 100, bottle_ml: 100,
        price: 1990, stock: 1, condition_label: 'Nuevo sellado',
        presentation: '100 ml · Nuevo sellado', size_label: '100 ml',
      }],
      sizes: [100], condition_labels: ['Nuevo sellado'],
    },
    decants: { mode: 'sold_out', cta: 'Agotado', count: 0, direct: null, from_price: null, choices: [], sizes: [], condition_labels: [] },
  },
};

// ── One in-stock bottle ──────────────────────────────────────────────

test('a product with exactly one in-stock bottle offers a direct add to cart', () => {
  const product = mapApiProduct(SET_PRODUCT);
  const affordance = bottleAffordance(product);

  assert.equal(affordance.mode, 'add_to_cart');
  assert.equal(affordance.cta, 'Agregar al carrito');
  assert.notEqual(affordance.cta, 'Ver ofertas');
  assert.equal(affordance.direct.offer_key, SEALED.offer_key, 'the CTA carries the exact purchasable identity');
  assert.equal(affordance.direct.price, 1990);
});

test('the card names the real bottle size instead of only a price floor', () => {
  const product = mapApiProduct(SET_PRODUCT);

  assert.equal(bottlePresentationLine(product), '100 ml · Nuevo sellado');
  assert.doesNotMatch(bottlePresentationLine(product), /^1 ml/);
});

test('the set keeps its identity: nothing flattens the name', () => {
  const product = mapApiProduct(SET_PRODUCT);

  assert.equal(product.name, '212 VIP BLACK SET EDP');
  assert.match(buildProductPageHtml(product), /212 VIP BLACK SET EDP/);
});

test('a hundred millilitre flacon never renders as one millilitre', () => {
  const html = buildProductPageHtml(mapApiProduct(SET_PRODUCT));

  assert.match(html, /100 ml · Nuevo sellado/);
  assert.doesNotMatch(html, /\b1 ml · Nuevo sellado/);
});

test('the product page stops asking a customer to choose from a list of one', () => {
  const html = buildProductPageHtml(mapApiProduct(SET_PRODUCT));

  assert.doesNotMatch(html, /Elige tu botella/);
  assert.match(html, /Disponible ahora/);
});

// ── Several bottles ──────────────────────────────────────────────────

test('a product with two bottle sizes asks which one, and lists both', () => {
  const small = { ...SEALED, offer_key: 'linea_nuevo|50|50|1290', ml: 50, bottle_ml: 50, size_ml: 50, price: 1290, label: '50 ml · Nuevo sellado', size_label: '50 ml' };
  const product = mapApiProduct({ ...SET_PRODUCT, purchase: null, bottles: [SEALED, small] });
  const affordance = bottleAffordance(product);

  assert.equal(affordance.mode, 'choose_presentation');
  assert.equal(affordance.cta, 'Elegir presentación');
  assert.equal(affordance.direct, null, 'no button may buy on the customer’s behalf when there are two answers');
  assert.deepEqual(affordance.sizes, [50, 100]);
  assert.deepEqual(
    affordance.choices.map(choice => choice.offer_key).sort(),
    [SEALED.offer_key, small.offer_key].sort(),
  );
  assert.equal(bottlePresentationLine(product), '50 ml / 100 ml · Nuevo sellado');
});

// ── Nothing on the shelf ─────────────────────────────────────────────

test('an out-of-stock bottle is never addable', () => {
  const product = mapApiProduct({ ...SET_PRODUCT, purchase: null, bottles: [{ ...SEALED, stock: 0 }] });
  const affordance = bottleAffordance(product);

  assert.equal(affordance.mode, 'sold_out');
  assert.equal(affordance.cta, 'Agotado');
  assert.equal(affordance.direct, null);
});

// ── A small presentation that is genuinely small ─────────────────────

test('a real one millilitre decant still reads as one millilitre', () => {
  /* The companion to the 100 ml case, and the reason both exist: if the fix
     had been a display substitution, this would now say something else. */
  const product = mapApiProduct({
    id: 'muestra', product_id: 900, name: 'MUESTRA UNICA', house: 'LABORATORIO',
    variants: [{ id: 9001, ml: 1, price: 25, available: true, stock: 4 }],
    bottles: [],
  });

  assert.equal(product.variants[0].size, 1);
  assert.equal(product.purchase.decants.sizes[0], 1);
  assert.equal(product.purchase.decants.choices[0].presentation, '1 ml');
});

// ── The mapper is the compatibility seam ─────────────────────────────

test('an API that has not shipped `purchase` yet still gets the same answer', () => {
  const product = mapApiProduct({ ...SET_PRODUCT, purchase: undefined });

  assert.equal(product.purchase.bottles.mode, 'add_to_cart');
  assert.equal(product.purchase.bottles.direct.offer_key, SEALED.offer_key);
});

test('a partial bottle is chosen by what is left in it, not by the flacon', () => {
  const partial = {
    ...SEALED, offer_key: 'tester_parcial|100|62|900', kind: 'partial', ml: 62, size_ml: 62,
    remaining_percent: 62, sealed: false, condition: 'tester_parcial', condition_label: 'Tester',
    price: 900, label: '62 ml de 100 ml · Tester · 62%', size_label: '62 ml',
  };
  const product = mapApiProduct({ ...SET_PRODUCT, purchase: null, bottles: [partial] });

  assert.equal(product.bottles[0].kind, 'partial');
  assert.equal(product.bottles[0].size_ml, 62);
  assert.equal(product.bottles[0].bottle_ml, 100);
  assert.equal(bottlePresentationLine(product), '62 ml de 100 ml · Tester · 62%');
});
