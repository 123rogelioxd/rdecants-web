/* =============================================================
   RDECANTS - BACKEND EVENT BRIDGE
   Translates local Tracker events into the Laravel /api/web/events
   contract accepted by R Supply OS.
   ============================================================= */

import { trackEvent } from './events.js?v=1.0.14';

export const API_EVENT_MAP = {
  viewed_product:            'product_viewed',
  opened_product_modal:      'product_modal_open',
  product_pdp_view:          'product_pdp_view',
  add_to_cart:               'product_added_to_cart',
  checkout_started:          'checkout_started',
  checkout_completed:        'checkout_completed',
  checkout_whatsapp_clicked: 'whatsapp_checkout_clicked',
  cart_minimum_prompt_shown: 'cart_minimum_prompt_shown',
  cart_minimum_prompt_converted: 'cart_minimum_prompt_converted',
  recommendation_viewed:     'recommendation_viewed',
  recommendation_clicked:    'recommendation_clicked',
  recommendation_added:      'recommendation_added',
  bundle_viewed:             'bundle_viewed',
  bundle_added:              'bundle_added',
  assistant_started:         'assistant_started',
  assistant_completed:       'assistant_completed',
  discovery_anchor_selected: 'discovery_anchor_selected',
  discovery_set_viewed:      'discovery_set_viewed',
  discovery_set_clicked:     'discovery_set_clicked',
  discovery_set_added:       'discovery_set_added',
  collection_builder_viewed: 'collection_builder_viewed',
  collection_builder_clicked: 'collection_builder_clicked',
  collection_builder_added:  'collection_builder_added',
  taste_like:                'taste_like',
  taste_dislike:             'taste_dislike',
  taste_skip:                'taste_skip',
  search_performed:          'search_performed',
  search_result_clicked:     'search_result_clicked',
  search_no_results:         'search_no_results',
  catalog_reached:           'catalog_impression',
  section_viewed:            'section_viewed',
  filter_applied:            'filter_applied',
  filter_cleared:            'filter_cleared',
  scroll_depth_reached:      'scroll_depth_reached',
  gender_filter_applied:     'gender_filter_applied',
  recommendation_gender_selected: 'recommendation_gender_selected',
  personalized_catalog_viewed: 'personalized_catalog_viewed',
  for_you_sort_applied: 'for_you_sort_applied',
  taste_builder_recommendations_clicked: 'taste_builder_recommendations_clicked',
};

let _installed = false;

export function installBackendTracking(Tracker) {
  if (_installed || !Tracker?.use) return;
  _installed = true;

  Tracker.use((event, payload) => {
    const apiName = API_EVENT_MAP[event];
    if (!apiName) return;
    trackEvent(apiName, toApiPayload(event, payload));
  });
}

export function toApiPayload(event, payload = {}) {
  const pid = payload.product_id ?? payload.productId ?? null;

  switch (event) {
    case 'viewed_product':
      return {
        product_id: pid,
        metadata: productMetadata(payload, payload.source ?? 'catalog'),
      };
    case 'opened_product_modal':
      return {
        product_id: pid,
        metadata: productMetadata(payload, 'modal'),
      };
    case 'product_pdp_view':
      return {
        product_id: pid,
        metadata: productMetadata(payload, 'pdp'),
      };
    case 'add_to_cart':
      return {
        product_id: pid,
        variant_id: payload.variant_id || null,
        metadata: {
          name: payload.productName,
          size: payload.size,
          price: payload.price,
          source_component: payload.source ?? 'size_btn',
        },
      };
    case 'checkout_started':
      return { metadata: { cart_total: payload.total, items_count: payload.itemCount } };
    case 'checkout_whatsapp_clicked':
    case 'checkout_completed':
      return {
        metadata: {
          cart_total: payload.total,
          items_count: payload.itemCount,
          delivery: payload.delivery,
          payment: payload.payment,
        },
      };
    case 'recommendation_viewed':
      return {
        metadata: {
          ids: payload.ids,
          count: payload.count,
          rail_id: payload.context?.railId,
          rail_title: payload.context?.railTitle,
        },
      };
    case 'recommendation_clicked':
    case 'recommendation_added':
      return {
        product_id: pid,
        metadata: {
          name: payload.productName,
          rail_id: payload.context?.railId,
          rail_title: payload.context?.railTitle,
          position: payload.position,
          source_component: 'recommendation_rail',
        },
      };
    case 'cart_minimum_prompt_shown':
    case 'cart_minimum_prompt_converted':
      return {
        metadata: {
          cart_total: payload.total,
          threshold: payload.threshold,
          remaining: payload.remaining,
          progress: payload.progress,
          ids: payload.ids,
        },
      };
    case 'bundle_viewed':
    case 'bundle_added':
      return { metadata: { bundle_id: payload.bundleId, title: payload.title, ids: payload.ids, total: payload.total } };
    case 'assistant_started':
    case 'assistant_completed':
      return { metadata: { answers: payload.answers, ids: payload.ids, count: payload.count } };
    case 'discovery_anchor_selected':
      return { product_id: pid, metadata: productMetadata(payload, 'discovery') };
    case 'discovery_set_viewed':
    case 'discovery_set_added':
      return { metadata: { set_id: payload.setId, name: payload.name, ids: payload.ids, total: payload.total } };
    case 'discovery_set_clicked':
      return { metadata: { set_id: payload.setId, name: payload.name, source: payload.source } };
    case 'collection_builder_viewed':
      return { metadata: { ids: payload.ids, count: payload.count, source: payload.source } };
    case 'collection_builder_clicked':
    case 'collection_builder_added':
      return {
        product_id: pid,
        metadata: {
          ...productMetadata(payload, 'collection_builder'),
          position: payload.position,
          source: payload.source,
        },
      };
    case 'taste_like':
    case 'taste_dislike':
    case 'taste_skip':
      return { product_id: pid, metadata: productMetadata(payload, 'taste_builder') };
    case 'search_performed':
    case 'search_no_results':
      return { metadata: { query: payload.query, results_count: payload.results_count, source: payload.source } };
    case 'search_result_clicked':
      return {
        product_id: pid,
        metadata: {
          name: payload.productName,
          house: payload.house,
          query: payload.query,
          position: payload.position,
        },
      };
    case 'catalog_reached':
      return { metadata: { ms_since_load: payload.ms_since_load } };
    case 'section_viewed':
      return { metadata: { section_id: payload.section_id, position_index: payload.position_index } };
    case 'filter_applied':
      return { metadata: { type: payload.type, value: payload.value, results_count: payload.results_count } };
    case 'filter_cleared':
      return {};
    case 'scroll_depth_reached':
      return { metadata: { pct: payload.pct } };
    case 'gender_filter_applied':
    case 'recommendation_gender_selected':
      return { metadata: { gender_preference: payload.gender_preference, source: payload.source } };
    case 'personalized_catalog_viewed':
      return { metadata: { likes: payload.likes, dislikes: payload.dislikes } };
    case 'for_you_sort_applied':
      return { metadata: { source: payload.source } };
    case 'taste_builder_recommendations_clicked':
      return { metadata: { likes_count: payload.likes_count } };
    default:
      return {};
  }
}

function productMetadata(payload, sourceComponent) {
  return {
    name: payload.productName,
    house: payload.house,
    source_component: sourceComponent,
  };
}
