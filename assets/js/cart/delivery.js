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

/* Address fields the national flow needs. `interior_number` and `references`
   are genuinely optional; the rest are what a courier cannot deliver without. */
export const ADDRESS_FIELDS = [
  'recipient', 'phone', 'street', 'exterior_number', 'interior_number',
  'neighborhood', 'city', 'state', 'postal_code', 'references',
];

const REQUIRED_ADDRESS_FIELDS = [
  'recipient', 'phone', 'street', 'exterior_number', 'neighborhood', 'city', 'state', 'postal_code',
];

let _state = {
  mode: null,
  zoneKey: null,
  address: {},
  /* The options R Supply OS last offered, and which one is selected. */
  options: [],
  selectedToken: null,
  cost: null,
  requiresManualQuote: false,
  reason: null,
  status: 'idle',   // idle | loading | quoted | manual | error
};

let _zonesCache = null;

/* ── Persistence ──────────────────────────────────────────────
   Only the customer's INPUT is remembered — mode, zone, address. Never a
   quoted price or a token: both expire, and restoring a stale one would show a
   price the carrier is no longer offering. */
function _persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: _state.mode,
      zoneKey: _state.zoneKey,
      address: _state.address,
    }));
  } catch { /* storage unavailable — the choice simply is not remembered */ }
}

function _restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.mode) _state.mode = saved.mode;
    if (saved.zoneKey) _state.zoneKey = saved.zoneKey;
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

  setZone(zoneKey) {
    if (_state.zoneKey === zoneKey) return;
    _state.zoneKey = zoneKey || null;
    _invalidateQuote();
    _persist();
  },

  setAddressField(field, value) {
    if (!ADDRESS_FIELDS.includes(field)) return;

    const clean = String(value ?? '').trim();
    const previous = _state.address[field];

    if (clean) _state.address[field] = clean;
    else delete _state.address[field];

    /* Only the postal code changes what a carrier charges. Re-quoting because
       somebody corrected a typo in "references" would throw away a valid rate
       and make the form feel broken. */
    if (field === 'postal_code' && previous !== clean) _invalidateQuote();

    _persist();
  },

  get address() {
    return { ..._state.address };
  },

  /* Which required fields are still empty. Drives the inline hints rather than
     a single "complete the form" error that does not say what is missing. */
  missingAddressFields() {
    if (_state.mode !== DELIVERY_MODES.NATIONAL) return [];
    return REQUIRED_ADDRESS_FIELDS.filter(field => !_state.address[field]);
  },

  hasCompleteAddress() {
    return this.missingAddressFields().length === 0;
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

    if (_state.mode === DELIVERY_MODES.LOCAL) {
      return Boolean(_state.zoneKey) && (this.isPriced() || this.requiresManualQuote());
    }

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

  /* The zones this shop serves. Cached for the session — the list changes when
     an operator edits configuration, not while somebody is checking out. */
  async zones() {
    if (_zonesCache) return _zonesCache;

    try {
      const data = await ApiClient.getDeliveryOptions();
      _zonesCache = Array.isArray(data?.zones) ? data.zones : [];
    } catch {
      /* The picker degrades to "no local zones offered" rather than showing
         zones we cannot price. */
      _zonesCache = [];
    }

    return _zonesCache;
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
      zone_key: _state.zoneKey,
      postal_code: _state.address.postal_code || null,
      city: _state.address.city || null,
      state: _state.address.state || null,
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
     the token is the amount, and R Supply OS unseals it. */
  forOrder() {
    if (!_state.mode) return null;

    const payload = { mode: _state.mode };

    if (_state.mode === DELIVERY_MODES.LOCAL) payload.zone_key = _state.zoneKey;
    if (_state.mode === DELIVERY_MODES.NATIONAL) payload.address = { ..._state.address };
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
      mode: null, zoneKey: null, address: {}, options: [],
      selectedToken: null, cost: null, requiresManualQuote: false,
      reason: null, status: 'idle',
    };
    _persist();
  },
};
