/* =============================================================
   RDECANTS — DELIVERY PANEL

   Binds the cart drawer's delivery section to the Delivery state module.

   ── What this file may and may not do ────────────────────────
   It renders prices; it never computes one. Every peso shown here came from
   /api/web/delivery/quote via Delivery, and the "por confirmar" state is a
   distinct branch rather than a zero. There is deliberately no code path that
   turns a null cost into "$0".
   ============================================================= */

import { Cart } from '../cart/cart.js';
import { Delivery, DELIVERY_MODES } from '../cart/delivery.js';
import { Discount } from '../cart/discount.js';
import { formatPrice } from '../utils/prices.js';
import { buildWebOrderPayload, readCheckoutData } from '../cart/checkout.js';
import { bindAddressForm } from '../cart/address.js';

let _wired = false;
let _quoteInFlight = false;
let _onChange = () => {};
let _addressForm = null;
let _autoQuoteTimer = null;

/* How long the street field settles before we ask for a price.

   Local delivery now prices itself from a ROAD ROUTE, which means a geocode
   and a routing call behind the endpoint. Firing on every keystroke of
   "Avenida Ferrocarril" would be seventeen billed lookups for one address and
   would spend the throttle the endpoint is behind. Long enough that a typist
   finishes the word; short enough that the price appears while they are still
   looking at the field. */
const AUTO_QUOTE_DEBOUNCE_MS = 700;

const $ = id => document.getElementById(id);

export function setupDeliveryPanel(onChange = () => {}) {
  const panel = $('delivery-panel');
  if (!panel || _wired) return;

  _onChange = onChange;
  _wired = true;

  Delivery.init();

  _wireModes();
  _wireAddressForm();
  $('delivery-quote-btn')?.addEventListener('click', () => _requestQuote());

  _loadModes();
  _hydrate();
  renderDeliveryPanel();
}

/* Hides any delivery-mode button R Supply OS is not currently offering (e.g.
   pickup, while there is no physical customer-facing store). Nothing about
   which modes exist is hardcoded here; the backend decides. */
async function _loadModes() {
  const modes = await Delivery.modes();

  document.querySelectorAll('#delivery-modes .delivery-mode').forEach(button => {
    if (!modes.includes(button.dataset.mode)) button.setAttribute('hidden', '');
  });
}

/* ── Wiring ──────────────────────────────────────────────────────────────── */

function _wireModes() {
  document.querySelectorAll('#delivery-modes .delivery-mode').forEach(button => {
    button.addEventListener('click', () => {
      Delivery.setMode(button.dataset.mode);
      renderDeliveryPanel();
      _onChange();

      /* Pickup has nothing to ask and nothing to quote — the zero is known the
         moment it is chosen, so the customer is not made to press a button
         that could only produce an answer we already have. Local re-quotes
         immediately when the address was already complete (e.g. the customer
         filled it in under National first, then switched) — otherwise
         switching modes would leave a stale "Por confirmar" from the mode
         they just left. */
      if (Delivery.mode === DELIVERY_MODES.PICKUP) _requestQuote();
      if (Delivery.mode === DELIVERY_MODES.LOCAL && Delivery.canQuoteAddress()) _requestQuote();
    });
  });
}

/* One address form, shared by Local and National (see cart/address.js) —
   the zone concept never reaches the customer. Local auto-quotes as soon as
   a colonia resolves, the same "no button needed" treatment pickup already
   got, because resolving a zone is a database lookup, not a carrier call.
   National still needs the explicit "Calcular envío" button below. */
function _wireAddressForm() {
  const root = document.querySelector('#delivery-address-block');
  if (!root) return;

  _addressForm = bindAddressForm(root, {
    onFieldChange: (field, value) => Delivery.setAddressField(field, value),
    onChange: () => {
      renderDeliveryPanel();
      _onChange();
      _scheduleLocalAutoQuote();
    },
  });
}

/* Ask for the local price as soon as the address can answer, and not before.

   The customer never presses anything and never sees a zone, a distance or a
   band — they type where they live and a number appears. That is the whole
   customer-facing surface of the automatic pricing behind it. */
