import { scoreSearchResult } from '../catalog/search.js';
import { openBottleQuickView } from './bottleQuickView.js';
import { formatPrice } from '../utils/prices.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function searchBottleOffers(products, query) {
  if (!String(query).trim()) return [];
  return products.filter(p => p.bottles?.some(o => o.stock > 0))
    .map(product => ({ product, score: scoreSearchResult(product, query) }))
    .filter(row => row.score >= 400).sort((a,b) => b.score - a.score).map(row => row.product);
}

export function renderBottleSearch(products, query) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  document.getElementById('search-bottles')?.remove();
  document.getElementById('search-decants-label')?.remove();
  if (!String(query).trim()) return;
  const label = document.createElement('div');
  label.id = 'search-decants-label'; label.className = 'catalog-search-group';
  label.innerHTML = '<h2>Decants</h2><p>Fragancias para probar en 3, 5 y 10 ml.</p>';
  grid.before(label);
  const section = document.createElement('section'); section.id = 'search-bottles'; section.className = 'catalog-search-group';
  section.setAttribute('aria-label', 'Resultados de botellas');
  const matches = searchBottleOffers(products, query);
  section.innerHTML = `<h2>Botellas</h2><p>${matches.length ? 'Presentaciones completas, testers y parciales.' : 'No hay botellas disponibles para esta búsqueda.'}</p><div class="search-bottle-results">${matches.map(p => {
    const offer = p.bottles[0];
    return `<article class="search-bottle-card"><button type="button" data-bottle-product="${escape(p.id)}" aria-label="Ver botella de ${escape(p.name)}">
    ${p.image ? `<img src="${escape(p.image)}" alt="${escape(p.name)}" width="320" height="320" loading="lazy">` : ''}
    <span class="search-bottle-copy"><small>${escape(p.house)}</small><strong>${escape(p.name)}</strong><span>${escape(offer.size_label)} · ${escape(offer.condition_label)}</span><strong>${p.bottles.length > 1 ? 'Desde ' : ''}${formatPrice(Math.min(...p.bottles.map(o => o.price)))}</strong><span>Ver botella →</span></span></button></article>`;
  }).join('')}</div>`;
  grid.parentElement.append(section);
  section.addEventListener('click', event => {
    const button = event.target.closest('[data-bottle-product]');
    const product = matches.find(p => p.id === button?.dataset.bottleProduct);
    if (product) openBottleQuickView(product);
  });
}
