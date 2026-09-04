/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js';
import { Discount }  from './discount.js';
import { Attribution } from './attribution.js';
import { Delivery } from './delivery.js';
import { ApiClient } from '../api/client.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { getVariantForSize } from '../utils/prices.js';
import { getShippingState } from './momentum.js';

const STORAGE_KEY = 'rdecants_checkout_customer';
const LAST_ORDER_KEY = 'rdecants_last_web_order_folio';
const LAST_FIRED_KEY = 'rdecants_checkout_last_fired_at';
/* Survives reloads within the tab so a refresh mid-submit still replays
   the same attempt instead of creating a second order. */
const ATTEMPT_KEY = 'rdecants_checkout_attempt_key';

const APP_VERSION = '1.0.5';

/* Debounce window between consecutive WhatsApp checkout submissions.
   Prevents double-taps and bfcache restores from re-firing the order. */
const CHECKOUT_LOCK_MS = 4000;

/* Only the notes textarea lives in the checkout panel now. Name and phone are
   asked once, in the delivery block — see readCheckoutData(). */
const FIELD_IDS = {
  notes: 'checkout-notes',
};

let _startedSignature = '';
let _isSubmitting = false;
let _prevEligible = null;

export function setupCheckout() {
  const form = _form();
  if (!form) return;

  _hydrate();
  _syncAvailability();

  form.addEventListener('input', _handleFormInput);
  form.addEventListener('change', _handleFormInput);
  form.addEventListener('focusin', () => trackCheckoutStarted('form_focus'), { once: true });
  _setupNotesToggle();
}

/* Notes are collapsed by default behind "Agregar comentario" so the
   checkout shows zero required fields before the WhatsApp handoff. */
function _setupNotesToggle() {
  const toggle = document.getElementById('checkout-notes-toggle');
  const field = _field('notes');
  if (!toggle || !field) return;

  toggle.addEventListener('click', () => {
    const show = field.hidden;
    field.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (show) field.focus();
  });
}

export function trackCheckoutStarted(source = 'cart_drawer') {
  const items = Cart.items;
  if (!items.length) return;

  const signature = `${source}:${Cart.count()}:${Cart.total()}:${items.map(i => `${i.key}:${i.qty}`).join('|')}`;
  if (_startedSignature === signature) return;

  _startedSignature = signature;
  Tracker.checkoutStarted(items, Cart.total());
}

export async function sendCheckoutWhatsApp(phoneNumber) {
  /* Idempotency guard — covers double-tap AND bfcache re-fire. We take
     the lock synchronously before any awaits so a second click in the
     same tick can never slip past. */
  if (_isSubmitting) return;
  if (_recentlyFired()) return;
  _isSubmitting = true;
  _syncAvailability();

  /* Bottle inventory must be revalidated before the handoff, but waiting for
     that request would lose the browser's click gesture and make WhatsApp look
     like a blocked popup. Reserve the tab synchronously, then either navigate
     it after validation or close it on a customer-facing stock error. */
  const hasBottle = Cart.items.some(item => item.type === 'bottle');
  const reservedWindow = hasBottle ? window.open('', '_blank') : null;

  try {
    await _performCheckout(phoneNumber, reservedWindow);
  } finally {
    _isSubmitting = false;
    _syncAvailability();
  }
}

/* WhatsApp-first: the WhatsApp window is opened SYNCHRONOUSLY inside the click
   gesture (no awaits before it) so the popup isn't blocked and a backend outage
   can never block the sale. The system order is created afterwards, async. */