function _scheduleLocalAutoQuote() {
  clearTimeout(_autoQuoteTimer);

  if (Delivery.mode !== DELIVERY_MODES.LOCAL || !Delivery.canQuoteAddress()) return;

  _autoQuoteTimer = setTimeout(() => _requestQuote(), AUTO_QUOTE_DEBOUNCE_MS);
}

/* Restore what the customer typed last time. The quote is deliberately NOT
   restored — see Delivery's persistence note. */
function _hydrate() {
  const state = Delivery.state;

  if (state.mode) {
    const button = document.querySelector(`#delivery-modes .delivery-mode[data-mode="${state.mode}"]`);
    if (button) button.setAttribute('aria-checked', 'true');
  }

  document.querySelectorAll('#delivery-address-block [data-address]').forEach(input => {
    const value = state.address[input.dataset.address];
    if (value) input.value = value;
  });

  if (state.address.postal_code) _addressForm?.hydrate(state.address.postal_code);
}

/* ── Quoting ─────────────────────────────────────────────────────────────── */

async function _requestQuote() {
  if (_quoteInFlight) return;

  const mode = Delivery.mode;
  if (!mode) return;

  /* A national quote without a postal code cannot be answered, and firing it
     anyway would spend the carrier rate limit to be told so. */
  if (mode === DELIVERY_MODES.NATIONAL && !Delivery.address.postal_code) {
    _message('Escribe tu código postal para calcular el envío.', 'neutral');
    return;
  }

  /* Local needs a house, not just a colonia: with no zone covering the
     address the price comes from a road route, and a postal-code centroid is
     the middle of a neighbourhood nobody lives at. */
  if (mode === DELIVERY_MODES.LOCAL && !Delivery.canQuoteAddress()) return;

  const items = Cart.items;
  if (!items.length) return;

  _quoteInFlight = true;
  renderDeliveryPanel();

  try {
    /* The SAME payload builder the order uses, so the parcel that gets quoted
       is the parcel that gets ordered. A separate cart shape here is how a
       quote and an order drift into describing different boxes. */
    const cartPayload = await buildWebOrderPayload(items, readCheckoutData(), {
      couponCodes: (Discount.applied || []).map(d => d?.normalizedCode || d?.code).filter(Boolean),
      packs: Cart.packPurchases(),
    });

    const result = await Delivery.quote({
      items: cartPayload.items,
      packs: cartPayload.packs,
      coupon_codes: cartPayload.coupon_codes,
    });

    if (!result.ok) _message(result.message, 'error');
  } catch {
    _message('No pudimos calcular la entrega. Inténtalo de nuevo.', 'error');
  } finally {
    _quoteInFlight = false;
    renderDeliveryPanel();
    _onChange();
  }
}

