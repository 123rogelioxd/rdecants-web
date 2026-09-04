import { bootstrapShell } from '../core/shell.js';
import { ApiClient } from '../api/client.js';
import { normalizeApiImageUrl } from '../api/config.js';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from '../ui/images.js';
import { formatPrice } from '../utils/prices.js';
import { bindAddressForm } from '../cart/address.js';

export const MIN_QUOTE_QUERY = 2;
export const QUOTE_DEBOUNCE_MS = 350;

const WHATSAPP_NUMBER = '5219516513018';

export function quoteLines(items = []) {
  return items.map(item => ({ reference: item.reference, quantity: Number(item.quantity) || 1 }));
}

export function upsertQuoteItem(items = [], item) {
  if (!item?.reference) return [...items];
  const existing = items.find(candidate => candidate.reference === item.reference);
  return existing
    ? items.map(candidate => candidate.reference === item.reference
      ? { ...candidate, quantity: Math.min(10, (Number(candidate.quantity) || 1) + 1) }
      : candidate)
    : [...items, { ...item, quantity: 1 }];
}

export function changeQuoteQuantity(items = [], reference, quantity) {
  const next = Number(quantity);
  if (!Number.isFinite(next) || next <= 0) return items.filter(item => item.reference !== reference);
  return items.map(item => item.reference === reference ? { ...item, quantity: Math.min(10, next) } : item);
}

/* ── Presentation only: the SKUs behind a single fragrance ───────────────
   The quote search endpoint returns one flat list of orderable SKUs per
   query — a raw, catalog-style name (e.g. "C RASASI HAWAS BLACK TESTER EDP
   100mL") is the only place the condition lives; there is no dedicated
   field for it. These helpers clean that string for display and group same
   fragrance/size SKUs into one card, the same "read the text" convention
   `perfumes.js`'s bottleConditionGroup() already uses for real condition
   fields — except here a SKU is never defaulted into a condition it never
   stated: no reliable keyword means `unknown`, not "sealed". Grouping only
   ever changes how SKUs are DISPLAYED — every original SKU/variant and all
   of its source fields survive underneath the grouped card (see
   groupQuoteResults below), nothing is merged away or discarded. */

const CONDITION_RULES = [
  {
    key: 'tester_no_box',
    label: 'Tester sin caja',
    detail: 'Sin caja retail',
    re: /\btester\b[^a-z0-9]{0,12}(sin\s*caja|s\/c|no\s*box)|(sin\s*caja|no\s*box)[^a-z0-9]{0,12}\btester\b/i,
  },
  {
    key: 'tester',
    label: 'Tester',
    detail: 'Presentación tester',
    re: /\btester\b/i,
  },
  {
    key: 'sealed',
    label: 'Nuevo y sellado',
    detail: 'Caja original incluida',
    // Explicit "new/sealed" language only — never the absence of a tester
    // keyword. A SKU that says nothing about its condition is `unknown`,
    // not quietly treated as sealed.
    re: /\b(nuevo\s*y?\s*sellado|sellado|new(?:\s+and)?\s*sealed|sealed|nuevo|new)\b/i,
  },
];
/* Shown only when nothing in the source name supports a real condition
   claim. Never silently upgraded to "Nuevo y sellado" — an unverified SKU
   must read as unverified, not as the safest-looking default. The UI never
   renders this as a badge (see normalizePresentation: conditionLabel is
   '' for 'unknown') — an absent fact should not become the loudest, most
   repeated element on the page. */
const UNKNOWN_CONDITION = Object.freeze({ key: 'unknown', label: 'Condición por confirmar', detail: '' });
const CONDITION_RANK = { sealed: 0, tester: 1, tester_no_box: 2, unknown: 3 };

/* Name-cleaning strips ONLY unambiguous packaging/condition phrasing — never
   "nuevo"/"new"/"sellado"/"sealed" on their own, because those bare words
   are common enough inside real marketing copy that stripping them risks
   the same mistake this file already made once (see CONCENTRATION list
   below). Detecting the condition (above) and cleaning the display name
   (below) are deliberately different, narrower operations. */
const CONDITION_STRIP_RE = /\b(tester\s*(sin\s*caja|s\/c|no\s*box)?|sin\s*caja|no\s*box)\b/gi;

