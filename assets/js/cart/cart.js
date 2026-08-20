/* =============================================================
   RDECANTS — CART
   State management: add, remove, qty, persist, stock limits.
   ============================================================= */

import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }         from '../tracking/tracker.js';
import { EventBus }        from '../core/events.js';
import { showToast }       from '../ui/toast.js';
import { getPriceForSize, getVariantForSize, isValidPrice } from '../utils/prices.js';
import {
  canConsumeSharedMl,
  clampToSharedAvailability,
  findSharedAvailabilityViolation,
  physicalProductKey,
  sharedAvailableMl,
} from './availability.js';

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
    const variantId = _validVariantId(variant?.variant_id);
    const stock = _selectedVariantStock(variant);
    const availableMl = sharedAvailableMl(product);
    const productKey = physicalProductKey(product);
    if (price === null) {
      showToast('Precio no disponible para esa variante');
      return;
    }

    if (!variantId) {
      showToast('Esta variante aun no esta disponible para pedido en sistema');
      return;
    }

    const key      = `${product.id}-${size}`;
    const existing = _items.find(i => i.key === key);

    _syncSharedAvailability(productKey, availableMl);

    if (!canConsumeSharedMl(_items, productKey, availableMl, size)) {
      showToast(_sharedAvailabilityMessage(product.name, availableMl));
      return;
    }

    if (existing) {
      if (existing.qty >= stock) {
        showToast(`Solo quedan ${stock} de ${product.name}`);
        return;
      }
      existing.qty++;
      existing.stock = stock;
      existing.product_id = product.product_id ?? product.id;
      existing.sku = product.sku ?? existing.sku;
      existing.variant_id = variantId;
      existing.image = product.image ?? existing.image;
      existing.available_ml = availableMl;
    } else {
      if (stock <= 0 || variant?.soldOut) {
        showToast(`${product.name} está agotado`);
        return;
      }
      _items.push({
        key,
        sourceId: product.id,
        product_id: product.product_id ?? product.id,
        sku: product.sku ?? null,
        variant_id: variantId,
        type:     'product',
        name:     product.name,
        house:    product.house,
        size,
        price,
        qty:      1,
        stock,
        available_ml: availableMl,
        image:    product.image,
      });
    }

    Tracker.addToCart(product, size, price);
    showToast(`${product.name} ${size}ml — Agregado ✓`, {
      actionLabel: 'Ver carrito',
      onAction: () => window.__rd?.ui?.openCart?.(),
    });
    _commit();
  },

  /** Add one opaque bottle offer to the same cart used by decants and packs. */
  async addBottle(productId, offerKey) {
    const product = await CatalogProvider.getProductById(productId);
    const offer = product?.bottles?.find(candidate => candidate.offer_key === offerKey);

    if (!product || !offer) {
      showToast('Esa botella ya no está disponible. Actualiza la página.');
      return false;
    }

    const key = `bottle-${product.product_id ?? product.id}-${offer.offer_key}`;
    if (_items.some(item => item.key === key)) {
      showToast('Esa botella ya está en tu carrito.');
      return false;
    }

    _items.push({
      key,
      sourceId: product.id,
      product_id: product.product_id ?? product.id,
      sku: product.sku ?? null,
      variant_id: null,
      offer_key: offer.offer_key,
      type: 'bottle',
      name: product.name,
      house: product.house,
      size: offer.ml,
      offer_label: offer.label,
      condition_label: offer.condition_label,
      price: offer.price,
      qty: 1,
      stock: 1,
      available_ml: null,
      image: product.image,
    });

    Tracker.emit('bottle_added_to_cart', {
      productId: product.id,
      condition: offer.condition,
      price: offer.price,
    });
    showToast(`${product.name} — Botella agregada ✓`, {
      actionLabel: 'Ver carrito',
      onAction: () => window.__rd?.ui?.openCart?.(),
    });
    _commit();
    return true;
  },

  /**
   * Add a curated pack as ONE indivisible line.
   *
   * ── Why one line and not three ─────────────────────────────────────
   * A pack's discount only exists while the pack does. If its three decants
   * were three ordinary cart lines, a customer could remove one and be left
   * holding two decants that the cart still believed were a discounted pack
   * — a phantom discount the server would then refuse, at checkout, after
   * the WhatsApp window had already opened. Making the pack atomic removes
   * the failure mode instead of detecting it: there is no edit that can
   * leave the cart representing a pack it is not.
   *
   * The customer can still SEE what is inside (`items` below feeds the cart
   * drawer), and can still open any of the three from the pack card. What
   * they cannot do is quietly disassemble one.
   *
   * ── What is stored ─────────────────────────────────────────────────
   * Identity, quantity, and a display snapshot. The prices held here are
   * never sent anywhere: checkout submits { pack_id, quantity } and R Supply
   * OS resolves the products, re-reads the canonical 3 ml variants and
   * derives the discount again. `reconcile()` refreshes the snapshot from
   * the live endpoint so a stale tab shows the current number, but even a
   * stale one cannot be charged.
   *
   * @param {object|string|number} packOrId  a normalized pack, or its id
   * @returns {Promise<boolean>} false when nothing was added
   */
  async addPack(packOrId) {
    const pack = typeof packOrId === 'object' && packOrId !== null
      ? packOrId
      : await CatalogProvider.getPackById(packOrId);

    if (!pack?.id || !pack.items?.length || !pack.pricing) return false;

    const key      = `pack-${pack.id}`;
    const existing = _items.find(i => i.key === key);
    const stock    = _packStock(pack);

    if (stock <= 0) {
      showToast(`${pack.name} no está disponible ahora`);
      return false;
    }

    if (existing) {
      if (existing.qty >= stock) {
        showToast(`Solo alcanza para ${stock} de ${pack.name}`);
        return false;
      }
      existing.qty++;
      Object.assign(existing, _packSnapshot(pack), { qty: existing.qty });
    } else {
      _items.push({ key, qty: 1, ..._packSnapshot(pack) });
    }

    showToast(`${pack.name} — Agregado ✓`, {
      actionLabel: 'Ver carrito',
      onAction: () => window.__rd?.ui?.openCart?.(),
    });
    _commit();
    return true;
  },

  async addBundle(bundle) {
    if (!bundle?.items?.length) return;

    const originalTotal = Number(bundle.originalTotal ?? bundle.items.reduce((sum, product) => {
      const variant = getVariantForSize(product, bundle.itemSize ?? 3) || product.variants?.[0];
      return sum + (Number(variant?.price) || 0);
    }, 0));
    const kitTotal = Number(bundle.total ?? originalTotal);
    const ratio = originalTotal > 0 && kitTotal > 0 ? kitTotal / originalTotal : 1;
    let added = 0;

    for (const seed of bundle.items) {
      const product = await CatalogProvider.getProductById(seed.id);
      if (!product) continue;

      const variant = getVariantForSize(product, bundle.itemSize ?? 3) || getVariantForSize(product, seed.size) || product.variants?.[0];
      const size = variant?.size;
      const variantId = _validVariantId(variant?.variant_id);
      const stock = _selectedVariantStock(variant);
      const availableMl = sharedAvailableMl(product);
      const productKey = physicalProductKey(product);
      const originalPrice = Number(variant?.price);
      const price = Math.max(1, Math.round(originalPrice * ratio));

      if (!size || !variantId || !Number.isFinite(originalPrice) || stock <= 0 || variant?.soldOut) continue;

      _syncSharedAvailability(productKey, availableMl);
      if (!canConsumeSharedMl(_items, productKey, availableMl, size)) continue;

      const key = `${product.id}-${size}-bundle-${bundle.id}`;
      const existing = _items.find(i => i.key === key);

      if (existing) {
        if (existing.qty >= stock) continue;
        existing.qty++;
        existing.stock = stock;
        existing.available_ml = availableMl;
      } else {
        _items.push({
          key,
          sourceId: product.id,
          product_id: product.product_id ?? product.id,
          sku: product.sku ?? null,
          variant_id: variantId,
          type: 'product',
          bundle_id: bundle.id,
          bundle_title: bundle.title,
          name: product.name,
          house: product.house,
          size,
          price,
          original_price: originalPrice,
          qty: 1,
          stock,
          available_ml: availableMl,
          image: product.image,
        });
      }

      Tracker.addToCart(product, size, price, `bundle_${bundle.id}`);
      added += 1;
    }

    if (added) {
      showToast(`${bundle.title} — Kit agregado ✓`, {
        actionLabel: 'Ver carrito',
        onAction: () => window.__rd?.ui?.openCart?.(),
      });
      _commit();
    }
  },

  async changeQty(key, delta) {
    const idx  = _items.findIndex(i => i.key === key);
    if (idx === -1) return;

    const item = _items[idx];

    if (delta > 0) {
      if (item.type === 'bottle') {
        showToast('Cada botella se pide de una en una.');
        return;
      }
      const availability = await _getAvailability(item);
      const stock = availability.stock;
      item.stock = stock;
      item.available_ml = availability.availableMl;
      _syncSharedAvailability(physicalProductKey(item), availability.availableMl);
      if (item.qty >= stock) {
        showToast(`Solo quedan ${stock} de ${item.name}`);
        return;
      }
      if (!canConsumeSharedMl(
        _items,
        physicalProductKey(item),
        availability.availableMl,
        item.size,
      )) {
        showToast(_sharedAvailabilityMessage(item.name, availability.availableMl));
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

  /**
   * What the customer will pay, as the storefront currently understands it.
   *
   * A pack line already carries its DISCOUNTED unit price, so the pack saving
   * is inside this number rather than applied on top of it. R Supply OS
   * recomputes the whole total at checkout from canonical prices; this is the
   * figure the drawer shows while they shop.
   */
  total() {
    return _items.reduce((sum, i) => {
      const price = isValidPrice(i.price) ? Number(i.price) : 0;
      return sum + price * i.qty;
    }, 0);
  },

  /** Merchandise at full price, before any pack saving. */
  normalTotal() {
    return _items.reduce((sum, i) => {
      const price = i.type === 'pack' && isValidPrice(i.normal_price)
        ? Number(i.normal_price)
        : (isValidPrice(i.price) ? Number(i.price) : 0);
      return sum + price * i.qty;
    }, 0);
  },

  /** What the packs in the cart take off, for display next to the total. */
  packSavings() {
    return _items.reduce((sum, i) => {
      if (i.type !== 'pack') return sum;
      const saving = Number(i.savings);
      return sum + (Number.isFinite(saving) && saving > 0 ? saving * i.qty : 0);
    }, 0);
  },

  /** The pack purchases to submit, as identity and quantity only. */
  packPurchases() {
    return _items
      .filter(i => i.type === 'pack' && i.pack_id !== null && i.pack_id !== undefined)
      .map(i => ({ pack_id: i.pack_id, quantity: Number(i.qty) || 1 }));
  },

  count() {
    return _items.reduce((sum, i) => sum + i.qty, 0);
  },

  canIncrement(key) {
    const item = _items.find(candidate => candidate.key === key);
    if (!item) return false;
    if (item.qty >= item.stock) return false;
    if (item.type === 'bottle') return false;
    if (item.type === 'pack') return true;

    return canConsumeSharedMl(
      _items,
      physicalProductKey(item),
      item.available_ml,
      item.size,
    );
  },

  availabilityError() {
    return findSharedAvailabilityViolation(_items);
  },

  clear() {
    _items = [];
    _commit();
  },

  async reconcile({ silent = true } = {}) {
    let changed = false;
    const removed = [];
    const reconciled = [];

    /* Reconciliation drops any line it cannot resolve against the catalog. That
       is right when a variant really went away — and badly wrong when the
       catalog itself failed to load: the API being down would silently empty a
       customer's cart on the next page view. "No catalog" is not evidence that
       a product disappeared, so with nothing to check against, leave the cart
       exactly as the customer left it and try again on the next load. */
    if (_items.length) {
      let catalog = [];
      try { catalog = await CatalogProvider.getProducts(); }
      catch { catalog = []; }
      if (!catalog.length) return;
    }

    /* Packs are re-read from the live endpoint, not skipped. A pack that went
       out of stock, was deactivated, or had a product unpublished stops being
       returned — and a cart line for a pack the server will refuse is a
       checkout that fails after the WhatsApp window has opened. Re-reading
       also refreshes the displayed total, so a tab left open overnight shows
       today's price rather than yesterday's. */
    let livePacks = null;
    if (_items.some(i => i.type === 'pack')) {
      try { livePacks = await CatalogProvider.getPacks(); }
      catch { livePacks = null; }
    }

    for (const item of _items) {
      if (item.type === 'pack') {
        /* Endpoint unreachable is not evidence the pack went away — same rule
           as the catalog guard above. Leave the line alone and retry later. */
        if (livePacks === null) {
          reconciled.push(item);
          continue;
        }

        const live = livePacks.find(p => String(p.id) === String(item.pack_id));
        if (!live) {
          removed.push(item);
          changed = true;
          continue;
        }

        const stock = _packStock(live);
        if (stock <= 0) {
          removed.push(item);
          changed = true;
          continue;
        }

        const updated = {
          ...item,
          ..._packSnapshot(live),
          qty: Math.min(Math.max(1, Number(item.qty) || 1), stock),
        };
        changed = changed || _packLineChanged(item, updated);
        reconciled.push(updated);
        continue;
      }

      if (item.type === 'bottle') {
        const product = await CatalogProvider.getProductById(item.sourceId ?? item.product_id);
        const offer = product?.bottles?.find(candidate => candidate.offer_key === item.offer_key);

        if (!product || !offer) {
          removed.push(item);
          changed = true;
          continue;
        }

        const updated = {
          ...item,
          sourceId: product.id,
          product_id: product.product_id ?? product.id,
          sku: product.sku ?? item.sku ?? null,
          offer_key: offer.offer_key,
          offer_label: offer.label,
          condition_label: offer.condition_label,
          size: offer.ml,
          price: offer.price,
          qty: 1,
          stock: 1,
          available_ml: null,
          image: product.image ?? item.image ?? null,
        };
        changed = changed || _cartItemChanged(item, updated);
        reconciled.push(updated);
        continue;
      }

      const product = await CatalogProvider.getProductById(item.sourceId ?? item.product_id);
      const variant = getVariantForSize(product, item.size);
      const variantId = _validVariantId(variant?.variant_id);

      const stock = _selectedVariantStock(variant);

      if (!product || !variant || !variantId || variant.soldOut || stock <= 0) {
        removed.push(item);
        changed = true;
        continue;
      }

      const updated = {
        ...item,
        sourceId: product.id,
        product_id: product.product_id ?? product.id,
        sku: product.sku ?? item.sku ?? null,
        variant_id: variantId,
        price: item.bundle_id ? item.price : variant.price,
        original_price: item.bundle_id ? (item.original_price ?? variant.price) : item.original_price,
        qty: Math.min(Math.max(1, Number(item.qty) || 1), stock),
        stock,
        available_ml: sharedAvailableMl(product),
        image: product.image ?? item.image ?? null,
      };

      changed = changed || _cartItemChanged(item, updated);
      reconciled.push(updated);
    }

    const limited = clampToSharedAvailability(reconciled);
    if (limited.adjusted.length || limited.removed.length) {
      changed = true;
      removed.push(...limited.removed);
    }
    reconciled.length = 0;
    reconciled.push(...limited.items);

    if (changed) {
      _items = reconciled;
      _commit();
      if (removed.length && !silent) {
        showToast('Actualizamos tu carrito porque una variante ya no esta disponible');
      }
    }

    return { removed, items: Cart.items };
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
      /* Drop pack lines saved by the previous build. They hold a price from
         the old hardcoded pack list — a number no product in the catalogue
         backs any more — and no `pack_id` for checkout to submit. Restoring
         one would put an unbuyable line at an invented price into a returning
         customer's cart; dropping it costs them one tap to re-add. */
      .filter(i => i.type !== 'pack' || (i.pack_id !== null && i.pack_id !== undefined))
      .map(i => i.type === 'pack'
        ? {
            ...i,
            product_id: null,
            variant_id: null,
            items: Array.isArray(i.items) ? i.items : [],
            price: Number(i.price) || 0,
            normal_price: Number(i.normal_price) || Number(i.price) || 0,
            savings: Math.max(0, Number(i.savings) || 0),
            stock: Math.max(0, Number(i.stock) || 0),
            qty: Math.max(1, Number(i.qty) || 1),
          }
        : i.type === 'bottle'
          ? {
              ...i,
              product_id: i.product_id ?? i.sourceId,
              sku: i.sku ?? null,
              variant_id: null,
              offer_key: String(i.offer_key ?? ''),
              qty: 1,
              stock: 1,
              available_ml: null,
              image: i.image ?? null,
            }
          : {
            ...i,
            product_id: i.product_id ?? i.sourceId,
            sku: i.sku ?? null,
            variant_id: i.variant_id ?? null,
            image: i.image ?? null,
            stock: Math.max(0, Number(i.stock) || 0),
            available_ml: _optionalNonNegativeNumber(i.available_ml),
            qty: Math.max(1, Number(i.qty) || 1),
          });
  } catch {
    return [];
  }
}

/**
 * How many of this pack the catalogue can currently fill.
 *
 * The binding constraint is the scarcest of its three perfumes: a pack of
 * three 3 ml decants cannot be assembled twice if one of them has 4 ml left.
 * `variant.stock` on the public payload is already derived from the shared
 * millilitre pool by the backend's own transformer, so this is a minimum over
 * canonical numbers rather than a second inventory opinion.
 */
function _packStock(pack) {
  const stocks = (pack.items ?? []).map(item => {
    const stock = Number(item?.variant?.stock ?? item?.variant?.availability);
    return Number.isFinite(stock) ? stock : 0;
  });

  return stocks.length ? Math.max(0, Math.min(...stocks)) : 0;
}

/**
 * The cart's view of a pack: identity, quantity ceiling, and a display
 * snapshot. `price` is the DISCOUNTED unit total so Cart.total() needs no
 * pack-specific branch; `normal_price` and `savings` exist only to render the
 * strike-through and the badge.
 */
function _packSnapshot(pack) {
  return {
    sourceId: pack.id,
    pack_id: pack.id,
    pack_slug: pack.slug ?? null,
    product_id: null,
    sku: null,
    variant_id: null,
    type: 'pack',
    name: pack.name,
    house: 'PACK',
    size: `${pack.count} × ${pack.itemSize} ml`,
    price: Number(pack.pricing.finalTotal),
    normal_price: Number(pack.pricing.normalTotal),
    savings: Number(pack.pricing.savings ?? 0),
    stock: _packStock(pack),
    image: pack.items?.[0]?.product?.image ?? null,
    /* Display only — what the customer opens the drawer to check. */
    items: (pack.items ?? []).map(item => ({
      id: item.product?.id ?? null,
      name: item.product?.name ?? '',
      house: item.product?.house ?? '',
      image: item.product?.image ?? null,
      label: item.label ?? null,
    })),
  };
}

function _packLineChanged(prev, next) {
  return prev.price !== next.price ||
    prev.normal_price !== next.normal_price ||
    prev.savings !== next.savings ||
    prev.qty !== next.qty ||
    prev.stock !== next.stock ||
    prev.name !== next.name;
}

async function _getAvailability(item) {
  if (item.type === 'pack') {
    const pack = await CatalogProvider.getPackById(item.pack_id ?? item.sourceId);
    return { stock: pack ? _packStock(pack) : 0, availableMl: null };
  }
  if (item.type === 'bottle') {
    const product = await CatalogProvider.getProductById(item.sourceId ?? item.product_id);
    const offer = product?.bottles?.find(candidate => candidate.offer_key === item.offer_key);
    return { stock: offer ? 1 : 0, availableMl: null };
  }
  const product = await CatalogProvider.getProductById(item.sourceId);
  const variant = getVariantForSize(product, item.size);
  return { stock: _selectedVariantStock(variant), availableMl: sharedAvailableMl(product) };
}

function _selectedVariantStock(variant) {
  const stock = Number(variant?.stock);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}

function _cartItemChanged(prev, next) {
  return prev.sourceId !== next.sourceId ||
    prev.product_id !== next.product_id ||
    prev.sku !== next.sku ||
    prev.variant_id !== next.variant_id ||
    prev.price !== next.price ||
    prev.qty !== next.qty ||
    prev.stock !== next.stock ||
    prev.available_ml !== next.available_ml ||
    prev.image !== next.image;
}

function _syncSharedAvailability(productKey, availableMl) {
  if (!productKey || availableMl === null) return;
  _items.forEach(item => {
    if (item.type !== 'pack' && physicalProductKey(item) === productKey) {
      item.available_ml = availableMl;
    }
  });
}

function _sharedAvailabilityMessage(name, availableMl) {
  const amount = Number.isInteger(availableMl) ? availableMl : Number(availableMl).toFixed(2).replace(/\.00$/, '');
  return `Solo hay ${amount}ml disponibles en total para ${name}`;
}

function _optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
