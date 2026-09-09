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
import { EventBus } from '../core/events.js';
import { Tracker } from '../tracking/tracker.js';
import { Account } from '../account/account.js';

let _wired = false;
let _quoteInFlight = false;
let _onChange = () => {};
let _addressForm = null;
let _autoQuoteTimer = null;
let _pendingQuote = false;
let _parcelSignature = '';
let _quoteError = '';

const parcelSignature = () => JSON.stringify({
  items: Cart.items.map(item => [item.key, item.qty, item.price]),
  coupons: Discount.applied.map(coupon => [coupon.normalizedCode || coupon.code, coupon.amount]),
});

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

  _wireWhen();
  _loadModes();
  _hydrate();
  _prefillFromAccount();
  renderDeliveryPanel();
  _parcelSignature = parcelSignature();
  const onParcelChange = () => {
    const signature = parcelSignature();
    if (signature === _parcelSignature) return;
    _parcelSignature = signature;
    invalidateDeliveryQuote();
    _onChange();
  };
  EventBus.on('cart:updated', onParcelChange);
  EventBus.on('discount:updated', onParcelChange);
}

/* Hides any delivery-mode button R Supply OS is not currently offering (e.g.
   pickup, while there is no physical customer-facing store). Nothing about
   which modes exist is hardcoded here; the backend decides. */
async function _loadModes() {
  const modes = await Delivery.modes();

  /* Handed to the state module rather than kept here, so it can drop a
     remembered day that is no longer on offer before anything renders it. */
  Delivery.setWindows(await Delivery.deliveryWindows());
  renderDeliveryPanel();

  document.querySelectorAll('#delivery-modes .delivery-mode').forEach(button => {
    button.hidden = !modes.includes(button.dataset.mode);
  });
  if (Delivery.mode && !modes.includes(Delivery.mode)) {
    Delivery.setMode(null);
    renderDeliveryPanel();
    _onChange();
  }
}

/* ── Wiring ──────────────────────────────────────────────────────────────── */

