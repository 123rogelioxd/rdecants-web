/* =============================================================
   RDECANTS — DELIVERY
   The customer's chosen delivery, and the price R Supply OS put on it.

   ── The one rule this module enforces ────────────────────────
   It never computes a shipping price. Every number here came from
   /api/web/delivery/quote, and the option the customer picks travels back to
   the order as an opaque signed token. A storefront that could state a
   shipping price could state any shipping price.

   ── The other rule ──────────────────────────────────────────
   `cost === null` means nobody has priced this delivery yet. It is NOT zero.
   Callers that render money must ask `isPriced()` first; the UI says "por
   confirmar" rather than "$0", because an order awaiting a manual quote has no
   final total and showing one would be a promise we cannot keep.
   ============================================================= */

import { ApiClient } from '../api/client.js';

const STORAGE_KEY = 'rdecants_delivery_choice';

export const DELIVERY_MODES = {
  PICKUP: 'pickup',
  LOCAL: 'local',
  NATIONAL: 'national',
};

/* Address fields both delivered modes need — local and national alike now
   resolve from the same postal-code-first address (see cart/address.js).
   `interior_number` and `references` are genuinely optional; `municipio` is
   derived from the postal-code lookup, never typed. */
export const ADDRESS_FIELDS = [
  'recipient', 'phone', 'street', 'exterior_number', 'interior_number',
  'neighborhood', 'municipio', 'city', 'state', 'postal_code', 'references',
];

const REQUIRED_ADDRESS_FIELDS = [
  'recipient', 'phone', 'street', 'exterior_number', 'neighborhood', 'city', 'state', 'postal_code',
];

/* Editing one of these invalidates whatever price we are holding. */
const PRICE_CHANGING_FIELDS = ['postal_code', 'neighborhood', 'street', 'exterior_number'];

/* Enough of an address to be worth asking the server about.

   Deliberately NOT the same list as REQUIRED_ADDRESS_FIELDS: a delivery can be
   priced before the customer has typed who receives it, and making them fill in
   a name to see a shipping cost is the kind of friction that loses the order.
   Recipient and phone are still required to CHECK OUT — see isReady(). */
const QUOTABLE_ADDRESS_FIELDS = ['postal_code', 'neighborhood', 'street', 'exterior_number'];

let _state = {
  mode: null,
  address: {},
  /* The options R Supply OS last offered, and which one is selected. */
  options: [],
  selectedToken: null,
  cost: null,
  requiresManualQuote: false,
  reason: null,
  status: 'idle',   // idle | loading | quoted | manual | error
};

let _optionsCache = null;

/* ── Persistence ──────────────────────────────────────────────
   Only the customer's INPUT is remembered — mode and address. Never a
   quoted price or a token: both expire, and restoring a stale one would show a
   price the carrier is no longer offering. */
function _persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: _state.mode,
      address: _state.address,
    }));
  } catch { /* storage unavailable — the choice simply is not remembered */ }
}

function _restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.mode) _state.mode = saved.mode;
    if (saved.address && typeof saved.address === 'object') {
      _state.address = _cleanAddress(saved.address);
    }
  } catch { /* unreadable — start fresh */ }
}

function _cleanAddress(raw) {
  const address = {};
  ADDRESS_FIELDS.forEach(field => {
    const value = raw?.[field];
    if (typeof value === 'string' && value.trim()) address[field] = value.trim();
  });
  return address;
}

/* ── Invalidation ─────────────────────────────────────────────
   Any change to WHAT is being delivered or WHERE invalidates the price. This
   is the guard against the worst bug available here: quoting a 2-decant parcel
   to one postal code, then ordering six decants to another at the first price. */
function _invalidateQuote() {
  _state.options = [];
  _state.selectedToken = null;
  _state.cost = null;
  _state.requiresManualQuote = false;
  _state.reason = null;
  _state.status = 'idle';
}

