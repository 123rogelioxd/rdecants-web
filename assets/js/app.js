/* =============================================================
   RDECANTS — HOME ENTRY POINT

   The home is a discovery page, not the store: a promise, the eight
   best sellers, four ways to say what you are shopping for, how it
   works, why it is authentic, four questions. The catalog (search,
   filters, sort, 70+ products) lives at /catalogo.html and the guided
   finder at /elegir.html, so no single screen asks the visitor to
   choose between five different ways to start.
   ============================================================= */

import { bootstrapShell }          from './core/shell.js';
import { renderBestsellers }       from './ui/bestsellers.js';
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

  /* The one commercial surface on this page. */
  await renderBestsellers('bestsellers-grid');

  observeFadeUp();
  setupScrollAnimations();
  _setupScrollTracking();

  AppState.set('initialized', true);
  Tracker.emit('page_view', { path: window.location.pathname });
});

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
  const SECTIONS = [
    'mas-vendidos', 'intenciones', 'como-funciona', 'autenticidad', 'faq',
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
