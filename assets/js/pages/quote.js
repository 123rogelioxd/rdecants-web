import { bootstrapShell } from '../core/shell.js';
import { ApiClient } from '../api/client.js';
import { Tracker } from '../tracking/tracker.js';
import { primeImageStates } from '../ui/images.js';
import { formatPrice } from '../utils/prices.js';

export const MIN_QUOTE_QUERY = 2;
export const QUOTE_DEBOUNCE_MS = 350;

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

globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  await bootstrapShell();

  const input = document.getElementById('quote-search-input');
  const results = document.getElementById('quote-results');
  const basketEl = document.getElementById('quote-basket');
  const form = document.getElementById('quote-form');
  const submit = document.getElementById('quote-submit');
  if (!input || !results || !basketEl || !form || !submit) return;

  let searchTimer = null;
  let searchGeneration = 0;
  let lastQuery = '';
  let basket = [];
  let pricedBasket = { items: [], total: 0, unavailable: [] };
  let pricingGeneration = 0;
  let submitting = false;

  const renderBasket = () => {
    if (!basket.length) {
      basketEl.innerHTML = _basketEmpty();
      form.hidden = true;
      return;
    }

    form.hidden = false;
    const pricedByRef = new Map((pricedBasket.items ?? []).map(item => [item.reference, item]));
    const unavailable = new Set(pricedBasket.unavailable ?? []);
    basketEl.innerHTML = `
      <div class="quote-basket-lines">
        ${basket.map(item => _basketLine(pricedByRef.get(item.reference) ?? item, unavailable.has(item.reference))).join('')}
      </div>
      <div class="quote-total-row"><span>Total estimado RDECANTS</span><strong>${formatPrice(pricedBasket.total, 'Recalculando…')}</strong></div>
      ${(pricedBasket.unavailable ?? []).length ? '<p class="quote-alert" role="alert">Una o más fragancias ya no están disponibles. Retíralas para continuar.</p>' : ''}`;

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
    } catch {
      if (generation !== pricingGeneration) return;
      basketEl.innerHTML = '<p class="quote-alert" role="alert">No pudimos recalcular tu lista. <button type="button" class="btn-ghost" id="quote-price-retry">Reintentar</button></p>';
      document.getElementById('quote-price-retry')?.addEventListener('click', reprice);
    } finally {
      if (generation === pricingGeneration) basketEl.setAttribute('aria-busy', 'false');
    }
  };

  const search = async query => {
    const generation = ++searchGeneration;
    lastQuery = query;
    if (query.length < MIN_QUOTE_QUERY) {
      results.innerHTML = _searchPrompt();
      return;
    }

    results.setAttribute('aria-busy', 'true');
    results.innerHTML = '<div class="quote-loading" role="status">Buscando en el catálogo…</div>';
    try {
      const response = await ApiClient.searchQuoteCatalog(query);
      if (generation !== searchGeneration || input.value.trim() !== query) return;
      const items = Array.isArray(response?.results) ? response.results : [];
      Tracker.emit('quote_search', { query, resultCount: items.length });
      results.innerHTML = items.length
        ? `<div class="quote-result-grid">${items.map(_resultCard).join('')}</div>`
        : _searchState('No encontramos ese perfume', 'Prueba con la marca o con una parte del nombre.');
      primeImageStates(results);
      results.querySelectorAll('[data-quote-add]').forEach(button => {
        button.addEventListener('click', async () => {
          const item = items.find(candidate => candidate.reference === button.dataset.quoteAdd);
          basket = upsertQuoteItem(basket, item);
          Tracker.emit('quote_item_added', { reference: item.reference });
          await reprice();
          document.getElementById('quote-basket-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    } catch {
      if (generation !== searchGeneration) return;
      results.innerHTML = `${_searchState('El catálogo no respondió', 'Tu lista sigue aquí. Puedes volver a intentar la búsqueda.')}<button class="btn-primary" type="button" id="quote-search-retry">Reintentar</button>`;
      document.getElementById('quote-search-retry')?.addEventListener('click', () => search(lastQuery));
    } finally {
      if (generation === searchGeneration) results.setAttribute('aria-busy', 'false');
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = input.value.trim();
    searchTimer = setTimeout(() => search(query), QUOTE_DEBOUNCE_MS);
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

      form.innerHTML = `<div class="quote-success" role="status">
        <h2>Solicitud recibida</h2>
        <p>Roger recibió tu solicitud y confirmará disponibilidad contigo por WhatsApp.</p>
        <p><strong>Referencia ${_escape(response.reference)}</strong></p>
        <a class="btn-primary quote-whatsapp-fallback" href="${_escape(whatsappUrl)}" target="_blank" rel="noopener" hidden>Continuar por WhatsApp</a>
      </div>`;
      basketEl.hidden = true;

      /* The backend owns the WhatsApp message and URL. Do not rebuild a
         message here: quote-only data never belongs in frontend copy. */
      if (reservedWindow) reservedWindow.location.href = whatsappUrl;
      const opened = reservedWindow || window.open(whatsappUrl, '_blank');
      if (!opened) {
        form.querySelector('.quote-whatsapp-fallback')?.removeAttribute('hidden');
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

function _resultCard(item) {
  return `<article class="quote-result-card">
    <div class="quote-result-image${item.image ? '' : ' img-shell img-failed'}">
      ${item.image ? `<img src="${_escape(item.image)}" alt="${_escape(item.name)}" loading="lazy" decoding="async">` : ''}
    </div>
    <div class="quote-result-body">
      <h3>${_escape(item.name)}</h3>
      <p>${_escape([item.concentration, item.size].filter(Boolean).join(' · '))}</p>
      <p class="quote-availability">${item.available ? 'Disponible para cotizar' : 'No disponible'}</p>
      <strong>${formatPrice(item.price)}</strong>
      <button type="button" class="btn-primary" data-quote-add="${_escape(item.reference)}" ${item.available ? '' : 'disabled'}>Agregar a mi lista</button>
    </div>
  </article>`;
}

function _basketLine(item, unavailable = false) {
  return `<article class="quote-basket-line${unavailable ? ' is-unavailable' : ''}">
    <div><strong>${_escape(item.name)}</strong><span>${_escape([item.concentration, item.size].filter(Boolean).join(' · '))}</span></div>
    <label>Cantidad <input type="number" inputmode="numeric" min="1" max="10" value="${Number(item.quantity) || 1}" data-quote-qty="${_escape(item.reference)}"></label>
    <strong>${unavailable ? 'Ya no disponible' : formatPrice(item.line_total ?? item.price)}</strong>
    <button type="button" class="quote-remove" data-quote-remove="${_escape(item.reference)}" aria-label="Quitar ${_escape(item.name)}">Quitar</button>
  </article>`;
}

function _searchPrompt() { return _searchState('Busca un perfume', `Escribe al menos ${MIN_QUOTE_QUERY} letras. No cargamos miles de productos de golpe.`); }
function _basketEmpty() { return '<div class="quote-basket-empty"><p>Tu lista está vacía.</p><span>Agrega uno o varios perfumes y recalcularemos el precio completo.</span></div>'; }
function _searchState(title, copy) { return `<div class="quote-state"><span aria-hidden="true">R</span><h2>${title}</h2><p>${copy}</p></div>`; }
function _escape(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
