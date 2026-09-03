/* =============================================================
   RDECANTS — API CLIENT
   Thin fetch wrapper for R Supply OS web endpoints.
   ============================================================= */

import { API_BASE, BUILD_VERSION } from './config.js';

async function _get(path) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('v', `${BUILD_VERSION}-${Date.now()}`);

  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);

  return res.json();
}

async function _post(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    if (res.status === 422) {
      console.error('[RDecants] API validation failed:', { path, status: res.status, response: data });
    }

    const message = data?.message || `API ${path} -> ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

/* Non-throwing POST — resolves to { ok, status, data } for both success and
   validation responses. Used by the discount preview, where a rejected code
   (4xx) is an expected, customer-facing outcome, not an exception. Only a
   network/transport failure rejects. */
async function _postSafe(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  return { ok: res.ok && data?.ok !== false, status: res.status, data };
}

export const ApiClient = {
  getDecantsProducts: () => _get('/api/web/catalog'),
  getCatalog:         () => _get('/api/web/catalog'),
  getFeatured:        () => _get('/api/web/featured'),
  getTrending:        () => _get('/api/web/trending'),
  getPacks:           () => _get('/api/web/packs'),
  /* Editorial placements: which products the home leads with today. Always
     answers with every slot present (empty when nothing is scheduled), so a
     caller never has to distinguish "off", "not migrated" and "none set". */
  getMerchandising:   () => _get('/api/web/merchandising'),
  /* The active homepage promotion, or { promotion: null }. Never 404s for
     "nothing scheduled", so a caller distinguishes only success from
     transport failure. */
  getPromotion:       () => _get('/api/web/promotion'),
  createWebOrder:     (payload) => _post('/api/web/orders', payload),
  /* Delivery. Both are READS: quoting creates no shipment, reserves no stock
     and consumes no coupon. The quote sends the cart as identity + quantity,
     exactly like the order does — R Supply OS reprices it, because the local
     tariff has a free-delivery threshold and a browser that could state its own
     total could state its way past it. */
  getDeliveryOptions: () => _get('/api/web/delivery/options'),
  quoteDelivery:      (payload) => _postSafe('/api/web/delivery/quote', payload),
  /* Discount PREVIEW only — R Supply OS is the source of truth and recalculates
     during Web Order creation. The storefront never computes discounts itself. */
  previewDiscount:    (payload) => _postSafe('/api/web/discounts/preview', payload),
  searchQuoteCatalog: (query, limit = 24) => _get(`/api/web/quote/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  priceQuoteBasket:   (items) => _post('/api/web/quote/price', { items }),
  submitQuote:        (payload) => _post('/api/web/quote', payload),
};
