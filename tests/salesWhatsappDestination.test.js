import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSalesWhatsAppUrl } from '../assets/js/utils/whatsapp.js';
import { orderWhatsAppUrl } from '../assets/js/cart/checkout.js';

const correct = 'https://wa.me/529513446211';
const old = 'https://wa.me/5219516513018';

test('legacy WhatsApp recipient is replaced without changing the canonical backend order message', () => {
  const original = `${old}?text=Hola%2C%20pedido%20WEB-7%20%24900`;
  const result = orderWhatsAppUrl({ whatsapp_url: original });
  assert.equal(result, `${correct}?text=Hola%2C%20pedido%20WEB-7%20%24900`);
  assert.equal(new URL(result).searchParams.get('text'), 'Hola, pedido WEB-7 $900');
});

test('cotiza uses the same canonical destination for old and newer configured numbers', () => {
  assert.equal(normalizeSalesWhatsAppUrl(`${old}?text=Cotizar%20perfume`), `${correct}?text=Cotizar%20perfume`);
  assert.equal(normalizeSalesWhatsAppUrl(`${correct}?text=Hola`), `${correct}?text=Hola`);
  assert.equal(normalizeSalesWhatsAppUrl('https://wa.me/529519999999?text=Hola'), `${correct}?text=Hola`);
});

test('rejects non-WhatsApp URLs, missing recipient, and deceptive destinations', () => {
  for (const unsafe of ['javascript:alert(1)', 'https://wa.me.evil.com/529513446211',
    'https://wa.me/', 'http://wa.me/529513446211', 'https://wa.me/529513446211#bad',
    'https://evil.com/?text=hi', 'https://wa.me/abc']) {
    assert.equal(normalizeSalesWhatsAppUrl(unsafe), null);
  }
});
