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
import { EventBus } from '../core/events.js';
import { Account } from '../account/account.js';

const STORAGE_KEY = 'rdecants_checkout_customer';
try { localStorage.removeItem(STORAGE_KEY); } catch { /* legacy private copy unavailable */ }
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

/** Registers a WebOrder only. WhatsApp is a separate, explicit next action. */
export async function registerWebOrder() {
  if (_isSubmitting || _recentlyFired()) return null;
  _isSubmitting = true;
  _syncAvailability();
  try {
    const items = Cart.items;
    if (!items.length) throw new Error('Agrega una fragancia antes de continuar.');
    const availability = Cart.availabilityError();
    if (availability) throw new Error(`Ajusta tu carrito: esta fragancia tiene ${_formatMl(availability.availableMl)} ml disponibles en total.`);
    if (!Delivery.mode || !Delivery.isReady()) throw new Error(_deliveryBlockedMessage());
    const validation = validateCheckout();
    if (validation) throw new Error(validation.message);

    const data = readCheckoutData();
    saveCheckoutData(data);
    const address = Delivery.address;
    const total = Cart.total();
    const attribution = Attribution.forOrder();
    if (Object.keys(attribution).length) Tracker.campaignCheckoutAttributed(Attribution.forTracking());
    let order;
    try {
      order = await _submitWebOrder(items, data, total, Discount.applied, attribution);
    } catch (error) {
      const windowRejected = isDeliveryPreferenceError(error);
      if (windowRejected) {
        Delivery.rejectPreference();
        await Delivery.refreshWindows();
      } else {
        Delivery.clearQuote();
      }
      _logCheckoutError(error);
      Tracker.backgroundOrderFailure(String(error?.message || 'order_failed'), total);
      const visibleError = new Error(windowRejected
        ? 'Ese horario ya no está disponible. Elige otro horario o coordínalo por WhatsApp. Tu carrito sigue aquí.'
        : _customerOrderError(error));
      visibleError.code = windowRejected ? 'DELIVERY_PREFERENCE_UNAVAILABLE' : error.code;
      throw visibleError;
    }
    _markFired();
    Cart.clear();
    Discount.clear();
    Attribution.clear();
    Delivery.reset();
    if (_field('notes')) _field('notes').value = '';
    Account._reset();
    _clearCheckoutAttempt();
    Tracker.emit('web_order_created', { folio: order.folio, total: order.grand_total });
    return { order, items, address, notes: data.notes };
  } finally {
    _isSubmitting = false;
    _syncAvailability();
  }
}

export function isDeliveryPreferenceError(error) {
  return error?.status === 422 && Object.keys(error?.data?.errors ?? {})
    .some(key => key === 'delivery.preference' || key.startsWith('delivery.preference.'));
}

