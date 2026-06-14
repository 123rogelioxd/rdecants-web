import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_QUESTIONS, getAssistantRecommendations } from '../assets/js/recommendations/assistant.js';
import { PRODUCTS } from '../data/products.js';

const variant = (size, price, stock) => ({
  size, price, stock,
  availability: stock, public_stock: stock,
  available: stock > 0, soldOut: stock <= 0,
  variant_id: 900 + size,
});
const product = (id, notes, desc, { stock = 20, price = 180, badge = 'Disponible', featured = false, variants = null } = {}) => ({
  id, name: id, house: 'House', notes, desc, story: desc, badge, featured,
  variants: variants ?? [variant(5, price, stock)],
});

const apiProduct = (id, fragrance, opts = {}) => ({
  id,
  name: id,
  house: opts.house ?? 'House',
  notes: opts.notes ?? [],
  desc: opts.desc ?? '',
  story: opts.story ?? opts.desc ?? '',
  badge: opts.badge ?? 'Disponible',
  featured: opts.featured ?? false,
  active: opts.active,
  status: opts.status,
  variants: opts.variants ?? [variant(5, opts.price ?? 180, opts.stock ?? 20)],
  fragrance,
});

const freshOffice = product('FreshOffice', ['marino', 'citrico', 'vetiver'], 'fresco limpio para oficina y verano', { price: 160 });
const sweetNight = product('SweetNight', ['vainilla', 'tonka', 'canela'], 'dulce nocturno para fiesta deja rastro', { price: 220, badge: 'Alta demanda', featured: true });
const intenseOud = product('IntenseOud', ['oud', 'cuero', 'ambar'], 'intenso oriental potente seductor', { price: 300 });
const soldOut = product('SoldOut', ['marino', 'citrico'], 'fresco verano oficina', { stock: 0, price: 150 });
const catalog = [freshOffice, sweetNight, intenseOud, soldOut];

const ids = (list) => list.map(r => r.product.id);

test('exposes four guided questions including gender', () => {
  assert.equal(ASSISTANT_QUESTIONS.length, 4);
  for (const q of ASSISTANT_QUESTIONS) {
    assert.ok(q.id && q.label && Array.isArray(q.options) && q.options.length >= 2);
  }
  const genderQ = ASSISTANT_QUESTIONS.find(q => q.id === 'gender');
  assert.ok(genderQ, 'has a gender question');
  assert.equal(genderQ.options.length, 4, 'gender question has 4 options');
  assert.equal(genderQ.options[0].value, 'any', 'defaults to "Me da igual"');
});

test('returns nothing for an empty catalog', () => {
  assert.deepEqual(getAssistantRecommendations({ family: 'fresco' }, []), []);
});

test('ranks the strongest match first', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'any' },
    catalog,
  );
  assert.equal(res[0].product.id, 'FreshOffice');
  assert.equal(res[0].matchTier.key, 'high');
});

test('never recommends a sold-out product', () => {
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'any' },
    catalog,
  );
  assert.ok(!ids(res).includes('SoldOut'));
});

test('caps results at four', () => {
  const big = [];
  for (let i = 0; i < 10; i++) big.push(product(`p${i}`, ['marino', 'citrico'], 'fresco oficina verano'));
  const res = getAssistantRecommendations({ family: 'fresco', occasion: 'oficina', climate: 'calido' }, big);
  assert.ok(res.length <= 4);
});

test('budget filtering excludes out-of-band prices', () => {
  // low band is [0,150]; every sellable product here is priced > 150
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'low' },
    catalog,
  );
  assert.deepEqual(res, []);
});

test('budget filtering uses the exact displayed purchasable variant', () => {
  const splitPrice = product(
    'SplitPrice',
    ['marino', 'citrico', 'vetiver'],
    'fresco limpio para oficina y verano',
    {
      variants: [
        variant(3, 180, 10),
        variant(5, 300, 10),
      ],
    },
  );

  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', level: 'beginner', budget: 'mid' },
    [splitPrice],
  );

  assert.equal(res.length, 1);
  assert.equal(res[0].product.id, 'SplitPrice');
  assert.equal(res[0].variant.size, 3);
  assert.ok(res[0].variant.price >= 150 && res[0].variant.price <= 250);
});

test('budget boundaries are strict and inclusive for displayed variants', () => {
  const lowEdge = product('LowEdge', ['marino', 'citrico'], 'fresco oficina verano', { price: 150 });
  const midEdge = product('MidEdge', ['marino', 'citrico'], 'fresco oficina verano', { price: 250 });
  const overMid = product('OverMid', ['marino', 'citrico'], 'fresco oficina verano', { price: 251 });

  const low = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'low' },
    [lowEdge, midEdge, overMid],
  );
  assert.deepEqual(ids(low), ['LowEdge']);

  const mid = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'mid' },
    [lowEdge, midEdge, overMid],
  );
  assert.deepEqual(ids(mid).sort(), ['LowEdge', 'MidEdge']);
});

