/* =============================================================
   RDECANTS — ANIMATIONS
   Scroll-reveal observer + hero parallax.
   ============================================================= */

export function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }),
    { threshold: 0.1 }
  );

  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

/* Observe newly added elements (called after dynamic renders) */
export function observeFadeUp() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }),
    { threshold: 0.1 }
  );

  document.querySelectorAll('.fade-up:not(.visible)').forEach(el => observer.observe(el));
}

/* ── Hero parallax ─────────────────────────────────────────────
   Adjusts hero image `top` so translateY(-50%) centering is
   preserved while adding a subtle scroll offset.
   DO NOT touch transform — heroFloat animation lives there.
   ──────────────────────────────────────────────────────────── */
export function setupHeroParallax() {
  const wrap = document.querySelector('.hero-img-wrap');
  if (!wrap) return;

  const getBaseTop = () => {
    if (window.matchMedia('(max-width: 380px)').matches) return '41%';
    if (window.matchMedia('(max-width: 768px)').matches) return '39%';
    return '50%';
  };

  const updateHeroTop = () => {
    const offset = window.scrollY * 0.04;
    wrap.style.top = `calc(${getBaseTop()} + ${-offset}px)`;
  };

  updateHeroTop();
  window.addEventListener('scroll', updateHeroTop, { passive: true });
  window.addEventListener('resize', updateHeroTop, { passive: true });
}
