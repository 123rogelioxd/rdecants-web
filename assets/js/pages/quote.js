import { bootstrapShell } from '../core/shell.js';
import { ApiClient } from '../api/client.js';
import { normalizeApiImageUrl } from '../api/config.js';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from '../ui/images.js';
import { formatPrice } from '../utils/prices.js';

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
   must read as unverified, not as the safest-looking default. */
const UNKNOWN_CONDITION = Object.freeze({ key: 'unknown', label: 'Condición por confirmar', detail: '' });
const CONDITION_RANK = { sealed: 0, tester: 1, tester_no_box: 2, unknown: 3 };
const CONDITION_STRIP_RE = /\b(tester\s*(sin\s*caja|s\/c|no\s*box)?|sin\s*caja|no\s*box|nuevo\s*y?\s*sellado|new(?:\s+and)?\s*sealed|sellado|sealed|nuevo|new)\b/gi;
const CONCENTRATION_STRIP_RE = /\b(EDP|EDT|EDC|PARFUM|EXTRAIT(?:\s+DE\s+PARFUM)?)\b/gi;
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

/* Strips a known supplier prefix, the condition phrase and the
   concentration/size tokens that are already shown as separate metadata,
   then title-cases the remainder. Deliberately narrow: only a whitelisted
   prefix letter and only the condition/concentration/size tokens above are
   removed — nothing else in the name is touched, so a real fragrance name
   is never mutated by a broad "looks like noise" guess. */
