/* =============================================================
   RDECANTS — CONTEXTUAL UPSELLS
   Operational-first product-to-product and cart recommendations.

   Two pure entry points (catalog passed in, so they are testable):
     getRelatedProducts(seed, products)  — modal "te puede gustar"
     getCartUpsells(cartItems, products) — cart add-on suggestions

   Revenue intelligence, applied centrally:
     • never surface sold-out products
     • down-rank nearly-gone stock so we don't push what we can't
       comfortably fulfil (operational health over a quick sale)
     • a subtle lift for featured / high-rotation products
   All similarity comes from REAL catalog metadata (house, notes,
   description). No AI, no fabricated affinity.
   ============================================================= */

import { getScarcityState, hasHighDemand } from '../utils/scarcity.js?v=1.0.13';
import { getOrderableVariants } from '../utils/prices.js?v=1.0.13';

const RELATED_LIMIT = 4;
const CART_LIMIT = 3;

const SAME_HOUSE_WEIGHT = 8;
const SHARED_NOTE_WEIGHT = 3;
const SHARED_TEXT_WEIGHT = 1;
const MAX_TEXT_TOKENS = 12;

const LAST_UNITS_PENALTY = 6;
const LOW_STOCK_PENALTY = 1;
const FEATURED_BOOST = 3;
const DEMAND_BOOST = 2;

export function getRelatedProducts(seed, products, { limit = RELATED_LIMIT } = {}) {
  if (!seed || !Array.isArray(products)) return [];

  const seedProfile = _profile([seed]);

  return _rank(
    products.filter(p => p && String(p.id) !== String(seed.id)),
    seedProfile,
    limit,
  );
}

export function getCartUpsells(cartItems, products, { limit = CART_LIMIT } = {}) {
  if (!Array.isArray(cartItems) || !cartItems.length || !Array.isArray(products)) return [];

  const inCart = new Set(
    cartItems.map(item => String(item.sourceId ?? item.product_id ?? item.id)),
  );

  const cartProducts = [...inCart]
    .map(id => products.find(p => String(p.id) === id))
    .filter(Boolean);

  if (!cartProducts.length) return [];

  const profile = _profile(cartProducts);

  return _rank(
    products.filter(p => p && !inCart.has(String(p.id))),
    profile,
    limit,
  );
}

/* ── Ranking ───────────────────────────────────────────────── */
function _rank(candidates, profile, limit) {
  return candidates
    .map(product => ({ product, score: _score(product, profile) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.product);
}

function _score(product, profile) {
  if (getScarcityState(product) === 'sold_out') return 0;
  if (!getOrderableVariants(product).length) return 0;

  const notes = (product.notes ?? []).map(_norm);
  const house = _norm(product.house);
  const text = _productText(product);

  let score = 0;

  if (house && profile.houses.has(house)) score += SAME_HOUSE_WEIGHT;

  score += notes.filter(note => profile.notes.has(note)).length * SHARED_NOTE_WEIGHT;

  score += [...profile.tokens].filter(token => text.includes(token)).length * SHARED_TEXT_WEIGHT;

  if (score <= 0) return 0;

  return Math.max(0, score + _healthAdjust(product));
}

function _healthAdjust(product) {
  const state = getScarcityState(product);
  let adj = 0;
  if (state === 'last_units') adj -= LAST_UNITS_PENALTY;
  else if (state === 'low') adj -= LOW_STOCK_PENALTY;
  if (product.featured) adj += FEATURED_BOOST;
  if (hasHighDemand(product)) adj += DEMAND_BOOST;
  return adj;
}

/* ── Seed profile from one or more products ────────────────── */
function _profile(seedProducts) {
  const houses = new Set();
  const notes = new Set();
  const tokens = new Set();

  seedProducts.forEach(product => {
    const house = _norm(product.house);
    if (house) houses.add(house);
    (product.notes ?? []).forEach(note => {
      const n = _norm(note);
      if (n) notes.add(n);
    });
    _productText(product)
      .split(' ')
      .filter(token => token.length >= 4)
      .slice(0, MAX_TEXT_TOKENS)
      .forEach(token => tokens.add(token));
  });

  return { houses, notes, tokens };
}

function _productText(product) {
  return _norm([product.desc, product.story, ...(product.notes ?? [])].join(' '));
}

function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