async function _performCheckout(phoneNumber, reservedWindow = null) {
  const items = Cart.items;

  if (!items.length) {
    reservedWindow?.close?.();
    const message = 'Agrega una fragancia antes de finalizar por WhatsApp';
    _showMessage(message, 'error');
    showToast(message);
    _syncAvailability();
    return;
  }

  const availabilityError = Cart.availabilityError();
  if (availabilityError) {
    reservedWindow?.close?.();
    const available = _formatMl(availabilityError.availableMl);
    const message = `Ajusta tu carrito: esta fragancia tiene ${available}ml disponibles en total.`;
    _showMessage(message, 'error');
    showToast(message);
    return;
  }

  /* ── A destination that has not been answered is not a checkout ──────────
     The customer may proceed on a MANUAL quote — agreeing to have the cost
     confirmed is a real choice, and blocking them over a number nobody can
     produce would simply lose the order. What must not happen is an order
     leaving with a national address no courier could use, or with a quote the
     customer started and never got an answer to: both put the business back to
     asking for the address over WhatsApp.

     Choosing no mode at all stays allowed, so a cart built before this panel
     existed still checks out exactly as it did. */
  if (Delivery.mode && !Delivery.isReady()) {
    reservedWindow?.close?.();
    const message = _deliveryBlockedMessage();
    _showMessage(message, 'error');
    showToast(message);
    document.getElementById('delivery-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = readCheckoutData();
  saveCheckoutData(data);
  _clearError();

  const total = Cart.total();
  const shipping = getShippingState(total);

  Tracker.checkoutWhatsappClicked(items, total, { phone: Boolean(data.phone) });
  Tracker.cartValueBeforeWhatsapp(total, items);
  if (!shipping.isEligible) Tracker.amountMissingForShipping(shipping);

  /* Snapshot what we send — the background order is built from this and is
     unaffected by the cart being cleared after a successful launch. The discount
     shown here is the last PREVIEW; R Supply OS recalculates the real total when
     it creates the order (we only forward the code). */
  const orderItems = items;
  const discount = Discount.applied;
  /* Snapshot campaign attribution BEFORE any clearing so the background order
     carries it even after the session state is wiped on a successful handoff. */
  const attribution = Attribution.forOrder();
  if (Object.keys(attribution).length) Tracker.campaignCheckoutAttributed(Attribution.forTracking());

  /* ── The order is created BEFORE WhatsApp, for every cart ────────────────
     This used to be bottle-only: a decant checkout opened WhatsApp first and
     wrote the order afterwards, fire-and-forget. When that write failed the
     customer never knew, and the only surviving record of the sale was a chat
     message the business then had to read back into an order by hand — the
     exact manual reconstruction this system exists to remove.

     Order-first makes the folio the thing being discussed rather than the
     conversation being the order. It also means every checkout gets what only
     bottles got before: live revalidation, server-recalculated money, and a
     real error while the customer can still act on it.

     The popup still opens synchronously from the click (`reservedWindow`) and
     is only NAVIGATED after the await, because iOS Safari refuses a
     window.open() that happens after an async boundary. That is the same
     mechanism the bottle path already proved. */
  let recordedOrder = null;
  try {
    recordedOrder = await _submitWebOrder(orderItems, data, total, discount, attribution);
  } catch (error) {
    reservedWindow?.close?.();
    _logCheckoutError(error);
    const message = _customerOrderError(error);
    _showMessage(message, 'error');
    showToast(message);
    Tracker.backgroundOrderFailure(String(error?.message || 'order_failed'), total);
    /* Cart, discount and attribution are all left intact so a retry is one tap
       and nothing the customer chose is lost. */
    return;
  }

  /* The order's numbers outrank the preview: R Supply OS may have priced the
     cart differently in the seconds since — a bottle repriced, or someone else
     taking the last redemption of a one-use code. Promising the preview total
     in a WhatsApp message the customer keeps, after the backend has already
     said otherwise, is a number nobody can honour. */
  const messageText = buildWhatsAppMessage(recordedOrder.folio);
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`;

  _markFired();
  if (reservedWindow) reservedWindow.location.href = whatsappUrl;
  const opened = reservedWindow || window.open(whatsappUrl, '_blank');

  /* The order exists either way now, so both branches clear the cart. A blocked
     popup is a browser inconvenience, not a failed purchase, and leaving the
     cart full would invite a second order for merchandise already reserved
     under a folio the customer is holding. */
  Cart.clear();
  Discount.clear();
  Attribution.clear();
  /* The address is kept — customers reorder to the same place — but the price
     is not: it belonged to the parcel that just shipped. */
  Delivery.clearQuote();
  _clearCheckoutAttempt();

  if (!opened) {
    _showManualWhatsApp(whatsappUrl);
    return;
  }

  _showMessage('Listo, te llevamos a WhatsApp para finalizar tu pedido.', 'success');
  showToast('Listo, abrimos WhatsApp para finalizar tu pedido.');
}

/* One idempotency key per CHECKOUT ATTEMPT, not per click.

   It is minted on the first submit and kept in sessionStorage until that
   attempt succeeds, so a double tap, a retry after a timeout, and a browser
   replaying the request all carry the SAME key and resolve to the one order R
   Supply OS already created. Clearing it on success is what makes the customer's
   next, genuinely different cart a new order rather than a replay of this one. */
function _checkoutAttemptKey() {
  try {
    const existing = sessionStorage.getItem(ATTEMPT_KEY);
    if (existing) return existing;

    const key = (globalThis.crypto?.randomUUID?.())
      || `rd-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(ATTEMPT_KEY, key);
    return key;
  } catch {
    /* sessionStorage unavailable (private mode, embedded webview). Without a
       stable key we cannot promise idempotency, so we send none rather than a
       fresh one per attempt — a per-attempt key would defeat the guard on the
       server while looking like it worked. */
    return null;
  }
}

function _clearCheckoutAttempt() {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch { /* nothing to clear */ }
}

/* Why the delivery is not ready yet, named specifically.

   "Completa los datos de entrega" would be true for all three cases and useful
   for none of them: the customer cannot tell whether they missed a field, a
   zone, or the quote button. */
function _deliveryBlockedMessage() {
  const missing = Delivery.missingAddressFields();

  if (missing.length) return 'Completa tu dirección de envío para continuar.';

  return 'Calcula el costo de entrega para continuar.';
}

/* What the customer is told when the order could not be created.

   Every branch keeps the cart and invites a retry. None of them offers a
   WhatsApp fallback: reaching the business with an unrecorded cart is how the
   business ends up rebuilding the order by hand, which is the failure this
   whole flow removes. */
function _customerOrderError(error) {
  const message = String(error?.data?.message || error?.message || '').trim();

  if (/precio/i.test(message)) return 'El precio de una botella cambió. Actualiza la página y confirma el nuevo precio.';
  if (/contenido|mililit|parcial/i.test(message)) return 'Cambió el contenido de una botella parcial. Actualiza la página para ver la cantidad actual.';
  if (/disponible|vendi|offer|oferta|agotad/i.test(message)) return 'Un producto de tu carrito acaba de agotarse. Actualiza la página para ver las opciones actuales.';
  if (/envio|env[ií]o|cotizaci[oó]n/i.test(message)) return 'La cotización de envío expiró. Vuelve a calcular el envío para confirmar el precio.';
  if (/codigo postal|c[oó]digo postal|zona/i.test(message)) return 'Revisa los datos de entrega antes de continuar.';

  return 'No pudimos registrar tu pedido ahora. Tu carrito sigue guardado; inténtalo de nuevo.';
}

async function _submitWebOrder(items, data, total, discount = null, attribution = {}) {
  const couponCodes = Array.isArray(discount)
    ? discount.map(d => d?.normalizedCode || d?.code).filter(Boolean)
    : (discount?.code ? [discount.code] : []);
  const packs = items
    .filter(item => item.type === 'pack')
    .map(item => ({ pack_id: item.pack_id, quantity: Number(item.qty) || 1 }));
  const payload = await buildWebOrderPayload(items, data, {
    couponCodes,
    attribution,
    packs,
    idempotencyKey: _checkoutAttemptKey(),
    delivery: Delivery.forOrder(),
  });

  if (!payload.items.length && !payload.packs?.length) {
    throw new Error('Tu carrito quedó vacío. Agrega una fragancia e inténtalo de nuevo.');
  }

  const response = await ApiClient.createWebOrder(payload);
  const order = response?.order;
  if (!response?.ok || !order?.folio) throw new Error('No se pudo crear el pedido en sistema.');

  localStorage.setItem(LAST_ORDER_KEY, order.folio || '');
  const finalTotal = _money(order.total) || total;
  Tracker.checkoutCompleted(items, finalTotal, { folio: order.folio });
  Tracker.backgroundOrderSuccess(order.folio, finalTotal);
  return order;
}

/* Popup-blocked fallback: a persistent manual link, cart kept intact. */
function _showManualWhatsApp(url) {
  const el = document.getElementById('checkout-fallback');
  if (!el) {
    showToast('Abre WhatsApp para finalizar tu pedido', {
      actionLabel: 'Abrir WhatsApp',
      onAction: () => { if (!window.open(url, '_blank')) window.location.href = url; },
    });
    return;
  }
  el.hidden = false;
  el.innerHTML = `Si WhatsApp no se abrió, <a href="${url}" target="_blank" rel="noopener">ábrelo manualmente aquí</a>. Tu carrito sigue guardado.`;
}

function _recentlyFired() {
  try {
    const raw = Number(sessionStorage.getItem(LAST_FIRED_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return false;
    return Date.now() - raw < CHECKOUT_LOCK_MS;
  } catch {
    return false;
  }
}

function _markFired() {
  try {
    sessionStorage.setItem(LAST_FIRED_KEY, String(Date.now()));
  } catch { /* sessionStorage unavailable — best-effort lock */ }
}

/* WHO this order is for — read from the one place the customer typed it.

   ── The bug this function used to be ─────────────────────────────────────
   It returned `{ name, notes }` and nothing else. `name` came from a separate
   "Tu nombre (opcional)" input at the top of the drawer, and there was no
   phone field anywhere in it — the customer's real name and phone went into
   the delivery block, into `Delivery.address.recipient` / `.phone`, and stayed
   there. So `payload.customer.name` was whatever was typed in the optional box
   (usually nothing) and `payload.customer.phone` was ALWAYS undefined.

   The result was an order in R Supply OS reading «Sin nombre» with no phone,
   for a customer who had filled in every field the form asked them for — and a
   business back to rebuilding the order out of a WhatsApp thread.

   The duplicate input is gone. The delivery block already asks "Quién recibe"
   and "Teléfono", and for a normal storefront checkout the recipient IS the
   customer. R Supply OS enforces the same mapping server-side, because a rule
   that lives only here would hold only for browsers that reloaded. */
export function readCheckoutData() {
  const address = Delivery.address;

  return {
    name:  (address.recipient || '').trim(),
    phone: (address.phone || '').trim(),
    notes: _field('notes')?.value.trim() || '',
  };
}

/* Only the NOTE is persisted here.

   Name and phone live in the delivery address, which Delivery already
   remembers under its own key. Writing them a second time would create two
   copies of the same fact that could disagree the moment the customer edits
   one of them — and this is the copy nothing reads back. */
export function saveCheckoutData(data = readCheckoutData()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: data.notes || '' }));
}

