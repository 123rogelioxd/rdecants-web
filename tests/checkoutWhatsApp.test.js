import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __RDECANTS_API_BASE__: '',
  location: { hostname: 'localhost', pathname: '/' },
};

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const { buildWhatsAppMessage } = await import('../assets/js/cart/checkout.js');

test('buildWhatsAppMessage creates a natural customer WhatsApp message', () => {
  const message = buildWhatsAppMessage(
    [
      { name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 },
      { name: 'ONE MILLION LUCKY', house: 'PACO RABANNE', size: 5, price: 200, qty: 1 },
      { name: 'LE BEAU LE PARFUM', house: 'JEAN PAUL GAULTIER', size: 5, price: 200, qty: 1 },
    ],
    570,
    { name: 'Roger' },
    'WEB-20260603-0002',
  );

  assert.equal(message, [
    'Hola 👋',
    '',
    'Me interesan estos decants:',
    '• Invictus Victory — 5ml — $170',
    '• One Million Lucky — 5ml — $200',
    '• Le Beau Le Parfum — 5ml — $200',
    '',
    'Total: $570 MXN',
    '',
    'Mi nombre es Roger.',
    '',
    'Quedo pendiente de disponibilidad y detalles de compra.',
  ].join('\n'));

  assert.doesNotMatch(message, /Folio|Casa|Presentaci[oó]n|Cantidad|Solo a|Producto:/);
});

test('buildWhatsAppMessage uses singular copy for one decant', () => {
  const message = buildWhatsAppMessage(
    [{ name: 'VICTORY', house: 'INVICTUS', size: 5, price: 170, qty: 1 }],
    170,
    { name: 'Roger' },
    'WEB-20260603-0002',
  );

  assert.match(message, /Me interesa este decant:/);
  assert.doesNotMatch(message, /Me interesan estos decants:/);
});
