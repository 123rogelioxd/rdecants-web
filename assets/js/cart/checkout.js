/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js?v=1.0.15';
import { ApiClient } from '../api/client.js?v=1.0.15';
import { CatalogProvider } from '../providers/catalog.js?v=1.0.15';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { formatPrice, getVariantForSize } from '../utils/prices.js?v=1.0.15';
import { getCartMomentum } from './momentum.js?v=1.0.15';

const STORAGE_KEY = 'rdecants_checkout_customer';
const LAST_ORDER_KEY = 'rdecants_last_web_order_folio';
const APP_VERSION = '1.0.5';

const FIELD_IDS = {
  name:  'checkout-name',
  phone: 'checkout-phone',
  notes: 'checkout-notes',
};

const MIN_NAME_CHARS = 2;

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
  _field('name')?.addEventListener('blur', () => _validateNameForDisplay({ force: true }));
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
  const items = Cart.items;

  if (!items.length) {
    const message = 'Agrega una fragancia antes de finalizar por WhatsApp';
    _showMessage(message, 'error');
    showToast(message);
    _syncAvailability();
    return;
  }

  if (_isSubmitting) return;

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

  _isSubmitting = true;
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
    _showMessage('Listo, abriremos WhatsApp para finalizar tu pedido.', 'success');
    showToast('Listo, abriremos WhatsApp para finalizar tu pedido.');

    const messageText = buildWhatsAppMessage(checkoutItems, checkoutTotal, data, order.folio);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`;
    Cart.clear();

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
      const messageText = buildWhatsAppMessage(items, total, data);
      window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageText)}`, '_blank');
    }
  } finally {
    _isSubmitting = false;
    _setButtonLoading(button, false);
  }
}

export function readCheckoutData() {
  return {
    name:  _field('name')?.value.trim() || '',
    phone: _field('phone')?.value.trim() || '',
    notes: _field('notes')?.value.trim() || '',
  };
}

export function saveCheckoutData(data = readCheckoutData()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function validateCheckout(data) {
  if (!_isValidCustomerName(data.name)) {
    return {
      key: 'name',
      field: _field('name'),
      message: 'Ingresa tu nombre para continuar.',
    };
  }

  if (data.phone && data.phone.replace(/\D/g, '').length < 8) {
    return {
      key: 'phone',
      field: _field('phone'),
      message: 'Revisa tu telefono para poder coordinar el pedido',
    };
  }

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
    unit_price: Number(variant.price) || Number(item.price) || 0,
  };
}

export function buildWhatsAppMessage(items, total, data, folio = '') {
  const lines = [
    'Bienvenido a RDECANTS, tu pedido es:',
    '',
  ];

  if (folio) {
    lines.push(`Folio: ${folio}`);
  } else {
    lines.push('Folio: Por confirmar');
  }

  lines.push(`Nombre: ${data.name}`);

  const isSingleUnit = items.length === 1 && (Number(items[0]?.qty) || 1) === 1;

  if (isSingleUnit) {
    const item = items[0];
    lines.push(
      `Producto: ${item.name}`,
      `Casa: ${item.house || 'Por confirmar'}`,
      `Presentación: ${_presentationText(item)}`,
      `Solo a: ${formatPrice(item.price, 'Por confirmar')}`,
    );
  } else {
    lines.push('');
    items.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.name}`,
        `Casa: ${item.house || 'Por confirmar'}`,
        `Presentación: ${_presentationText(item)}`,
        `Solo a: ${formatPrice(item.price, 'Por confirmar')}`,
        `Cantidad: ${Number(item.qty) || 1}`,
      );

      if (index < items.length - 1) lines.push('');
    });

    lines.push('', `Total: ${formatPrice(total, 'Por confirmar')}`);
  }

  if (data.notes) {
    lines.push('', 'Notas:', data.notes);
  }

  lines.push('', 'Hola, quiero finalizar mi pedido.');

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
  _validateNameForDisplay();
}

function _hydrate() {
  const saved = _load();
  Object.entries(FIELD_IDS).forEach(([key, id]) => {
    const field = document.getElementById(id);
    if (field && saved[key] !== undefined) field.value = saved[key];
  });
}

function _load() {
  try {
    return {
      delivery: 'local',
      payment:  'transfer',
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
    };
  } catch {
    return { delivery: 'local', payment: 'transfer' };
  }
}

function _syncAvailability() {
  const count = Cart.count();
  const isEmpty = count === 0;
  const hasValidName = _isValidCustomerName(readCheckoutData().name);
  const button = document.getElementById('checkout-whatsapp');
  const form = _form();

  if (button) {
    const isDisabled = isEmpty || !hasValidName || _isSubmitting;
    button.disabled = isDisabled;
    button.setAttribute('aria-disabled', String(isDisabled));
  }

  form?.classList.toggle('checkout-form--disabled', isEmpty);
  form?.classList.toggle('checkout-form--ready', !isEmpty && hasValidName);

  _syncMomentum(count, hasValidName);
}

function _syncMomentum(count, hasValidName) {
  const el = document.getElementById('checkout-momentum');
  if (!el) return;

  const momentum = getCartMomentum({ count, hasValidName });
  el.textContent = momentum.message;
  el.dataset.key = momentum.key;
  el.hidden = !momentum.message;
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

function _isValidCustomerName(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').length >= MIN_NAME_CHARS;
}

function _validateNameForDisplay({ force = false } = {}) {
  if (Cart.count() === 0) return;

  const field = _field('name');
  if (!field) return;

  const value = field.value;
  const hasAnyInput = value.length > 0;
  if (_isValidCustomerName(value)) return;

  if (force || hasAnyInput) {
    _showError({
      key: 'name',
      field,
      message: 'Ingresa tu nombre para continuar.',
    });
  }
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
