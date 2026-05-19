/* =============================================================
   RDECANTS — FEATURED CAROUSEL
   Fetches /data/featured.json and renders luxury portrait cards.
   Fields used: image · name · tag
   ============================================================= */

let _cache = null;

async function _load() {
  if (_cache) return _cache;
  const res = await fetch('/data/featured.json');
  if (!res.ok) throw new Error(`featured.json → ${res.status}`);
  _cache = await res.json();
  return _cache;
}

export async function renderFeaturedCarousel() {
  const track = document.getElementById('fc-track');
  if (!track) return;

  let items;
  try {
    items = await _load();
  } catch {
    document.getElementById('fc-section')?.remove();
    return;
  }

  if (!items?.length) {
    document.getElementById('fc-section')?.remove();
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'fc-card';
    card.setAttribute('aria-label', `${item.name} — ${item.tag}`);
    card.style.setProperty('--i', idx);

    card.innerHTML = `
      <div class="fc-img-wrap">
        <img
          src="${item.image}"
          alt="${item.name}"
          loading="lazy"
          decoding="async"
        >
      </div>
      <div class="fc-overlay" aria-hidden="true"></div>
      <div class="fc-info">
        <p class="fc-tag">${item.tag}</p>
        <h3 class="fc-name">${item.name}</h3>
        <span class="fc-cta" aria-hidden="true">Descubrir →</span>
      </div>
    `;

    frag.appendChild(card);
  });

  track.appendChild(frag);
  _setupDrag(track.parentElement);
  _observeCards(track);
}

/* Scroll animation via IntersectionObserver */
function _observeCards(track) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('fc-card--in');
        io.unobserve(e.target);
      });
    },
    { threshold: 0.12 }
  );
  track.querySelectorAll('.fc-card').forEach(c => io.observe(c));
}

/* Mouse drag-to-scroll on desktop */
function _setupDrag(scroller) {
  if (!scroller) return;
  let isDown = false, startX = 0, scrollLeft = 0;

  scroller.addEventListener('mousedown', e => {
    isDown   = true;
    startX   = e.pageX - scroller.offsetLeft;
    scrollLeft = scroller.scrollLeft;
    scroller.classList.add('fc-scroll--grabbing');
  });

  const stop = () => {
    isDown = false;
    scroller.classList.remove('fc-scroll--grabbing');
  };

  scroller.addEventListener('mouseleave', stop);
  scroller.addEventListener('mouseup',    stop);

  scroller.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x    = e.pageX - scroller.offsetLeft;
    const walk = (x - startX) * 1.4;
    scroller.scrollLeft = scrollLeft - walk;
  });
}
