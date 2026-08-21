import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_EVENT_MAP } from '../assets/js/tracking/backend.js';

/* =============================================================
   CROSS-REPO DRIFT GUARD

   `/api/web/events` validates `event_name` against a CLOSED allowlist in
   R Supply OS (`app/Services/EventTrackingService::ALLOWED_EVENTS`). A name
   this storefront emits but that repo does not list is not a soft failure:
   the POST returns 422 and the event is lost, which is indistinguishable
   from the visitor never doing the thing.

   That is exactly what happened. This bridge emitted 54 distinct names while
   the backend listed 12, so everything except a dozen catalog/cart events —
   including both halves of the guided finder funnel — was dropped in
   production for as long as the finder has existed.

   The two repositories deploy separately, so nothing but this test stops
   them drifting apart again. Adding an event means editing THREE places:
     1. this storefront's Tracker + API_EVENT_MAP,
     2. EventTrackingService::ALLOWED_EVENTS in r-supply-os,
     3. the mirror below.
   ============================================================= */

/** Verbatim mirror of EventTrackingService::ALLOWED_EVENTS (r-supply-os). */
const BACKEND_ALLOWED_EVENTS = [
  // Catalog / product surfaces
  'product_viewed',
  'opened_product_modal',
  'catalog_impression',
  'product_modal_open',
  'product_pdp_view',
  'product_added_to_cart',
  'section_viewed',
  'scroll_depth_reached',
  // Search & filtering
  'search_performed',
  'search_result_clicked',
  'search_no_results',
  'filter_applied',
  'filter_cleared',
  'gender_filter_applied',
  'for_you_sort_applied',
  'guide_filter_removed',
  // Home merchandising
  'hero_cta_clicked',
  'home_path_selected',
  'roger_recommendation_clicked',
  'catalog_cta_clicked',
  // Guided finder
  'assistant_started',
  'assistant_completed',
  'recommendation_viewed',
  'recommendation_clicked',
  'recommendation_added',
  'recommendation_gender_selected',
  'personalized_catalog_viewed',
  'recommended_product_shown',
  'recommended_product_added',
  // Discovery / taste / collection builder
  'discovery_anchor_selected',
  'discovery_set_viewed',
  'discovery_set_clicked',
  'discovery_set_added',
  'collection_builder_viewed',
  'collection_builder_clicked',
  'collection_builder_added',
  'taste_like',
  'taste_dislike',
  'taste_skip',
  'taste_builder_recommendations_clicked',
  // Curated beginner packs
  'pack_viewed',
  'pack_selected',
  'pack_added',
  // Storefront promotion banner
  'promotion_viewed',
  'promotion_clicked',
  // Cart, shipping thresholds and checkout
  'cart_minimum_prompt_shown',
  'cart_minimum_prompt_converted',
  'cart_value_before_whatsapp',
  'shipping_eligible',
  'shipping_not_eligible',
  'amount_missing_for_shipping',
  'checkout_started',
  'checkout_completed',
  'whatsapp_checkout_clicked',
  'background_order_success',
  'background_order_failure',
  // Discounts & campaign attribution
  'discount_apply_attempt',
  'discount_applied',
  'discount_invalid',
  'discount_removed',
  'campaign_detected',
  'campaign_promo_auto_apply_attempted',
  'campaign_promo_applied',
  'campaign_promo_rejected',
  'campaign_checkout_attributed',
  // Bottle storefront and supplier quote funnel
  'perfumes_view',
  'bottle_offer_selected',
  'bottle_added_to_cart',
  'quote_search',
  'quote_item_added',
  'quote_submitted',
];

test('every event this storefront posts is accepted by the backend allowlist', () => {
  const emitted = [...new Set(Object.values(API_EVENT_MAP))];
  const rejected = emitted.filter(name => !BACKEND_ALLOWED_EVENTS.includes(name));

  assert.deepEqual(
    rejected,
    [],
    `These names would be 422'd and lost: ${rejected.join(', ')}. ` +
    'Add them to EventTrackingService::ALLOWED_EVENTS in r-supply-os and to the mirror in this file.',
  );
});

test('the guided-finder funnel is measurable end to end', () => {
  /* The whole point of the fix: these four answer "is Ayúdame a elegir worth
     the homepage space it takes?" */
  for (const name of ['assistant_started', 'assistant_completed', 'recommendation_clicked', 'product_added_to_cart']) {
    assert.ok(
      BACKEND_ALLOWED_EVENTS.includes(name),
      `${name} must be accepted by the backend.`,
    );
  }
});

test('the mirror has no duplicates', () => {
  assert.equal(BACKEND_ALLOWED_EVENTS.length, new Set(BACKEND_ALLOWED_EVENTS).size);
});