/* Legacy bridge: opening checkout never bypasses delivery and review. */
export function sendCheckoutWhatsApp() {
  EventBus.emit('checkout:open');
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

  try { localStorage.setItem(LAST_ORDER_KEY, order.folio || ''); } catch { /* registration already succeeded */ }
  const finalTotal = Number.isFinite(Number(order.total)) ? Number(order.total) : total;
  Tracker.checkoutCompleted(items, finalTotal, { folio: order.folio });
  Tracker.backgroundOrderSuccess(order.folio, finalTotal);
  return order;
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
  /* Notes can contain personal delivery information too. Keep them in the
     mounted form and remove the legacy browser copy. */
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

export function validateCheckout() {
  if (!Delivery.mode) return { message: 'Elige cómo recibir tu pedido.', field: 'mode' };
  if (Delivery.preferenceNeedsReselection) return { message: 'Ese horario ya no está disponible. Elige otro o coordínalo por WhatsApp.', field: 'preference' };
  const missing = Delivery.missingAddressFields();
  if (missing.length) return { message: 'Completa los datos de entrega para continuar.', field: missing[0] };
  const address = Delivery.address;
  if (Delivery.mode !== 'pickup' && !/^\d{5}$/.test(address.postal_code || '')) {
    return { message: 'Escribe un código postal de 5 dígitos.', field: 'postal_code' };
  }
  if (Delivery.mode !== 'pickup' && !/^(?:52)?\d{10}$/.test((address.phone || '').replace(/[^\d]/g, ''))) {
    return { message: 'Escribe un teléfono de 10 dígitos.', field: 'phone' };
  }
  if (!Delivery.isReady()) return { message: 'Calcula la entrega para revisar tu pedido.', field: 'quote' };
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

/* The WhatsApp handoff is a reference, not a second order record.

   R Supply OS remains authoritative for prices, discounts, payment, delivery
   cost and status. The message carries only:
     • the folio;
     • the exact submitted cart snapshot (name, presentation, quantity);
     • the requested delivery window, when present.

   `registerWebOrder()` captures `items` before clearing the cart and only returns
   after the server accepts the order, so these product lines identify the order
   without making WhatsApp a second pricing authority.

   Everything is reduced to plain ASCII because this channel previously mangled
   multi-byte characters. */
function _asciiText(value) {
  return String(value ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _orderLines(items = []) {
  if (!Array.isArray(items)) return [];

  return items.flatMap(item => {
    const rawName = _asciiText(item?.name);
    if (!rawName) return [];

    const house = _asciiText(item?.house);
    const name = house && !rawName.toLowerCase().startsWith(house.toLowerCase())
      ? `${house} ${rawName}`
      : rawName;

    let presentation = '';
    if (item?.type === 'bottle') {
      const bottle = _asciiText(item?.offer_label || item?.condition_label || item?.size || 'Botella');
      presentation = /^botella\b/i.test(bottle) ? bottle : `Botella - ${bottle}`;
    } else if (item?.type === 'pack') {
      presentation = _asciiText(item?.size || 'Pack');
    } else {
      const size = _asciiText(item?.size);
      presentation = size ? (/\bml\b/i.test(size) ? size : `${size} ml`) : '';
    }

    const qty = Math.max(1, Number.parseInt(item?.qty, 10) || 1);
    return [`- ${name}${presentation ? ` - ${presentation}` : ''} x${qty}`];
  });
}

export function buildWhatsAppMessage(folio = '', preference = null, items = []) {
  const opening = 'Hola, quiero confirmar mi pedido de RDECANTS.';

  const blocks = [opening];
  const orderLines = _orderLines(items);
  if (orderLines.length) blocks.push(`Pedido:\n${orderLines.join('\n')}`);

  const line = _preferenceLine(preference);
  if (line) blocks.push(line);

  return blocks.join('\n');
}

/* The backend builds the message from the accepted order, canonical prices
   and requested window. Never compose another order in the browser. */
export function orderWhatsAppUrl(order) {
  try {
    const url = new URL(order?.whatsapp_url);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || url.username || url.password || url.port || !/^\/\d{8,15}$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

/* "Horario preferido: 10/09, 4 - 7 pm." — or nothing.

   Built only from `date` and `window_label` as the server stored them. A
   missing or malformed either means no line at all: the folio is what the
   message is for, and a half-built sentence about timing helps nobody. */
function _preferenceLine(preference) {
  const date = String(preference?.date ?? '').trim();
  const label = String(preference?.window_label ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return '';

  const [, month, day] = date.split('-');

  return `Horario preferido: ${day}/${month}, ${label}.`;
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
  saveCheckoutData();
  return {};
}

function _syncAvailability() {
  const isEmpty = Cart.count() === 0;
  const button = document.getElementById('cart-continue');
  if (button) {
    button.disabled = isEmpty || _isSubmitting;
    button.setAttribute('aria-disabled', String(button.disabled));
    button.textContent = getCheckoutButtonLabel({ isEmpty });
    button.dataset.state = getCheckoutButtonState({ isEmpty });
  }
  _form()?.classList.toggle('checkout-form--disabled', isEmpty);
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
  return isEmpty ? 'Agrega una fragancia para continuar' : 'Continuar a entrega →';
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
    console.error('[RDecants] order validation failed:', { fields: Object.keys(error.data.errors ?? {}) });
  }
}