export function validateCheckout() {
  /* Zero required fields before WhatsApp. The customer identifies themselves
     inside the chat, so nothing here blocks reaching the handoff. */
  return null;
}

export async function buildWebOrderPayload(items, data, options = {}) {
  const orderItems = [];

  for (const item of items.filter(item => item.type !== 'pack')) {
    orderItems.push(await _buildOrderItem(item));
  }

  /* Packs travel as IDENTITY AND QUANTITY. Deliberately no price, no discount
     amount and no component list: R Supply OS resolves the pack, re-reads the
     canonical 3 ml variants and derives the discount itself, exactly as it
     already ignores `unit_price` on ordinary items. A storefront that could
     state its own pack price could state any price. */
  const packs = options.packs ?? Cart.packPurchases();

  const payload = {
    customer: {
      name: data.name || null,
      phone: data.phone || null,
    },
    items: orderItems,
    ...(packs.length ? { packs } : {}),
    notes: data.notes || null,
    ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
    /* Where it goes and which option was chosen — identity and a signed token,
       never an amount. R Supply OS recomputes a local fee from the tariff and
       unseals a national one from a token it signed itself.

       `delivery: null` is omitted rather than sent, so a cart quoted before a
       destination was chosen keeps the exact payload shape it has today. */
    ...(options.delivery ? { delivery: options.delivery } : {}),
    metadata: {
      source: 'rdecants-web',
      user_agent: navigator.userAgent,
      cart_version: APP_VERSION,
      session_id: localStorage.getItem('rd_sid') || null,
      cart_items: items.map(item => ({
        key: item.key,
        name: item.name,
        house: item.house,
        type: item.type,
        image: item.image,
      })),
    },
  };

  /* Campaign attribution + discount code. All code-only and opt-in — omitting
     keys when absent keeps the payload shape unchanged for the no-campaign path.
     R Supply OS is the source of truth: it validates the code, resolves the
     campaign and recalculates totals server-side. We NEVER send a discount
     amount or a frontend total as truth. */
  const attribution = options.attribution || {};

  /* Coupon codes: the applied set (up to 2) wins; else a single legacy
     discountCode, else the pending promo the customer kept. We forward
     coupon_codes[] (the canonical contract) plus discount_code = the first
     code as a legacy mirror — R Supply OS prefers coupon_codes and stays the
     source of truth (it validates, resolves campaigns and recalculates). We
     never send a discount amount or a frontend total as truth. */
  let codes = Array.isArray(options.couponCodes) ? options.couponCodes.filter(Boolean) : [];
  if (!codes.length) {
    const single = options.discountCode || attribution.discount_code;
    if (single) codes = [single];
  }
  codes = codes.map(c => String(c).trim().toUpperCase()).filter(Boolean).slice(0, 2);

  if (codes.length) {
    payload.coupon_codes = codes;
    payload.discount_code = codes[0];
  }
  if (attribution.promo)        payload.promo = attribution.promo;
  if (attribution.campaign_slug) payload.campaign_slug = attribution.campaign_slug;
  if (attribution.utm_campaign) payload.utm_campaign = attribution.utm_campaign;
  if (attribution.utm_source)   payload.utm_source = attribution.utm_source;
  if (attribution.utm_medium)   payload.utm_medium = attribution.utm_medium;

  return payload;
}

