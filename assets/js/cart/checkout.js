/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js';
import { Discount }  from './discount.js';
import { Attribution } from './attribution.js';
import { ApiClient } from '../api/client.js';
import { CatalogProvider } from '../providers/catalog.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { formatPrice, getVariantForSize } from '../utils/prices.js';
import { getShippingState } from './momentum.js';

const STORAGE_KEY = 'rdecants_checkout_customer';
const LAST_ORDER_KEY = 'rdecants_last_web_order_folio';
const LAST_FIRED_KEY = 'rdecants_checkout_last_fired_at';
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

  try {
    await _performCheckout(phoneNumber);
  } finally {
    _isSubmitting = false;
    _syncAvailability();
  }
}

/* WhatsApp-first: the WhatsApp window is opened SYNCHRONOUSLY inside the click
   gesture (no awaits before it) so the popup isn't blocked and a backend outage
   can never block the sale. The system order is created afterwards, async. */
function _performCheckout(phoneNumber) {
  const items = Cart.items;

  if (!items.length) {
    const message = 'Agrega una fragancia antes de finalizar por WhatsApp';
    _showMessage(message, 'error');
    showToast(message);
    _syncAvailability();
    return;
  }

  const availabilityError = Cart.availabilityError();
  if (availabilityError) {
    const available = _formatMl(availabilityError.availableMl);
    const message = `Ajusta tu carrito: esta fragancia tiene ${available}ml disponibles en total.`;
    _showMessage(message, 'error');
    showToast(message);
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

  const messageText = buildWhatsAppMessage(orderItems, total, data, '', discount);
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`;

  /* 1) WhatsApp first. */
  _markFired();
  const opened = window.open(whatsappUrl, '_blank');

  if (!opened) {
    /* Popup blocked — keep the cart, discount AND attribution intact, offer a
       manual link, still try to record the order in the background. No lost
       carts, no lost campaign credit. */
    _showManualWhatsApp(whatsappUrl);
    _createOrderInBackground(orderItems, data, total, discount, attribution);
    return;
  }

  /* 2) Launch succeeded → the customer's job is done. Clear the cart, the
     applied discount AND the campaign attribution (all belong to the order we
     just handed off), then record the order in the background. */
  _showMessage('Listo, te llevamos a WhatsApp para finalizar tu pedido.', 'success');
  showToast('Listo, abrimos WhatsApp para finalizar tu pedido.');
  Cart.clear();
  Discount.clear();
  Attribution.clear();
  _createOrderInBackground(orderItems, data, total, discount, attribution);
}

/* Records the system order WITHOUT ever blocking the customer or showing them
   an error. On failure: log + emit background_order_failure (the admin-notify
   path). The customer never sees a system error. */
async function _createOrderInBackground(items, data, total, discount = null, attribution = {}) {
  try {
    /* A pure-pack order used to be dropped here — the old packs were a
       hardcoded list with no resolvable products, so there was nothing to
       send and the sale was "coordinated in chat". Packs are now real,
       server-resolved products with a server-derived discount, so a cart of
       nothing but packs is an ordinary order. */
    const hasSomethingToOrder = items.some(item => item.type !== 'pack')
      || Cart.packPurchases().length > 0;
    if (!hasSomethingToOrder) return;

    /* Forward ONLY the code + campaign attribution — R Supply OS validates,
       resolves the campaign and recalculates. We never send the previewed
       amount/total as truth. */
    const couponCodes = Array.isArray(discount)
      ? discount.map(d => d?.normalizedCode || d?.code).filter(Boolean)
      : (discount?.code ? [discount.code] : []);
    const payload = await buildWebOrderPayload(items, data, { couponCodes, attribution });
    if (!payload.items.length && !payload.packs?.length) return;

    const response = await ApiClient.createWebOrder(payload);
    const order = response?.order;
    if (!response?.ok || !order?.folio) throw new Error('No se pudo crear el pedido en sistema.');

    localStorage.setItem(LAST_ORDER_KEY, order.folio || '');
    /* If the backend rejected/adjusted the discount, trust its response — the
       preview was only ever an estimate. Recorded for observability. */
    const finalTotal = _money(order.total) || total;
    Tracker.checkoutCompleted(items, finalTotal, { folio: order.folio });
    Tracker.backgroundOrderSuccess(order.folio, finalTotal);
  } catch (error) {
    _logCheckoutError(error);
    Tracker.backgroundOrderFailure(String(error?.message || 'error'), total);
  }
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

export function buildWhatsAppMessage(items, total, data, folio = '', discount = null) {
  const lines = [
    'Hola 👋',
    '',
    items.length === 1 ? 'Me interesa este decant:' : 'Me interesan estos decants:',
  ];

  items.forEach(item => {
    lines.push(`• ${_whatsAppItemLine(item)}`);
  });

  /* `total` is the SUBTOTAL (Cart.total()). With one or two valid previews we
     show the per-code breakdown; the final total is only an estimate — R Supply
     OS confirms it. `discount` may be a single object (legacy) or a list. */
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
  return item.size ? `${item.size}ml` : 'Por confirmar';
}

function _logCheckoutError(error) {
  if (error?.status === 422 && error?.data) {
    console.error('[RDecants] background order validation failed:', error.data);
  }
}
