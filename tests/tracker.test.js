import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  eventDedupKey,
  shouldEmitEvent,
} from '../assets/js/tracking/tracker.js';

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
