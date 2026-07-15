/* =============================================================
   RDECANTS — ANIMATIONS
   Scroll-reveal observer + hero parallax.

   Resilience contract: .fade-up content is visible by default (CSS).
   JS only ADDS the reveal transition when it is safe. If motion is
   reduced, the observer is unsupported, or the tab is hidden (so the
   observer would never fire), we reveal everything immediately. A
   safety timeout also reveals anything still pending, so content can
   never get stuck invisible waiting on an observer.
   ============================================================= */

const REVEAL_FALLBACK_MS = 900;

let _observer = null;

function _prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function _canAnimate() {
  return (
    typeof IntersectionObserver !== 'undefined' &&
    !_prefersReducedMotion() &&
    !document.hidden
  );
}

function _revealAll() {
  document.querySelectorAll('.fade-up:not(.visible)').forEach(el => el.classList.add('visible'));
}

function _ensureObserver() {
  if (_observer) return _observer;
  _observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        _observer.unobserve(e.target);
      }
    }),
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  return _observer;
}

/* Observe (or immediately reveal) any not-yet-visible .fade-up elements.
   Safe to call repeatedly after dynamic renders. */
export function observeFadeUp() {
  const pending = document.querySelectorAll('.fade-up:not(.visible)');
  if (!pending.length) return;

  if (!_canAnimate()) {
    _revealAll();
    return;
  }

  const observer = _ensureObserver();
  pending.forEach(el => observer.observe(el));

  /* If the tab is backgrounded before elements scroll into view (observers
     are throttled while hidden), reveal everything as soon as it returns. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _revealAll();
  }, { once: true });

  /* Absolute safety net — nothing stays hidden longer than this. */
  window.setTimeout(_revealAll, REVEAL_FALLBACK_MS);
}

/* Kept for API compatibility with existing call sites. */
export function setupScrollAnimations() {
  observeFadeUp();
}