/* Only the three universal, unambiguous abbreviations. Earlier this also
   stripped "PARFUM"/"EXTRAIT" and — far worse — whatever the SKU's own
   `concentration` field said verbatim. That second rule is how "RASASI
   HAWAS ELIXIR" (concentration: "Elixir") got mangled into "Rasasi Hawas":
   for this house "Elixir" is simultaneously the concentration tier AND
   part of the marketed name, so stripping "the current item's concentration
   value" is not safe in general. "EDP"/"EDT"/"EDC" are the only tokens that
   are reliably NEVER part of a real fragrance name, so those are the only
   ones removed generically; anything else stays untouched. */
const CONCENTRATION_STRIP_RE = /\b(EDP|EDT|EDC)\b/gi;
const SIZE_STRIP_RE = /\b\d{1,4}\s?ML\b/gi;

/* Known catalog/supplier prefix codes seen on raw SKU names — from the
   documented example, "C RASASI HAWAS BLACK EDP 100mL". A short, explicit
   whitelist rather than "any single capital letter at the start", so a real
   one-letter/short fragrance name (e.g. "K by Dolce&Gabbana") is never
   mistaken for a prefix code and mutilated. */
const KNOWN_SUPPLIER_PREFIXES = new Set(['C']);

export function detectCondition(rawName = '') {
  const text = String(rawName ?? '');
  for (const rule of CONDITION_RULES) {
    if (rule.re.test(text)) return { key: rule.key, label: rule.label, detail: rule.detail };
  }
  return { ...UNKNOWN_CONDITION };
}

/* Strips a known supplier prefix, unambiguous condition phrasing (tester /
   sin caja / no box) and the concentration abbreviation/size tokens that
   are already shown as separate metadata, then title-cases the remainder.
   Deliberately conservative: when a token's meaning is ambiguous (it could
   be real marketing language — "Elixir", "Intense", "Sport", "Le Parfum"…)
   it is left in the name. A slightly redundant but correct name beats a
   incorrectly renamed perfume. */
export function cleanDisplayName(rawName, concentration = '', size = '') {
  let text = String(rawName ?? '').trim();
  if (!text) return '';
  // concentration is accepted for API-shape compatibility with callers that
  // pass every SKU field positionally, but is intentionally NOT used to
  // strip text — see CONCENTRATION_STRIP_RE comment above.
  void concentration;

  const prefixMatch = text.match(/^([A-Z])\s+(?=\S)/);
  if (prefixMatch && KNOWN_SUPPLIER_PREFIXES.has(prefixMatch[1])) {
    text = text.slice(prefixMatch[0].length);
  }
  text = text.replace(CONDITION_STRIP_RE, ' ');
  text = text.replace(CONCENTRATION_STRIP_RE, ' ');

  const sizeDigits = String(size ?? '').match(/\d+(?:\.\d+)?/)?.[0];
  if (sizeDigits) {
    text = text.replace(new RegExp(`\\b${sizeDigits}\\s?ML\\b`, 'gi'), ' ');
  }
  text = text.replace(SIZE_STRIP_RE, ' ');

  text = text.replace(/\s{2,}/g, ' ').trim().replace(/^[-–—,.\s]+|[-–—,.\s]+$/g, '');
  return _titleCaseName(text) || String(rawName ?? '').trim();
}

/* Size, normalized once to the single customer-facing format ("100 ml"),
   regardless of whether the source wrote "100mL", "100ML" or "100 ml". */
export function sizeLabel(size) {
  const raw = String(size ?? '').trim();
  if (!raw) return '';
  const digits = raw.match(/\d+(?:\.\d+)?/)?.[0];
  return digits ? `${digits} ml` : raw;
}

/* ── Single source of truth for customer-facing product data ─────────────
   One normalized object per SKU/variant, fed by the exact same
   cleanDisplayName/detectCondition/sizeLabel pipeline everywhere a SKU is
   shown: the result card, the quote sidebar, the mobile drawer and the
   WhatsApp message. Nothing downstream re-parses the raw supplier name.
   `originalRecord` keeps the untouched source SKU for backend operations
   (quoteLines, priceQuoteBasket, submitQuote all key off `sku`/reference,
   never off anything derived here). */
export function normalizePresentation(record = {}) {
  const displayName = cleanDisplayName(record.name, record.concentration, record.size);
  const size = sizeLabel(record.size);
  const condition = detectCondition(record.name);
  const quantity = Number(record.quantity) || 1;
  const price = Number(record.price) || 0;
  const lineTotal = Number(record.line_total ?? price * quantity) || 0;
  return {
    displayName,
    concentration: record.concentration ?? '',
    sizeLabel: size,
    metaLabel: [record.concentration, size].filter(Boolean).join(' · '),
    condition: condition.key,
    // Never surfaced as a badge/label when unknown — see UNKNOWN_CONDITION.
    conditionLabel: condition.key === 'unknown' ? '' : condition.label,
    conditionDetail: condition.key === 'unknown' ? '' : condition.detail,
    price,
    quantity,
    lineTotal,
    available: record.available !== false,
    sku: record.reference,
    image: record.image ?? '',
    originalRecord: record,
  };
}

