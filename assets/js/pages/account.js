/* =============================================================
   RDECANTS — MIS PEDIDOS
   A customer reading their own record.

   ── What this page is allowed to decide ──────────────────────
   Nothing. Every status label, every sentence under it and every peso comes
   from /api/web/account/orders already resolved. A second status vocabulary
   here could disagree with the operator's board, and the customer would be
   reading a state nobody in the business can see.

   ── The three states ─────────────────────────────────────────
   Loading, guest, and the customer's own list. A guest is the ordinary first
   visit, not an error: they are told how to become a recognised customer
   (order once) instead of being shown an empty table or a login form that
   does not exist.
   ============================================================= */

import { bootstrapShell } from '../core/shell.js';
import { Tracker } from '../tracking/tracker.js';
import { normalizeApiImageUrl } from '../api/config.js';
import { Account, statusTone, paymentTone, formatOrderDate, formatOrderTotal } from '../account/account.js';

const WHATSAPP_NUMBER = '5219516513018';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The perfume, as a picture — the same monogram fallback the cart uses, so a
   photo that never loads leaves a recognisable row rather than a hole. */
export function orderThumbHtml(item) {
  const image = normalizeApiImageUrl(item?.image) || '';
  const initial = String(item?.brand || item?.name || 'R').trim().charAt(0).toUpperCase() || 'R';

  return `<div class="cart-item-thumb account-thumb" data-fallback="${esc(initial)}" aria-hidden="true">${
    image
      ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async"
             onerror="this.closest('.cart-item-thumb').classList.add('cart-item-thumb--empty');this.remove()">`
      : ''
  }</div>`;
}

/**
 * One row in the list.
 *
 * `total` is null while nobody has priced the delivery. It renders as
 * "Total por confirmar", never as the merchandise figure and never as $0 — an
 * order with an unpriced delivery genuinely has no final price, and showing one
 * is a promise the business has not made.
 */
export function orderCardHtml(order) {
  const total = formatOrderTotal(order?.total);
  const merchandise = formatOrderTotal(order?.merchandise_total);
  const status = order?.status ?? {};
  const preference = order?.delivery?.preference_label;

  return `
    <a class="account-order" href="/cuenta.html?folio=${encodeURIComponent(order.folio)}">
      <div class="account-order-thumbs">${(order.preview ?? []).map(orderThumbHtml).join('')}</div>
      <div class="account-order-body">
        <p class="account-order-folio">${esc(order.folio)}</p>
        <p class="account-order-meta">${esc(formatOrderDate(order.created_at))}${order.summary_line ? ` · ${esc(order.summary_line)}` : ''}</p>
        <p class="account-status account-status--${esc(statusTone(status))}">${esc(status.progress_label ?? 'Pedido registrado')}</p>
        ${preference ? `<p class="account-order-meta">Horario preferido: ${esc(preference)}</p>` : ''}
      </div>
      <div class="account-order-total">
        ${total
          ? `<span class="account-total-value">${esc(total)}</span>`
          : `<span class="account-total-value">${esc(merchandise ?? '')}</span><span class="account-total-note">Total por confirmar</span>`}
      </div>
    </a>`;
}

/** The full order — what was bought, where it goes, and what is really known. */
export function orderDetailHtml(order) {
  const status = order?.status ?? {};
  const total = formatOrderTotal(order?.total);
  const shipping = order?.delivery?.shipping_cost;
  const preference = order?.delivery?.preference_label;

  return `
    <a class="account-back" href="/cuenta.html"><span aria-hidden="true">←</span> Todos mis pedidos</a>

    <article class="account-detail">
      <header class="account-detail-head">
        <p class="account-order-folio">${esc(order.folio)}</p>
        <p class="account-order-meta">${esc(formatOrderDate(order.created_at))}</p>
        <p class="account-status account-status--${esc(statusTone(status))}">${esc(status.progress_label ?? '')}</p>
        <p class="account-detail-note">${esc(status.progress_detail ?? '')}</p>
      </header>

      <section class="account-block" aria-label="Productos">
        <h3>Tu pedido</h3>
        ${(order.items ?? []).map(item => `
          <div class="account-line">
            ${orderThumbHtml(item)}
            <div class="account-line-id">
              ${item.brand ? `<p class="account-line-brand">${esc(item.brand)}</p>` : ''}
              <strong>${esc(item.name)}</strong>
              <p class="account-order-meta">${item.ml ? `${esc(item.ml)} ml` : 'Botella'} · Cantidad ${esc(item.quantity)}</p>
            </div>
            <span class="account-line-total">${esc(formatOrderTotal(item.line_total) ?? '')}</span>
          </div>`).join('')}
      </section>

      <section class="account-block" aria-label="Entrega">
        <h3>Entrega</h3>
        <p class="account-order-meta">${esc(deliveryModeLabel(order?.delivery?.mode))}</p>
        ${order?.delivery?.destination ? `<p class="account-order-meta">${esc(order.delivery.destination)}</p>` : ''}
        ${order?.delivery?.recipient ? `<p class="account-order-meta">Recibe: ${esc(order.delivery.recipient)}</p>` : ''}
        <p class="account-order-meta">${shipping === null || shipping === undefined
          ? 'Costo de entrega por confirmar'
          : `Entrega: ${esc(formatOrderTotal(shipping) ?? 'Sin costo')}`}</p>
        ${preference
          /* "Preferido", never "confirmado". There is no capacity model behind
             it and the API says so in its own payload. */
          ? `<p class="account-order-meta">Horario preferido: ${esc(preference)} · lo confirmamos por WhatsApp</p>`
          : ''}
      </section>

      <section class="account-block account-block--money" aria-label="Importe">
        <h3>Importe</h3>
        <div class="account-money-row"><span>Productos</span><span>${esc(formatOrderTotal(order.merchandise_total) ?? '')}</span></div>
        ${Number(order.discount) > 0 ? `<div class="account-money-row"><span>Descuentos</span><span>−${esc(formatOrderTotal(order.discount) ?? '')}</span></div>` : ''}
        <div class="account-money-row account-money-row--total">
          <span>${total ? 'Total' : 'Total'}</span>
          <span>${total ? esc(total) : 'Por confirmar'}</span>
        </div>
        <p class="account-status account-status--${esc(paymentTone(status))} account-status--payment">${esc(status.payment_label ?? 'Pago por confirmar')}</p>
      </section>

      <a class="account-cta" href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText(order))}"
         target="_blank" rel="noopener" data-account-whatsapp>Confirmar por WhatsApp</a>
    </article>`;
}

export function deliveryModeLabel(mode) {
  if (mode === 'local') return 'Entrega local';
  if (mode === 'national') return 'Envío nacional';
  if (mode === 'pickup') return 'Recoger';

  return 'Entrega por confirmar';
}

/* The folio, and nothing rebuilt.

   Deliberately not the cart, the prices or the payment state: R Supply OS holds
   all of that, better than a page could restate it, and a message that repeats
   an order is how WhatsApp became a second copy of it in the first place. */
export function whatsappText(order) {
  return `Hola, quiero confirmar mi pedido ${order?.folio ?? ''}.`.replace(/\s+/g, ' ').trim();
}

function guestHtml() {
  return `
    <div class="account-empty">
      <h2>Aún no tienes pedidos aquí</h2>
      <p>Cuando registres un pedido, este navegador te reconocerá y tus pedidos aparecerán en esta página. No necesitas crear una cuenta.</p>
      <a class="btn-primary" href="/catalogo.html">Ver catálogo</a>
    </div>`;
}

function emptyHtml() {
  return `
    <div class="account-empty">
      <h2>Todavía no hay pedidos</h2>
      <p>En cuanto registres uno, lo verás aquí con su folio y su estado.</p>
      <a class="btn-primary" href="/catalogo.html">Ver catálogo</a>
    </div>`;
}

function errorHtml() {
  return `
    <div class="account-empty">
      <h2>No pudimos cargar tus pedidos</h2>
      <p>Revisa tu conexión e inténtalo de nuevo.</p>
      <button class="btn-primary" type="button" data-account-retry>Reintentar</button>
    </div>`;
}

async function render() {
  const root = document.getElementById('account-root');
  if (!root) return;

  const identity = await Account.identity({ refresh: true });

  if (!identity.authenticated) {
    root.innerHTML = identity.offline ? errorHtml() : guestHtml();
    wireRetry(root);
    return;
  }

  const greeting = document.getElementById('account-greeting');
  if (greeting && identity.customer?.name) greeting.textContent = `Hola, ${identity.customer.name}`;

  if (Account.shouldReportRecognition()) {
    Tracker.emit('customer_recognized', { orders: identity.ordersCount });
  }

  const folio = new URLSearchParams(location.search).get('folio');

  if (folio) {
    const order = await Account.order(folio);

    if (!order) {
      root.innerHTML = `<div class="account-empty"><h2>No encontramos ese pedido</h2><p>Puede que pertenezca a otro navegador.</p><a class="btn-primary" href="/cuenta.html">Ver mis pedidos</a></div>`;
      return;
    }

    root.innerHTML = orderDetailHtml(order);
    Tracker.emit('account_order_viewed', { folio: order.folio, status: order.status?.progress });
    root.querySelector('[data-account-whatsapp]')?.addEventListener('click', () => {
      Tracker.emit('whatsapp_confirmation_clicked', { folio: order.folio, source: 'account' });
    });
    document.getElementById('account-lede')?.remove();
    return;
  }

  const orders = await Account.orders();
  Tracker.emit('account_orders_viewed', { count: orders.length });

  root.innerHTML = orders.length
    ? `<div class="account-orders">${orders.map(orderCardHtml).join('')}</div>
       <button class="account-forget" type="button" data-account-forget>No es mi dispositivo · cerrar sesión</button>`
    : emptyHtml();

  root.querySelector('[data-account-forget]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    await Account.forget();
    location.reload();
  });
}

function wireRetry(root) {
  root.querySelector('[data-account-retry]')?.addEventListener('click', () => {
    root.innerHTML = '<p class="account-loading">Cargando tus pedidos…</p>';
    render();
  });
}

if (typeof document !== 'undefined' && document.getElementById('account-root')) {
  bootstrapShell();
  render();
}
