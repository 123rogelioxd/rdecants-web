/* =============================================================
   RDECANTS - RECOMMENDATION RAILS
   Dynamic luxury ecommerce rails from catalog metadata.
   ============================================================= */

import { CatalogProvider }  from '../providers/catalog.js';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from '../ui/modal.js';
import { observeFadeUp }    from '../ui/animations.js';

const MAX_PER_RAIL = 8;
const MIN_PER_RAIL = 2;

const RAILS = [
  {
    id: 'heat',
    title: 'Para calor',
    mark: '🔥',
    desc: 'Frescas, limpias y de alto impacto en dias calientes.',
    match: {
      notes: ['marino', 'citrico', 'mineral', 'menta', 'mandarina', 'coco'],
      badges: ['fresco', 'verano', 'summer'],
      text: ['fresco', 'limpio', 'azul', 'calor', 'verano', 'tropical'],
    },
  },
  {
    id: 'party',
    title: 'Dulces / Fiesta',
    mark: '🌙',
    desc: 'Nocturnas, dulces y pensadas para dejar rastro.',
    match: {
      notes: ['vainilla', 'miel', 'tonka', 'canela', 'manzana', 'lavanda', 'especias'],
      badges: ['trending', 'night', 'nuevo', 'alta demanda', 'mas pedido'],
      text: ['dulce', 'noche', 'nocturno', 'salidas', 'conquista', 'rastro', 'cumplidos'],
    },
  },
  {
    id: 'daily',
    title: 'Limpios / Diario',
    mark: '✨',
    desc: 'Versatiles, pulidas y faciles de usar todos los dias.',
    match: {
      notes: ['citrico', 'jengibre', 'cedro', 'madera', 'manzana', 'mineral'],
      badges: ['diario', 'daily', 'value', 'clasico', 'classic'],
      text: ['limpio', 'diario', 'versatil', 'atemporal', 'elegante', 'discreto', 'fallar'],
    },
  },
  {
    id: 'niche',
    title: 'Lujo Nicho',
    mark: '🖤',
    desc: 'Perfiles mas exclusivos, densos y memorables.',
    match: {
      requireStrong: true,
      houses: ['xerjoff', 'creed', 'initio', 'parfums de marly', 'amouage', 'nishane', 'kilian'],
      notes: ['miel', 'tabaco', 'ambar', 'frutas', 'vainilla'],
      badges: ['ultra luxury', 'limited', 'nicho'],
      text: ['lujo', 'exclusivo', 'carisimo'],
    },
  },
  {
    id: 'trending',
    title: 'Trending ahora',
    mark: '↑',
    desc: 'Lo que mas se mueve: featured, alta demanda y pocas unidades.',
    trending: true,
  },
];

const TRENDING_BADGES = [
  'trending',
  'mas pedido',
  'mas vendido',
  'best seller',
  'alta demanda',
  'nuevo',
  'ultimas',
  'ultimas unidades',
];

let _rendered = false;

export const Recommendations = {
  async get(context = {}) {
    const products = await CatalogProvider.getProducts();
    const featured = await _getFeaturedSafe();
    return buildRails(products, featured, context);
  },

  async render(containerId = 'recommendation-rails', context = {}) {
    const root = document.getElementById(containerId);
    if (!root) return;

    _renderSkeleton(root);

    const hydrate = async () => {
      if (_rendered) return;
      _rendered = true;

      const products = await CatalogProvider.getProducts();
      const featured = await _getFeaturedSafe();
      const rails = buildRails(products, featured, context);

      if (!rails.length) {
        root.remove();
        return;
      }

      _renderRails(root, rails);
    };

    if (!('IntersectionObserver' in window)) {
      await hydrate();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      hydrate();
    }, { rootMargin: '280px 0px', threshold: 0.01 });

    observer.observe(root);
  },
};