test('each result carries a tier and reasons', () => {
  const res = getAssistantRecommendations(
    { family: 'intenso', occasion: 'noche', climate: 'frio', level: 'enthusiast', budget: 'any' },
    catalog,
  );
  assert.ok(res.length >= 1);
  for (const r of res) {
    assert.ok(r.matchTier && r.matchTier.label);
    assert.ok(Array.isArray(r.reasons));
    assert.ok(typeof r.useCase === 'string');
  }
});

test('among equal matches, healthier/featured stock ranks higher', () => {
  const plain = product('Plain', ['marino', 'citrico'], 'fresco oficina verano', { stock: 30 });
  const featured = product('Featured', ['marino', 'citrico'], 'fresco oficina verano', { stock: 30, featured: true });
  const res = getAssistantRecommendations(
    { family: 'fresco', occasion: 'oficina', climate: 'calido', budget: 'any' },
    [plain, featured],
  );
  assert.equal(res[0].product.id, 'Featured');
});

test('daytime sweet recommendations prioritize context over heavy night sweetness', () => {
  const res = getAssistantRecommendations(
    { family: 'dulce', occasion: 'dia', budget: 'any', gender: 'any' },
    PRODUCTS,
    { limit: 4 },
  );
  const resultIds = ids(res);

  assert.ok(resultIds.includes('ysl-y-edp'), 'YSL Y EDP remains eligible for daytime sweet');
  assert.ok(resultIds.includes('valentino-extradose'), 'Valentino stays above night-only sweet scents');
  assert.ok(!resultIds.includes('lemale-elixir'), 'Le Male Elixir is too night-oriented for daytime sweet');
  assert.ok(!resultIds.includes('afnan-9pm'), 'Afnan 9PM is too night-oriented for daytime sweet');
  assert.ok(res.every(r => r.reasons.length > 0), 'every recommendation explains the fit');
  assert.ok(res.every(r => r.scoreBreakdown.context >= r.scoreBreakdown.popularity), 'context dominates popularity');
});

test('Daytime + Sweet ranks wearable daytime sweetness over night-only sweetness', () => {
  const daytimeSweet = apiProduct('DaySweet', {
    occasions: ['diario', 'daytime'],
    climate_tags: ['calido', 'templado'],
    mood_tags: ['dulce', 'limpio'],
    style_tags: ['dulce', 'versatil'],
    recommendation_tags: ['diario', 'facil_de_usar'],
    commercial_roles: ['signature'],
    scores: { sweetness: 55, freshness: 70, versatility: 90, mass_appeal: 88 },
  });
  const nightSweet = apiProduct('NightSweet', {
    occasions: ['noche', 'fiesta'],
    climate_tags: ['frio'],
    mood_tags: ['dulce', 'nocturno'],
    style_tags: ['dulce', 'gourmand', 'heavy'],
    recommendation_tags: ['noche', 'alto_rendimiento'],
    scores: { sweetness: 95, freshness: 20, versatility: 35, mass_appeal: 80 },
  }, { featured: true, badge: 'TRENDING' });

  const res = getAssistantRecommendations({ family: 'dulce', occasion: 'dia', budget: 'any' }, [nightSweet, daytimeSweet], { limit: 2 });
  assert.equal(res[0].product.id, 'DaySweet');
  assert.ok(res[0].reasons.includes('Excelente para uso de día'));
  assert.ok(res[0].reasons.includes('Toque dulce sin perder el contexto'));
  assert.ok(!res[0].reasons.some(reason => /noche|fiesta/i.test(reason)), 'does not invent unrelated night reasons');
});

test('Hot Weather + Fresh prioritizes warm-weather freshness over cold heavy profiles', () => {
  const hotFresh = apiProduct('HotFresh', {
    occasions: ['diario'],
    climate_tags: ['calido', 'verano'],
    mood_tags: ['fresco', 'limpio'],
    style_tags: ['fresco', 'acuatico', 'ligero'],
    recommendation_tags: ['verano', 'diario'],
    scores: { freshness: 92, sweetness: 15, versatility: 86, mass_appeal: 82, summer: 95 },
  });
  const coldFresh = apiProduct('ColdFreshButHeavy', {
    occasions: ['noche'],
    climate_tags: ['frio', 'invierno'],
    mood_tags: ['fresco', 'intenso'],
    style_tags: ['fresco', 'heavy'],
    recommendation_tags: ['noche'],
    scores: { freshness: 65, sweetness: 75, projection: 90, versatility: 40 },
  });

  const res = getAssistantRecommendations({ family: 'fresco', climate: 'calido', budget: 'any' }, [coldFresh, hotFresh], { limit: 2 });
  assert.equal(res[0].product.id, 'HotFresh');
  assert.ok(res[0].reasons.includes('Funciona bien en clima cálido'));
  assert.ok(res[0].reasons.includes('Perfil fresco y fácil de usar'));
});

