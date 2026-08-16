/* =============================================================
   RDECANTS — HOME ENTRY POINT

   The home is a funnel, not a brochure. In page order: the promise and
   three trust signals, an easy first purchase (the starter packs), the
   three self-service routes, Roger's four picks, the guided finder for
   whoever is still undecided, what is new, how it works, and the four
   questions that block a first order. The catalog (search, filters, sort,
   90+ products) lives at /catalogo.html and the guided finder at
   /elegir.html, so no single screen asks the visitor to choose between
   five different ways to start.
   ============================================================= */

import { bootstrapShell }          from './core/shell.js';
import { renderHero }              from './ui/hero.js';
import { renderStarterPacks }      from './ui/starterPacks.js';
import { renderPromotion }         from './ui/promotion.js';
import { renderBestsellers,
         renderNewest }            from './ui/bestsellers.js';
import { setupScrollAnimations,
         observeFadeUp }           from './ui/animations.js';
import { Tracker }                 from './tracking/tracker.js';
import { AppState }                from './core/state.js';

/* Links that used to point at on-page sections (#catalog, #guide) are
   still shared and bookmarked. Send them to the page that now owns
   that job instead of leaving them scrolling to nothing. */
const LEGACY_HASH_ROUTES = {
  '#catalog': '/catalogo.html',
  '#catalogo': '/catalogo.html',
  '#guide': '/elegir.html',
  '#assistant': '/elegir.html',
  '#discovery-sets': '/catalogo.html',
};

function _redirectLegacyHash() {
  const target = LEGACY_HASH_ROUTES[window.location.hash];
  if (target) window.location.replace(target);
  return Boolean(target);
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (_redirectLegacyHash()) return;

  await bootstrapShell();

  /* The hero is already rendered from HTML; this only applies an active
     campaign on top of it, and does nothing when there is none. */
  await renderHero();

  /* The packs are the first thing a visitor can buy, so they render before
     the rails. Like "Nuevos", the section removes itself rather than
     standing empty when the catalog cannot fill a single pack. */
  await renderStarterPacks('packs-rail');

  /* The active campaign banner, under the packs and above "Prefiero elegir
     yo". Same rule as every other optional section: it removes itself when
     there is nothing to show, so a home with no promotion is one section
     shorter rather than one gap longer. */
  await renderPromotion('promocion');

  /* The two product rails. Roger's picks lead; "Nuevos" sits below the
     finder prompt and removes itself when there is nothing to show. */
  await renderBestsellers('bestsellers-grid');
  await renderNewest('newest-grid');

  observeFadeUp();
  setupScrollAnimations();
  _setupScrollTracking();
  _setupDiscoveryTracking();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

/* Which of the three routes into the store a visitor actually takes.
   One delegated listener rather than a listener per element, so a rail that
   re-renders cannot leave handlers behind. */
function _setupDiscoveryTracking() {
  document.addEventListener('click', event => {
    const path = event.target.closest('[data-path]');
    if (path) {
      Tracker.homePathSelected(path.dataset.path);
      return;
    }

    const cta = event.target.closest('[data-cta]');
    if (!cta) return;

    if (cta.dataset.cta === 'hero-catalog') Tracker.catalogCtaClicked('hero');
    else Tracker.heroCtaClicked(cta.dataset.cta);
  });
}

/* ── Behavioral observability ───────────────────────────────── */
function _setupScrollTracking() {
  /* Scroll depth — fires at 25/50/75/100% */
  const depths  = [25, 50, 75, 100];
  const reached = new Set();
  const onScroll = () => {
    const scrollable = document.body.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const pct = Math.round((window.scrollY / scrollable) * 100);
    depths.forEach(d => {
      if (pct >= d && !reached.has(d)) {
        reached.add(d);
        Tracker.scrollDepthReached(d);
      }
    });
    if (reached.size === depths.length) window.removeEventListener('scroll', onScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Section viewed — fires once per section when 15% enters viewport */
  /* In page order, so the reported index is how far down someone got. */
  const SECTIONS = [
    'packs', 'intenciones', 'roger-recomienda', 'asistente', 'nuevos',
    'como-funciona', 'faq',
  ];
  if (!('IntersectionObserver' in window)) return;
  SECTIONS.forEach((id, positionIndex) => {
    const el = document.getElementById(id);
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        obs.disconnect();
        Tracker.sectionViewed(id, positionIndex);
      }
    }, { threshold: 0.15 });
    obs.observe(el);
  });
}