export function cleanDisplayName(rawName, concentration = '', size = '') {
  let text = String(rawName ?? '').trim();
  if (!text) return '';

  const prefixMatch = text.match(/^([A-Z])\s+(?=\S)/);
  if (prefixMatch && KNOWN_SUPPLIER_PREFIXES.has(prefixMatch[1])) {
    text = text.slice(prefixMatch[0].length);
  }
  text = text.replace(CONDITION_STRIP_RE, ' ');

  const concentrationToken = String(concentration ?? '').trim();
  if (concentrationToken) {
    text = text.replace(new RegExp(`\\b${_escapeRegExp(concentrationToken)}\\b`, 'gi'), ' ');
  }
  text = text.replace(CONCENTRATION_STRIP_RE, ' ');

  const sizeDigits = String(size ?? '').match(/\d+(?:\.\d+)?/)?.[0];
  if (sizeDigits) {
    text = text.replace(new RegExp(`\\b${sizeDigits}\\s?ML\\b`, 'gi'), ' ');
  }
  text = text.replace(SIZE_STRIP_RE, ' ');

  text = text.replace(/\s{2,}/g, ' ').trim().replace(/^[-–—,.\s]+|[-–—,.\s]+$/g, '');
  return _titleCaseName(text) || String(rawName ?? '').trim();
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

globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  const input = document.getElementById('quote-search-input');
  const results = document.getElementById('quote-results');
  const basketEl = document.getElementById('quote-basket');
  const form = document.getElementById('quote-form');
  const submit = document.getElementById('quote-submit');
  const successEl = document.getElementById('quote-success-message');
  const whatsappFallback = document.getElementById('quote-whatsapp-fallback');
  if (!input || !results || !basketEl || !form || !submit) return;

  const searchClear = document.getElementById('quote-search-clear');
  const resultsHead = document.getElementById('quote-results-head');
  const resultsCount = document.getElementById('quote-results-count');
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
      form.hidden = true;
      return;
    }

    if (successEl) {
      successEl.hidden = true;
      successEl.textContent = '';
    }
    if (whatsappFallback) {
      whatsappFallback.hidden = true;
      whatsappFallback.removeAttribute('href');
    }
    form.hidden = false;
    const pricedByRef = new Map((pricedBasket.items ?? []).map(item => [item.reference, item]));
    const unavailable = new Set(pricedBasket.unavailable ?? []);
    basketEl.innerHTML = `
      <div class="quote-basket-lines">
        ${basket.map(item => _basketLine(pricedByRef.get(item.reference) ?? item, unavailable.has(item.reference))).join('')}
      </div>
      <div class="quote-total-row"><span>Subtotal</span><strong>${formatPrice(pricedBasket.total, 'Recalculando…')}</strong></div>
      <div class="quote-total-row quote-total-row--shipping"><span>Envío</span><span>Se calcula después</span></div>
      ${(pricedBasket.unavailable ?? []).length ? '<p class="quote-alert" role="alert">Una o más fragancias ya no están disponibles. Retíralas para continuar.</p>' : ''}`;

    primeImageStates(basketEl);
    basketEl.querySelectorAll('[data-quote-qty]').forEach(control => {
      control.addEventListener('change', async () => {
        basket = changeQuoteQuantity(basket, control.dataset.quoteQty, control.value);
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !basket.length || pricedBasket.unavailable?.length) return;
    const message = document.getElementById('quote-submit-message');
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Revalidando…';
    if (message) message.textContent = '';

    /* Reserve the tab during the submit gesture, before awaiting the backend.
       This is the same popup-safe handoff used by decant checkout: once the
       quote is accepted we can navigate this tab without losing the gesture. */
    const reservedWindow = window.open('', '_blank');

    try {
      const response = await ApiClient.submitQuote({
        items: quoteLines(basket),
        customer_name: document.getElementById('quote-name').value.trim(),
        customer_phone: document.getElementById('quote-phone').value.trim(),
        expected_total: pricedBasket.total,
      });
      Tracker.emit('quote_submitted', { reference: response.reference, itemCount: basket.length });
      const whatsappUrl = String(response.whatsapp_url ?? '').trim();
      if (!whatsappUrl) throw new Error('No pudimos abrir WhatsApp. Inténtalo de nuevo.');

      // Keep the form and basket mounted. The completed basket is cleared so
      // the same page can immediately start a second quote without reloading.
      basket = [];
      pricedBasket = { items: [], total: 0, unavailable: [] };
      renderBasket();
      syncResultButtons();
      closeQuotePanel();
      form.reset();
      if (successEl) {
        successEl.textContent = 'Solicitud recibida. Roger recibió tu solicitud y confirmará disponibilidad contigo por WhatsApp.';
        successEl.hidden = false;
      }

      /* The backend owns the WhatsApp message and URL. Do not rebuild a
         message here: quote-only data never belongs in frontend copy. */
      if (reservedWindow) reservedWindow.location.href = whatsappUrl;
      const opened = reservedWindow || window.open(whatsappUrl, '_blank');
      if (!opened) {
        if (whatsappFallback) {
          whatsappFallback.href = whatsappUrl;
          whatsappFallback.hidden = false;
        }
      }
    } catch (error) {
      reservedWindow?.close?.();
      if (error.status === 409 && error.data?.basket) {
        pricedBasket = error.data.basket;
        const byRef = new Map((pricedBasket.items ?? []).map(item => [item.reference, item]));
        basket = basket.map(item => ({ ...item, ...(byRef.get(item.reference) ?? {}), quantity: item.quantity }));
        renderBasket();
        if (message) message.textContent = pricedBasket.unavailable?.length
          ? 'Una fragancia dejó de estar disponible. Revisa la lista.'
          : 'El precio cambió. Revisa el nuevo total y vuelve a enviar para aceptarlo.';
      } else if (message) {
        message.textContent = error.message || 'No pudimos enviar la solicitud. Inténtalo de nuevo.';
      }
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Solicitar cotización';
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
          <p class="quote-perfume-meta">${_escape([group.concentration, _sizeLabel(group.size)].filter(Boolean).join(' · '))}</p>
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
  const disabled = !variant.available;
  return `<div class="quote-variant-row">
    <div class="quote-variant-condition">
      <span class="quote-condition-badge quote-condition-badge--${variant.condition.key}">${_escape(variant.condition.label)}</span>
      ${variant.condition.detail ? `<span class="quote-variant-detail">${_escape(variant.condition.detail)}</span>` : ''}
    </div>
    <strong class="quote-variant-price">${formatPrice(variant.price)}</strong>
    <button type="button" class="btn-primary quote-variant-add" data-quote-add="${_escape(variant.reference)}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
      aria-label="${disabled ? `${_escape(variant.condition.label)} no disponible` : `Agregar ${_escape(variant.condition.label)} a tu cotización`}">
      ${disabled ? 'No disponible' : 'Agregar'}
    </button>
  </div>`;
}

function _detailsBody(group) {
  const rows = group.variants.map(v => `<li><span>${_escape(v.condition.label)}</span><span>${formatPrice(v.price)}</span><span>${v.available ? 'Disponible' : 'No disponible'}</span></li>`).join('');
  return `
    <p><strong>Concentración:</strong> ${_escape(group.concentration || 'No especificada')}</p>
    <p><strong>Tamaño:</strong> ${_escape(_sizeLabel(group.size) || 'No especificado')}</p>
    <p><strong>Disponibilidad:</strong> Por encargo</p>
    <ul class="quote-details-variants">${rows}</ul>`;
}

function _basketLine(item, unavailable = false) {
  const name = cleanDisplayName(item.name, item.concentration, item.size);
  const condition = detectCondition(item.name);
  const hasImage = Boolean(item.image);
  return `<article class="quote-basket-line${unavailable ? ' is-unavailable' : ''}">
    <div class="quote-basket-thumb${hasImage ? '' : ' img-shell img-failed'}">
      ${hasImage ? `<img src="${_escape(item.image)}" alt="" loading="lazy" decoding="async">` : ''}
    </div>
    <div class="quote-basket-line-info">
      <strong>${_escape(name)}</strong>
      <span>${_escape([condition.label, _sizeLabel(item.size)].filter(Boolean).join(' · '))}</span>
      <label class="quote-basket-qty">Cantidad
        <input type="number" inputmode="numeric" min="1" max="10" value="${Number(item.quantity) || 1}" data-quote-qty="${_escape(item.reference)}">
      </label>
    </div>
    <div class="quote-basket-line-actions">
      <strong>${unavailable ? 'Ya no disponible' : formatPrice(item.line_total ?? item.price)}</strong>
      <button type="button" class="quote-remove" data-quote-remove="${_escape(item.reference)}" aria-label="Quitar ${_escape(name)}">Quitar</button>
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

function _sizeLabel(size) {
  const text = String(size ?? '').trim();
  if (!text) return '';
  return /ml/i.test(text) ? text : `${text} ml`;
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

function _escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function _escape(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