/* Groups SKUs that share the same cleaned name + concentration + size — an
   exact-key match on fields the backend already returns, never a fuzzy
   guess, so two different fragrances can never merge by mistake. */
export function groupQuoteResults(items = []) {
  const groups = [];
  const byKey = new Map();

  for (const item of items) {
    if (!item?.reference) continue;
    const name = cleanDisplayName(item.name, item.concentration, item.size);
    const key = [name.toLowerCase(), String(item.concentration ?? '').toLowerCase().trim(), _normalizeSize(item.size)].join('|');
    let group = byKey.get(key);
    if (!group) {
      group = { key, name: name || item.name || 'Perfume', concentration: item.concentration ?? '', size: item.size ?? '', image: item.image ?? '', variants: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    if (!group.image && item.image) group.image = item.image;
    group.variants.push({ ...item, condition: detectCondition(item.name) });
  }

  groups.forEach(group => {
    group.variants.sort((a, b) => {
      const rankDiff = (CONDITION_RANK[a.condition.key] ?? 9) - (CONDITION_RANK[b.condition.key] ?? 9);
      return rankDiff !== 0 ? rankDiff : (Number(a.price) || 0) - (Number(b.price) || 0);
    });
  });

  return groups;
}

export function sortQuoteGroups(groups = [], sortKey = 'relevance') {
  if (sortKey === 'price_asc') return [...groups].sort((a, b) => _groupMinPrice(a) - _groupMinPrice(b));
  if (sortKey === 'price_desc') return [...groups].sort((a, b) => _groupMinPrice(b) - _groupMinPrice(a));
  return groups;
}

/* A sort control with a single meaningful order is noise, not a choice —
   only worth showing once there is more than one card to actually reorder. */
export function shouldShowSort(groupCount) {
  return groupCount >= 2;
}

/* ── The WhatsApp message this page used to build itself ──────────────────
   No longer wired into the live submit handoff: PublicQuoteController::store()
   now builds and returns whatsapp_message/whatsapp_url from the SAME
   structured request it just created (folio, delivery, real figures), and
   the submit handler uses that rather than reconstructing its own — the
   backend record is otherwise nothing more than a receipt nobody reads.
   Kept exported (and tested) as the reference for what that shape looks
   like; not deleted, since removing it is not part of closing this loop.

   Built entirely from normalized presentation objects (never from a raw
   supplier record), and returned as a plain JS string — encodeURIComponent
   at the call site handles UTF-8/URL-encoding correctly on its own, so this
   never needs (and must never do) any manual escaping that could double-
   encode or corrupt characters into U+FFFD. `reference` is optional and is
   only ever a real, non-empty backend-issued id: an empty/falsy value
   omits the "Referencia:" line entirely rather than printing it blank. */
export function buildWhatsAppMessage(items = [], subtotal = 0, reference = '') {
  const lines = items
    .map(item => `• ${item.quantity} × ${item.displayName} — ${item.metaLabel} — ${formatPrice(item.lineTotal ?? item.price)}`)
    .join('\n');

  const parts = [
    'Hola, quiero confirmar disponibilidad de esta cotización en RDECANTS:',
    '',
    lines,
    '',
    `Subtotal: ${formatPrice(subtotal)}`,
    'Envío: por confirmar según destino',
  ];

  const ref = String(reference ?? '').trim();
  if (ref) parts.push('', `Referencia: ${ref}`);

  return parts.join('\n');
}

globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  const input = document.getElementById('quote-search-input');
  const results = document.getElementById('quote-results');
  const basketEl = document.getElementById('quote-basket');
  const ctaBlock = document.getElementById('quote-cta-block');
  const submit = document.getElementById('quote-submit');
  const whatsappFallback = document.getElementById('quote-whatsapp-fallback');
  if (!input || !results || !basketEl || !ctaBlock || !submit) return;

  const submitMessage = document.getElementById('quote-submit-message');
  const searchClear = document.getElementById('quote-search-clear');
  const resultsHead = document.getElementById('quote-results-head');
  const resultsCount = document.getElementById('quote-results-count');
  const sortWrap = document.querySelector('.quote-results-head .sf-sel-wrap');
  const sortSelect = document.getElementById('quote-sort');
  const panel = document.getElementById('quote-panel');
  const panelClose = document.getElementById('quote-panel-close');
  const panelOverlay = document.getElementById('quote-panel-overlay');
  const panelCount = document.getElementById('quote-panel-count');
  const mobileBar = document.getElementById('quote-mobile-bar');
  const mobileBarCount = document.getElementById('quote-mobile-bar-count');
  const mobileBarTotal = document.getElementById('quote-mobile-bar-total');
  const mobileBarBtn = document.getElementById('quote-mobile-bar-btn');

  let searchTimer = null;
  let searchGeneration = 0;
  let lastQuery = '';
  let lastItems = [];
  let lastGroups = [];
  let basket = [];
  let pricedBasket = { items: [], total: 0, unavailable: [] };
  let pricingGeneration = 0;
  let submitting = false;
  let panelLastFocus = null;

  /* ── Mobile drawer (the same panel is the desktop sticky sidebar; only
     the CSS repositions it under 1024px) ─────────────────────────────── */
  const openQuotePanel = () => {
    if (!panel) return;
    panelLastFocus = document.activeElement;
    panel.classList.add('is-open');
    panelOverlay?.classList.add('is-open');
    document.body.classList.add('quote-panel-open');
    panelClose?.focus();
  };
  const closeQuotePanel = () => {
    if (!panel || !panel.classList.contains('is-open')) return;
    panel.classList.remove('is-open');
    panelOverlay?.classList.remove('is-open');
    document.body.classList.remove('quote-panel-open');
    if (panelLastFocus instanceof HTMLElement) panelLastFocus.focus();
  };
  mobileBarBtn?.addEventListener('click', openQuotePanel);
  panelClose?.addEventListener('click', closeQuotePanel);
  panelOverlay?.addEventListener('click', closeQuotePanel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeQuotePanel(); });

  const syncMobileBar = () => {
    if (!mobileBar) return;
    const visible = basket.length > 0;
    mobileBar.hidden = !visible;
    // The floating WhatsApp button sits in the same corner this full-width
    // bar spans on a phone — hide it only while the bar is actually shown
    // (same pattern as the PDP sticky CTA / .whatsapp-float).
    document.body.classList.toggle('quote-mobile-bar-visible', visible);
    if (!visible) return;
    if (mobileBarCount) mobileBarCount.textContent = `${basket.length} ${basket.length === 1 ? 'perfume' : 'perfumes'}`;
    if (mobileBarTotal) mobileBarTotal.textContent = formatPrice(pricedBasket.total, 'Recalculando…');
  };

  const syncResultButtons = () => {
    const refs = new Set(basket.map(item => item.reference));
    results.querySelectorAll('[data-quote-add]:not(:disabled)').forEach(button => {
      const inBasket = refs.has(button.dataset.quoteAdd);
      button.classList.toggle('is-added', inBasket);
      button.textContent = inBasket ? 'Agregado ✓' : 'Agregar';
    });
  };

  const renderBasket = () => {
    if (panelCount) { panelCount.hidden = !basket.length; panelCount.textContent = String(basket.length); }
    syncMobileBar();

    if (!basket.length) {
      basketEl.innerHTML = _basketEmpty();
      ctaBlock.hidden = true;
      return;
    }

    if (whatsappFallback) {
      whatsappFallback.hidden = true;
      whatsappFallback.removeAttribute('href');
    }
    if (submitMessage) { submitMessage.hidden = true; submitMessage.textContent = ''; }
    ctaBlock.hidden = false;
    const canSubmit = !(pricedBasket.unavailable ?? []).length;
    submit.disabled = !canSubmit;

    const pricedByRef = new Map((pricedBasket.items ?? []).map(item => [item.reference, item]));
    const unavailable = new Set(pricedBasket.unavailable ?? []);
    basketEl.innerHTML = `
      <div class="quote-basket-lines">
        ${basket.map(item => _basketLine(pricedByRef.get(item.reference) ?? item, unavailable.has(item.reference))).join('')}
      </div>
      <div class="quote-total-row"><span>Subtotal</span><strong>${formatPrice(pricedBasket.total, 'Recalculando…')}</strong></div>
      <div class="quote-total-row quote-total-row--shipping"><span>Envío</span><span>Se calcula según destino</span></div>
      ${(pricedBasket.unavailable ?? []).length ? '<p class="quote-alert" role="alert">Una o más fragancias ya no están disponibles. Retíralas para continuar.</p>' : ''}`;

    primeImageStates(basketEl);
    basketEl.querySelectorAll('[data-quote-qty-dec]').forEach(button => {
      button.addEventListener('click', async () => {
        const ref = button.dataset.quoteQtyDec;
        const current = basket.find(item => item.reference === ref);
        if (!current || (Number(current.quantity) || 1) <= 1) return;
        basket = changeQuoteQuantity(basket, ref, (Number(current.quantity) || 1) - 1);
        await reprice();
      });
    });
    basketEl.querySelectorAll('[data-quote-qty-inc]').forEach(button => {
      button.addEventListener('click', async () => {
        const ref = button.dataset.quoteQtyInc;
        const current = basket.find(item => item.reference === ref);
        basket = changeQuoteQuantity(basket, ref, (Number(current?.quantity) || 1) + 1);
        await reprice();
      });
    });
    basketEl.querySelectorAll('[data-quote-remove]').forEach(button => {
      button.addEventListener('click', async () => {
        basket = basket.filter(item => item.reference !== button.dataset.quoteRemove);
        await reprice();
      });
    });
  };

  const reprice = async () => {
    const generation = ++pricingGeneration;
    if (!basket.length) {
      pricedBasket = { items: [], total: 0, unavailable: [] };
      renderBasket();
      syncResultButtons();
      return;
    }
    basketEl.setAttribute('aria-busy', 'true');
    try {
      const response = await ApiClient.priceQuoteBasket(quoteLines(basket));
      if (generation !== pricingGeneration) return;
      pricedBasket = response;
      const byRef = new Map((response.items ?? []).map(item => [item.reference, item]));
      basket = basket.map(item => ({ ...item, ...(byRef.get(item.reference) ?? {}), quantity: item.quantity }));
      renderBasket();
      syncResultButtons();
    } catch {
      if (generation !== pricingGeneration) return;
      basketEl.innerHTML = '<p class="quote-alert" role="alert">No pudimos recalcular tu lista. <button type="button" class="btn-ghost" id="quote-price-retry">Reintentar</button></p>';
      document.getElementById('quote-price-retry')?.addEventListener('click', reprice);
    } finally {
      if (generation === pricingGeneration) basketEl.setAttribute('aria-busy', 'false');
    }
  };

  const bindManualQuoteCta = query => {
    document.getElementById('quote-manual-cta')?.addEventListener('click', () => {
      const message = [
        'Hola 👋',
        '',
        `No encontré "${query}" en el buscador de cotizaciones.`,
        '',
        '¿Me ayudas a conseguirlo?',
      ].join('\n');
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      const opened = window.open(url, '_blank');
      if (!opened) window.location.href = url;
    });
  };

  const renderResultsList = () => {
    if (!lastGroups.length) {
      if (resultsHead) resultsHead.hidden = true;
      results.innerHTML = _noResultsState(lastQuery);
      bindManualQuoteCta(lastQuery);
      return;
    }
    if (resultsHead) {
      resultsHead.hidden = false;
      if (resultsCount) resultsCount.textContent = `${lastItems.length} ${lastItems.length === 1 ? 'resultado' : 'resultados'} para "${lastQuery}"`;
      if (sortWrap) sortWrap.hidden = !shouldShowSort(lastGroups.length);
    }
    const sorted = sortQuoteGroups(lastGroups, sortSelect?.value ?? 'relevance');
    results.innerHTML = sorted.map(_perfumeCard).join('');
    primeImageStates(results);
    results.querySelectorAll('[data-quote-add]').forEach(button => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const item = lastItems.find(candidate => candidate.reference === button.dataset.quoteAdd);
        if (!item) return;
        basket = upsertQuoteItem(basket, item);
        Tracker.emit('quote_item_added', { reference: item.reference });
        await reprice();
      });
    });
    syncResultButtons();
  };

  sortSelect?.addEventListener('change', () => { if (lastGroups.length) renderResultsList(); });

  const search = async query => {
    const generation = ++searchGeneration;
    lastQuery = query;
    if (query.length < MIN_QUOTE_QUERY) {
      if (resultsHead) resultsHead.hidden = true;
      results.innerHTML = _searchPrompt();
      lastItems = [];
      lastGroups = [];
      return;
    }

    results.setAttribute('aria-busy', 'true');
    if (resultsHead) resultsHead.hidden = true;
    results.innerHTML = '<div class="quote-loading" role="status">Buscando en el catálogo…</div>';
    try {
      const response = await ApiClient.searchQuoteCatalog(query);
      if (generation !== searchGeneration || input.value.trim() !== query) return;
      // Supplier quote images are resolved by the API, but normalize a legacy
      // /storage path here as well so a cached backend response cannot make
      // the storefront request the image from rdecants.com instead of the API.
      const items = Array.isArray(response?.results)
        ? response.results.map(item => ({ ...item, image: normalizeApiImageUrl(item?.image) }))
        : [];
      Tracker.emit('quote_search', { query, resultCount: items.length });
      lastItems = items;
      lastGroups = groupQuoteResults(items);
      renderResultsList();
    } catch {
      if (generation !== searchGeneration) return;
      if (resultsHead) resultsHead.hidden = true;
      results.innerHTML = `${_searchState('El catálogo no respondió', 'Tu lista sigue aquí. Puedes volver a intentar la búsqueda.')}<button class="btn-primary" type="button" id="quote-search-retry">Reintentar</button>`;
      document.getElementById('quote-search-retry')?.addEventListener('click', () => search(lastQuery));
    } finally {
      if (generation === searchGeneration) results.setAttribute('aria-busy', 'false');
    }
  };

  const updateClearButton = () => { if (searchClear) searchClear.hidden = input.value.length === 0; };

  input.addEventListener('input', () => {
    updateClearButton();
    clearTimeout(searchTimer);
    const query = input.value.trim();
    searchTimer = setTimeout(() => search(query), QUOTE_DEBOUNCE_MS);
  });
  searchClear?.addEventListener('click', () => {
    input.value = '';
    updateClearButton();
    input.focus();
    clearTimeout(searchTimer);
    search('');
  });

  /* ── Delivery: local/national, resolved the same postal-code-first way
     checkout does (see cart/address.js). This page keeps its own small
     address state — separate from the cart drawer's Delivery singleton,
     because this is a different structured record (a
     SourcingCatalogQuoteRequest, not a WebOrder). National always ends up
     "por confirmar" here: a sourcing request has no measured parcel yet, so
     the backend deliberately does not guess one — see
     PublicQuoteSubmissionService::resolveDelivery(). */
  const deliveryModes = document.getElementById('quote-delivery-modes');
  const addressBlock = document.getElementById('quote-address-block');
  let deliveryMode = null;
  let deliveryAddress = {};

  deliveryModes?.querySelectorAll('.delivery-mode').forEach(button => {
    button.addEventListener('click', () => {
      deliveryMode = button.dataset.mode;
      deliveryModes.querySelectorAll('.delivery-mode').forEach(b => {
        const active = b === button;
        b.setAttribute('aria-checked', String(active));
        b.classList.toggle('is-active', active);
      });
      if (addressBlock) addressBlock.hidden = false;
    });
  });

  if (addressBlock) {
    bindAddressForm(addressBlock, {
      onFieldChange: (field, value) => {
        if (value) deliveryAddress[field] = value;
        else delete deliveryAddress[field];
      },
      onChange: () => {},
    });
  }

  /* ── Confirm on WhatsApp — the entire "submit" step ───────────────────
     The final CTA must not navigate to WhatsApp unless RSupplyOS actually
     created the structured request and returned its folio. Delivery pricing
     may stay unanswered ("por confirmar") — that is a legitimate outcome —
     but a request that never got recorded is not, and this must never fall
     back to a locally-built, folio-less WhatsApp message. */
  submit.addEventListener('click', async () => {
    if (submitting || !basket.length || pricedBasket.unavailable?.length) return;

    const customerName = document.getElementById('quote-customer-name')?.value.trim() || '';
    const customerPhone = document.getElementById('quote-customer-phone')?.value.trim() || '';

    if (customerName.length < 2 || customerPhone.length < 7) {
      if (submitMessage) {
        submitMessage.textContent = 'Escribe tu nombre y teléfono para confirmar.';
        submitMessage.hidden = false;
      }
      return;
    }

    submitting = true;
    submit.disabled = true;
    const originalLabel = submit.textContent;
    submit.textContent = 'Enviando…';
    if (submitMessage) { submitMessage.hidden = true; submitMessage.textContent = ''; }

    /* Reserve the tab during the click gesture, before any await, so the
       popup-safe handoff survives the request below (same pattern as the
       rest of the storefront's checkout) — but it is only ever NAVIGATED
       once the backend confirms the request was created; on failure it is
       closed, never left pointing at a stateless WhatsApp message. */
    const reservedWindow = window.open('', '_blank');

    try {
      const response = await ApiClient.submitQuote({
        items: quoteLines(basket),
        expected_total: pricedBasket.total,
        customer_name: customerName,
        customer_phone: customerPhone,
        ...(deliveryMode ? { delivery: { mode: deliveryMode, address: deliveryAddress } } : {}),
      });

      const reference = String(response?.reference ?? '').trim();
      const whatsappUrl = String(response?.whatsapp_url ?? '').trim();

      if (!reference || !whatsappUrl) {
        throw new Error('missing_reference');
      }

      Tracker.emit('quote_submitted', { reference, itemCount: basket.length });

      if (reservedWindow) reservedWindow.location.href = whatsappUrl;
      const opened = reservedWindow || window.open(whatsappUrl, '_blank');

      basket = [];
      pricedBasket = { items: [], total: 0, unavailable: [] };
      renderBasket();
      syncResultButtons();
      closeQuotePanel();

      if (!opened && whatsappFallback) {
        whatsappFallback.href = whatsappUrl;
        whatsappFallback.hidden = false;
      }
    } catch (error) {
      /* The basket, name/phone and delivery choice are all left exactly as
         typed — a retry is one tap, and nothing here quietly reaches
         WhatsApp with no backend record behind it. */
      reservedWindow?.close?.();
      if (submitMessage) {
        submitMessage.textContent = _submitErrorMessage(error);
        submitMessage.hidden = false;
      }
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  });

  results.innerHTML = _searchPrompt();
  renderBasket();
});