export const Delivery = {
  init() {
    _restore();
    return _state.mode;
  },

  get state() {
    return { ..._state, address: { ..._state.address } };
  },

  get mode() {
    return _state.mode;
  },

  setMode(mode) {
    if (_state.mode === mode) return;
    _state.mode = Object.values(DELIVERY_MODES).includes(mode) ? mode : null;
    _invalidateQuote();
    _persist();
  },

  setAddressField(field, value) {
    if (!ADDRESS_FIELDS.includes(field)) return;

    const clean = String(value ?? '').trim();
    const previous = _state.address[field];

    if (clean) _state.address[field] = clean;
    else delete _state.address[field];

    /* The fields that can change the PRICE, and only those.

       Postal code and colonia decide the carrier rate and the local zone.
       Street and exterior number joined them when local delivery started
       pricing itself by road distance: two houses in the same colonia can be a
       different band apart, so a corrected street number is a different price.

       Everything else is deliberately excluded. Re-quoting because somebody
       fixed a typo in "references" would throw away a valid rate and make the
       form feel broken for a change that cannot move a peso. */
    if (PRICE_CHANGING_FIELDS.includes(field) && previous !== clean) _invalidateQuote();

    _persist();
  },

  get address() {
    return { ..._state.address };
  },

  /* Which required fields are still empty. Drives the inline hints rather than
     a single "complete the form" error that does not say what is missing.
     Applies to both delivered modes — local delivery needs a real street for
     the repartidor exactly as national needs one for the label. */
  missingAddressFields() {
    if (_state.mode !== DELIVERY_MODES.NATIONAL && _state.mode !== DELIVERY_MODES.LOCAL) return [];
    return REQUIRED_ADDRESS_FIELDS.filter(field => !_state.address[field]);
  },

  hasCompleteAddress() {
    return this.missingAddressFields().length === 0;
  },

  /* Enough address to ask for a price, which is less than enough to check out.

     The customer sees "Entrega local — $40" the moment they have typed WHERE,
     without having to fill in who receives it first. */
  canQuoteAddress() {
    return QUOTABLE_ADDRESS_FIELDS.every(field => Boolean(_state.address[field]));
  },

  /* ── Money ─────────────────────────────────────────────────
     `cost` is null until R Supply OS priced this delivery. Callers rendering
     money must branch on isPriced(); there is deliberately no getter that
     coerces the null to 0. */
  isPriced() {
    return _state.cost !== null && _state.cost !== undefined;
  },

  get cost() {
    return _state.cost;
  },

  requiresManualQuote() {
    return _state.requiresManualQuote === true;
  },

  /* Checkout may proceed. A manual quote is READY — the customer agreed to
     have the cost confirmed, and blocking them on a number nobody can produce
     would simply lose the order. What is never allowed is proceeding with an
     unanswered quote, or a national address that no courier could use. */
  isReady() {
    if (!_state.mode) return false;
    if (_state.mode === DELIVERY_MODES.PICKUP) return true;

    return this.hasCompleteAddress() && (this.isPriced() || this.requiresManualQuote());
  },

  selectOption(token) {
    const option = _state.options.find(candidate => candidate.token === token);
    if (!option) return false;

    _state.selectedToken = option.token;
    _state.cost = Number(option.amount);
    _state.requiresManualQuote = false;
    return true;
  },

  get options() {
    return [..._state.options];
  },

  get selectedToken() {
    return _state.selectedToken;
  },

  get status() {
    return _state.status;
  },

  get reason() {
    return _state.reason;
  },

  /* /api/web/delivery/options, fetched once per session and shared by
     zones() and modes() below — one network call answers both questions. The
     list changes when an operator edits configuration, not while somebody is
     checking out. */
  async _options() {
    if (_optionsCache) return _optionsCache;

    try {
      const data = await ApiClient.getDeliveryOptions();
      _optionsCache = {
        zones: Array.isArray(data?.zones) ? data.zones : [],
        modes: Array.isArray(data?.modes) ? data.modes.map(m => m.value) : Object.values(DELIVERY_MODES),
      };
    } catch {
      /* Degrades to "nothing extra offered" rather than showing a zone or a
         mode R Supply OS did not actually confirm. Local/national are the
         floor — a transient failure here must not also hide the modes every
         checkout depends on. */
      _optionsCache = { zones: [], modes: [DELIVERY_MODES.LOCAL, DELIVERY_MODES.NATIONAL] };
    }

    return _optionsCache;
  },

  /* The zones this shop serves. */
  async zones() {
    return (await this._options()).zones;
  },

  /* Which delivery modes R Supply OS is currently offering — e.g. pickup
     stays out of this list while there is no physical customer-facing store,
     without the storefront hardcoding that decision anywhere. */
  async modes() {
    return (await this._options()).modes;
  },

  /**
   * Ask R Supply OS what this cart costs to deliver.
   *
   * `cartPayload` carries items/packs/coupons as identity and quantity — the
   * same shape the order uses, and for the same reason: the server reprices it.
   */
  async quote(cartPayload) {
    if (!_state.mode) return { ok: false };

    _state.status = 'loading';
    _invalidateQuote();
    _state.status = 'loading';

    const { ok, data } = await ApiClient.quoteDelivery({
      ...cartPayload,
      mode: _state.mode,
      postal_code: _state.address.postal_code || null,
      // Local resolves its zone from these two, silently — never a zone the
      // customer picks (see cart/address.js).
      municipio: _state.address.municipio || null,
      neighborhood: _state.address.neighborhood || null,
      city: _state.address.city || null,
      state: _state.address.state || null,
      // Local delivery can now price itself by ROAD DISTANCE when no zone
      // covers the address, and a distance needs a house rather than a postal
      // code — a CP centroid is the middle of a neighbourhood nobody lives at.
      // Sent for both modes because the request shape stays one shape; the
      // national quote reads the postal code and ignores these.
      street: _state.address.street || null,
      exterior_number: _state.address.exterior_number || null,
    });

    if (!ok) {
      _state.status = 'error';
      _state.reason = data?.message || 'No pudimos calcular la entrega. Revisa los datos e inténtalo de nuevo.';
      return { ok: false, message: _state.reason };
    }

    const delivery = data?.delivery ?? {};
    _state.options = Array.isArray(delivery.options) ? delivery.options : [];
    _state.reason = delivery.reason ?? null;

    if (delivery.requires_manual_quote || _state.options.length === 0) {
      /* No price exists. Recorded as an open question — never as zero. */
      _state.requiresManualQuote = true;
      _state.cost = null;
      _state.status = 'manual';
      return { ok: true, manual: true, reason: _state.reason };
    }

    /* Preselect the cheapest. The list is already sorted by amount server-side;
       the customer can pick a faster one. */
    _state.status = 'quoted';
    this.selectOption(_state.options[0].token);

    return { ok: true, manual: false, options: _state.options };
  },

  /* The block that travels with the order. Deliberately carries no amount:
     the token is the amount, and R Supply OS unseals it. Local resolves its
     zone from the same address national uses to reach a carrier. */
  forOrder() {
    if (!_state.mode) return null;

    const payload = { mode: _state.mode };

    if (_state.mode === DELIVERY_MODES.LOCAL || _state.mode === DELIVERY_MODES.NATIONAL) {
      payload.address = { ..._state.address };
    }
    if (_state.selectedToken) payload.option_token = _state.selectedToken;

    return payload;
  },

  /* Called after a successful order. The address is kept (customers reorder to
     the same place); the quote is not. */
  clearQuote() {
    _invalidateQuote();
  },

  reset() {
    _state = {
      mode: null, address: {}, options: [],
      selectedToken: null, cost: null, requiresManualQuote: false,
      reason: null, status: 'idle',
    };
    _persist();
  },
};