export function buildRails(products, featured = null) {
  const featuredId = featured?.id;
  const rails = RAILS
    .map(config => {
      const scored = products
        .map(product => ({
          product,
          score: config.trending
            ? _scoreTrending(product, featuredId)
            : _scoreRail(product, config.match),
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || _stockDemand(b.product) - _stockDemand(a.product))
        .map(item => item.product);

      const items = _fillRail(scored, products, config, featuredId).slice(0, MAX_PER_RAIL);
      return { ...config, items };
    })
    .filter(rail => rail.items.length >= MIN_PER_RAIL);

  return rails;
}

function _renderSkeleton(root) {
  root.innerHTML = `
    <div class="container">
      <div class="rr-head fade-up">
        <div>
          <p class="section-label">Curadurias dinamicas</p>
          <h2 class="section-title">Descubre<br><em>por mood</em></h2>
        </div>
      </div>
      <div class="rr-skeleton-list" aria-label="Cargando recomendaciones">
        ${Array.from({ length: 3 }).map(() => `
          <div class="rr-skeleton-rail">
            <div class="rr-skeleton-title"></div>
            <div class="rr-skeleton-track">
              ${Array.from({ length: 4 }).map(() => '<div class="rr-skeleton-card"></div>').join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function _renderRails(root, rails) {
  root.innerHTML = `
    <div class="container">
      <div class="rr-head fade-up">
        <div>
          <p class="section-label">Curadurias dinamicas</p>
          <h2 class="section-title">Descubre<br><em>por mood</em></h2>
        </div>
        <p class="rr-head-copy">
          Selecciones armadas en vivo con notas, demanda, stock y casas del catalogo.
        </p>
      </div>
    </div>
    <div class="rr-stack">
      ${rails.map(_railTemplate).join('')}
    </div>
  `;

  rails.forEach(rail => {
    const track = root.querySelector(`[data-rail-track="${rail.id}"]`);
    _bindRail(track, rail);
    _setupDrag(track?.parentElement);
    Tracker.recommendationView(rail.items, { railId: rail.id, railTitle: rail.title });
  });

  _observeRailCards(root);
  observeFadeUp();
}

function _railTemplate(rail) {
  return `
    <section class="rr-rail" aria-label="${rail.title}">
      <div class="container rr-rail-head">
        <div>
          <p class="rr-eyebrow">${rail.mark} ${rail.title}</p>
          <p class="rr-desc">${rail.desc}</p>
        </div>
      </div>
      <div class="rr-scroll">
        <div class="rr-track" data-rail-track="${rail.id}">
          ${rail.items.map((product, idx) => _cardTemplate(product, rail, idx)).join('')}
        </div>
      </div>
    </section>
  `;
}

function _cardTemplate(product, rail, idx) {
  const price = product.prices?.[5] ?? product.prices?.[3] ?? 0;
  const notes = (product.notes ?? []).slice(0, 2);

  return `
    <article class="rr-card" data-product-id="${product.id}" data-position="${idx}" style="--i:${idx}">
      ${product.badge ? `<span class="rr-badge">${product.badge}</span>` : ''}
      <div class="rr-img">
        <img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async"
             onerror="this.parentElement.classList.add('rr-img--fallback');this.remove()">
      </div>
      <div class="rr-body">
        <p class="rr-house">${product.house}</p>
        <h3 class="rr-name">${product.name}</h3>
        <div class="rr-notes">
          ${notes.map(note => `<span>${note}</span>`).join('')}
        </div>
        <div class="rr-foot">
          <span class="rr-price">$${price} <small>/ 5ml</small></span>
          <span class="rr-open" aria-hidden="true">Ver</span>
        </div>
      </div>
    </article>
  `;
}

function _bindRail(track, rail) {
  if (!track) return;
  track.addEventListener('click', (event) => {
    const card = event.target.closest('.rr-card');
    if (!card) return;

    const product = rail.items.find(item => item.id === card.dataset.productId);
    if (!product) return;

    const position = Number(card.dataset.position) + 1;
    Tracker.recommendationClicked(product, position, {
      railId: rail.id,
      railTitle: rail.title,
    });
    openProductModal(product);
  });

  track.querySelectorAll('.rr-card').forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      card.click();
    });
  });
}

