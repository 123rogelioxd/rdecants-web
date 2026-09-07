import { Cart } from '../cart/cart.js';
import { Discount } from '../cart/discount.js';
import { Delivery } from '../cart/delivery.js';
import { registerWebOrder, validateCheckout, readCheckoutData, buildWhatsAppMessage } from '../cart/checkout.js';
import { openCart, closeCart } from '../cart/render.js';
import { setupDeliveryPanel, requestDeliveryQuote } from './deliveryPanel.js';
import { lockBodyScroll, unlockBodyScroll } from './scrollLock.js';
import { EventBus } from '../core/events.js';
import { Tracker } from '../tracking/tracker.js';

const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value) + ' MXN';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const $ = id => document.getElementById(id);
let step = 'delivery', busy = false, wired = false, previousFocus = null, registered = null;

export function checkoutTotals({ subtotal, discount = 0, pricing = null, deliveryCost = null }) {
  const merchandise = pricing?.merchandise_total ?? Math.max(0, Number(subtotal) - Number(discount));
  const known = deliveryCost !== null && deliveryCost !== undefined && Number.isFinite(Number(deliveryCost)) && Number(deliveryCost) >= 0;
  return { subtotal: pricing?.subtotal ?? Number(subtotal), discount: pricing?.discount ?? Number(discount), merchandise,
    delivery: known ? Number(deliveryCost) : null, total: known ? merchandise + Number(deliveryCost) : null };
}

export function checkoutSummaryHtml(totals) {
  return `<h3>Resumen del pedido</h3><dl><div><dt>Subtotal</dt><dd>${money(totals.subtotal)}</dd></div>
    ${totals.discount > 0 ? `<div><dt>Descuentos</dt><dd>−${money(totals.discount)}</dd></div>` : ''}
    <div><dt>Entrega</dt><dd>${totals.delivery === null ? 'Por confirmar' : totals.delivery === 0 ? 'Sin costo' : money(totals.delivery)}</dd></div>
    ${totals.total === null ? `<div class="checkout-total"><dt>Productos</dt><dd>${money(totals.merchandise)}</dd></div>`
      : `<div class="checkout-total"><dt>Total</dt><dd>${money(totals.total)}</dd></div>`}</dl>
    ${totals.total === null ? '<p>El importe final está pendiente de confirmar la entrega.</p>' : '<p>Incluye productos, descuentos y entrega.</p>'}`;
}

function totals() { return checkoutTotals({ subtotal: Cart.total(), discount: Discount.amount(), pricing: Delivery.pricing, deliveryCost: Delivery.isPriced() ? Delivery.cost : null }); }
function error(message = '') { $('checkout-step-error').textContent = message; $('checkout-step-error').hidden = !message; }
function itemHtml(items) { return items.map(item => `<div class="checkout-review-line"><div><strong>${esc(item.name)}</strong><p>${esc(item.type === 'bottle' ? `Botella · ${item.offer_label || item.condition_label || item.size}` : item.type === 'pack' ? item.size : `${item.size} ml`)} · Cantidad ${item.qty}</p></div><span>${money(item.price * item.qty)}</span></div>`).join(''); }

