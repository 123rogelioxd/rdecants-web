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
/* The same 56px thumbnail the cart uses, from the same `item.image` the cart
   line already carries. A customer confirming an order should be able to
   recognise the perfumes by sight — a list of names is a spelling test.

   The monogram sits on the wrapper, so a photo that never loads reveals it
   instead of leaving a hole. See .cart-item-thumb in components.css. */
function thumbHtml(item) {
  const image = typeof item?.image === 'string' ? item.image.trim() : '';
  const initial = String(item?.house || item?.name || 'R').trim().charAt(0).toUpperCase() || 'R';
  return `<div class="cart-item-thumb checkout-review-thumb" data-fallback="${esc(initial)}" aria-hidden="true">${
    image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.cart-item-thumb').classList.add('cart-item-thumb--empty');this.remove()">` : ''
  }</div>`;
}

function itemLabel(item) {
  if (item.type === 'bottle') return `Botella · ${item.offer_label || item.condition_label || item.size}`;
  if (item.type === 'pack') return item.size;
  return `${item.size} ml`;
}

function itemHtml(items) {
  return items.map(item => `<div class="checkout-review-line">${thumbHtml(item)}<div class="checkout-review-id">${
    item.house ? `<p class="checkout-review-house">${esc(item.house)}</p>` : ''
  }<strong>${esc(item.name)}</strong><p>${esc(itemLabel(item))} · Cantidad ${item.qty}</p></div><span>${money(item.price * item.qty)}</span></div>`).join('');
}

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
    $('checkout-registered-facts').innerHTML = registeredFactsHtml(order);
    const whatsapp = $('checkout-registered-whatsapp');
    whatsapp.href = `https://wa.me/529513446211?text=${encodeURIComponent(buildWhatsAppMessage(order.folio, order.delivery?.preference))}`;
    whatsapp.onclick = () => Tracker.emit('whatsapp_confirmation_clicked', { folio: order.folio, source: 'checkout' });
    /* Deep-links to this order, not to the list. The session cookie was set on
       the same response that created it, so nothing asks the customer to sign
       in to see what they just bought. */
    $('checkout-view-order').href = `/cuenta.html?folio=${encodeURIComponent(order.folio)}`;
    changeStep('registered');
  } catch (e) {
    if (step === 'confirm' && !Delivery.isReady()) changeStep('delivery');
    error(e.message || 'No pudimos registrar tu pedido. Tu carrito sigue aquí.');
  }
  finally { busy = false; render(); }
}

/* The four things a customer wants confirmed, each one read from the server's
   own response rather than assumed by this screen.

   Note what is NOT here: any claim about payment. "Pedido registrado" is not
   "pagado", and the note below this list says so in as many words. */
export function registeredFactsHtml(order) {
  const facts = ['Tu inventario quedó apartado.'];

  const preference = order?.delivery?.preference;
  if (preference?.label) {
    /* "Preferido", because that is what it is. `is_guaranteed` is false in the
       payload and no screen may render it as a confirmed appointment. */
    facts.push(`Horario preferido: ${preference.label}. Lo confirmamos por WhatsApp.`);
  }

  const shipping = order?.delivery?.shipping_cost;
  facts.push(shipping === null || shipping === undefined
    ? 'El costo de entrega se confirma por WhatsApp.'
    : 'La entrega ya está calculada.');

  facts.push('Confirmaremos los detalles de entrega y pago por WhatsApp.');

  return facts.map(fact => `<li>${esc(fact)}</li>`).join('');
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
