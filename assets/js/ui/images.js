/* =============================================================
   RDECANTS - IMAGE UX
   Shared load/error states for dynamic images.
   ============================================================= */

const IMAGE_WRAPPERS = [
  'card-img-wrap',
  'featured-img',
  'fc-img-wrap',
  'pdm-img-wrap',
  'rr-img',
  'hero-img-wrap',
];

let _initialized = false;

export function setupImageStates(root = document) {
  _primeImages(root);

  if (_initialized) return;
  _initialized = true;

  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement) _markLoaded(event.target);
  }, true);

  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement) _markFailed(event.target);
  }, true);
}

export function primeImageStates(root = document) {
  _primeImages(root);
}

function _primeImages(root) {
  root.querySelectorAll?.('img')?.forEach(img => {
    const wrap = _wrapperFor(img);
    if (!wrap) return;

    wrap.classList.add('img-shell');
    if (img.complete && img.naturalWidth > 0) _markLoaded(img);
    if (img.complete && img.naturalWidth === 0) _markFailed(img);
  });
}

function _markLoaded(img) {
  const wrap = _wrapperFor(img);
  if (!wrap) return;
  wrap.classList.add('img-loaded');
  wrap.classList.remove('img-failed');
}

function _markFailed(img) {
  const wrap = _wrapperFor(img);
  if (!wrap) return;
  wrap.classList.add('img-failed');
  wrap.classList.remove('img-loaded');
}

function _wrapperFor(img) {
  return IMAGE_WRAPPERS
    .map(className => img.closest(`.${className}`))
    .find(Boolean);
}