function _observeRailCards(root) {
  const cards = root.querySelectorAll('.rr-card');
  if (!('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('rr-card--in'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('rr-card--in');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '80px 0px', threshold: 0.12 });

  cards.forEach(card => observer.observe(card));
}

function _setupDrag(scroller) {
  if (!scroller) return;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  scroller.addEventListener('mousedown', event => {
    isDown = true;
    startX = event.pageX - scroller.offsetLeft;
    scrollLeft = scroller.scrollLeft;
    scroller.classList.add('rr-scroll--grabbing');
  });

  const stop = () => {
    isDown = false;
    scroller.classList.remove('rr-scroll--grabbing');
  };

  scroller.addEventListener('mouseleave', stop);
  scroller.addEventListener('mouseup', stop);
  scroller.addEventListener('mousemove', event => {
    if (!isDown) return;
    event.preventDefault();
    const x = event.pageX - scroller.offsetLeft;
    scroller.scrollLeft = scrollLeft - ((x - startX) * 1.25);
  });
}

async function _getFeaturedSafe() {
  try {
    return await CatalogProvider.getFeatured();
  } catch {
    return null;
  }
}

function _fillRail(scored, products, config, featuredId) {
  if (config.match?.requireStrong) return scored;
  if (scored.length >= MIN_PER_RAIL) return scored;

  const selected = new Set(scored.map(product => product.id));
  const fallback = [...products]
    .filter(product => !selected.has(product.id))
    .sort((a, b) => {
      const scoreA = config.trending ? _scoreTrending(a, featuredId) : _scoreTrending(a, featuredId) / 2;
      const scoreB = config.trending ? _scoreTrending(b, featuredId) : _scoreTrending(b, featuredId) / 2;
      return scoreB - scoreA;
    });

  return [...scored, ...fallback].slice(0, MIN_PER_RAIL);
}

function _scoreRail(product, rules = {}) {
  const haystack = _productText(product);
  const notes = (product.notes ?? []).map(_norm);
  const badge = _norm(product.badge);
  const house = _norm(product.house);
  const strongMatch =
    _hasMatch(rules.badges, item => badge.includes(item)) ||
    _hasMatch(rules.text, item => haystack.includes(item)) ||
    _hasMatch(rules.houses, item => house.includes(item));

  if (rules.requireStrong && !strongMatch) return 0;

  let score = 0;
  score += _scoreList(rules.notes, note => notes.some(n => n.includes(note)), 6);
  score += _scoreList(rules.badges, item => badge.includes(item), 7);
  score += _scoreList(rules.text, item => haystack.includes(item), 4);
  score += _scoreList(rules.houses, item => house.includes(item), 9);
  score += _stockDemand(product);

  return score;
}

function _scoreTrending(product, featuredId) {
  const badge = _norm(product.badge);
  let score = 0;

  if (product.id === featuredId || product.featured) score += 18;
  if ((product.stock ?? 99) <= 1) score += 12;
  else if ((product.stock ?? 99) <= 3) score += 8;
  else if ((product.stock ?? 99) <= 5) score += 4;

  score += TRENDING_BADGES.reduce((sum, item) => sum + (badge.includes(item) ? 10 : 0), 0);
  score += _norm(product.desc).includes('cumplidos') || _norm(product.story).includes('cumplidos') ? 4 : 0;

  return score;
}

function _stockDemand(product) {
  const stock = Number(product.stock ?? 99);
  if (stock <= 1) return 5;
  if (stock <= 3) return 4;
  if (stock <= 5) return 2;
  return 0;
}

function _scoreList(list = [], predicate, weight) {
  return list.reduce((sum, raw) => sum + (predicate(_norm(raw)) ? weight : 0), 0);
}

function _hasMatch(list = [], predicate) {
  return list.some(raw => predicate(_norm(raw)));
}

function _productText(product) {
  return _norm([
    product.name,
    product.house,
    product.badge,
    product.desc,
    product.story,
    ...(product.notes ?? []),
  ].join(' '));
}

function _norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
