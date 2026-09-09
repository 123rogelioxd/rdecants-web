/* =============================================================
   RDECANTS — MI CUENTA
   Who this browser is, according to R Supply OS.

   ── There is no login, and that is the design ────────────────
   A customer becomes recognised by ORDERING. The API sets an HttpOnly session
   cookie when their first order is registered, and from then on this module
   just asks "who am I" and gets an answer. Nothing here stores a name, a phone
   number or an order — every one of those is fetched, because the copy that
   matters lives in R Supply OS and a copy kept here would be free to disagree
   with it.

   ── Nothing here is a credential ─────────────────────────────
   The session token is HttpOnly: this file cannot read it, and neither can any
   script that ends up on the page. All it can do is make a credentialed request
   and be told yes or no.

   ── A guest is not an error ──────────────────────────────────
   401 is the ordinary answer for somebody who has not ordered yet. It resolves
   to `authenticated: false` and the UI shows the empty state; it never throws,
   never retries and never logs a customer out of anything.
   ============================================================= */

import { ApiClient } from '../api/client.js';

/* One in-flight identity request per page load, shared by every caller.

   The header, the account page and the checkout prefill all want the same
   answer at the same moment. Without this they would each fire their own
   request and the third one would arrive after the form was already filled. */
let _identity = null;

/* Guards a single "is this a returning customer" analytics event per page. */
let _recognitionReported = false;

export const Account = {
  /** Who this browser is. Cached for the page load; pass true to re-ask. */
  async identity({ refresh = false } = {}) {
    if (refresh) _identity = null;
    _identity ??= ApiClient.getAccount()
      .then(response => {
        if (response.status === 401 || !response.ok) {
          return { authenticated: false, customer: null, delivery: null, ordersCount: 0 };
        }

        const data = response.data ?? {};

        return {
          authenticated: data.authenticated === true,
          customer: data.customer ?? null,
          delivery: data.delivery ?? null,
          ordersCount: Number(data.orders_count) || 0,
        };
      })
      /* A network failure is not "you are a guest" — but it has to render as
         something, and the safe something is the guest view. The customer's
         orders are still there on the next load; nothing is lost by showing
         less. */
      .catch(() => ({ authenticated: false, customer: null, delivery: null, ordersCount: 0, offline: true }));

    return _identity;
  },

  /** Cheap "should the menu show Mis pedidos" check. */
  async isRecognised() {
    return (await this.identity()).authenticated === true;
  },

  /** This customer's orders, newest first. Empty for a guest. */
  async orders() {
    const response = await ApiClient.getAccountOrders();
    if (!response.ok) return [];

    return Array.isArray(response.data?.orders) ? response.data.orders : [];
  },

  /**
   * One order in full, or null.
   *
   * Null covers both "no such folio" and "not yours" because the API answers
   * them identically — telling them apart would confirm that a folio belongs to
   * somebody.
   */
  async order(folio) {
    if (!folio) return null;
    const response = await ApiClient.getAccountOrder(folio);

    return response.ok ? (response.data?.order ?? null) : null;
  },

  /** Sign this browser out. Revokes the session server-side, not just locally. */
  async forget() {
    try {
      await ApiClient.forgetAccount();
    } catch { /* already gone, or offline — the local view resets either way */ }

    _identity = null;
    _recognitionReported = false;
  },

  /**
   * The saved delivery data worth putting into the next order, or null.
   *
   * Read from the customer's most recent order, which is where it already lives
   * — there is no separate address book to keep in sync. Always editable: this
   * fills fields in, it does not lock them.
   */
  async prefill() {
    const identity = await this.identity();
    if (!identity.authenticated) return null;

    const address = identity.delivery?.address ?? null;
    const name = identity.customer?.name ?? null;
    const phone = identity.customer?.phone ?? null;

    if (!address && !name && !phone) return null;

    return { name, phone, mode: identity.delivery?.mode ?? null, address: address ?? {} };
  },

  /** Fires once per page load, and only for a customer we actually recognised. */
  shouldReportRecognition() {
    if (_recognitionReported) return false;
    _recognitionReported = true;

    return true;
  },

  /** Test seam: drops the cached identity so a suite can re-stub the API. */
  _reset() {
    _identity = null;
    _recognitionReported = false;
  },
};

/* ── Presentation ────────────────────────────────────────────────────────
   Status arrives from the API already resolved into a customer-facing label
   and a sentence — the storefront must not invent either, because a second
   status vocabulary here could disagree with the operator's board. These
   helpers only choose a TONE for it. */

const OPEN_TONES = {
  registrado: 'pending',
  confirmado: 'progress',
  en_preparacion: 'progress',
  listo: 'progress',
  en_ruta: 'progress',
  entregado: 'done',
  cancelado: 'cancelled',
};

export function statusTone(status) {
  return OPEN_TONES[status?.progress] ?? 'pending';
}

/* Payment is a separate question from progress and is never inferred from it.
   Only `pagado` is a positive claim, and it arrives only when an operator
   marked the collection settled. */
export function paymentTone(status) {
  return status?.payment === 'pagado' ? 'done' : 'pending';
}

export function formatOrderDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/* "$1,250 MXN", or the honest absence of a number.

   `null` means the delivery has not been priced, so the order genuinely has no
   final total. It must never render as $0 — that would tell a customer their
   delivery is free. */
export function formatOrderTotal(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;

  return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value))} MXN`;
}
