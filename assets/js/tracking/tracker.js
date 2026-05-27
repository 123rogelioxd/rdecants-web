/* =============================================================
   RDECANTS - BEHAVIORAL TRACKER
   Privacy-safe local event queue with provider hooks for future
   ingestion into R Supply OS analytics.
   ============================================================= */

import { EventBus } from '../core/events.js';

const SESSION_KEY = 'rd_session';
const QUEUE_KEY = 'rd_behavior_queue';
const MAX_QUEUE = 80;
const DEDUPE_MS = 1500;
const VIEW_DEDUPE_MS = 10 * 60 * 1000;

export const EVENTS = {
  VIEWED_PRODUCT: 'viewed_product',
  OPENED_PRODUCT_MODAL: 'opened_product_modal',
  RECOMMENDATION_VIEWED: 'recommendation_viewed',
  RECOMMENDATION_CLICKED: 'recommendation_clicked',
  RECOMMENDATION_ADDED: 'recommendation_added',
  BUNDLE_VIEWED: 'bundle_viewed',
  BUNDLE_ADDED: 'bundle_added',
  ASSISTANT_STARTED: 'assistant_started',
  ASSISTANT_COMPLETED: 'assistant_completed',
  CART_MINIMUM_PROMPT_SHOWN: 'cart_minimum_prompt_shown',
  CART_MINIMUM_PROMPT_CONVERTED: 'cart_minimum_prompt_converted',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',

  PRODUCT_CLICKED: 'product_clicked',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  CART_OPENED: 'cart_opened',
  CART_CLOSED: 'cart_closed',
  CHECKOUT_WHATSAPP_CLICKED: 'checkout_whatsapp_clicked',
  WHATSAPP_CHECKOUT: 'whatsapp_checkout',
  PACK_CLICKED: 'pack_clicked',
  PAGE_VIEW: 'page_view',

  PRODUCT_VIEW: 'product_view',
  PRODUCT_VIEWED: 'product_viewed',
  RECOMMENDATION_VIEW: 'recommendation_view',
};

const _providers = [];
const _recent = new Map();
const _sessionId = _getSessionId();

export function createEventRecord(event, payload = {}, now = Date.now()) {
  return {
    id: `${_sessionId}_${now}_${Math.random().toString(36).slice(2, 8)}`,
    event,
    ts: now,
    sessionId: _sessionId,
    url: _path(),
    ..._sanitize(payload),
  };
}

export function eventDedupKey(event, payload = {}) {
  const context = payload.context ?? {};
  const parts = [
    event,
    payload.productId,
    payload.product_id,
    payload.variant_id,
    payload.size,
    payload.packId,
    payload.bundleId,
    payload.railId ?? context.railId,
    payload.position,
    payload.total,
    Array.isArray(payload.ids) ? payload.ids.join(',') : '',
  ];

  return parts.map(value => String(value ?? '')).join('|');
}

export function shouldEmitEvent(event, payload = {}, now = Date.now(), recent = _recent) {
  const key = eventDedupKey(event, payload);
  const windowMs = _viewLike(event) ? VIEW_DEDUPE_MS : DEDUPE_MS;
  const last = recent.get(key) ?? 0;
  if (last && now - last < windowMs) return false;
  recent.set(key, now);
  return true;
}