/* The cart changed, so any price we hold describes a different parcel. */
export function invalidateDeliveryQuote() {
  Delivery.clearQuote();
  renderDeliveryPanel();
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

export function renderDeliveryPanel() {
  const panel = $('delivery-panel');
  if (!panel) return;

  const mode = Delivery.mode;

  document.querySelectorAll('#delivery-modes .delivery-mode').forEach(button => {
    const active = button.dataset.mode === mode;
    button.setAttribute('aria-checked', String(active));
    button.classList.toggle('is-active', active);
  });

  _toggle($('delivery-address-block'), mode === DELIVERY_MODES.LOCAL || mode === DELIVERY_MODES.NATIONAL);

  _renderQuoteButton(mode);
  _renderOptions();
  _renderMessage(mode);
}

function _renderQuoteButton(mode) {
  const button = $('delivery-quote-btn');
  if (!button) return;

  /* Pickup and local quote themselves the moment the choice is complete. Only
     national — the one that reaches an external carrier — gets an explicit
     button, so a postal-code field does not fire a carrier call per keystroke. */
  const needsButton = mode === DELIVERY_MODES.NATIONAL;
  button.hidden = !needsButton;

  if (!needsButton) return;

  button.disabled = _quoteInFlight || !Delivery.address.postal_code;
  button.textContent = _quoteInFlight
    ? 'Calculando…'
    : (Delivery.isPriced() || Delivery.requiresManualQuote() ? 'Recalcular envío' : 'Calcular envío');
}

function _renderOptions() {
  const container = $('delivery-options');
  if (!container) return;

  const options = Delivery.options;

  /* Only shown for a real choice. One option is not a choice, and a radio
     group of one is noise — its price appears in the summary instead. */
  if (options.length < 2) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const selected = Delivery.selectedToken;

  container.hidden = false;
  container.innerHTML = options.map(option => `
    <button type="button" class="delivery-option${option.token === selected ? ' is-active' : ''}"
            role="radio" aria-checked="${option.token === selected}" data-token="${_escape(option.token)}">
      <span class="delivery-option-main">
        <span class="delivery-option-label">${_escape(option.label)}</span>
        ${option.estimated_days ? `<span class="delivery-option-eta">${_escape(option.estimated_days)} días</span>` : ''}
      </span>
      <span class="delivery-option-price">${formatPrice(option.amount, '')}</span>
    </button>`).join('');

  container.querySelectorAll('.delivery-option').forEach(button => {
    button.addEventListener('click', () => {
      Delivery.selectOption(button.dataset.token);
      renderDeliveryPanel();
      _onChange();
    });
  });
}

function _renderMessage(mode) {
  if (!mode) {
    _message('', 'neutral');
    return;
  }

  if (_quoteInFlight) {
    _message('Calculando entrega…', 'neutral');
    return;
  }

  if (mode === DELIVERY_MODES.NATIONAL || mode === DELIVERY_MODES.LOCAL) {
    const missing = Delivery.missingAddressFields();

    if (missing.length && Delivery.address.postal_code) {
      _message('Completa tu dirección para continuar.', 'neutral');
      return;
    }
  }

  /* The honest unpriced state. Says what happens next; shows no number. */
  if (Delivery.requiresManualQuote()) {
    _message(Delivery.reason || 'Confirmamos el costo de entrega por WhatsApp antes de cobrar.', 'warn');
    return;
  }

  _message('', 'neutral');
}

function _message(text, tone) {
  const element = $('delivery-msg');
  if (!element) return;

  element.textContent = text || '';
  element.dataset.tone = tone;
  element.hidden = !text;
}

/* ── Summary rows ────────────────────────────────────────────────────────────
   Called by cart/render.js so the shipping line and the grand total stay in
   step with the merchandise total beside them. */
export function renderDeliverySummary(merchandiseTotal) {
  const row = $('cart-shipping-row');
  const value = $('cart-shipping-value');
  const label = $('cart-shipping-label');
  const note = $('cart-total-note');

  if (!row || !value) return;

  const mode = Delivery.mode;

  if (!mode) {
    row.hidden = true;
    if (note) note.hidden = true;
    return;
  }

  row.hidden = false;
  if (label) label.textContent = _modeLabel(mode);

  if (Delivery.isPriced()) {
    const cost = Delivery.cost;
    value.textContent = cost > 0 ? formatPrice(cost, '') : 'Sin costo';

    /* A grand total is only stated when every part of it is real. */
    if (note) {
      const grand = Number(merchandiseTotal || 0) + cost;
      // formatPrice already appends " MXN".
      note.textContent = `Total con entrega: ${formatPrice(grand, '')}`;
      note.hidden = false;
    }
    return;
  }

  /* Unpriced. The words are the whole point: an order awaiting a manual quote
     has no final total, so no total is shown. */
  value.textContent = 'Por confirmar';
  if (note) note.hidden = true;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function _modeLabel(mode) {
  if (mode === DELIVERY_MODES.PICKUP) return 'Recoger en tienda';
  if (mode === DELIVERY_MODES.LOCAL) return 'Entrega local';
  return 'Envío';
}

function _toggle(element, show) {
  if (element) element.hidden = !show;
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
