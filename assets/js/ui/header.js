/* =============================================================
   RDECANTS — HEADER
   Scroll behavior: compact header on scroll.
   ============================================================= */

export function setupHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
