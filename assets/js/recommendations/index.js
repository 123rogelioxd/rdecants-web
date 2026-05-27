/* =============================================================
   RDECANTS - RECOMMENDATION RAILS
   Dynamic luxury ecommerce rails from catalog metadata.
   ============================================================= */

import { CatalogProvider }  from '../providers/catalog.js';
import { Tracker }          from '../tracking/tracker.js';
import { openProductModal } from '../ui/modal.js';
import { observeFadeUp }    from '../ui/animations.js';
import { primeImageStates } from '../ui/images.js';
import { Personalization, personalizeRails } from './personalization.js?v=1.0.13';

const MAX_PER_RAIL = 5;
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
      let rails = buildRails(products, featured, context);

      if (!rails.length) {
        _renderEmpty(root);
        return;
      }

      /* Subtle personalized discovery: nudge rails/items toward the
         visitor's local taste signal (ties keep original order). */
      if (Personalization.hasSignal()) {
        rails = personalizeRails(rails, Personalization.getTaste());
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
      <div class="rr-editorial-grid rr-editorial-grid--loading" aria-label="Cargando recomendaciones">
        ${Array.from({ length: 3 }).map(() => '<div class="rr-skeleton-card rr-skeleton-card--mood"></div>').join('')}
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
      <div class="rr-editorial-grid fade-up">
        ${rails.slice(0, 3).map(_collectionTemplate).join('')}
      </div>
    </div>
  `;

  rails.forEach(rail => {
    Tracker.recommendationView(rail.items, { railId: rail.id, railTitle: rail.title });
  });

  _bindCollections(root, rails);
  primeImageStates(root);
  observeFadeUp();
}

function _collectionTemplate(rail) {
  const featured = rail.items[0];
  const supporting = rail.items.slice(1, 3);
  if (!featured) return '';

  return `
    <article class="rr-collection" data-rail-id="${rail.id}" data-mood="${_railMood(rail.id)}">
      <div class="rr-collection-media">
        <img src="${featured.image}" alt="${featured.name}" loading="lazy" decoding="async"
             onerror="this.parentElement.classList.add('rr-collection-media--fallback');this.remove()">
      </div>
      <div class="rr-collection-copy">
        <p class="rr-collection-kicker">${rail.title}</p>
        <h3>${_collectionTitle(rail.id)}</h3>
        <p>${rail.desc}</p>
        <div class="rr-collection-feature">
          <span>${featured.house}</span>
          <strong>${featured.name}</strong>
        </div>
        <div class="rr-collection-support">
          ${supporting.map(product => `
            <button type="button" data-product-id="${product.id}" aria-label="Ver ${product.name}">
              <span>${product.house}</span>
              ${product.name}
            </button>
          `).join('')}
        </div>
        <button type="button" class="btn-primary rr-collection-cta" data-action="explore"
          onclick="window.__rd?.ui?.applyMoodFilter?.('${_railMood(rail.id)}')">Explorar mood</button>
      </div>
    </article>
  `;
}

function _renderEmpty(root) {
  root.innerHTML = `
    <div class="container">
      <div class="catalog-empty premium-empty">
        <div class="sf-empty-icon" aria-hidden="true">R</div>
        <h3 class="sf-empty-title">Sin recomendaciones por ahora</h3>
        <p class="sf-empty-desc">
          El catalogo necesita mas metadata para crear selecciones dinamicas.
        </p>
      </div>
    </div>
  `;
}

function _bindCollections(root, rails) {
  root.querySelectorAll('.rr-collection').forEach(card => {
    const rail = rails.find(item => item.id === card.dataset.railId);
    if (!rail) return;

    card.querySelectorAll('[data-product-id]').forEach(productButton => {
      productButton.addEventListener('click', event => {
        event.stopPropagation();
        const product = rail.items.find(item => String(item.id) === String(productButton.dataset.productId));
        if (!product) return;
        Tracker.recommendationClicked(product, 1, { railId: rail.id, railTitle: rail.title });
        openProductModal(product);
      });
    });

    card.querySelector('[data-action="explore"]')?.addEventListener('click', event => {
      event.stopPropagation();
      Tracker.recommendationClicked(rail.items[0], 1, { railId: rail.id, railTitle: `${rail.title} catalog filter` });
      window.__rd?.ui?.applyMoodFilter?.(card.dataset.mood);
    });
  });
}

function _collectionTitle(id) {
  const titles = {
    heat: 'Calor Tropical',
    party: 'Noche / Seduccion',
    daily: 'Fresh Office',
    niche: 'Fresh Luxury',
  };
  return titles[id] ?? 'Seleccion curada';
}

function _railMood(id) {
  const moods = {
    heat: 'fresco',
    party: 'fiesta',
    daily: 'diario',
    niche: 'lujo',
  };
  return moods[id] ?? '';
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
