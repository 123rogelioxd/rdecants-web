/* =============================================================
   RDECANTS - CHECKOUT WHATSAPP
   Customer data, validation, persistence and premium WA message.
   ============================================================= */

import { Cart }      from './cart.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { formatPrice, isValidPrice } from '../utils/prices.js';

const STORAGE_KEY = 'rdecants_checkout_customer';

const FIELD_IDS = {
  name:     'checkout-name',
  location: 'checkout-location',
  delivery: 'checkout-delivery',
  payment:  'checkout-payment',
  notes:    'checkout-notes',
};

const DELIVERY_LABELS = {
  local:    'Entrega local',
  national: 'Envio nacional',
};

const PAYMENT_LABELS = {
  cash:     'Efectivo',
  transfer: 'Transferencia',
  oxxo:     'Deposito OXXO',
};

let _startedSignature = '';

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

export function sendCheckoutWhatsApp(phoneNumber) {
  const items = Cart.items;

  if (!items.length) {
    showToast('Agrega una fragancia antes de confirmar por WhatsApp');
    _syncAvailability();
    return;
  }

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
  _setButtonLoading(button, true, 'Abriendo WhatsApp...');
  Tracker.checkoutWhatsappClicked(items, total, {
    delivery: data.delivery,
    payment:  data.payment,
  });

  const message = buildWhatsAppMessage(items, total, data);
  window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
  setTimeout(() => _setButtonLoading(button, false), 700);
}

export function readCheckoutData() {
  return {
    name:     _field('name')?.value.trim() || '',
    location: _field('location')?.value.trim() || '',
    delivery: _field('delivery')?.value || 'local',
    payment:  _field('payment')?.value || 'transfer',
    notes:    _field('notes')?.value.trim() || '',
  };
}

export function saveCheckoutData(data = readCheckoutData()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function validateCheckout(data) {
  if (!data.name) {
    return {
      key: 'name',
      field: _field('name'),
      message: 'Tu nombre es necesario para preparar el pedido',
    };
  }

  if (data.delivery === 'national' && !data.location) {
    return {
      key: 'location',
      field: _field('location'),
      message: 'Agrega ciudad y estado para envio nacional',
    };
  }

  return null;
}

export function buildWhatsAppMessage(items, total, data) {
  const lines = [
    'Hola RDecants, quiero confirmar mi pedido.',
    '',
    '*Datos del cliente*',
    `Nombre: ${data.name}`,
    `Ciudad/estado: ${data.location || 'Por confirmar'}`,
    '',
    '*Seleccion*',
  ];

  items.forEach(item => {
    const size = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;
    lines.push(`- ${item.name} | ${size} | Cantidad: ${item.qty} | Subtotal: ${formatPrice(subtotal, 'Por confirmar')}`);
  });

  lines.push(
    '',
    `*Total general: ${formatPrice(total, 'Por confirmar')}*`,
    '',
    '*Entrega y pago*',
    `Entrega: ${DELIVERY_LABELS[data.delivery] || data.delivery}`,
    `Pago: ${PAYMENT_LABELS[data.payment] || data.payment}`,
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
    button.disabled = isEmpty;
    button.setAttribute('aria-disabled', String(isEmpty));
  }

  form?.classList.toggle('checkout-form--disabled', isEmpty);
}

function _showError(error) {
  _clearError();
  error.field?.classList.add('checkout-field--error');
  const errorEl = document.getElementById('checkout-error');
  if (errorEl) errorEl.textContent = error.message;
}

function _clearError() {
  const form = _form();
  form?.querySelectorAll('.checkout-field--error')
    .forEach(field => field.classList.remove('checkout-field--error'));

  const errorEl = document.getElementById('checkout-error');
  if (errorEl) errorEl.textContent = '';
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