test('Office + Long Lasting prefers office-safe longevity and penalizes intrusive projection', () => {
  const officeLong = apiProduct('OfficeLong', {
    occasions: ['oficina', 'diario'],
    climate_tags: ['templado'],
    mood_tags: ['limpio', 'elegante'],
    style_tags: ['limpio', 'discreto', 'long lasting'],
    recommendation_tags: ['oficina'],
    commercial_roles: ['office safe'],
    scores: { longevity: 88, projection: 45, versatility: 84, office_safe: 92, mass_appeal: 75 },
  });
  const intrusiveLong = apiProduct('IntrusiveLong', {
    occasions: ['fiesta', 'noche'],
    climate_tags: ['frio'],
    mood_tags: ['intenso'],
    style_tags: ['llamativo', 'long lasting'],
    recommendation_tags: ['alto_rendimiento', 'fiesta'],
    scores: { longevity: 95, projection: 95, versatility: 35, office_safe: 10, mass_appeal: 70 },
  }, { featured: true, badge: 'TRENDING' });

  const res = getAssistantRecommendations(
    { occasion: 'oficina', performance: 'long_lasting', budget: 'any' },
    [intrusiveLong, officeLong],
    { limit: 2 },
  );
  assert.equal(res[0].product.id, 'OfficeLong');
  assert.ok(res[0].reasons.includes('Adecuada para oficina'));
  assert.ok(res[0].reasons.includes('Buena duración'));
  const intrusive = res.find(r => r.product.id === 'IntrusiveLong');
  assert.ok(!intrusive || intrusive.scoreBreakdown.penalty > 0, 'intrusive long-lasting scents are penalized or excluded');
});

test('Night + Sweet rewards sweet night metadata', () => {
  const nightSweet = apiProduct('NightSweetFit', {
    occasions: ['noche', 'fiesta'],
    climate_tags: ['frio'],
    mood_tags: ['dulce', 'nocturno', 'seductor'],
    style_tags: ['dulce', 'gourmand'],
    recommendation_tags: ['noche', 'cita'],
    commercial_roles: ['club scent'],
    scores: { sweetness: 90, night_out: 92, date_night: 85, versatility: 55, mass_appeal: 82 },
  });
  const dailySweet = apiProduct('DailySweet', {
    occasions: ['diario', 'oficina'],
    climate_tags: ['calido'],
    mood_tags: ['dulce', 'limpio'],
    style_tags: ['dulce', 'limpio'],
    recommendation_tags: ['diario'],
    scores: { sweetness: 55, night_out: 20, versatility: 85, mass_appeal: 78 },
  });

  const res = getAssistantRecommendations({ family: 'dulce', occasion: 'noche', budget: 'any' }, [dailySweet, nightSweet], { limit: 2 });
  assert.equal(res[0].product.id, 'NightSweetFit');
  assert.ok(res[0].reasons.includes('Encaja con planes de noche'));
  assert.ok(res[0].reasons.includes('Dulzor marcado'));
});

test('Date + Elegant rewards elegant date metadata', () => {
  const dateElegant = apiProduct('DateElegant', {
    occasions: ['cita', 'formal'],
    climate_tags: ['templado'],
    mood_tags: ['elegante', 'seductor'],
    style_tags: ['elegante', 'premium', 'woody'],
    recommendation_tags: ['cita', 'evento formal'],
    commercial_roles: ['premium'],
    scores: { date_night: 90, versatility: 70, mass_appeal: 74 },
  });
  const partySweet = apiProduct('PartySweet', {
    occasions: ['fiesta', 'antro'],
    climate_tags: ['frio'],
    mood_tags: ['dulce', 'juvenil'],
    style_tags: ['llamativo', 'gourmand'],
    recommendation_tags: ['fiesta', 'alto_rendimiento'],
    scores: { sweetness: 92, projection: 90, date_night: 50, versatility: 35 },
  }, { featured: true });

  const res = getAssistantRecommendations({ family: 'elegante', occasion: 'cita', budget: 'any' }, [partySweet, dateElegant], { limit: 2 });
  assert.equal(res[0].product.id, 'DateElegant');
  assert.ok(res[0].reasons.includes('Encaja para una cita'));
  assert.ok(res[0].reasons.includes('Perfil elegante y pulido'));
  assert.ok(!res[0].reasons.some(reason => /fiesta|antro/i.test(reason)), 'does not invent party reasons');
});

test('assistant excludes inactive and out-of-stock products through sellability rules', () => {
  const active = apiProduct('ActiveOffice', {
    occasions: ['oficina'],
    style_tags: ['limpio'],
    recommendation_tags: ['oficina'],
    scores: { versatility: 80, mass_appeal: 70 },
  });
  const inactive = apiProduct('InactiveOffice', {
    occasions: ['oficina'],
    style_tags: ['limpio'],
    recommendation_tags: ['oficina'],
    scores: { versatility: 90, mass_appeal: 90 },
  }, { active: false });
  const outOfStock = apiProduct('OutOfStockOffice', {
    occasions: ['oficina'],
    style_tags: ['limpio'],
    recommendation_tags: ['oficina'],
    scores: { versatility: 90, mass_appeal: 90 },
  }, { stock: 0, variants: [variant(5, 180, 0)] });

  const res = getAssistantRecommendations({ occasion: 'oficina', budget: 'any' }, [inactive, outOfStock, active], { limit: 4 });
  assert.deepEqual(ids(res), ['ActiveOffice']);
});