async function _buildOrderItem(item) {
  const product = await CatalogProvider.getProductById(item.sourceId ?? item.product_id);

  if (item.type === 'bottle') {
    const offer = product?.bottles?.find(candidate => candidate.offer_key === item.offer_key);
    if (!product || !offer) {
      const error = new Error('Esa botella ya no está disponible. Actualiza la página para ver las opciones actuales.');
      error.code = 'STALE_BOTTLE_OFFER';
      error.item = item;
      throw error;
    }

    return {
      product_id: product.product_id ?? product.id,
      offer_key: offer.offer_key,
      quantity: 1,
    };
  }

  const variant = getVariantForSize(product, item.size);
  const variantId = _validVariantId(variant?.variant_id);

  const stock = _selectedVariantStock(variant);

  if (!product || !variant || !variantId || variant.soldOut || stock <= 0 || item.qty > stock) {
    const error = new Error('STALE_CART_VARIANT');
    error.item = item;
    throw error;
  }

  return {
    product_id: product.product_id ?? product.id,
    variant_id: variantId,
    ml: Number(variant.size) || Number(item.size) || null,
    quantity: Number(item.qty) || 1,
    unit_price: Number(item.price) || Number(variant.price) || 0,
  };
}

/* The message the customer sends: one sentence and a folio.

   ── Why it stopped being the order ───────────────────────────────────────
   It used to rebuild the whole cart in text: every line, every presentation,
   the subtotal, each coupon, the total, the customer's name. That made the
   chat a SECOND copy of a record R Supply OS already holds — one that could
   disagree with the real order (a coupon consumed a second earlier, a bottle
   repriced), that a person had to read back by hand, and that the business
   ended up treating as the order itself.

   By the time this runs the backend record exists: priced, reserved, routed to
   Operación or Guías, with the address attached. The folio is the whole
   message because it is the only thing the order cannot say for itself — that
   this particular person is ready to go ahead.

   Three things deliberately went with it:

     • The opening emoji. It reached real customers as "Hola" followed by a
       replacement character — one byte of a four-byte codepoint surviving a
       transport that was not treating the text as UTF-8. Nothing here needs a
       character outside ASCII, so the class of bug is gone rather than patched.

     • "Quedo pendiente de disponibilidad." Availability is not pending — it
       was validated and physically reserved before this string was built.

     • The name line. R Supply OS has the customer's name; printing it back at
       them was only ever a way for a missing one to be announced.

   `folio` is required in practice. A message with no folio would be exactly the
   unrecorded order this flow exists to eliminate, and the caller never reaches
   here without one — _performCheckout returns on a failed order and never
   opens WhatsApp. The fallback is a last defence, not a supported path. */
