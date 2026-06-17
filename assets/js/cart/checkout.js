/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js?v=2026.06.04.2';
import { ApiClient } from '../api/client.js?v=2026.06.04.2';
import { CatalogProvider } from '../providers/catalog.js?v=2026.06.04.2';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { formatPrice, getVariantForSize } from '../utils/prices.js?v=2026.06.04.2';
import { getCartMomentum } from './momentum.js?v=2026.06.04.2';

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
let _wasBelowMinimum = false;

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

async function _performCheckout(phoneNumber) {
  const items = Cart.items;

  if (!items.length) {
    const message = 'Agrega una fragancia antes de finalizar por WhatsApp';
    _showMessage(message, 'error');
    showToast(message);
    _syncAvailability();
    return;
  }

  /* No minimum-order gate and no required customer data — the customer can
     always reach WhatsApp. Any remaining validation is soft and non-blocking. */
  const data = readCheckoutData();
  const error = validateCheckout(data);

  if (error) {
    _showError(error);
    showToast(error.message);
    error.field?.focus();
    return;
  }

  saveCheckoutData(data);

  const total = Cart.total();
  const button = document.getElementById('checkout-whatsapp');
  _setButtonLoading(button, true, 'Creando pedido...');
  Tracker.checkoutWhatsappClicked(items, total, {
    phone: Boolean(data.phone),
  });

  _clearError();

  try {
    if (items.some(item => item.type === 'pack')) {
      throw new Error('PACK_CHECKOUT_FALLBACK');
    }

    const reconciliation = await Cart.reconcile({ silent: false });
    if (reconciliation.removed.length) {
      throw new Error('STALE_CART_VARIANT');
    }

    const checkoutItems = Cart.items;
    const checkoutTotal = Cart.total();
    const payload = await buildWebOrderPayload(checkoutItems, data);

    if (!payload.items.length) {
      throw new Error('PACK_CHECKOUT_FALLBACK');
    }

    const response = await ApiClient.createWebOrder(payload);
    const order = response?.order;

    if (!response?.ok || !order?.folio) {
      throw new Error('No se pudo crear el pedido.');
    }

    localStorage.setItem(LAST_ORDER_KEY, order.folio || '');
    Tracker.checkoutCompleted(Cart.items, checkoutTotal, { folio: order.folio });
    _showMessage('Listo, abriremos WhatsApp para finalizar tu pedido.', 'success');
    showToast('Listo, abriremos WhatsApp para finalizar tu pedido.');

    const messageText = buildWhatsAppMessage(checkoutItems, checkoutTotal, data, order.folio);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`;
    Cart.clear();

    _markFired();
    const opened = window.open(whatsappUrl, '_blank');
    if (!opened) {
      window.location.href = whatsappUrl;
    }
  } catch (error) {
    _logCheckoutError(error);
    const message = _readableApiError(error);
    const canFallback = _canFallbackToWhatsApp(error);
    _showMessage(canFallback ? `${message} Puedes intentar de nuevo o continuar por WhatsApp sin folio.` : message, 'error');
    showToast(message);

    if (!canFallback) return;

    const fallback = confirm(`${message}\n\nNo se creo el pedido en sistema. ¿Abrir WhatsApp sin folio?`);
    if (fallback) {
      _markFired();
      const messageText = buildWhatsAppMessage(items, total, data);
      window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`, '_blank');
      Cart.clear();
    }
  } finally {
    _setButtonLoading(button, false);
  }
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

export async function buildWebOrderPayload(items, data) {
  const orderItems = [];

  for (const item of items.filter(item => item.type !== 'pack')) {
    orderItems.push(await _buildOrderItem(item));
  }

  return {
    customer: {
      name: data.name || null,
      phone: data.phone || null,
    },
    items: orderItems,
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

export function buildWhatsAppMessage(items, total, data, folio = '') {
  const lines = [
    'Hola 👋',
    '',
    items.length === 1 ? 'Me interesa este decant:' : 'Me interesan estos decants:',
  ];

  items.forEach(item => {
    lines.push(`• ${_whatsAppItemLine(item)}`);
  });

  lines.push('', `Total: ${formatPrice(total, 'Por confirmar')}`);

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
  const minimum = getCartMomentum({ count, total }).minimum;
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
  form?.classList.toggle('checkout-form--ready', !isEmpty && minimum.isComplete);

  /* Keep the "added a second decant" conversion signal for analytics — it no
     longer gates anything, it just measures whether the nudge worked. */
  if (!isEmpty && _wasBelowMinimum && minimum.isComplete) {
    Tracker.cartMinimumPromptConverted(minimum);
  }
  _wasBelowMinimum = !isEmpty && !minimum.isComplete;

  _syncMomentum(count, total);
}

function _syncMomentum(count, total) {
  const el = document.getElementById('checkout-momentum');
  if (!el) return;

  const momentum = getCartMomentum({ count, total });
  el.innerHTML = momentum.message;
  el.dataset.key = momentum.key;
  el.hidden = !momentum.message;
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

  _showNameMessage('', 'neutral');
}

function _field(key) {
  return document.getElementById(FIELD_IDS[key]);
}

function _form() {
  return document.getElementById('checkout-form');
}

function _setButtonLoading(button, isLoading, label = '') {
  if (!button) return;
  if (isLoading) {
    button.dataset.label = button.textContent.trim();
    button.classList.add('is-loading');
    button.disabled = true;
    if (label) button.textContent = label;
  } else {
    button.classList.remove('is-loading');
    if (button.dataset.label) button.textContent = button.dataset.label;
    delete button.dataset.label;
    _syncAvailability();
  }
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

function _readableApiError(error) {
  const raw = `${error?.data?.message || ''} ${error?.message || ''} ${JSON.stringify(error?.data?.errors || {})}`.toLowerCase();

  if (raw.includes('pack_checkout_fallback')) {
    return 'Los packs todavia se coordinan directo por WhatsApp.';
  }

  if (raw.includes('stale_cart_variant')) {
    return 'Actualizamos tu carrito porque una variante ya no esta disponible. Revisa tu seleccion e intenta de nuevo.';
  }

  if (raw.includes('stock')) {
    return 'Este producto ya no tiene stock disponible. Actualiza el carrito e intenta de nuevo.';
  }

  if (raw.includes('inactive') || raw.includes('inactivo')) {
    return 'Uno de los productos ya no esta disponible. Actualiza el carrito e intenta de nuevo.';
  }

  if (raw.includes('variant') || raw.includes('variante')) {
    return 'No pudimos confirmar una variante del carrito. Actualiza el carrito e intenta de nuevo.';
  }

  if (raw.includes('cart is empty') || raw.includes('items')) {
    return 'Agrega una fragancia antes de finalizar por WhatsApp.';
  }

  return 'No pudimos crear el pedido en sistema.';
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

function _whatsAppItemLine(item) {
  const qty = Number(item.qty) || 1;
  const quantityText = qty > 1 ? ` — x${qty}` : '';
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
    console.error('[RDecants] checkout validation failed:', error.data);
  }
}

function _canFallbackToWhatsApp(error) {
  const raw = String(error?.message || '').toLowerCase();
  return !raw.includes('stale_cart_variant');
}
