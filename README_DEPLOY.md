# RDecants — Deploy Guide

## Structure

```
rdecants-web/
├── index.html                    ← entry, no-cache on Netlify
├── VERSION                       ← current version string
├── netlify.toml                  ← cache headers + redirects
├── _headers                      ← Netlify headers (mirror of toml)
│
├── assets/
│   ├── css/
│   │   ├── tokens.css            ← CSS variables (load first)
│   │   ├── animations.css        ← @keyframes + fade-up
│   │   ├── components.css        ← all UI components
│   │   └── styles.css            ← reset + base
│   │
│   ├── js/
│   │   ├── app.js                ← entry (type="module")
│   │   ├── core/
│   │   │   ├── events.js         ← EventBus (pub/sub)
│   │   │   └── state.js          ← AppState
│   │   ├── providers/
│   │   │   └── catalog.js        ← CatalogProvider (data abstraction)
│   │   ├── catalog/
│   │   │   └── render.js         ← renderFeatured / renderProducts / renderPacks
│   │   ├── cart/
│   │   │   ├── cart.js           ← Cart state + localStorage
│   │   │   └── render.js         ← Cart drawer UI + WhatsApp
│   │   ├── tracking/
│   │   │   └── tracker.js        ← behavioral event layer
│   │   ├── ui/
│   │   │   ├── toast.js
│   │   │   ├── animations.js     ← scroll-reveal + hero parallax
│   │   │   └── header.js
│   │   └── recommendations/
│   │       └── index.js          ← scaffold for future engine
│   │
│   └── img/                      ← product images (long cache)
│
└── data/
    └── products.js               ← local catalog (ES module export)
```

---

## Deploying a New Version

1. Edit your files.
2. Open `VERSION` and increment the version number (e.g. `1.0.0` → `1.1.0`).
3. In `index.html`, update **all** `?v=` query strings to match:
   ```html
   <link rel="stylesheet" href="assets/css/tokens.css?v=1.1.0">
   <link rel="stylesheet" href="assets/css/animations.css?v=1.1.0">
   <link rel="stylesheet" href="assets/css/components.css?v=1.1.0">
   <link rel="stylesheet" href="assets/css/styles.css?v=1.1.0">
   ...
   <script type="module" src="assets/js/app.js?v=1.1.0"></script>
   ```
4. Drag the `rdecants-web/` folder into **Netlify Drop**.

### Why this solves "old version on phones"

| Asset type | Cache strategy | How invalidated |
|------------|----------------|-----------------|
| `index.html` | `no-cache` | Always re-fetched |
| CSS files | `immutable` (1 year) | `?v=` query string changes URL |
| JS files | `no-cache` (ETag) | 304 if unchanged, full fetch if changed |
| Images | `immutable` (1 year) | Filename must change to bust |
| `data/*.js` | `no-cache` | Always re-fetched |

---

## Cache Strategy Details

- **HTML** is served with `Cache-Control: no-cache`. The browser re-fetches on every visit but the page loads instantly because assets are cached.
- **CSS** uses `immutable` long cache. Changing `?v=` in the HTML (which itself is no-cache) forces browsers to fetch the new URL — old URL stays cached but is never requested.
- **JS** uses `no-cache` with automatic ETag validation. Netlify sends a `304 Not Modified` when the file hasn't changed, so no bandwidth is wasted. If the file changed, a full download happens.
- **Images** are immutable. If you update an image, rename the file.

---

## Adding Analytics / Tracking Provider

The tracking layer in `assets/js/tracking/tracker.js` is ready. To wire up an analytics service:

```js
// In app.js, after imports:
import { Tracker } from './tracking/tracker.js';

Tracker.use((event, payload) => {
  // Example: send to your own API
  fetch('/api/track', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => {});

  // Example: Google Analytics 4
  // gtag('event', event, payload);
});
```

All events are already emitted. No changes to product cards or cart needed.

---

## Swapping the Catalog Data Source

Currently all data comes from `data/products.js` (local JS file).

To switch to an API without touching any rendering code, edit only `assets/js/providers/catalog.js`:

```js
// Replace getProducts() local return with:
async getProducts() {
  const res = await fetch('https://your-api.com/products');
  return res.json();
}
```

The rendering modules (`catalog/render.js`) and the cart never know the difference.

---

## Future Integration Points

| Module | File | Purpose |
|--------|------|---------|
| Recommendation Engine | `recommendations/index.js` | Personalized product suggestions |
| Taste Profiles | `providers/catalog.js` | Pass user profile to `getRecommendations()` |
| Operational Intelligence | `tracking/tracker.js` | All events already emitted |
| Dynamic Homepage | `catalog/render.js` | `renderFeatured()` accepts any product |
| Customer Segmentation | `core/state.js` | Add segment key to AppState |
| Commercial Copilot | `providers/catalog.js` | Override product scores from API |

---

## Debug Mode

`Tracker` auto-enables debug logging on `localhost`. You'll see grouped console output for every behavioral event. To force-enable on production temporarily:

```js
// In browser console:
window.__rd  // inspect full public API
```