export const Tracker = {
  DEBUG: _isDebug(),

  use(providerFn) {
    if (typeof providerFn === 'function') _providers.push(providerFn);
  },

  emit(event, payload = {}, options = {}) {
    const now = Date.now();
    if (!options.allowDuplicate && !shouldEmitEvent(event, payload, now)) return null;

    const enriched = createEventRecord(event, payload, now);
    _enqueue(enriched);

    if (this.DEBUG) {
      console.groupCollapsed(`[RDecants Tracker] ${event}`);
      console.table(enriched);
      console.groupEnd();
    }

    EventBus.emit(`track:${event}`, enriched);
    _providers.forEach(fn => {
      try { fn(event, enriched); }
      catch (e) { console.warn('[Tracker] Provider error', e); }
    });

    return enriched;
  },

  getQueue() {
    return _readQueue();
  },

  clearQueue() {
    _storage('local')?.removeItem(QUEUE_KEY);
  },

  productView(product) {
    this.emit(EVENTS.VIEWED_PRODUCT, _productPayload(product), { allowDuplicate: false });
  },

  productViewed(product) {
    this.emit(EVENTS.OPENED_PRODUCT_MODAL, _productPayload(product));
    this.emit(EVENTS.VIEWED_PRODUCT, { ..._productPayload(product), source: 'modal' });
  },

  productClicked(product, source = 'grid') {
    this.emit(EVENTS.PRODUCT_CLICKED, {
      ..._productPayload(product),
      source,
    });
  },

  addToCart(product, size, price, source = 'size_btn') {
    const variant = product.variants?.find(v => Number(v.size ?? v.ml_size) === Number(size));
    this.emit(EVENTS.ADD_TO_CART, {
      ..._productPayload(product),
      product_id: product.product_id ?? product.id,
      variant_id: variant?.variant_id,
      size,
      price,
      source,
    });
  },

  removeFromCart(item) {
    this.emit(EVENTS.REMOVE_FROM_CART, {
      itemKey: item.key,
      name: item.name,
      size: item.size,
      price: item.price,
      qty: item.qty,
    });
  },

  cartOpened() {
    this.emit(EVENTS.CART_OPENED);
  },

  cartClosed() {
    this.emit(EVENTS.CART_CLOSED);
  },

  packClicked(pack, source = 'packs_grid') {
    this.emit(EVENTS.PACK_CLICKED, {
      packId: pack.id,
      packName: pack.name,
      price: pack.price,
      source,
    });
  },

  bundleViewed(bundle) {
    this.emit(EVENTS.BUNDLE_VIEWED, {
      bundleId: bundle.id,
      title: bundle.title,
      ids: bundle.items?.map(item => item.id) ?? [],
      total: bundle.total,
    });
  },

  bundleAdded(bundle) {
    this.emit(EVENTS.BUNDLE_ADDED, {
      bundleId: bundle.id,
      title: bundle.title,
      ids: bundle.items?.map(item => item.id) ?? [],
      total: bundle.total,
    });
  },

  assistantStarted(answers = {}) {
    this.emit(EVENTS.ASSISTANT_STARTED, { answers });
  },

  assistantCompleted(results = [], answers = {}) {
    this.emit(EVENTS.ASSISTANT_COMPLETED, {
      count: results.length,
      ids: results.map(result => result.product?.id ?? result.id).filter(Boolean),
      answers,
    });
  },

  cartMinimumPromptShown(minimum, recs = []) {
    this.emit(EVENTS.CART_MINIMUM_PROMPT_SHOWN, {
      total: minimum.total,
      threshold: minimum.threshold,
      remaining: minimum.remaining,
      progress: minimum.progress,
      ids: recs.map(r => r.id),
    });
  },

  cartMinimumPromptConverted(minimum) {
    this.emit(EVENTS.CART_MINIMUM_PROMPT_CONVERTED, {
      total: minimum.total,
      threshold: minimum.threshold,
      progress: minimum.progress,
    });
  },

  checkoutStarted(cart = [], total = 0) {
    this.emit(EVENTS.CHECKOUT_STARTED, {
      itemCount: cart.length,
      total,
      items: cart.map(i => ({ key: i.key, name: i.name, price: i.price, qty: i.qty })),
    });
  },

  checkoutCompleted(cart = [], total = 0, checkout = {}) {
    this.emit(EVENTS.CHECKOUT_COMPLETED, {
      itemCount: cart.length,
      total,
      ...checkout,
    });
  },

  whatsappCheckout(cart = [], total = 0) {
    this.emit(EVENTS.WHATSAPP_CHECKOUT, { itemCount: cart.length, total });
  },

  checkoutWhatsappClicked(cart = [], total = 0, checkout = {}) {
    this.emit(EVENTS.CHECKOUT_WHATSAPP_CLICKED, {
      itemCount: cart.length,
      total,
      ...checkout,
    });
  },

  recommendationView(recs = [], context = {}) {
    this.emit(EVENTS.RECOMMENDATION_VIEWED, {
      count: recs.length,
      ids: recs.map(r => r.id),
      context,
    });
  },

  recommendationClicked(rec, position, context = {}) {
    this.emit(EVENTS.RECOMMENDATION_CLICKED, {
      ..._productPayload(rec),
      position,
      context,
    });
  },

  recommendationAdded(rec, position, context = {}) {
    this.emit(EVENTS.RECOMMENDATION_ADDED, {
      ..._productPayload(rec),
      position,
      context,
    });
  },

  recommendationIgnored(rec, reason = 'scroll_past') {
    this.emit('recommendation_ignored', {
      productId: rec.id,
      reason,
    });
  },
};

function _productPayload(product = {}) {
  return {
    productId: product.id,
    productName: product.name,
    house: product.house,
  };
}

function _enqueue(eventRecord) {
  const storage = _storage('local');
  if (!storage) return;
  const queue = _readQueue();
  queue.push(eventRecord);
  storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

function _readQueue() {
  const storage = _storage('local');
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem(QUEUE_KEY) || '[]').filter(Boolean);
  } catch {
    return [];
  }
}

function _sanitize(payload) {
  const clone = { ...payload };
  delete clone.phone;
  delete clone.email;
  delete clone.customerName;
  return clone;
}

function _getSessionId() {
  const storage = _storage('session') ?? _storage('local');
  if (!storage) return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let id = storage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    storage.setItem(SESSION_KEY, id);
  }
  return id;
}

function _storage(type) {
  try {
    const store = type === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    if (store?.getItem && store?.setItem) return store;
  } catch {
    return null;
  }
  return null;
}

function _path() {
  return globalThis.window?.location?.pathname ?? '/';
}

function _isDebug() {
  const host = globalThis.window?.location?.hostname ?? '';
  return host === 'localhost' || host === '127.0.0.1';
}

function _viewLike(event) {
  return event === EVENTS.VIEWED_PRODUCT ||
    event === EVENTS.OPENED_PRODUCT_MODAL ||
    event === EVENTS.RECOMMENDATION_VIEWED ||
    event === EVENTS.BUNDLE_VIEWED ||
    event === EVENTS.CART_MINIMUM_PROMPT_SHOWN;
}
