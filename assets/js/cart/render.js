/* =============================================================
   RDECANTS — CART RENDERER
   Renders cart drawer from current Cart state.
   ============================================================= */

import { Cart }      from './cart.js';
import { Discount, API_DOWN_MSG, STALE_CODE_MSG } from './discount.js';
import { Attribution, parseAttributionParams, normalizeCampaignCode } from './attribution.js';
import { maybeAutoApplyPromo, resetAutoApplyGuard, markAutoApplyDone } from './campaign.js';
import { sendCheckoutWhatsApp,
         syncCheckoutAvailability,
         trackCheckoutStarted } from './checkout.js';
import { EventBus }  from '../core/events.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { lockBodyScroll, unlockBodyScroll } from '../ui/scrollLock.js';
import { formatPrice, isValidPrice } from '../utils/prices.js';
import { CatalogProvider } from '../providers/catalog.js';

const WHATSAPP_NUMBER = '529513446211';

/* The perfume, as a picture.

   ── Why the cart line already knows it ─────────────────────────────────────
   `item.image` is the canonical catalogue URL, copied onto the line when it was
   added and already sent to R Supply OS in the order metadata. Nothing new is
   stored and no second image source is introduced — this renders what the cart
   has been carrying all along.

   ── Why the fallback is a monogram and not a broken frame ──────────────────
   A product without a photo, an image host having a bad minute, and an offline
   phone all produce the same thing: an <img> that will never paint. The wrapper
   carries the initial underneath, so the row keeps its shape and stays
   recognisable instead of collapsing or showing a torn-page icon. `onerror`
   removes the image rather than hiding it, so a failed load cannot leave an
   alt-text string sitting on top of the monogram. */
function cartThumbHtml(item) {
  const image = typeof item?.image === 'string' ? item.image.trim() : '';
  const initial = String(item?.house || item?.name || 'R').trim().charAt(0).toUpperCase() || 'R';

  return `<div class="cart-item-thumb" data-fallback="${_esc(initial)}" aria-hidden="true">${
    image
      ? `<img src="${_esc(image)}" alt="" loading="lazy" decoding="async"
             onerror="this.closest('.cart-item-thumb').classList.add('cart-item-thumb--empty');this.remove()">`
      : ''
  }</div>`;
}

const _esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let _prevFocus = null;