function _perfumeCard(group) {
  const hasImage = Boolean(group.image);
  return `<article class="quote-perfume-card">
    <div class="quote-perfume-media">
      <div class="quote-result-image${hasImage ? '' : ' img-shell img-failed'}">
        ${hasImage ? `<img src="${_escape(group.image)}" alt="${_escape(group.name)}" loading="lazy" decoding="async">` : ''}
      </div>
    </div>
    <div class="quote-perfume-body">
      <div class="quote-perfume-headline">
        <div>
          <h3 class="quote-perfume-name">${_escape(group.name)}</h3>
          <p class="quote-perfume-meta">${_escape([group.concentration, sizeLabel(group.size)].filter(Boolean).join(' · '))}</p>
        </div>
        <details class="quote-details">
          <summary>Ver detalles</summary>
          <div class="quote-details-body">${_detailsBody(group)}</div>
        </details>
      </div>
      <div class="quote-variant-list">
        ${group.variants.map(_variantRow).join('')}
      </div>
    </div>
  </article>`;
}

function _variantRow(variant) {
  const presentation = normalizePresentation(variant);
  const disabled = !presentation.available;
  return `<div class="quote-variant-row">
    <div class="quote-variant-condition">
      ${presentation.conditionLabel ? `<span class="quote-condition-badge quote-condition-badge--${presentation.condition}">${_escape(presentation.conditionLabel)}</span>` : ''}
      ${presentation.conditionDetail ? `<span class="quote-variant-detail">${_escape(presentation.conditionDetail)}</span>` : ''}
    </div>
    <strong class="quote-variant-price">${formatPrice(presentation.price)}</strong>
    <button type="button" class="btn-primary quote-variant-add" data-quote-add="${_escape(presentation.sku)}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
      aria-label="${disabled ? `${_escape(presentation.displayName)} no disponible` : `Agregar ${_escape(presentation.displayName)} a tu cotización`}">
      ${disabled ? 'No disponible' : 'Agregar'}
    </button>
  </div>`;
}