function render() {
  if (!$('checkout-overlay')) return;
  document.querySelectorAll('[data-checkout-step]').forEach(el => { el.hidden = el.dataset.checkoutStep !== step; });
  document.querySelectorAll('[data-checkout-progress]').forEach(el => {
    if (el.dataset.checkoutProgress === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
  });
  const names = { delivery: ['2', 'Entrega', 'Elige cómo recibir tu pedido.'], confirm: ['3', 'Revisa tu pedido', 'Confirma tu selección y los datos de entrega.'], registered: ['4', 'Pedido registrado', 'Gracias por elegir RDECANTS.'] };
  const [n, title, subtitle] = names[step];
  $('checkout-title').textContent = title; $('checkout-subtitle').textContent = subtitle; $('checkout-eyebrow').textContent = `PASO ${n} DE 4`;
  $('checkout-summary').innerHTML = checkoutSummaryHtml(registered?.totals ?? totals());
  $('checkout-actions').hidden = step === 'registered';
  document.querySelectorAll('[data-checkout-edit]').forEach(el => { el.disabled = busy || step === 'registered'; });
  $('checkout-next').disabled = busy;
  $('checkout-next').textContent = busy ? 'Un momento…' : step === 'delivery' ? 'Revisar pedido →' : 'Registrar pedido';
  $('checkout-back').disabled = busy;
  $('checkout-close').disabled = busy;
  $('checkout-back').textContent = step === 'delivery' ? 'Volver al carrito' : 'Editar entrega';
  $('checkout-action-hint').textContent = step === 'delivery' ? 'Revisarás tu pedido antes de registrarlo.' : 'Apartaremos tu inventario. El registro no realiza un cobro.';
  if (step === 'confirm') {
    $('checkout-review-items').innerHTML = itemHtml(Cart.items);
    const a = Delivery.address;
    $('checkout-review-address').innerHTML = `<strong>${Delivery.mode === 'local' ? 'Entrega local' : Delivery.mode === 'national' ? 'Envío nacional' : 'Recoger'}</strong><p>${esc(a.recipient)} · ${esc(a.phone)}</p><p>${esc([a.street, a.exterior_number, a.interior_number].filter(Boolean).join(' '))}</p><p>${esc([a.neighborhood, a.postal_code, a.city, a.state].filter(Boolean).join(', '))}</p>${a.references ? `<p>Referencias: ${esc(a.references)}</p>` : ''}`;
    const note = readCheckoutData().notes;
    $('checkout-review-notes').hidden = !note; $('checkout-review-notes').textContent = note || '';
  }
}
function changeStep(next) { step = next; error(); render(); $('checkout-scroll').scrollTop = 0; $('checkout-title').focus(); }
function close() { if (busy || $('checkout-overlay').hidden) return; $('checkout-overlay').hidden = true; unlockBodyScroll(); previousFocus?.focus?.(); }
function editCart() { if (busy) return; close(); openCart(); }

export function openCheckoutFlow() {
  if (!Cart.items.length) return;
  previousFocus = document.activeElement; registered = null;
  closeCart(); $('checkout-overlay').hidden = false; lockBodyScroll(); changeStep('delivery');
  Tracker.emit('delivery_started', { itemCount: Cart.count() });
}

async function next() {
  if (busy) return;
  error();
  if (!Cart.items.length || Cart.availabilityError()) { error('Revisa la disponibilidad de los productos en tu carrito.'); return; }
  if (!Delivery.mode) { error('Elige cómo recibir tu pedido.'); return; }
  const invalid = validateCheckout();
  if (invalid && invalid.field !== 'quote') { error(invalid.message); document.querySelector(`[data-address="${invalid.field}"]`)?.focus(); return; }
  if (step === 'confirm' && !Delivery.isReady()) { changeStep('delivery'); error('La entrega cambió. Revisa el costo actualizado antes de registrar.'); return; }
  if (Delivery.missingAddressFields().length) { error('Completa tu dirección, quién recibe y teléfono.'); return; }
  busy = true; render();
  try {
    if (!Delivery.isReady()) await requestDeliveryQuote();
    if (!Delivery.isReady()) throw new Error('Calcula y selecciona una opción de entrega para continuar.');
    if (step === 'delivery') { changeStep('confirm'); return; }
    // A quote invalidated after review needs a NEW review, never a blind register.
    const reviewedTotals = totals();
    const result = await registerWebOrder();
    if (!result) throw new Error('Espera un momento antes de intentar de nuevo.');
    const order = result.order;
    registered = { ...result, totals: registeredOrderTotals(order, reviewedTotals) };
    $('checkout-folio').textContent = `Folio ${order.folio}`;
    $('checkout-registered-whatsapp').href = `https://wa.me/5219516513018?text=${encodeURIComponent(buildWhatsAppMessage(order.folio))}`;
    changeStep('registered');
  } catch (e) {
    if (step === 'confirm' && !Delivery.isReady()) changeStep('delivery');
    error(e.message || 'No pudimos registrar tu pedido. Tu carrito sigue aquí.');
  }
  finally { busy = false; render(); }
}

export function registeredOrderTotals(order, reviewed) {
  const deliveryCost = order.delivery && 'shipping_cost' in order.delivery ? order.delivery.shipping_cost : null;
  const result = checkoutTotals({ subtotal: order.subtotal ?? reviewed.subtotal, discount: order.discount ?? reviewed.discount, deliveryCost });
  result.merchandise = order.total ?? result.merchandise;
  result.total = order.grand_total ?? null;
  return result;
}

export function setupCheckoutFlow() {
  if (wired) return; wired = true;
  setupDeliveryPanel(() => { if (step === 'confirm' && !busy && !Delivery.isReady()) changeStep('delivery'); else render(); });
  $('cart-continue')?.addEventListener('click', openCheckoutFlow);
  EventBus.on('checkout:open', openCheckoutFlow);
  EventBus.on('cart:updated', () => { if (!$('checkout-overlay').hidden && !busy && step !== 'registered') changeStep('delivery'); });
  $('checkout-next').addEventListener('click', next);
  $('checkout-close').addEventListener('click', close);
  $('checkout-keep-shopping').addEventListener('click', close);
  $('checkout-back').addEventListener('click', () => step === 'delivery' ? editCart() : changeStep('delivery'));
  document.querySelectorAll('[data-checkout-edit]').forEach(el => el.addEventListener('click', () => el.dataset.checkoutEdit === 'cart' ? editCart() : changeStep('delivery')));
  $('checkout-overlay').addEventListener('click', e => { if (e.target === $('checkout-overlay')) close(); });
  document.addEventListener('keydown', e => {
    if ($('checkout-overlay').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    const focusable = [...$('checkout-dialog').querySelectorAll('button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]')].filter(el => !el.closest('[hidden]') && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
}