/* ── Render ─────────────────────────────────────────────────── */
export function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  const items = Cart.items;
  document.getElementById('cart-drawer')?.classList.toggle('cart-drawer--empty', !items.length);

  if (!items.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">R</div>
        <h3 class="cart-empty-title">Tu carrito est&aacute; vac&iacute;o</h3>
        <p class="cart-empty-desc">Agrega un decant o una botella para armar tu pedido.</p>
        <button class="btn-continue cart-empty-cta" onclick="window.__rd.ui.scrollToCatalog()">
          Explorar cat&aacute;logo
        </button>
      </div>
    `;
    /* An empty cart can't carry a discount — drop any stale preview. */
    Discount.remove();
    _renderSummary();
    renderDiscountPanel();
    syncCheckoutAvailability();
    return;
  }

  const total = Cart.total();
  const count = Cart.count();

  container.innerHTML = `
    <section class="cart-section cart-products-section" aria-label="Productos agregados">
      <p class="cart-section-label">Productos agregados</p>
      <div class="cart-product-list">
        ${items.map(item => {
    const isMaxed = !Cart.canIncrement(item.key);
    const isPack  = item.type === 'pack';
    const isBottle = item.type === 'bottle';
    /* `item.size` already reads "3 × 3 ml" for a pack — set once when the
       pack was added, so there is no second place that decides the wording. */
    const label   = isPack ? item.size : isBottle ? `Botella · ${item.offer_label || item.condition_label}` : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;
    const normalSubtotal = isPack && isValidPrice(item.normal_price)
      ? item.normal_price * item.qty
      : null;

    /* The three fragrances inside the pack, named. A pack is added and
       removed whole — there is deliberately no per-fragrance remove button —
       so this list is what the customer opens the drawer to check. Making the
       group atomic is also what makes a phantom pack discount impossible:
       there is no edit that can leave the cart holding two decants while
       still claiming to hold a pack. */
    const contents = isPack && item.items?.length
      ? `<ul class="cart-pack-contents">
           ${item.items.map(entry => `
             <li>
               <span class="cart-pack-item-name">${entry.name}</span>
               ${entry.label ? `<span class="cart-pack-item-role">${entry.label}</span>` : ''}
             </li>`).join('')}
         </ul>`
      : '';

    /* Normal → saving → pack, in the same order and the same restrained
       treatment the pack card on the home uses. */
    /* Bare amounts on the secondary row: `formatPrice` appends " MXN", and
       stating the currency three times inside one cart line is noise. It stays
       on the line that is actually charged, below. */
    const bare = value => formatPrice(value).replace(/\s*MXN$/, '');
    const savingRow = isPack && Number(item.savings) > 0 && normalSubtotal
      ? `<p class="cart-pack-saving">
           <span class="cart-pack-was">Normal ${bare(normalSubtotal)}</span>
           <span class="cart-pack-save">Ahorras ${bare(item.savings * item.qty)}</span>
         </p>`
      : '';

    return `
      <div class="cart-item${isPack ? ' cart-item--pack' : ''}${isBottle ? ' cart-item--bottle' : ''}">
        <div class="cart-item-top">
          ${cartThumbHtml(item)}
          <div class="cart-item-id">
            <p class="cart-item-house">${item.house}</p>
            <p class="cart-item-name">${item.name}</p>
            <p class="cart-item-meta">${label}</p>
          </div>
          <button class="remove-btn"
            onclick="window.__rd.cart.remove('${item.key}')"
            aria-label="Eliminar ${item.name}">×</button>
        </div>
        ${contents}
        ${savingRow}
        <div class="cart-item-bottom">
          <div class="qty-controls" ${isBottle ? 'aria-label="Una botella"' : ''}>
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', -1)"
              aria-label="Reducir cantidad">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', 1)"
              ${isMaxed ? 'disabled' : ''}
              aria-label="Aumentar cantidad">+</button>
          </div>
          <div class="cart-item-money">
            ${isMaxed ? '<span class="cart-stock-note">Máximo disponible</span>' : ''}
            <span class="cart-item-price">${formatPrice(subtotal, 'Precio por confirmar')}</span>
          </div>
        </div>
      </div>
    `;
        }).join('')}
      </div>
    </section>
  `;

  _renderSummary();
  renderDiscountPanel();
  syncCheckoutAvailability();
  _scheduleRevalidation();
}

/* ── Summary: subtotal · one discount row per coupon · final total ──── */
function _renderSummary() {
  const count = Cart.count();
  const subtotal = Cart.total();
  const applied = Discount.applied.filter(a => a.amount > 0);
  const finalTotal = Discount.totalFor(subtotal);

  const countEl = document.getElementById('cart-summary-count');
  if (countEl) countEl.textContent = `${count} ${count === 1 ? 'artículo' : 'artículos'}`;

  const subtotalEl = document.getElementById('cart-subtotal-value');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal, '$0 MXN');

  /* Each applied coupon gets its own row ("Descuento ESPANA40  -$40 MXN"),
     never combined — so the customer can see exactly what each code did. */
  const rowsEl = document.getElementById('cart-discount-rows');
  if (rowsEl) {
    rowsEl.hidden = !applied.length;
    rowsEl.innerHTML = applied.map(a => {
      const code = a.normalizedCode || a.code;
      return `
        <div class="cart-summary-row cart-summary-row--discount">
          <span class="cart-summary-row-label">Descuento <span class="cart-summary-row-code">${_escape(code)}</span></span>
          <span class="cart-summary-row-value">-${formatPrice(a.amount, '$0 MXN')}</span>
        </div>`;
    }).join('');
  }

  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = finalTotal;


}

/* ── Discount panel: toggle ⇄ input ⇄ applied badge, transient messages ──
   Progressive disclosure: the code input starts collapsed behind "¿Tienes un
   código?" so it never competes with the primary WhatsApp action. It expands
   automatically when there's something to show (a pending campaign promo, or
   a code the customer already typed) and stays expanded across re-renders
   once the customer opens it — a cart update never collapses their input. */
/* Whether the customer has opened the "add another code" form. Kept open across
   re-renders until a code applies (or is removed), so a background cart update
   never collapses an in-progress entry. */
let _addAnotherOpen = false;

export function renderDiscountPanel() {
  const wrap = document.getElementById('cart-discount');
  if (!wrap) return;

  const toggle = document.getElementById('cart-discount-toggle');
  const form   = document.getElementById('cart-discount-form');
  const list   = document.getElementById('cart-discount-applied-list');
  const input  = document.getElementById('cart-discount-input');
  const apply  = document.getElementById('cart-discount-apply');
  const maxMsg = document.getElementById('cart-discount-max-msg');

  const applied = Discount.applied;   // array (0..MAX)
  const count = applied.length;
  const canAddMore = Discount.canAddMore();

  /* Applied chips — each reuses .cart-discount-applied so one code looks exactly
     as before and a second just stacks below it. Own Quitar button per code. */
  if (list) {
    if (count) {
      list.hidden = false;
      list.innerHTML = applied.map(a => {
        const code = a.normalizedCode || a.code;
        const saved = a.amount > 0 ? `Ahorraste ${formatPrice(a.amount, '')}`.trim() : 'Código aplicado';
        return `
          <div class="cart-discount-applied">
            <div class="cart-discount-applied-info">
              <span class="cart-discount-tag">${_escape(code)}</span>
              <span class="cart-discount-applied-text">${_escape(saved)}</span>
            </div>
            <button class="cart-discount-remove" type="button" data-code="${_escape(code)}"
              aria-label="Quitar código ${_escape(code)}">Quitar</button>
          </div>`;
      }).join('');
    } else {
      list.hidden = true;
      list.innerHTML = '';
    }
  }

  /* The "promo detectada" hint only matters before the first code is applied. */
  _renderCampaignHint(count ? null : Attribution.pendingPromoCode());
  if (!count) _prefillPromoInput();

  /* At the max there's no way to add more — hide the toggle and form entirely
     and explain why so the customer isn't left wondering where it went. */
  if (maxMsg) maxMsg.hidden = canAddMore;
  if (!canAddMore) {
    if (toggle) toggle.hidden = true;
    if (form) form.hidden = true;
    return;
  }

  const wantOpen = _addAnotherOpen
    || (count === 0 && (Boolean(Attribution.pendingPromoCode()) || Boolean(input?.value?.trim())));

  if (toggle) {
    toggle.hidden = wantOpen;
    toggle.textContent = count ? '¿Tienes otro cupón?' : '¿Tienes un código de descuento?';
    toggle.setAttribute('aria-expanded', String(wantOpen));
  }
  if (form) form.hidden = !wantOpen;
  if (input) input.placeholder = count ? 'Ingresa tu segundo código' : 'Código de descuento';
  if (apply && !apply.disabled) apply.textContent = _applyButtonLabel();
}

/* "Aplicar" for the first code, "Aplicar otro cupón" once one is already
   applied — matches the toggle/placeholder copy for the second slot. */
function _applyButtonLabel() {
  return Discount.count() > 0 ? 'Aplicar otro cupón' : 'Aplicar';
}

/* Escape dynamic text before injecting into innerHTML (codes are normalized but
   we never trust input into markup). */
function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/* Pre-fill the discount input with a campaign promo the customer arrived with,
   without clobbering anything they're already typing. */
function _prefillPromoInput() {
  const input = document.getElementById('cart-discount-input');
  const code = Attribution.pendingPromoCode();
  if (input && code && !input.value.trim()) {
    input.value = normalizeCampaignCode(code);
  }
}

/* Subtle "Promo detectada: VIP8" line — textContent only (never HTML), so a
   query param can never inject markup. Hidden when there's nothing pending. */
function _renderCampaignHint(code) {
  const el = document.getElementById('cart-campaign-hint');
  if (!el) return;
  if (code) {
    el.textContent = `Promo detectada: ${normalizeCampaignCode(code)}`;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

/* Read campaign params from the URL, persist attribution, reflect it in the
   discount UI and try to auto-apply the promo if the cart already has items.
   Safe to call on every page's bootstrap. */
export function setupCampaignAttribution(search = _locationSearch()) {
  const hadUrlParams = Object.keys(parseAttributionParams(search)).length > 0;
  Attribution.capture(search);

  if (hadUrlParams) {
    resetAutoApplyGuard();
    Tracker.campaignDetected(Attribution.forTracking());
  }

  renderDiscountPanel();
  _runCampaignAutoApply();
}

/* Kick the auto-apply orchestrator with the live cart + UI callbacks. */
function _runCampaignAutoApply() {
  return maybeAutoApplyPromo({
    items: Cart.items,
    total: Cart.total(),
    onApplied: result => {
      _setDiscountMessage('', 'neutral');
      showToast(`Código ${result.normalizedCode || result.code} aplicado`);
    },
    onMessage: (message, tone) => _setDiscountMessage(message, tone),
  });
}

function _locationSearch() {
  return globalThis.window?.location?.search ?? '';
}

function _setDiscountMessage(message, tone = 'neutral') {
  const el = document.getElementById('cart-discount-msg');
  if (!el) return;
  const text = String(message ?? '').trim();
  el.textContent = text;
  el.dataset.tone = tone;
  el.hidden = !text;
}

function _setDiscountLoading(isLoading) {
  const wrap = document.getElementById('cart-discount');
  const input = document.getElementById('cart-discount-input');
  const button = document.getElementById('cart-discount-apply');
  wrap?.classList.toggle('is-loading', isLoading);
  if (input) input.disabled = isLoading;
  if (button) {
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Validando…' : _applyButtonLabel();
  }
}

/* One-time wiring for the discount form (apply/remove). Idempotent. */
let _discountWired = false;
export function setupDiscountControls() {
  if (_discountWired) return;
  const form = document.getElementById('cart-discount-form');
  const list = document.getElementById('cart-discount-applied-list');
  if (!form && !list) return;
  _discountWired = true;

  form?.addEventListener('submit', e => {
    e.preventDefault();
    _applyDiscountFromInput();
  });

  const input = document.getElementById('cart-discount-input');
  input?.addEventListener('input', () => _setDiscountMessage('', 'neutral'));

  const toggle = document.getElementById('cart-discount-toggle');
  toggle?.addEventListener('click', () => {
    _addAnotherOpen = true;
    renderDiscountPanel();
    document.getElementById('cart-discount-input')?.focus();
  });

  /* Per-chip remove — delegated because chips are re-rendered on every change. */
  list?.addEventListener('click', e => {
    const btn = e.target.closest('.cart-discount-remove');
    if (!btn) return;
    _removeDiscount(btn.dataset.code || null);
  });

  renderDiscountPanel();
}

async function _removeDiscount(code) {
  _addAnotherOpen = false;
  await Discount.remove(code, Cart.items, Cart.total());
  /* Manual removal stops the URL promo from auto-applying again this session
     (attribution/UTM stays for reporting; only auto-apply is suppressed). */
  Attribution.dismissPromo();
  markAutoApplyDone();
  _setDiscountMessage('', 'neutral');
  Tracker.discountRemoved();
  const field = document.getElementById('cart-discount-input');
  if (field) field.value = '';
}

async function _applyDiscountFromInput() {
  const input = document.getElementById('cart-discount-input');
  const code = input?.value ?? '';
  if (!code.trim()) {
    _setDiscountMessage('Escribe un código para aplicarlo.', 'invalid');
    return;
  }

  /* A manual code takes over: it overrides the URL promo for discount purposes
     and prevents auto-apply from clobbering the customer's explicit choice. */
  markAutoApplyDone();
  _addAnotherOpen = true; // keep the form open through the attempt

  _setDiscountLoading(true);
  Tracker.discountApplyAttempt(code);
  let result;
  try {
    result = await Discount.apply(code, Cart.items, Cart.total());
  } finally {
    _setDiscountLoading(false);
  }

  if (result.status === 'valid') {
    _addAnotherOpen = false;
    if (input) input.value = '';
    _setDiscountMessage('', 'neutral');
    Tracker.discountApplied(result.normalizedCode, result.amount);
    renderDiscountPanel(); // collapse to the applied chips + "add another" toggle
  } else if (result.status === 'duplicate' || result.status === 'max') {
    /* Client-side guard — keep the form open with a clear notice. */
    _setDiscountMessage(result.message, 'invalid');
  } else if (result.status === 'invalid') {
    _setDiscountMessage(result.message, 'invalid');
    Tracker.discountInvalid(code);
  } else {
    /* error/empty → never block checkout. */
    _setDiscountMessage(result.message || API_DOWN_MSG, 'error');
  }
}

/* Re-validate an applied code when the cart changes. Debounced so rapid qty
   taps trigger a single request. If it no longer validates, the module removes
   it and we surface a safe notice — no stale totals. */
let _revalidateTimer = null;
function _scheduleRevalidation() {
  if (!Discount.isApplied()) return;
  clearTimeout(_revalidateTimer);
  _revalidateTimer = setTimeout(async () => {
    if (!Discount.isApplied() || !Cart.items.length) return;
    const result = await Discount.revalidate(Cart.items, Cart.total());
    if (result.status === 'invalid') {
      /* The backend's own sentence, not ours. For a scoped code it is the only
         one that tells the customer something they can act on — "no aplica a
         los productos de tu carrito" points at the cart, "ya expiró" does not. */
      _setDiscountMessage(result.message || STALE_CODE_MSG, 'invalid');
      showToast('Actualizamos tu total: el código ya no aplica.');
    } else if (result.status === 'error') {
      _setDiscountMessage('No pudimos revalidar el código. Continúa y lo confirmamos por WhatsApp.', 'error');
    }
  }, 550);
}

export function updateCartCount() {
  const count   = Cart.count();
  const countEl = document.getElementById('cart-count');
  const dot     = document.querySelector('.cart-dot');
  if (countEl) countEl.textContent = count;
  if (dot)     dot.classList.toggle('visible', count > 0);
}

/* ── Drawer open / close ────────────────────────────────────── */
export function openCart() {
  const drawer = document.getElementById('cart-drawer');
  if (drawer?.classList.contains('active')) return;
  _prevFocus = document.activeElement;
  drawer?.classList.add('active');
  drawer?.setAttribute('aria-hidden', 'false');
  document.getElementById('cart-overlay')?.classList.add('active');
  document.body.classList.add('cart-open');
  lockBodyScroll();
  Tracker.cartOpened();
  trackCheckoutStarted();
  document.removeEventListener('keydown', _handleCartKey);
  document.addEventListener('keydown', _handleCartKey);
  setTimeout(() => drawer?.querySelector('.cart-close')?.focus(), 120);
}

export function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer?.classList.contains('active')) return;
  drawer?.classList.remove('active');
  drawer?.setAttribute('aria-hidden', 'true');
  document.getElementById('cart-overlay')?.classList.remove('active');
  document.body.classList.remove('cart-open');
  unlockBodyScroll();
  Tracker.cartClosed();
  document.removeEventListener('keydown', _handleCartKey);
  _prevFocus?.focus?.();
  _prevFocus = null;
}

export function toggleCart() {
  const isOpen = document.getElementById('cart-drawer')?.classList.contains('active');
  isOpen ? closeCart() : openCart();
}

/* ── WhatsApp checkout ──────────────────────────────────────── */
export function sendWhatsApp() {
  sendCheckoutWhatsApp(WHATSAPP_NUMBER);
}

function _handleCartKey(e) {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer?.classList.contains('active')) return;

  if (e.key === 'Escape') {
    closeCart();
    return;
  }

  if (e.key !== 'Tab') return;

  const focusable = Array.from(drawer.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter(element => element.getClientRects().length && !element.closest('[hidden]'));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ── Auto-update on cart changes ────────────────────────────── */
EventBus.on('cart:updated', () => {
  renderCart();
  updateCartCount();
  /* First item added after a campaign landing → try the pending promo now. */
  _runCampaignAutoApply();
});

/* Discount applied/removed → refresh only the summary + panel (leave the item
   list and the discount input's focus untouched). */
EventBus.on('discount:updated', () => {
  _renderSummary();
  renderDiscountPanel();
});