function _detailsBody(group) {
  const rows = group.variants.map(v => {
    const p = normalizePresentation(v);
    return `<li><span>${_escape(p.conditionLabel || 'Condición por confirmar')}</span><span>${formatPrice(p.price)}</span><span>${p.available ? 'Disponible' : 'No disponible'}</span></li>`;
  }).join('');
  return `
    <p><strong>Concentración:</strong> ${_escape(group.concentration || 'No especificada')}</p>
    <p><strong>Tamaño:</strong> ${_escape(sizeLabel(group.size) || 'No especificado')}</p>
    <p><strong>Disponibilidad:</strong> Por encargo</p>
    <ul class="quote-details-variants">${rows}</ul>`;
}

function _basketLine(item, unavailable = false) {
  const presentation = normalizePresentation(item);
  const hasImage = Boolean(presentation.image);
  return `<article class="quote-basket-line${unavailable ? ' is-unavailable' : ''}">
    <div class="quote-basket-thumb${hasImage ? '' : ' img-shell img-failed'}">
      ${hasImage ? `<img src="${_escape(presentation.image)}" alt="" loading="lazy" decoding="async">` : ''}
    </div>
    <div class="quote-basket-line-info">
      <strong>${_escape(presentation.displayName)}</strong>
      <span>${_escape(presentation.metaLabel)}</span>
      ${presentation.conditionLabel ? `<span class="quote-condition-badge quote-condition-badge--${presentation.condition} quote-basket-condition">${_escape(presentation.conditionLabel)}</span>` : ''}
      <div class="quote-qty-stepper" role="group" aria-label="Cantidad de ${_escape(presentation.displayName)}">
        <span class="quote-qty-caption">Cantidad</span>
        <button type="button" class="quote-qty-btn" data-quote-qty-dec="${_escape(presentation.sku)}" aria-label="Reducir cantidad" ${presentation.quantity <= 1 ? 'disabled' : ''}>−</button>
        <span class="quote-qty-value">${presentation.quantity}</span>
        <button type="button" class="quote-qty-btn" data-quote-qty-inc="${_escape(presentation.sku)}" aria-label="Aumentar cantidad" ${presentation.quantity >= 10 ? 'disabled' : ''}>+</button>
      </div>
    </div>
    <div class="quote-basket-line-actions">
      <strong>${unavailable ? 'Ya no disponible' : formatPrice(presentation.lineTotal)}</strong>
      <button type="button" class="quote-remove" data-quote-remove="${_escape(presentation.sku)}" aria-label="Quitar ${_escape(presentation.displayName)}">Quitar</button>
    </div>
  </article>`;
}

