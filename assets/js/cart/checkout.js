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
import { formatPrice, getVariantForSize } from '../utils/prices.js';
import { getShippingState } from './momentum.js';

const STORAGE_KEY = 'rdecants_checkout_customer';
const LAST_ORDER_KEY = 'rdecants_last_web_order_folio';
const LAST_FIRED_KEY = 'rdecants_checkout_last_fired_at';
/* Survives reloads within the tab so a refresh mid-submit still replays
   the same attempt instead of creating a second order. */
const ATTEMPT_KEY = 'rdecants_checkout_attempt_key';

/* Customer-facing names for the three delivery modes R Supply OS knows. */
const DELIVERY_LABELS = {
  pickup: 'Recoger en tienda',
  local: 'Entrega local',
  national: 'Envío',
};
const APP_VERSION = '1.0.5';

/* Debounce window between consecutive WhatsApp checkout submissions.
   Prevents double-taps and bfcache restores from re-firing the order. */
const CHECKOUT_LOCK_MS = 4000;

const FIELD_IDS = {
  name:  'checkout-name',
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
  const messageText = buildWhatsAppMessage(orderItems, total, data, recordedOrder?.folio || '', discount, recordedOrder);
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

export function readCheckoutData() {
  return {
    name:  _field('name')?.value.trim() || '',
    notes: _field('notes')?.value.trim() || '',
  };
}

export function saveCheckoutData(data = readCheckoutData()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

/* `order` is the Web Order R Supply OS actually created, when there is one. It
   is the pricing authority; `total` + `discount` are the last PREVIEW and are
   used only when no order has been created yet (the decant path, where the
   order is written in the background after the handoff). */
export function buildWhatsAppMessage(items, total, data, folio = '', discount = null, order = null) {
  const hasBottle = items.some(item => item.type === 'bottle');
  const hasDecant = items.some(item => item.type !== 'bottle' && item.type !== 'pack');
  const lines = [
    'Hola 👋',
    '',
    items.length === 1
      ? (hasBottle ? 'Me interesa esta botella:' : 'Me interesa este decant:')
      : (hasBottle && hasDecant ? 'Me interesan estos perfumes:' : hasBottle ? 'Me interesan estas botellas:' : 'Me interesan estos decants:'),
  ];

  items.forEach(item => {
    lines.push(`• ${_whatsAppItemLine(item)}`);
  });

  const confirmed = _orderPricing(order);

  if (confirmed) {
    lines.push(...confirmed);
  } else {
    /* No order yet. `total` is the SUBTOTAL (Cart.total()) and the amounts are
       the last valid PREVIEW; R Supply OS confirms them when it writes the
       order. `discount` may be a single object (legacy) or a list. */
    const applied = _normalizeDiscountList(discount);
    const totalDiscount = applied.reduce((sum, d) => sum + _money(d.amount), 0);

    if (applied.length && totalDiscount > 0) {
      /* One code: honor its preview total. Two codes: subtotal − sum. */
      const finalTotal = (applied.length === 1 && _money(applied[0].total) > 0)
        ? _money(applied[0].total)
        : Math.max(0, _money(total) - totalDiscount);
      lines.push('');
      lines.push(`Subtotal: ${formatPrice(total, 'Por confirmar')}`);
      applied.forEach(d => {
        lines.push(`Código: ${d.code}`);
        lines.push(`Descuento: -${formatPrice(_money(d.amount), '$0')}`);
      });
      if (applied.length > 1) {
        lines.push(`Descuento total: -${formatPrice(totalDiscount, '$0')}`);
      }
      lines.push(`Total: ${formatPrice(finalTotal, 'Por confirmar')}`);
    } else {
      lines.push('', `Total: ${formatPrice(total, 'Por confirmar')}`);
    }
  }

  /* ── The reference that makes this message unnecessary to decode ─────────
     R Supply OS already holds every line, price, discount and address under
     this folio. The business reads the folio and opens the order; it never
     rebuilds the cart from the text above, which is there so the CUSTOMER has
     a record of what they asked for.

     Phrased as a sentence rather than a "Folio:" field on purpose — this is a
     message a person sends, not a form they fill in. */
  if (folio) {
    lines.push('', `Mi pedido es ${folio}.`);
  }

  if (data.name) {
    lines.push('', `Mi nombre es ${data.name}.`);
  }

  if (data.notes) {
    lines.push('', 'Notas:', data.notes);
  }

  lines.push('', 'Quedo pendiente de disponibilidad y detalles de compra.');

  return lines.join('\n');
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
  if (error.key === 'name') {
    _showNameMessage(error.message, 'error');
  }
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

  _showNameMessage('', 'neutral');
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

function _showNameMessage(message, tone = 'neutral') {
  const el = document.getElementById('checkout-name-error');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
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

/* Normalize the discount argument to a list of { code, amount, total } with a
   positive amount. Accepts a single object (legacy) or an array of applied
   coupons — so callers and the WhatsApp message support one or two codes. */
/* The money block for an order R Supply OS has already created, or null when
   there is no order to read.

   Every figure is the backend's: the subtotal it resolved, the per-coupon
   amounts IT decided (a scoped code's amount is a share of the cart, and only
   the backend knows which share), and the total it will charge. Nothing here
   recomputes a percentage — that is the whole reason the block exists.

   `discount` on the order is the TOTAL saving and can exceed the coupons when a
   pack is involved; the extra line makes the arithmetic add up on screen
   instead of leaving the customer with a total they cannot reconcile. */
function _orderPricing(order) {
  if (!order) return null;

  const subtotal = _money(order.subtotal);
  const total = _money(order.total);

  /* Only an order with no usable numbers at all falls back to the preview. */
  if (subtotal <= 0 && total <= 0) return null;

  const totalDiscount = _money(order.discount ?? order.total_discount);

  /* An order that came back with NO discount is the answer, not a reason to go
     looking for a better one. This is the case that matters most: the customer
     previewed a one-use code, somebody else redeemed it a second later, and the
     order was written at full price. Falling through to the preview here would
     hand them a WhatsApp message promising a discount the order does not have. */
  if (totalDiscount <= 0) {
    return ['', `Total: ${formatPrice(total || subtotal, 'Por confirmar')}`]
      .concat(_orderDelivery(order));
  }

  const coupons = (Array.isArray(order.coupons) ? order.coupons : [])
    .filter(c => c && c.code && _money(c.discount_amount ?? c.amount) > 0);

  const lines = ['', `Subtotal: ${formatPrice(subtotal, 'Por confirmar')}`];

  coupons.forEach(c => {
    lines.push(`Código: ${c.code}`);
    lines.push(`Descuento: -${formatPrice(_money(c.discount_amount ?? c.amount), '$0')}`);
  });

  const couponTotal = coupons.reduce((sum, c) => sum + _money(c.discount_amount ?? c.amount), 0);
  if (coupons.length !== 1 || couponTotal !== totalDiscount) {
    lines.push(`Descuento total: -${formatPrice(totalDiscount, '$0')}`);
  }

  lines.push(`Total: ${formatPrice(total, 'Por confirmar')}`);

  return lines.concat(_orderDelivery(order));
}

/* The delivery half of the money, appended to whichever pricing branch ran.

   Only ever built from the ORDER, never from a preview: a shipping figure the
   server did not write is a figure nobody has to honour.

   The unpriced case says so in words instead of showing $0. An order awaiting a
   manual quote genuinely has no final total, and a WhatsApp message that
   printed one would be the customer's evidence for a price we never agreed. */
function _orderDelivery(order) {
  const delivery = order?.delivery;
  if (!delivery || !delivery.mode) return [];

  const label = DELIVERY_LABELS[delivery.mode] || 'Entrega';

  if (delivery.requires_manual_quote || delivery.shipping_cost === null || delivery.shipping_cost === undefined) {
    return ['', `${label}: por confirmar`];
  }

  const shipping = _money(delivery.shipping_cost);
  const lines = ['', `${label}: ${shipping > 0 ? formatPrice(shipping, '$0') : 'sin costo'}`];

  const grandTotal = _money(order.grand_total);
  if (grandTotal > 0) lines.push(`Total con envío: ${formatPrice(grandTotal, 'Por confirmar')}`);

  return lines;
}

function _normalizeDiscountList(discount) {
  const list = Array.isArray(discount) ? discount : (discount ? [discount] : []);
  return list
    .filter(d => d && (d.code || d.normalizedCode) && _money(d.amount) > 0)
    .map(d => ({ code: d.normalizedCode || d.code, amount: _money(d.amount), total: _money(d.total) }));
}

function _whatsAppItemLine(item) {
  const qty = Number(item.qty) || 1;
  const quantityText = qty > 1 ? ` — x${qty}` : '';

  /* A pack is one line plus its contents, indented. The customer is telling
     Roger what is in the box, and "Pack Todo Terreno — 3 × 3 ml — $399" on its
     own would leave him asking which three. The saving is stated here because
     the price above it is already the discounted one, and an unexplained $399
     against three decants that add to $450 reads as an error. */
  if (item.type === 'pack') {
    const header = `${_humanizeProductText(item.name)} — ${item.size} — ${_lineItemPrice(item.price)}${quantityText}`;
    const contents = (item.items ?? [])
      .map(entry => `\n   · ${_whatsAppProductName(entry)}`)
      .join('');
    const saving = Number(item.savings) > 0
      ? `\n   (antes ${_lineItemPrice(item.normal_price)}, ahorras ${_lineItemPrice(item.savings)})`
      : '';

    return `${header}${contents}${saving}`;
  }

  if (item.type === 'bottle') {
    return `${_whatsAppProductName(item)} — Botella ${item.offer_label || item.condition_label || ''} — ${_lineItemPrice(item.price)}`;
  }

  return `${_whatsAppProductName(item)} — ${_presentationText(item)} — ${_lineItemPrice(item.price)}${quantityText}`;
}

function _whatsAppProductName(item) {
  const name = _humanizeProductText(item.name);
  const house = _humanizeProductText(item.house);

  if (!house || house === 'Pack') return name || 'Producto por confirmar';
  if (!name) return house;
  if (name.toLowerCase().includes(house.toLowerCase())) return name;
  if (name.trim().split(/\s+/).length === 1) return `${house} ${name}`;

  return name;
}

function _lineItemPrice(value) {
  return formatPrice(value, 'Por confirmar').replace(/\s*MXN$/, '');
}

function _humanizeProductText(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text !== text.toUpperCase()) return text;

  return text
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function _presentationText(item) {
  if (item.type === 'pack') return 'Pack';
  if (item.type === 'bottle') return `Botella ${item.offer_label || item.condition_label || ''}`.trim();
  return item.size ? `${item.size}ml` : 'Por confirmar';
}

/* Field-level detail for a rejected order. The customer gets a sentence they
   can act on; this is the part a developer needs and they do not. */
function _logCheckoutError(error) {
  if (error?.status === 422 && error?.data) {
    console.error('[RDecants] order validation failed:', error.data);
  }
}
