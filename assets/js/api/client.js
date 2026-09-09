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

/* ── Why some calls carry credentials and most do not ──────────────────────
   The customer session is an HttpOnly cookie set by api.rdecants.com. A browser
   neither SENDS nor ACCEPTS a cookie on a cross-origin fetch unless that fetch
   opts in with `credentials: 'include'` — so registering an order and every
   account read must, or a returning customer would silently never be
   recognised.

   Everything else stays `omit` deliberately. The catalogue, the delivery quote
   and the discount preview are public reads that must behave identically for a
   customer and a stranger, and sending a credential where it changes nothing is
   how a cache ends up holding one customer's response for another.

   The API answers these with Access-Control-Allow-Credentials against an
   explicit origin list; see config/cors.php in r-supply-os. */
async function _getWithCredentials(path) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('v', `${BUILD_VERSION}-${Date.now()}`);

  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });

  const data = await res.json().catch(() => null);

  /* 401 is not an error here — it is the answer "this browser is a guest", and
     the account UI renders a different screen for it. Throwing would turn the
     ordinary first-visit case into a console full of exceptions. */
  return { ok: res.ok && data?.ok !== false, status: res.status, data };
}

async function _post(path, payload, { credentials = 'omit' } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials,
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
  /* `include` so the browser ACCEPTS the Set-Cookie that makes this customer a
     recognised one on their next visit. Nothing about the order itself changes. */
  createWebOrder:     (payload) => _post('/api/web/orders', payload, { credentials: 'include' }),
  /* ── Mi cuenta / Mis pedidos ──────────────────────────────────────────
     Every one of these is answered from the cliente_id the session cookie
     resolves to. There is no customer id, phone number or folio the storefront
     could send to ask about somebody else — a folio here narrows a set that is
     already this customer's own. */
  getAccount:         () => _getWithCredentials('/api/web/account'),
  getAccountOrders:   () => _getWithCredentials('/api/web/account/orders'),
  getAccountOrder:    (folio) => _getWithCredentials(`/api/web/account/orders/${encodeURIComponent(folio)}`),
  forgetAccount:      () => _post('/api/web/account/forget', {}, { credentials: 'include' }),
  /* Delivery. Both are READS: quoting creates no shipment, reserves no stock
     and consumes no coupon. The quote sends the cart as identity + quantity,
     exactly like the order does — R Supply OS reprices it, because the local
     tariff has a free-delivery threshold and a browser that could state its own
     total could state its way past it. */
  getDeliveryOptions: () => _get('/api/web/delivery/options'),
  /* Postal code -> state/municipio/colonias. Always answers 200 — `ok: false`
     means the code is not in the catalog (real gaps exist), not an error. */
  getPostalCode:      (postalCode) => _get(`/api/web/address/postal-code/${encodeURIComponent(postalCode)}`),
  quoteDelivery:      (payload) => _postSafe('/api/web/delivery/quote', payload),
  /* Discount PREVIEW only — R Supply OS is the source of truth and recalculates
     during Web Order creation. The storefront never computes discounts itself. */
  previewDiscount:    (payload) => _postSafe('/api/web/discounts/preview', payload),
  searchQuoteCatalog: (query, limit = 24) => _get(`/api/web/quote/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  priceQuoteBasket:   (items) => _post('/api/web/quote/price', { items }),
  submitQuote:        (payload) => _post('/api/web/quote', payload),
  /* Cross-sell backed by real purchase behaviour (co-purchase, repeat-buy) —
     the one signal a client-side scorer structurally cannot see, because
     purchase history is private. Read-only; the caller decides what to do
     with an empty or failed result, so this never blocks the PDP's own
     already-working local recommendations. */
  getSimilarProducts: (productId, limit = 4) => _get(`/api/web/products/${encodeURIComponent(productId)}/similar?limit=${limit}`),
};