function _searchPrompt() {
  return `<div class="quote-state">
    <span aria-hidden="true">⌕</span>
    <h2>Empieza tu búsqueda</h2>
    <p>Escribe el nombre de un perfume o una marca para ver las opciones disponibles.</p>
  </div>`;
}

function _noResultsState(query) {
  return `<div class="quote-state">
    <span aria-hidden="true">R</span>
    <h2>No encontramos “${_escape(query)}”</h2>
    <p>Puede que aún podamos conseguirlo para ti.</p>
    <button type="button" class="btn-primary" id="quote-manual-cta">Pedir cotización manual</button>
  </div>`;
}

function _basketEmpty() { return '<div class="quote-basket-empty"><p>Tu cotización está vacía.</p><span>Agrega uno o varios perfumes y calcularemos el precio completo.</span></div>'; }
function _searchState(title, copy) { return `<div class="quote-state"><span aria-hidden="true">R</span><h2>${title}</h2><p>${copy}</p></div>`; }

/* What the customer is told when the structured request could not be
   created. Every branch keeps the basket, the name/phone and the delivery
   choice intact and invites a retry — none of them falls through to
   WhatsApp, which is the whole point: reaching Roger with an unrecorded
   basket is how a "cotización" ends up rebuilt by hand from a chat message. */
