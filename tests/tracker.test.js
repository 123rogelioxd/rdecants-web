import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Tracker,
  EVENTS,
  eventDedupKey,
  shouldEmitEvent,
} from '../assets/js/tracking/tracker.js';

/* ── Middleware / provider chain ────────────────────────────────
   CRITICAL: tracker.js must be imported with the SAME url (no ?v=)
   in every module. A version-string mismatch creates two separate
   module instances with separate _providers arrays — the provider
   registered in app.js would never fire for events emitted by modal,
   cart, or any other UI module.
   ───────────────────────────────────────────────────────────── */
test('Tracker.use() provider fires when Tracker.emit() is called', () => {
  const received = [];

  Tracker.use((event, payload) => {
    if (event === '__test_bridge__') received.push({ event, payload });
  });

  Tracker.emit('__test_bridge__', { check: true }, { allowDuplicate: true });

  assert.equal(received.length, 1, 'provider must be called exactly once');
  assert.equal(received[0].event, '__test_bridge__');
  assert.equal(received[0].payload.check, true);
});

test('Tracker.use() provider receives enriched payload with sessionId and url', () => {
  const received = [];

  Tracker.use((event, payload) => {
    if (event === '__test_enriched__') received.push(payload);
  });

  Tracker.emit('__test_enriched__', { productId: 'abc' }, { allowDuplicate: true });

  assert.equal(received.length, 1);
  assert.ok('sessionId' in received[0], 'enriched payload must have sessionId');
  assert.ok('ts' in received[0], 'enriched payload must have ts');
  assert.equal(received[0].productId, 'abc', 'original payload fields must survive enrichment');
});

test('event dedupe key includes commerce context', () => {
  const a = eventDedupKey(EVENTS.RECOMMENDATION_CLICKED, {
    productId: 'ysl-y',
    position: 1,
    context: { railId: 'cart_upsell' },
  });
  const b = eventDedupKey(EVENTS.RECOMMENDATION_CLICKED, {
    productId: 'ysl-y',
    position: 2,
    context: { railId: 'cart_upsell' },
  });

  assert.notEqual(a, b);
});

test('dedupe suppresses immediate duplicate events', () => {
  const recent = new Map();
  const payload = { productId: 'torino-21', context: { railId: 'cart_upsell' } };

  assert.equal(shouldEmitEvent(EVENTS.RECOMMENDATION_VIEWED, payload, 1000, recent), true);
  assert.equal(shouldEmitEvent(EVENTS.RECOMMENDATION_VIEWED, payload, 1200, recent), false);
});

test('dedupe allows events after their window expires', () => {
  const recent = new Map();
  const payload = { productId: 'torino-21', position: 1 };

  assert.equal(shouldEmitEvent(EVENTS.RECOMMENDATION_CLICKED, payload, 1000, recent), true);
  assert.equal(shouldEmitEvent(EVENTS.RECOMMENDATION_CLICKED, payload, 3000, recent), true);
});