export function buildWhatsAppMessage(folio = '') {
  const reference = String(folio || '').trim();

  return reference
    ? `Hola, quiero confirmar mi pedido ${reference}.`
    : 'Hola, quiero confirmar mi pedido.';
}

export function syncCheckoutAvailability() {
  _syncAvailability();
}

function _handleFormInput() {
  _clearError();
  _showMessage('', 'neutral');
  saveCheckoutData();
  _syncAvailability();
}

function _hydrate() {
  const saved = _load();
  Object.entries(FIELD_IDS).forEach(([key, id]) => {
    const field = document.getElementById(id);
    if (field && saved[key] !== undefined) field.value = saved[key];
  });

  /* Reveal the collapsed notes field if the customer already wrote one. */
  const notes = _field('notes');
  if (notes && notes.value.trim()) {
    notes.hidden = false;
    document.getElementById('checkout-notes-toggle')?.setAttribute('aria-expanded', 'true');
  }
}

function _load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function _syncAvailability() {
  const count = Cart.count();
  const total = Cart.total();
  const isEmpty = count === 0;
  const shipping = getShippingState(total);
  const button = document.getElementById('checkout-whatsapp');
  const form = _form();

  if (button) {
    /* The primary CTA is never gated by a minimum or by customer data.
       It is disabled only while empty or mid-submit (double-tap guard). */
    const isDisabled = isEmpty || _isSubmitting;
    button.disabled = isDisabled;
    button.setAttribute('aria-disabled', String(isDisabled));
    if (!_isSubmitting) button.textContent = getCheckoutButtonLabel({ isEmpty });
    button.dataset.state = getCheckoutButtonState({ isEmpty });
  }

  form?.classList.toggle('checkout-form--disabled', isEmpty);
  form?.classList.toggle('checkout-form--ready', !isEmpty && shipping.isEligible);

  _syncShipping(count, shipping);
}

