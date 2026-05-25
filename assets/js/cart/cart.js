/* =============================================================
   RDECANTS — CART
   State management: add, remove, qty, persist, stock limits.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js?v=1.0.10';
import { Tracker }         from '../tracking/tracker.js';
import { EventBus }        from '../core/events.js';
import { showToast }       from '../ui/toast.js';
import { getPriceForSize, getVariantForSize, isValidPrice } from '../utils/prices.js?v=1.0.2';

const STORAGE_KEY = 'rdecants_cart';

/* ── Internal cart array ────────────────────────────────────── */
let _items = _load();

/* ── Public API ─────────────────────────────────────────────── */
export const Cart = {

  get items() { return [..._items]; },

  async add(productId, size) {
    const product = await CatalogProvider.getProductById(productId);
    if (!product) return;

    const price = getPriceForSize(product, size);
    const variant = getVariantForSize(product, size);
    const stock = variant?.availability ?? product.stock ?? 0;
    if (price === null) {
      showToast('Precio no disponible para esa variante');
      return;
    }

    const key      = `${product.id}-${size}`;
    const existing = _items.find(i => i.key === key);

    if (existing) {
      if (existing.qty >= stock) {
        showToast(`Solo quedan ${stock} de ${product.name}`);
        return;
      }
      existing.qty++;
      existing.stock = stock;
      existing.product_id = product.product_id ?? product.id;
      existing.variant_id = variant?.variant_id ?? existing.variant_id;
    } else {
      if (stock <= 0 || variant?.soldOut) {
        showToast(`${product.name} está agotado`);
        return;
      }
      _items.push({
        key,
        sourceId: product.id,
        product_id: product.product_id ?? product.id,
        variant_id: variant?.variant_id ?? `${product.id}-${size}`,
        type:     'product',
        name:     product.name,
        house:    product.house,
        size,
        price,
        qty:      1,
        stock,
      });
    }

    Tracker.addToCart(product, size, price);
    showToast(`${product.name} ${size}ml — Agregado ✓`);
    _commit();
  },

  async addPack(packId) {
    const pack = await CatalogProvider.getPackById(packId);
    if (!pack) return;

    const key      = `pack-${pack.id}`;
    const existing = _items.find(i => i.key === key);

    if (existing) {
      if (existing.qty >= pack.stock) {
        showToast(`Solo quedan ${pack.stock} de ${pack.name}`);
        return;
      }
      existing.qty++;
    } else {
      if (pack.stock <= 0) {
        showToast(`${pack.name} está agotado`);
        return;
      }
      _items.push({
        key,
        sourceId: pack.id,
        product_id: pack.id,
        variant_id: `pack-${pack.id}`,
        type:     'pack',
        name:     pack.name,
        house:    'PACK',
        size:     'Pack',
        price:    pack.price,
        qty:      1,
        stock:    pack.stock,
      });
    }

    Tracker.packClicked(pack, 'pack_btn');
    showToast(`${pack.name} — Agregado 💎`);
    _commit();
  },

  async changeQty(key, delta) {
    const idx  = _items.findIndex(i => i.key === key);
    if (idx === -1) return;

    const item = _items[idx];

    if (delta > 0) {
      const stock = await _getStock(item);
      if (item.qty >= stock) {
        showToast(`Solo quedan ${stock} de ${item.name}`);
        return;
      }
    }

    item.qty += delta;

    if (item.qty <= 0) {
      Tracker.removeFromCart(item);
      _items.splice(idx, 1);
    }

    _commit();
  },

  remove(key) {
    const item = _items.find(i => i.key === key);
    if (item) Tracker.removeFromCart(item);
    _items = _items.filter(i => i.key !== key);
    _commit();
  },

  total() {
    return _items.reduce((sum, i) => {
      const price = isValidPrice(i.price) ? Number(i.price) : 0;
      return sum + price * i.qty;
    }, 0);
  },

  count() {
    return _items.reduce((sum, i) => sum + i.qty, 0);
  },

  clear() {
    _items = [];
    _commit();
  },
};

/* ── Internals ──────────────────────────────────────────────── */
function _commit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_items));
  EventBus.emit('cart:updated', { items: Cart.items, total: Cart.total(), count: Cart.count() });
}

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw)
      .filter(i => i && i.key)
      .map(i => ({
        ...i,
        product_id: i.product_id ?? i.sourceId,
        variant_id: i.variant_id ?? i.key,
        stock: Math.max(0, Number(i.stock) || 0),
        qty: Math.max(1, Number(i.qty) || 1),
      }));
  } catch {
    return [];
  }
}

async function _getStock(item) {
  if (item.type === 'pack') {
    const pack = await CatalogProvider.getPackById(item.sourceId);
    return pack?.stock ?? item.stock ?? 1;
  }
  const product = await CatalogProvider.getProductById(item.sourceId);
  const variant = getVariantForSize(product, item.size);
  return variant?.availability ?? item.stock ?? 0;
}
