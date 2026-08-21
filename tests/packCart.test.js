/* =============================================================
   PACKS IN THE CART, AND WHAT REACHES THE SERVER

   Two invariants, and they are the reason the pack is one cart line rather
   than three:

   1. A pack discount exists only while the pack does. If the three decants
      were three ordinary lines, removing one would leave the cart holding
      two decants that it still believed were a discounted pack — a phantom
      discount the server would refuse at checkout, after the WhatsApp
      window had already opened. Atomicity removes the failure mode instead
      of detecting it.

   2. The browser sends IDENTITY AND QUANTITY. No pack price, no discount
      amount, no component prices. R Supply OS resolves the pack, re-reads
      the canonical 3 ml variants and derives every peso — the same safety
      WebOrderService already applies to ordinary items, not weakened for
      bundles.
   ============================================================= */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

globalThis.window = {
  location: { hostname: 'localhost', pathname: '/', search: '' },
  addEventListener() {},
  __rd: {},
};
const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  addEventListener() {},
  createElement: () => ({ classList: { add() {}, remove() {} }, style: {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-test' } });

const { Cart } = await import('../assets/js/cart/cart.js');
const { CatalogProvider } = await import('../assets/js/providers/catalog.js');
const { buildPreviewPayload } = await import('../assets/js/cart/discount.js');

/* A pack in the shape CatalogProvider.getPacks() returns. */
const product = (id, price) => ({
  id,
  product_id: Number(id.charCodeAt(0)),
  name: `Perfume ${id}`,
  house: 'CASA',
  image: `/img/${id}.jpg`,
  variants: [{ id: `${id}-3`, variant_id: `${id}-3`, size: 3, ml: 3, price, stock: 5, availability: 5, available: true }],
});

const PACK = {
  id: 7,
  slug: 'pack-todo-terreno',
  name: 'Pack Todo Terreno',
  copy: 'Uno fresco, uno que va con todo y uno para salir.',
  itemSize: 3,
  count: 3,
  items: [
    { position: 0, label: 'Fresco', product: product('A', 120), variant: { size: 3, price: 120, stock: 5 } },
    { position: 1, label: 'Va con todo', product: product('B', 150), variant: { size: 3, price: 150, stock: 5 } },
    { position: 2, label: 'Para salir', product: product('C', 180), variant: { size: 3, price: 180, stock: 5 } },
  ],
  products: [product('A', 120), product('B', 150), product('C', 180)],
  pricing: { normalTotal: 450, finalTotal: 405, savings: 45, savingsPercentage: 10, discountType: 'percent' },
};

beforeEach(() => {
  Cart.clear();
  _store.clear();
  CatalogProvider.getPacks = async () => [PACK];
  CatalogProvider.getPackById = async id => (String(id) === '7' ? PACK : null);
});

/* ── The cart line ───────────────────────────────────────────── */

test('a pack is added as ONE line carrying its discounted total', async () => {
  await Cart.addPack(PACK);

  assert.equal(Cart.items.length, 1, 'one line, not three');
  const [line] = Cart.items;
  assert.equal(line.type, 'pack');
  assert.equal(line.pack_id, 7);
  assert.equal(line.price, 405, 'the DISCOUNTED unit total');
  assert.equal(line.normal_price, 450);
  assert.equal(line.savings, 45);
  assert.equal(Cart.total(), 405);
});

test('the customer can still see what is inside', async () => {
  await Cart.addPack(PACK);

  assert.deepEqual(Cart.items[0].items.map(i => i.name), ['Perfume A', 'Perfume B', 'Perfume C']);
  assert.deepEqual(Cart.items[0].items.map(i => i.label), ['Fresco', 'Va con todo', 'Para salir']);
});

test('the pack stock is the scarcest of its three perfumes', async () => {
  const scarce = {
    ...PACK,
    items: PACK.items.map((item, i) => i === 1
      ? { ...item, variant: { ...item.variant, stock: 2 } }
      : item),
  };

  await Cart.addPack(scarce);
  assert.equal(Cart.items[0].stock, 2, 'you cannot box what you do not have');
});

test('a pack that cannot be assembled is not added', async () => {
  const empty = { ...PACK, items: PACK.items.map(i => ({ ...i, variant: { ...i.variant, stock: 0 } })) };

  assert.equal(await Cart.addPack(empty), false);
  assert.equal(Cart.items.length, 0);
});

test('quantity multiplies the totals and the saving', async () => {
  await Cart.addPack(PACK);
  await Cart.addPack(PACK);

  assert.equal(Cart.items.length, 1, 'still one line');
  assert.equal(Cart.items[0].qty, 2);
  assert.equal(Cart.total(), 810);
  assert.equal(Cart.normalTotal(), 900);
  assert.equal(Cart.packSavings(), 90);
});

/* ── The invariant: no phantom discount ──────────────────────── */

test('a pack cannot be partially disassembled', async () => {
  await Cart.addPack(PACK);

  /* There is no cart key for a constituent product, so no edit exists that
     could leave the cart holding two decants and one pack discount. */
  const keys = Cart.items.map(i => i.key);
  assert.deepEqual(keys, ['pack-7']);

  for (const inner of PACK.products) {
    assert.equal(Cart.items.find(i => i.sourceId === inner.id), undefined,
      `${inner.id} is not independently removable`);
  }
});

test('removing the pack removes the whole discount with it', async () => {
  await Cart.addPack(PACK);
  Cart.remove('pack-7');

  assert.equal(Cart.items.length, 0);
  assert.equal(Cart.total(), 0);
  assert.equal(Cart.packSavings(), 0);
});

test('a pack that stops being sellable is dropped from the cart', async () => {
  await Cart.addPack(PACK);

  CatalogProvider.getPacks = async () => [];          /* one perfume ran out */
  const { removed } = await Cart.reconcile();

  assert.equal(Cart.items.length, 0);
  assert.equal(removed.length, 1, 'and the customer is not charged for a pack that vanished');
});

test('an unreachable packs endpoint leaves the cart alone', async () => {
  await Cart.addPack(PACK);

  CatalogProvider.getPacks = async () => { throw new Error('network'); };
  await Cart.reconcile();

  assert.equal(Cart.items.length, 1, '"API down" is not evidence a pack went away');
});

test('reconciliation refreshes a stale price', async () => {
  await Cart.addPack(PACK);

  CatalogProvider.getPacks = async () => [{
    ...PACK,
    pricing: { normalTotal: 550, finalTotal: 495, savings: 55, savingsPercentage: 10, discountType: 'percent' },
  }];
  await Cart.reconcile();

  assert.equal(Cart.items[0].price, 495, 'a tab left open overnight shows today\'s price');
  assert.equal(Cart.items[0].normal_price, 550);
});

test('a pack line saved by the previous build is discarded on load', async () => {
  /* The old shape held a price from the hardcoded pack list — a number no
     product backs any more — and no pack_id for checkout to submit. */
  _store.set('rdecants_cart', JSON.stringify([{
    key: 'pack-pack-ceo-night',
    sourceId: 'pack-ceo-night',
    type: 'pack',
    name: 'CEO Night',
    price: 349,
    qty: 1,
    stock: 2,
  }]));

  const { Cart: Reloaded } = await import(`../assets/js/cart/cart.js?legacy=${Date.now()}`);
  assert.deepEqual(Reloaded.items, [], 'an unbuyable line at an invented price does not survive');
});

/* ── What reaches the server ─────────────────────────────────── */

test('the checkout payload carries pack identity and quantity only', async () => {
  await Cart.addPack(PACK);

  const [purchase] = Cart.packPurchases();
  assert.deepEqual(purchase, { pack_id: 7, quantity: 1 });
  assert.deepEqual(Object.keys(purchase).sort(), ['pack_id', 'quantity'],
    'no price, no discount, no components');
});

test('the discount preview resolves the same cart checkout will', async () => {
  await Cart.addPack(PACK);

  const payload = buildPreviewPayload(['DIEZ'], Cart.items);

  assert.deepEqual(payload.packs, [{ pack_id: 7, quantity: 1 }]);
  assert.deepEqual(payload.items, [], 'the pack is not also sent as loose items');
});

test('the checkout source never sends a pack price', () => {
  const checkout = read('assets/js/cart/checkout.js').replace(/\/\*[\s\S]*?\*\//g, ' ');

  assert.match(checkout, /packs\b/, 'packs are submitted');
  assert.doesNotMatch(checkout, /pack_total|pack_price|pack_discount:/,
    'no client-stated pack money crosses the wire');
});

test('a cart of nothing but packs is still a real order', () => {
  const checkout = read('assets/js/cart/checkout.js').replace(/\/\*[\s\S]*?\*\//g, ' ');

  /* Pure-pack carts used to be dropped ("coordinated in chat") because the
     old packs had no resolvable products. They do now. */
  assert.doesNotMatch(checkout, /if \(!orderable\.length\) return/);
  assert.match(checkout, /\.filter\(item => item\.type === 'pack'\)/,
    'the submitted snapshot derives pack purchases before the live cart is cleared');
  assert.match(checkout, /pack_id: item\.pack_id/);
});

test('the cart drawer shows the pack as a group, with no per-item controls', () => {
  const render = read('assets/js/cart/render.js');

  assert.match(render, /cart-pack-contents/, 'the three fragrances are listed');
  assert.match(render, /cart-pack-saving|cart-pack-save/, 'the saving is shown');

  /* The contents LIST carries no remove or quantity button — the whole point
     of the atomic group. The pack line itself keeps both, so the customer can
     still drop or duplicate the box; it is the three fragrances inside that
     must not be individually editable. */
  const list = render.slice(
    render.indexOf('<ul class="cart-pack-contents">'),
    render.indexOf('</ul>', render.indexOf('<ul class="cart-pack-contents">')),
  );
  assert.ok(list.length > 0, 'the contents list is rendered');
  assert.doesNotMatch(list, /remove-btn|qty-btn|onclick/,
    'a constituent must not be independently editable');

  /* And the pack line as a whole still is. */
  assert.match(render, /window\.__rd\.cart\.remove\('\$\{item\.key\}'\)/);
});
