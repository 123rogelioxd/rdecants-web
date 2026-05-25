/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js?v=1.0.3';
import { ApiClient } from '../api/client.js?v=1.0.8';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { formatPrice, isValidPrice } from '../utils/prices.js?v=1.0.3';

const STORAGE_KEY = 'rdecants_checkout_customer';
const LAST_ORDER_KEY = 'rdecants_last_web_order_folio';
const APP_VERSION = '1.0.3';

const FIELD_IDS = {
  name:  'checkout-name',
  phone: 'checkout-phone',
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
    const payload = buildWebOrderPayload(items, data);

    if (!payload.items.length || items.some(item => item.type === 'pack')) {
      throw new Error('PACK_CHECKOUT_FALLBACK');
    }

    const response = await ApiClient.createWebOrder(payload);
    const order = response?.order;

    if (!response?.ok || !order?.whatsapp_url) {
      throw new Error('No se pudo crear el pedido.');
    }

    localStorage.setItem(LAST_ORDER_KEY, order.folio || '');
    _showMessage(`Pedido ${order.folio} creado. Abriendo WhatsApp...`, 'success');
    showToast(`Pedido ${order.folio} creado`);

    const opened = window.open(order.whatsapp_url, '_blank');
    if (!opened) {
      window.location.href = order.whatsapp_url;
    }
  } catch (error) {
    const message = _readableApiError(error);
    _showMessage(`${message} Puedes intentar de nuevo o continuar por WhatsApp sin folio.`, 'error');
    showToast(message);

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
  if (data.phone && data.phone.replace(/\D/g, '').length < 8) {
    return {
      key: 'phone',
      field: _field('phone'),
      message: 'Revisa tu telefono para poder coordinar el pedido',
    };
  }

  return null;
}

export function buildWebOrderPayload(items, data) {
  return {
    customer: {
      name: data.name || null,
      phone: data.phone || null,
    },
    items: items
      .filter(item => item.type !== 'pack')
      .map(item => {
        const variantId = Number(item.variant_id);

        return {
          product_id: _orderProductId(item),
          ...(Number.isInteger(variantId) && variantId > 0 ? { variant_id: variantId } : {}),
          ml: Number(item.size) || null,
          quantity: Number(item.qty) || 1,
          unit_price: Number(item.price) || 0,
        };
      }),
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

function _orderProductId(item) {
  const productId = item.product_id ?? item.sourceId;

  if (Number.isInteger(Number(productId)) && Number(productId) > 0) {
    return Number(productId);
  }

  return item.sku || productId;
}

export function buildWhatsAppMessage(items, total, data) {
  const lines = [
    'Hola RDecants, quiero confirmar mi pedido.',
    '',
    '*Datos del cliente*',
    `Nombre: ${data.name || 'Por confirmar'}`,
    `Telefono: ${data.phone || 'Por confirmar'}`,
    '',
    '*Seleccion*',
  ];

  items.forEach(item => {
    const size = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;
    lines.push(
      `- ${item.name} | ${size} | Cantidad: ${item.qty} | Subtotal: ${formatPrice(subtotal, 'Por confirmar')}`,
      `  product_id: ${item.product_id ?? item.sourceId ?? 'Por confirmar'} | variant_id: ${item.variant_id ?? item.key ?? 'Por confirmar'}`
    );
  });

  lines.push(
    '',
    `*Total general: ${formatPrice(total, 'Por confirmar')}*`,
    'Stock sujeto a confirmacion.',
  );

  if (data.notes) {
    lines.push('', '*Notas*', data.notes);
  }

  lines.push('', 'Quedo atento para coordinar los detalles.');

  return lines.join('\n');
}

export function syncCheckoutAvailability() {
  _syncAvailability();
}

function _handleFormInput() {
  _clearError();
  _showMessage('', 'neutral');
  saveCheckoutData();
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
  const isEmpty = Cart.count() === 0;
  const button = document.getElementById('checkout-whatsapp');
  const form = _form();

  if (button) {
    button.disabled = isEmpty || _isSubmitting;
    button.setAttribute('aria-disabled', String(isEmpty || _isSubmitting));
  }

  form?.classList.toggle('checkout-form--disabled', isEmpty);
}

function _showError(error) {
  _clearError();
  error.field?.classList.add('checkout-field--error');
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
    .forEach(field => field.classList.remove('checkout-field--error'));

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
    button.disabled = Cart.count() === 0;
    if (button.dataset.label) button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

function _readableApiError(error) {
  const raw = String(error?.data?.message || error?.message || '').toLowerCase();

  if (raw.includes('pack_checkout_fallback')) {
    return 'Los packs todavia se coordinan directo por WhatsApp.';
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