function _wireModes() {
  document.querySelectorAll('#delivery-modes .delivery-mode').forEach(button => {
    button.addEventListener('click', () => {
      _quoteError = '';
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
    onFieldChange: (field, value) => {
      _quoteError = '';
      Delivery.setAddressField(field, value);
    },
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

  if (Delivery.mode !== DELIVERY_MODES.LOCAL || !Delivery.canQuoteAddress() || Delivery.isPriced() || Delivery.requiresManualQuote()) return;

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

  if (state.address.postal_code) _addressForm?.hydrate(state.address.postal_code, state.address);
}

/* ── A returning customer should not retype what we already have ──────────
   Filled from the customer's OWN most recent order, which R Supply OS returns
   for a browser it recognises. No account, no password, no form: they ordered
   once, so we know where they live.

   ── Three rules that keep this from being annoying or wrong ─────────────
   1. It NEVER overwrites. Anything already in the field — typed now, or
      remembered from the last session by Delivery's own storage — wins. The
      prefill fills blanks; it does not correct people.
   2. It is fully editable afterwards. Nothing here locks a field.
   3. It changes no historical order. This reads the last order's snapshot and
      writes into a FORM; the order itself is never touched, so a customer who
      moves house does not rewrite where last month's parcel went.

   Silent on failure. A customer who is not recognised, or an API that did not
   answer, simply gets the empty form they would have got anyway. */
async function _prefillFromAccount() {
  let saved = null;

  try {
    saved = await Account.prefill();
  } catch { /* not recognised, or offline — the form is simply empty */ }

  if (!saved) return;

  const current = Delivery.state.address;
  const incoming = { ...saved.address };

  /* The recipient IS the customer for a normal storefront checkout — the same
     mapping R Supply OS applies server-side. */
  if (saved.name) incoming.recipient = saved.name;
  if (saved.phone) incoming.phone = saved.phone;

  let filled = 0;

  for (const [field, value] of Object.entries(incoming)) {
    if (!value || current[field]) continue;
    Delivery.setAddressField(field, value);
    filled += 1;
  }

  if (!filled) return;

  /* A remembered mode too, but only when the customer has not chosen one in
     this session — switching somebody's delivery method under them would be a
     far worse surprise than an empty field. */
  if (!Delivery.mode && saved.mode) Delivery.setMode(saved.mode);

  _hydrate();
  renderDeliveryPanel();
  _onChange();

  if (Delivery.mode === DELIVERY_MODES.LOCAL && Delivery.canQuoteAddress()) _requestQuote();

  Tracker.emit('checkout_prefilled', { fields: filled });
}

/* ── Quoting ─────────────────────────────────────────────────────────────── */

export async function requestDeliveryQuote() { return _requestQuote(); }

async function _requestQuote() {
  if (_quoteInFlight) { _pendingQuote = true; return; }

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
  _quoteError = '';
  const generation = Delivery.generation;
  renderDeliveryPanel();

  try {
    /* The SAME payload builder the order uses, so the parcel that gets quoted
       is the parcel that gets ordered. A separate cart shape here is how a
       quote and an order drift into describing different boxes. */
    const cartPayload = await buildWebOrderPayload(items, readCheckoutData(), {
      couponCodes: (Discount.applied || []).map(d => d?.normalizedCode || d?.code).filter(Boolean),
      packs: Cart.packPurchases(),
    });

    if (generation !== Delivery.generation) { _pendingQuote = true; return; }
    const result = await Delivery.quote({
      items: cartPayload.items,
      packs: cartPayload.packs,
      coupon_codes: cartPayload.coupon_codes,
    });

    if (!result.ok && !result.stale) _quoteError = result.message;
    if (result.ok) Tracker.emit('delivery_quoted', { mode: Delivery.mode, status: Delivery.status, cost: Delivery.cost });
  } catch {
    _quoteError = 'No pudimos calcular la entrega. Inténtalo de nuevo.';
  } finally {
    _quoteInFlight = false;
    renderDeliveryPanel();
    _onChange();
    if (_pendingQuote) {
      _pendingQuote = false;
      _scheduleLocalAutoQuote();
    }
  }
}

/* The cart changed, so any price we hold describes a different parcel. */
export function invalidateDeliveryQuote() {
  clearTimeout(_autoQuoteTimer);
  _quoteError = '';
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
  _renderWhen(mode);
  _renderMessage(mode);
}

/* ── "¿Cuándo te queda mejor?" ────────────────────────────────────────────
   Two taps: a day, then a window. Shown only for LOCAL delivery and only once
   the address is complete enough to price — asking when before knowing where
   is asking a question the answer to which might not apply.

   ── Requested, never booked ─────────────────────────────────────────────
   Nothing here promises a time. The days and windows are exactly what
   /api/web/delivery/options published (which carries `is_guaranteed: false`
   of its own), a window that has closed today simply is not in the list, and
   "Lo coordinamos por WhatsApp" is a first-class choice rather than a way of
   opting out of a form. */
function _renderWhen(mode) {
  const block = $('delivery-when');
  if (!block) return;

  const offer = Delivery.windows;
  const days = Array.isArray(offer?.days) ? offer.days.filter(day => (day.windows || []).length) : [];
  const applies = mode === DELIVERY_MODES.LOCAL && offer?.enabled === true && days.length > 0;

  _toggle(block, applies);
  if (!applies) return;

  const chosen = Delivery.preference;
  /* The day defaults to whatever the customer already picked; otherwise none is
     preselected. A preselected day would post a preference nobody chose. */
  const activeDate = chosen?.date && days.some(d => d.date === chosen.date) ? chosen.date : _openDay;

  /* Hoy · Mañana · Otro día. The horizon is a week, and seven date chips
     wrapping across a phone is a list to read rather than a choice to make —
     so the rest stay behind one more tap, and appear only when somebody wants
     a day that is not the next two (or already picked one). */
  const isFar = date => days.findIndex(day => day.date === date) > 1;
  const expanded = _showAllDays || isFar(activeDate);
  const visible = expanded ? days : days.slice(0, 2);

  $('delivery-when-days').innerHTML = visible.map(day => `
    <button type="button" class="delivery-when-chip${day.date === activeDate ? ' is-active' : ''}"
            data-when-day="${_esc(day.date)}" aria-pressed="${day.date === activeDate}">${_esc(day.label)}</button>`).join('')
    + (expanded || days.length <= 2
      ? ''
      : `<button type="button" class="delivery-when-chip delivery-when-chip--more"
                 data-when-more="1" aria-expanded="false">Otro día…</button>`);

  const active = days.find(day => day.date === activeDate);

  $('delivery-when-slots').innerHTML = !active ? '' : `${active.windows.map(window => {
    const on = chosen?.date === active.date && chosen?.window === window.key;
    return `<button type="button" class="delivery-when-chip delivery-when-chip--slot${on ? ' is-active' : ''}"
              data-when-window="${_esc(window.key)}" data-when-date="${_esc(active.date)}"
              aria-pressed="${on}">${_esc(window.label)}</button>`;
  }).join('')}<button type="button" class="delivery-when-chip delivery-when-chip--none${chosen ? '' : ' is-active'}"
      data-when-clear="1" aria-pressed="${!chosen}">Lo coordinamos por WhatsApp</button>`;
}

/* Which day's windows are on screen, and whether the full week is showing.
   Both are UI state only — choosing a day is not choosing a window, and nothing
   is sent until a window is tapped. */
let _openDay = null;
let _showAllDays = false;

function _wireWhen() {
  const block = $('delivery-when');
  if (!block) return;

  block.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.whenMore) {
      _showAllDays = true;
      renderDeliveryPanel();
      $('delivery-when-days')?.querySelector('button:nth-child(3)')?.focus();
      return;
    }

    if (target.dataset.whenDay) {
      _openDay = target.dataset.whenDay;
      renderDeliveryPanel();
      return;
    }

    if (target.dataset.whenClear) {
      Delivery.clearPreference();
    } else if (target.dataset.whenWindow) {
      _openDay = target.dataset.whenDate;
      Delivery.setPreference(target.dataset.whenDate, target.dataset.whenWindow);
      Tracker.emit('delivery_preference_selected', { window: target.dataset.whenWindow });
    } else {
      return;
    }

    renderDeliveryPanel();
    _onChange();
  });
}

const _esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _renderQuoteButton(mode) {
  const button = $('delivery-quote-btn');
  if (!button) return;

  /* Pickup and local quote themselves the moment the choice is complete. Only
     national — the one that reaches an external carrier — gets an explicit
     button, so a postal-code field does not fire a carrier call per keystroke. */
  const needsButton = mode === DELIVERY_MODES.NATIONAL || (mode === DELIVERY_MODES.LOCAL && Delivery.canQuoteAddress() && !_quoteInFlight && !Delivery.isPriced() && !Delivery.requiresManualQuote());
  button.hidden = !needsButton;

  if (!needsButton) return;

  button.disabled = _quoteInFlight || !Delivery.address.postal_code;
  button.textContent = _quoteInFlight
    ? 'Calculando…'
    : (Delivery.isPriced() || Delivery.requiresManualQuote() ? 'Recalcular entrega' : 'Calcular entrega');
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

  if (_quoteError || Delivery.status === 'error') {
    _message(_quoteError || Delivery.reason, 'error');
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

/* ── Helpers ─────────────────────────────────────────────── */
function _toggle(element, show) {
  if (element) element.hidden = !show;
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