/* Shipping eligibility badge + explanation, shown near the total. This is an
   operational status — it NEVER blocks or changes the CTA. */
function _syncShipping(count, shipping) {
  const status = document.getElementById('shipping-status');
  const badge = document.getElementById('shipping-badge');
  const note = document.getElementById('shipping-note');

  if (status) {
    if (count <= 0) {
      status.hidden = true;
    } else {
      status.hidden = false;
      status.dataset.state = shipping.isEligible ? 'eligible' : 'local';
      if (badge) badge.textContent = shipping.isEligible ? '✓ Califica para envío' : '📍 Disponible para entrega local';
      if (note) {
        note.textContent = shipping.isEligible
          ? 'Tu pedido ya califica para envío.'
          : `Los pedidos menores a $${shipping.threshold} pueden recogerse localmente sin problema.`;
      }
    }
  }

  /* Eligibility-transition analytics (deduped by the tracker). */
  if (count <= 0) {
    _prevEligible = null;
  } else if (_prevEligible !== shipping.isEligible) {
    if (shipping.isEligible) Tracker.shippingEligible(shipping);
    else Tracker.shippingNotEligible(shipping);
    _prevEligible = shipping.isEligible;
  }
}

function _showError(error) {
  _clearError();
  error.field?.classList.add('checkout-field--error');
  error.field?.setAttribute('aria-invalid', 'true');
  _showMessage(error.message, 'error');
}

function _showMessage(message, tone = 'neutral') {
  const errorEl = document.getElementById('checkout-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.dataset.tone = tone;
}

function _clearError() {
  const form = _form();
  form?.querySelectorAll('.checkout-field--error')
    .forEach(field => {
      field.classList.remove('checkout-field--error');
      field.removeAttribute('aria-invalid');
    });

  const errorEl = document.getElementById('checkout-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.dataset.tone = 'neutral';
  }

  const fallbackEl = document.getElementById('checkout-fallback');
  if (fallbackEl) {
    fallbackEl.hidden = true;
    fallbackEl.innerHTML = '';
  }
}

function _field(key) {
  return document.getElementById(FIELD_IDS[key]);
}

function _form() {
  return document.getElementById('checkout-form');
}

export function getCheckoutButtonLabel({ isEmpty = false } = {}) {
  /* One single action, one single label — it never changes (except the
     transient loading state) so the user always sees the same next step. */
  if (isEmpty) return 'Agrega una fragancia para finalizar';
  return '📲 Enviar pedido por WhatsApp';
}

export function getCheckoutButtonState({ isEmpty = false } = {}) {
  return isEmpty ? 'empty' : 'ready';
}

function _validVariantId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}

function _selectedVariantStock(variant) {
  const stock = Number(variant?.stock);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function _money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function _formatMl(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/* Field-level detail for a rejected order. The customer gets a sentence they
   can act on; this is the part a developer needs and they do not. */
function _logCheckoutError(error) {
  if (error?.status === 422 && error?.data) {
    console.error('[RDecants] order validation failed:', error.data);
  }
}
