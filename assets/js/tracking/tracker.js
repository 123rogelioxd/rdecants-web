/* =============================================================
   RDECANTS — TRACKER
   Behavioral event layer. No external connections — yet.

   Architecture:
   ┌────────────────────────────────────────────────────────┐
   │  All user actions emit a named event with a payload.   │
   │  Tracker logs locally in DEBUG mode.                   │
   │  Future: attach providers (GA, Segment, internal API). │
   └────────────────────────────────────────────────────────┘

   Event payload contract — all events include:
     { event, ts, sessionId, ...specific_fields }

   To add an analytics provider:
     Tracker.use((event, payload) => sendToProvider(payload));
   ============================================================= */

import { EventBus } from '../core/events.js';

/* ── Session ID — persisted for session continuity ─────────── */
const _sessionId = (() => {
  const key = 'rd_session';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
})();

/* ── Registered analytics providers ────────────────────────── */
const _providers = [];

/* ── Event name constants ───────────────────────────────────── */
export const EVENTS = {
  PRODUCT_VIEW:          'product_view',
  PRODUCT_CLICKED:       'product_clicked',
  ADD_TO_CART:           'add_to_cart',
  REMOVE_FROM_CART:      'remove_from_cart',
  CART_OPENED:           'cart_opened',
  CART_CLOSED:           'cart_closed',
  PACK_VIEW:             'pack_view',
  PACK_CLICKED:          'pack_clicked',
  CHECKOUT_STARTED:      'checkout_started',
  CHECKOUT_WHATSAPP_CLICKED: 'checkout_whatsapp_clicked',
  WHATSAPP_CHECKOUT:     'whatsapp_checkout',
  RECOMMENDATION_VIEW:   'recommendation_view',
  RECOMMENDATION_CLICKED:'recommendation_clicked',
  RECOMMENDATION_IGNORED:'recommendation_ignored',
  PAGE_VIEW:             'page_view',
  PRODUCT_VIEWED:        'product_viewed',
};

/* ── Tracker ────────────────────────────────────────────────── */
export const Tracker = {

  DEBUG: (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'),

  use(providerFn) {
    _providers.push(providerFn);
  },

  emit(event, payload = {}) {
    const enriched = {
      event,
      ts:        Date.now(),
      sessionId: _sessionId,
      url:       window.location.pathname,
      ...payload,
    };

    if (this.DEBUG) {
      console.groupCollapsed(`[RDecants Tracker] ${event}`);
      console.table(enriched);
      console.groupEnd();
    }

    /* Broadcast on EventBus so any module can react */
    EventBus.emit(`track:${event}`, enriched);

    /* Forward to registered analytics providers */
    _providers.forEach(fn => {
      try { fn(event, enriched); }
      catch (e) { console.warn('[Tracker] Provider error', e); }
    });
  },

  /* ── Convenience methods per event contract ─────────────── */

  productView(product) {
    this.emit(EVENTS.PRODUCT_VIEW, {
      productId:   product.id,
      productName: product.name,
      house:       product.house,
    });
  },

  productViewed(product) {
    this.emit(EVENTS.PRODUCT_VIEWED, {
      productId:   product.id,
      productName: product.name,
      house:       product.house,
    });
  },

  productClicked(product, source = 'grid') {
    this.emit(EVENTS.PRODUCT_CLICKED, {
      productId:   product.id,
      productName: product.name,
      source,
    });
  },

  addToCart(product, size, price, source = 'size_btn') {
    this.emit(EVENTS.ADD_TO_CART, {
      productId:   product.id,
      productName: product.name,
      house:       product.house,
      size,
      price,
      source,
    });
  },

  removeFromCart(item) {
    this.emit(EVENTS.REMOVE_FROM_CART, {
      itemKey:  item.key,
      name:     item.name,
      size:     item.size,
      price:    item.price,
      qty:      item.qty,
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
      packId:   pack.id,
      packName: pack.name,
      price:    pack.price,
      source,
    });
  },

  checkoutStarted(cart, total) {
    this.emit(EVENTS.CHECKOUT_STARTED, {
      itemCount: cart.length,
      total,
      items: cart.map(i => ({ key: i.key, name: i.name, price: i.price, qty: i.qty })),
    });
  },

  whatsappCheckout(cart, total) {
    this.emit(EVENTS.WHATSAPP_CHECKOUT, {
      itemCount: cart.length,
      total,
    });
  },

  checkoutWhatsappClicked(cart, total, checkout = {}) {
    this.emit(EVENTS.CHECKOUT_WHATSAPP_CLICKED, {
      itemCount: cart.length,
      total,
      ...checkout,
    });
  },

  recommendationView(recs, context = {}) {
    this.emit(EVENTS.RECOMMENDATION_VIEW, {
      count: recs.length,
      ids:   recs.map(r => r.id),
      context,
    });
  },

  recommendationClicked(rec, position, context = {}) {
    this.emit(EVENTS.RECOMMENDATION_CLICKED, {
      productId:   rec.id,
      productName: rec.name,
      position,
      context,
    });
  },

  recommendationIgnored(rec, reason = 'scroll_past') {
    this.emit(EVENTS.RECOMMENDATION_IGNORED, {
      productId: rec.id,
      reason,
    });
  },
};
