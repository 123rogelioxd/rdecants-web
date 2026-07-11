/* =============================================================
   RDECANTS — CART RENDERER
   Renders cart drawer from current Cart state.
   ============================================================= */

import { Cart }      from './cart.js?v=2026.06.04.2';
import { Discount, API_DOWN_MSG } from './discount.js?v=2026.06.04.2';
import { Attribution, parseAttributionParams, normalizeCampaignCode } from './attribution.js?v=2026.06.04.2';
import { maybeAutoApplyPromo, resetAutoApplyGuard, markAutoApplyDone } from './campaign.js?v=2026.06.04.2';
import { sendCheckoutWhatsApp,
         syncCheckoutAvailability,
         trackCheckoutStarted } from './checkout.js?v=2026.06.04.2';
import { EventBus }  from '../core/events.js';
import { Tracker }   from '../tracking/tracker.js';
import { showToast } from '../ui/toast.js';
import { lockBodyScroll, unlockBodyScroll } from '../ui/scrollLock.js';
import { formatPrice, isValidPrice, getDefaultVariant } from '../utils/prices.js?v=2026.06.04.2';
import { CatalogProvider } from '../providers/catalog.js?v=2026.06.04.2';
import { getCartUpsells, getShippingCompletionUpsell } from '../recommendations/upsells.js?v=2026.06.04.2';
import { getCollectionPairs } from '../recommendations/crossSell.js?v=2026.06.04.2';
import { Personalization, filterDisliked } from '../recommendations/personalization.js?v=2026.06.04.2';
import { getShippingState } from './momentum.js?v=2026.06.04.2';

