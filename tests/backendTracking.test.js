import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_EVENT_MAP, toApiPayload } from '../assets/js/tracking/backend.js';
import { trackEvent } from '../assets/js/tracking/events.js';

test('backend event map uses Laravel-accepted names for critical storefront events', () => {
  assert.equal(API_EVENT_MAP.catalog_reached, 'catalog_impression');
  assert.equal(API_EVENT_MAP.opened_product_modal, 'product_modal_open');
  assert.equal(API_EVENT_MAP.product_pdp_view, 'product_pdp_view');
  assert.equal(API_EVENT_MAP.add_to_cart, 'product_added_to_cart');
  assert.equal(API_EVENT_MAP.checkout_started, 'checkout_started');
  assert.equal(API_EVENT_MAP.checkout_whatsapp_clicked, 'whatsapp_checkout_clicked');
});

test('bundle events stay local until Laravel accepts a bundle event_name', () => {
  assert.equal(API_EVENT_MAP.bundle_viewed, undefined);
  assert.equal(API_EVENT_MAP.bundle_added, undefined);
  assert.deepEqual(toApiPayload('bundle_viewed', {
    bundleId: 'calor-tropical',
    title: 'Calor tropical',
    ids: ['a', 'b'],
    total: 399,
  }), {
    metadata: {
      bundle_id: 'calor-tropical',
      title: 'Calor tropical',
      ids: ['a', 'b'],
      total: 399,
    },
  });
});

test('catalog_impression payload keeps catalog timing metadata', () => {
  assert.deepEqual(toApiPayload('catalog_reached', { ms_since_load: 321 }), {
    metadata: { ms_since_load: 321 },
  });
});

test('product modal and PDP views use distinct backend surfaces', () => {
  const product = {
    product_id: 42,
    productId: 'ysl-y-edp',
    productName: 'Y EDP',
    house: 'YSL',
  };

  assert.deepEqual(toApiPayload('opened_product_modal', product), {
    product_id: 42,
    metadata: {
      name: 'Y EDP',
      house: 'YSL',
      source_component: 'modal',
    },
  });

  assert.deepEqual(toApiPayload('product_pdp_view', product), {
    product_id: 42,
    metadata: {
      name: 'Y EDP',
      house: 'YSL',
      source_component: 'pdp',
    },
  });
});

test('commerce events preserve backend-compatible event payloads', () => {
  assert.deepEqual(toApiPayload('add_to_cart', {
    product_id: 42,
    variant_id: 7,
    productName: 'Y EDP',
    size: 5,
    price: 149,
    source: 'quick_add',
  }), {
    product_id: 42,
    variant_id: 7,
    metadata: {
      name: 'Y EDP',
      size: 5,
      price: 149,
      source_component: 'quick_add',
    },
  });

  assert.deepEqual(toApiPayload('checkout_started', { total: 450, itemCount: 3 }), {
    metadata: { cart_total: 450, items_count: 3 },
  });

  assert.deepEqual(toApiPayload('checkout_whatsapp_clicked', { total: 450, itemCount: 3 }), {
    metadata: {
      cart_total: 450,
      items_count: 3,
      delivery: undefined,
      payment: undefined,
    },
  });
});

test('trackEvent sends legacy and current event fields plus page context', async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;

  globalThis.window = {
    location: {
      href: 'https://rdecants.com/perfume/ysl-y-edp',
      pathname: '/perfume/ysl-y-edp',
      hostname: 'rdecants.com',
    },
  };
  globalThis.localStorage = {
    getItem: key => key === 'rd_sid' ? 'session_123' : null,
    setItem: () => {},
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true };
  };

  try {
    trackEvent('product_pdp_view', { product_id: 42, metadata: { source_component: 'pdp' } });
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
    globalThis.localStorage = previousLocalStorage;
  }

  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.event, 'product_pdp_view');
  assert.equal(body.event_name, 'product_pdp_view');
  assert.equal(body.session_id, 'session_123');
  assert.equal(body.source, 'web');
  assert.equal(body.surface, 'web');
  assert.equal(body.url, 'https://rdecants.com/perfume/ysl-y-edp');
  assert.equal(body.path, '/perfume/ysl-y-edp');
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.product_id, 42);
});
