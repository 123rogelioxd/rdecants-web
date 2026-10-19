/* Public RDECANTS sales channel. Preserve the backend's accepted-order message,
 * but never let a stale organization setting send customers to another number.
 * This is the outgoing customer handoff, not the inbound messaging integration. */
export const SALES_WHATSAPP_NUMBER = '529513446211';

export function normalizeSalesWhatsAppUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' ||
        url.username || url.password || url.port || url.hash ||
        !/^\/\d{8,15}$/.test(url.pathname)) return null;
    url.pathname = `/${SALES_WHATSAPP_NUMBER}`;
    return url.href;
  } catch {
    return null;
  }
}