const WHATSAPP_NUMBER = '5219516513018';
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
        <p class="cart-empty-desc">Agrega un decant para armar tu pedido.</p>
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
    const isMaxed = item.qty >= item.stock;
    const label   = item.type === 'pack' ? 'Pack' : `${item.size}ml`;
    const subtotal = isValidPrice(item.price) ? item.price * item.qty : null;

    return `
      <div class="cart-item">
        <div class="cart-item-top">
          <div class="cart-item-id">
            <p class="cart-item-house">${item.house}</p>
            <p class="cart-item-name">${item.name}</p>
          </div>
          <button class="remove-btn"
            onclick="window.__rd.cart.remove('${item.key}')"
            aria-label="Eliminar ${item.name}">×</button>
        </div>
        <div class="cart-item-bottom">
          <div class="cart-item-meta-price">
            <span class="cart-item-meta">${label} &times; ${item.qty} &middot; Disponibles: ${item.stock}</span>
            ${isMaxed ? '<span class="cart-stock-note">Máximo disponible</span>' : ''}
            <span class="cart-item-price">${formatPrice(subtotal, 'Precio por confirmar')}</span>
          </div>
          <div class="qty-controls">
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', -1)"
              aria-label="Reducir cantidad">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn"
              onclick="window.__rd.cart.changeQty('${item.key}', 1)"
              ${isMaxed ? 'disabled' : ''}
              aria-label="Aumentar cantidad">+</button>
          </div>
        </div>
      </div>
    `;
        }).join('')}
      </div>
    </section>
    <section class="cart-upsells" id="cart-upsells" aria-label="Completa tu pedido" hidden></section>
  `;

  _renderSummary();
  renderDiscountPanel();
  syncCheckoutAvailability();
  _renderUpsells();
  _scheduleRevalidation();
}

/* ── Add-on upsells (operational-first, low friction) ───────── */
let _lastUpsellSig = '';

async function _renderUpsells() {
  const slot = document.getElementById('cart-upsells');
  if (!slot) return;

  const items = Cart.items;
  if (!items.length) {
    slot.hidden = true;
    slot.innerHTML = '';
    _lastUpsellSig = '';
    return;
  }

  let products = [];
  try {
    products = await CatalogProvider.getProducts();
  } catch {
    return;
  }

  /* Cart may have changed while awaiting the catalog */
  if (Cart.items.length !== items.length) return;

  const shipping = getShippingState(Cart.total());
  const taste = Personalization.getTaste();
  const eligible = filterDisliked(products, taste, { minCount: 3 });

  /* Below the shipping threshold → ONE cheapest-qualifying add-on, framed as
     a shipping opportunity ("Te faltan $X para calificar para envío").
     Never a block — if nothing qualifies we fall through to normal cross-sell. */
  if (!shipping.isEligible) {
    const rec = getShippingCompletionUpsell(Cart.items, eligible, shipping.remaining);
    if (rec) {
      _renderShippingCompletion(slot, rec, shipping);
      return;
    }
  }

  /* Eligible (or nothing qualifies) → optional complementary cross-sell. */
  const cartProducts = Cart.items
    .map(item => products.find(p => String(p.id) === String(item.sourceId ?? item.id)))
    .filter(Boolean);

  const pairs = getCollectionPairs(cartProducts, eligible, taste, { limit: 3 });
  const isCollection = pairs.length > 0;

  const suggestions = (isCollection ? pairs : getCartUpsells(Cart.items, eligible, {
    targetRemaining: shipping.remaining,
  }))
    .map(product => ({ product, variant: getDefaultVariant(product, 3) }))
    .filter(entry => entry.variant);

  if (!suggestions.length) {
    slot.hidden = true;
    slot.innerHTML = '';
    _lastUpsellSig = '';
    return;
  }

  /* Optional, non-blocking cross-sell. */
  slot.innerHTML = `
    <p class="cart-section-label">Completa tu pedido</p>
    <div class="cart-upsell-list">
      ${suggestions.map(_upsellRow).join('')}
    </div>`;
  slot.hidden = false;

  const railId = isCollection ? 'collection_builder_cart' : 'cart_upsell';
  const railTitle = 'Completa tu pedido';
  const sig = `${railId}:${suggestions.map(s => s.product.id).join('|')}`;
  if (sig !== _lastUpsellSig) {
    _lastUpsellSig = sig;
    if (isCollection) {
      Tracker.collectionBuilderViewed(suggestions.map(s => s.product), 'cart');
    } else {
      Tracker.recommendationView(suggestions.map(s => s.product), { railId, railTitle });
    }
  }

  slot.querySelectorAll('.cart-upsell-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = suggestions.find(s => String(s.product.id) === btn.dataset.productId);
      if (!entry) return;
      const position = Number(btn.dataset.position) + 1;
      if (isCollection) {
        Tracker.collectionBuilderClicked(entry.product, position, 'cart');
        Tracker.collectionBuilderAdded(entry.product, position, 'cart');
      } else {
        Tracker.recommendationClicked(entry.product, position, { railId, railTitle });
      }
      window.__rd?.cart?.add(entry.product.id, entry.variant.size);
    });
  });
}

/* Single cheapest-qualifying recommendation that reaches the shipping
   threshold in one tap. Optional and non-blocking. */
function _renderShippingCompletion(slot, { product, variant }, shipping) {
  slot.innerHTML = `
    <div class="cart-shipping-complete">
      <p class="cart-shipping-complete-head">
        Te faltan <strong>${formatPrice(shipping.remaining)}</strong> para calificar para envío.
      </p>
      <div class="cart-upsell-list">
        ${_upsellRow({ product, variant }, 0)}
      </div>
    </div>`;
  slot.hidden = false;

  const sig = `ship_complete:${product.id}:${variant.size}`;
  if (sig !== _lastUpsellSig) {
    _lastUpsellSig = sig;
    Tracker.recommendedProductShown(product, variant, shipping.remaining);
    Tracker.amountMissingForShipping(shipping);
  }

  slot.querySelector('.cart-upsell-add')?.addEventListener('click', () => {
    Tracker.recommendedProductAdded(product, variant, shipping.remaining);
    window.__rd?.cart?.add(product.id, variant.size);
  });
}

function _upsellRow({ product, variant }, idx) {
  const hasImage = product.image && product.image.trim() !== '';
  return `
    <div class="cart-upsell-item">
      <span class="cart-upsell-img">
        ${hasImage
          ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('cart-upsell-img--fallback');this.remove()">`
          : ''}
      </span>
      <div class="cart-upsell-info">
        <p class="cart-upsell-house">${product.house ?? ''}</p>
        <p class="cart-upsell-name">${product.name}</p>
        <p class="cart-upsell-meta">${variant.size}ml &middot; ${formatPrice(variant.price)}</p>
      </div>
      <button class="cart-upsell-add" data-product-id="${product.id}" data-position="${idx}"
        aria-label="Agregar ${product.name} ${variant.size}ml a tu pedido">+</button>
    </div>`;
}

/* ── Summary: subtotal · discount · final total ─────────────── */
function _renderSummary() {
  const count = Cart.count();
  const subtotal = Cart.total();
  const applied = Discount.applied;
  const finalTotal = Discount.totalFor(subtotal);

  const countEl = document.getElementById('cart-summary-count');
  if (countEl) countEl.textContent = `${count} ${count === 1 ? 'artículo' : 'artículos'}`;

  const subtotalEl = document.getElementById('cart-subtotal-value');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal, '$0 MXN');

  const discountRow = document.getElementById('cart-discount-row');
  const discountCodeEl = document.getElementById('cart-discount-row-code');
  const discountValueEl = document.getElementById('cart-discount-row-value');
  if (discountRow) {
    const hasDiscount = Boolean(applied) && Discount.amount() > 0;
    discountRow.hidden = !hasDiscount;
    if (hasDiscount) {
      if (discountCodeEl) discountCodeEl.textContent = applied.normalizedCode || applied.code;
      if (discountValueEl) discountValueEl.textContent = `-${formatPrice(Discount.amount(), '$0 MXN')}`;
    }
  }

  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = finalTotal;
}

/* ── Discount panel: input ⇄ applied badge, transient messages ── */
export function renderDiscountPanel() {
  const wrap = document.getElementById('cart-discount');
  if (!wrap) return;

  const form = document.getElementById('cart-discount-form');
  const applied = document.getElementById('cart-discount-applied');
  const codeEl = document.getElementById('cart-discount-code');
  const savedEl = document.getElementById('cart-discount-saved');
  const state = Discount.applied;

  if (state) {
    if (form) form.hidden = true;
    if (applied) applied.hidden = false;
    if (codeEl) codeEl.textContent = state.normalizedCode || state.code;
    if (savedEl) {
      const amount = Discount.amount();
      savedEl.textContent = amount > 0 ? `Ahorraste ${formatPrice(amount, '')}`.trim() : 'Código aplicado';
    }
    /* Applied badge already communicates the code — hide the "detected" hint. */
    _renderCampaignHint(null);
  } else {
    if (form) form.hidden = false;
    if (applied) applied.hidden = true;
    _prefillPromoInput();
    _renderCampaignHint(Attribution.pendingPromoCode());
  }
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
    button.textContent = isLoading ? 'Validando…' : 'Aplicar';
  }
}

/* One-time wiring for the discount form (apply/remove). Idempotent. */
let _discountWired = false;
export function setupDiscountControls() {
  if (_discountWired) return;
  const form = document.getElementById('cart-discount-form');
  const removeBtn = document.getElementById('cart-discount-remove');
  if (!form && !removeBtn) return;
  _discountWired = true;

  form?.addEventListener('submit', e => {
    e.preventDefault();
    _applyDiscountFromInput();
  });

  const input = document.getElementById('cart-discount-input');
  input?.addEventListener('input', () => _setDiscountMessage('', 'neutral'));

  removeBtn?.addEventListener('click', () => {
    Discount.remove();
    /* Manual removal stops the URL promo from auto-applying again this session
       (attribution/UTM stays for reporting; only auto-apply is suppressed). */
    Attribution.dismissPromo();
    markAutoApplyDone();
    _setDiscountMessage('', 'neutral');
    Tracker.discountRemoved();
    const field = document.getElementById('cart-discount-input');
    if (field) field.value = '';
  });

  renderDiscountPanel();
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

  _setDiscountLoading(true);
  Tracker.discountApplyAttempt(code);
  let result;
  try {
    result = await Discount.apply(code, Cart.items, Cart.total());
  } finally {
    _setDiscountLoading(false);
  }

  if (result.status === 'valid') {
    _setDiscountMessage('', 'neutral');
    Tracker.discountApplied(result.normalizedCode, result.amount);
    /* renderDiscountPanel + summary refresh via the discount:updated event. */
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
      _setDiscountMessage('Tu código ya no aplica a este pedido. Puedes continuar sin descuento.', 'invalid');
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
  ));
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