function _submitErrorMessage(error) {
  const message = String(error?.data?.message || error?.message || '').trim();

  if (/nombre|tel[eé]fono/i.test(message)) return 'Revisa tu nombre y teléfono e inténtalo de nuevo.';
  if (/cambi|disponib|agot/i.test(message)) return 'Tu lista cambió. Actualiza la página y revisa los precios.';
  if (/postal|colonia|envio|env[ií]o/i.test(message)) return 'Revisa los datos de entrega antes de continuar.';

  return 'No pudimos registrar tu cotización ahora. Tu lista sigue guardada; inténtalo de nuevo.';
}

function _normalizeSize(size) {
  const digits = String(size ?? '').match(/\d+(?:\.\d+)?/);
  return digits ? digits[0] : String(size ?? '').trim().toLowerCase();
}

function _groupMinPrice(group) {
  const prices = (group.variants ?? []).map(v => Number(v.price)).filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

/* A length-only "short all-caps word = acronym" rule also caught ordinary
   short words ("ICE" -> should title-case to "Ice", not stay shouting), so
   this is an explicit whitelist of real brand/style shorthand instead — a
   single letter ("Y") already survives through the normal branch below. */
const KNOWN_ACRONYMS = new Set(['YSL', 'CK', 'DKNY', 'D&G', 'JPG', 'CH', 'TF']);

function _titleCaseName(text) {
  return text.split(/\s+/).filter(Boolean).map(word => {
    const letters = word.replace(/[^A-Za-zÀ-ÿ&]/g, '').toUpperCase();
    if (KNOWN_ACRONYMS.has(letters)) return letters;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

function _escape(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
