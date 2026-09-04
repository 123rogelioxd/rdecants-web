/* =============================================================
   RDECANTS — ADDRESS (postal-code-first)

   Binds a "Dónde te lo enviamos" form to the postal-code catalog:

     CP → resolve state/municipio → real colonias → customer picks one
        → street + exterior number
        → "+ Interior / depto. (opcional)" stays collapsed

   Shared by the cart drawer's delivery panel (ui/deliveryPanel.js) AND the
   Cotiza tu perfume page (pages/quote.js) — one form, one behaviour,
   mounted twice. Deliberately holds no state of its own beyond the current
   resolution: the caller's own state module (Delivery, or the quote page's
   own address object) is the source of truth, reached through the
   `onFieldChange` callback below.

   ── What this module never does ────────────────────────────────────────
   It never assumes a postal code determines a street — only state,
   municipio and the real colonias that share it. A code the catalog does
   not have falls back to a plain text colonia/city/state, gracefully: real
   gaps exist (very new subdivisions, some rural areas), and a blocked
   checkout over a data gap would be worse than an unverified colonia.
   ============================================================= */

import { ApiClient } from '../api/client.js';

const DEBOUNCE_MS = 350;

/**
 * @param {HTMLElement} root - subtree containing every element below.
 * @param {object} options
 * @param {(field: string, value: string) => void} options.onFieldChange
 * @param {() => void} [options.onChange] - fired after any field settles,
 *   for callers that want to re-quote/re-render.
 */
export function bindAddressForm(root, { onFieldChange, onChange = () => {} }) {
  if (!root) return null;

  const postalInput = root.querySelector('[data-address="postal_code"]');
  const locationHint = root.querySelector('[data-address-location]');
  const coloniaSelectWrap = root.querySelector('[data-address-colonia-select-wrap]');
  const coloniaSelect = root.querySelector('[data-address-colonia-select]');
  const coloniaManualWrap = root.querySelector('[data-address-colonia-manual-wrap]');
  const coloniaManualInput = root.querySelector('[data-address-colonia-manual-wrap] [data-address="neighborhood"]');
  const cityWrap = root.querySelector('[data-address-city-wrap]');
  const stateWrap = root.querySelector('[data-address-state-wrap]');
  const moreToggle = root.querySelector('[data-address-more-toggle]');
  const more = root.querySelector('[data-address-more]');

  if (!postalInput) return null;

  let debounceTimer = null;
  let requestGeneration = 0;
  let lastResolution = null;

  const emit = (field, value) => {
    onFieldChange(field, value);
    onChange();
  };

  /* Every non-colonia field with a plain data-address binds itself the same
     generic way — street, exterior/interior number, recipient, phone,
     references, and (in the unresolved fallback) city/state as free text. */
  root.querySelectorAll('[data-address]').forEach(input => {
    if (input === postalInput || input === coloniaManualInput) return;
    input.addEventListener('input', () => emit(input.dataset.address, input.value));
  });

  moreToggle?.addEventListener('click', () => {
    const show = more.hidden;
    more.hidden = !show;
    moreToggle.setAttribute('aria-expanded', String(show));
    moreToggle.textContent = show ? '− Interior / depto.' : '+ Interior / depto. (opcional)';
  });

  const showManualColonia = () => {
    if (coloniaSelectWrap) coloniaSelectWrap.hidden = true;
    if (coloniaManualWrap) coloniaManualWrap.hidden = false;
    if (cityWrap) cityWrap.hidden = false;
    if (stateWrap) stateWrap.hidden = false;
  };

  const showColoniaSelect = () => {
    if (coloniaSelectWrap) coloniaSelectWrap.hidden = false;
    if (coloniaManualWrap) coloniaManualWrap.hidden = true;
    if (cityWrap) cityWrap.hidden = true;
    if (stateWrap) stateWrap.hidden = true;
  };

  const renderUnresolved = () => {
    lastResolution = null;
    if (locationHint) {
      locationHint.hidden = true;
      locationHint.textContent = '';
    }
    showManualColonia();
    if (coloniaManualInput) coloniaManualInput.value = '';
    emit('municipio', '');
    emit('city', '');
    emit('state', '');
  };

  const renderResolved = resolution => {
    lastResolution = resolution;
    showColoniaSelect();

    if (locationHint) {
      locationHint.hidden = false;
      locationHint.textContent = `📍 ${resolution.municipio}, ${resolution.estado}`;
    }

    if (coloniaSelect) {
      coloniaSelect.innerHTML = '<option value="">Elige tu colonia</option>'
        + resolution.colonias.map(c => `<option value="${_escape(c.colonia)}">${_escape(c.colonia)}</option>`).join('');
    }

    emit('municipio', resolution.municipio);
    emit('city', resolution.ciudad || resolution.municipio);
    emit('state', resolution.estado);
    // A fresh resolution invalidates whichever colonia was chosen before —
    // the customer must confirm again rather than keep a stale one.
    emit('neighborhood', '');
  };

  coloniaSelect?.addEventListener('change', () => emit('neighborhood', coloniaSelect.value));

  const lookup = async cp => {
    const generation = ++requestGeneration;

    try {
      const resolution = await ApiClient.getPostalCode(cp);
      if (generation !== requestGeneration) return; // superseded by a newer keystroke

      if (resolution?.ok && Array.isArray(resolution.colonias) && resolution.colonias.length) {
        renderResolved(resolution);
      } else {
        renderUnresolved();
      }
    } catch {
      if (generation !== requestGeneration) return;
      // A network hiccup is the same as "not in the catalog" to the
      // customer: they can still complete the address by hand.
      renderUnresolved();
    }

    onChange();
  };

  postalInput.addEventListener('input', () => {
    const digits = postalInput.value.replace(/\D/g, '').slice(0, 5);
    if (digits !== postalInput.value) postalInput.value = digits;

    emit('postal_code', digits);

    clearTimeout(debounceTimer);
    requestGeneration++; // any in-flight lookup for the old value is now stale

    if (digits.length !== 5) {
      renderUnresolved();
      return;
    }

    debounceTimer = setTimeout(() => lookup(digits), DEBOUNCE_MS);
  });

  return {
    /** The last successful resolution, or null (unresolved / not looked up yet). */
    resolution: () => lastResolution,
    /** Restore a previously-typed postal code (e.g. from localStorage) and re-resolve it. */
    hydrate(postalCode) {
      if (!postalCode || postalCode.length !== 5) return;
      postalInput.value = postalCode;
      lookup(postalCode);
    },
  };
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
