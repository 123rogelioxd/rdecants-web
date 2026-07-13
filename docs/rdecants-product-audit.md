# RDecants — Product Audit

_Audit date: 2026-07-13 · Branch: `production` · Scope: storefront frontend (`rdecants-web`)_

This audit maps the **current, live code** (not memory or historical assumptions) and classifies findings into: **Confirmed problems**, **Already-fixed history**, **Regression risks**, **Backend limitations**, and **Frontend-only opportunities**. Line references are to files at audit time.

---

## 1. Architecture map (as it actually is)

| Concern | Where it lives | State |
|---|---|---|
| Entry pages | `index.html` (home), `product.html` (PDP deep-link), `mood.html` (mood landing) | Static HTML, 3 pages share the cart drawer markup |
| App bootstrap | `assets/js/app.js` | ES-module orchestrator; exposes `window.__rd` bridge |
| Data source | `assets/js/providers/catalog.js` → `assets/js/api/client.js` → `api/config.js` | Provider abstraction over R Supply OS; **local `data/products.js` fallback** |
| Catalog render | `assets/js/catalog/render.js` | Grid + cards, mobile cap (8), quick-add |
| Search / filters | `assets/js/ui/searchbar.js` + `assets/js/catalog/search.js` | Pure filter/sort engine + DOM controller |
| Product detail | `assets/js/ui/modal.js` (quick view) + `assets/js/ui/productPage.js` (full PDP) | Modal is focus-trapped, size selector, 5 ml default |
| Guided finder | `assets/js/recommendations/assistant.js` (logic) + `assets/js/ui/assistant.js` (UI) | Deterministic, metadata-driven |
| Recommendation core | `assets/js/recommendations/*` (taxonomy, scoring, reasoning, upsells, index, personalization, bundles, discovery) | Centralized; unit-tested |
| Cart state | `assets/js/cart/cart.js` | localStorage-backed |
| Cart drawer | `assets/js/cart/render.js` | Drawer UI, summary, trust strip |
| Checkout / WhatsApp | `assets/js/cart/checkout.js` | **WhatsApp-first**, background order, cart-preserving |
| Discount preview | `assets/js/cart/discount.js` | Backend-authoritative preview, code-only |
| Campaign attribution | `assets/js/cart/attribution.js` + `campaign.js` | UTM/promo capture + auto-apply |
| Tracking | `assets/js/tracking/tracker.js` (queue+dedupe) + `events.js` (POST bridge) + `backend.js` (map) | Robust, PII-sanitized, deferred providers |
| Design tokens | `assets/css/tokens.css` (63 lines) | Minimal; missing surfaces/state/motion tokens |
| Styles | `assets/css/components.css` (**7,742 lines**), `styles.css`, `animations.css` | Large monolith |
| Cache strategy | `_headers`, `netlify.toml`, `.htaccess`, `VERSION` | CSS immutable 1yr, cache-bust via `?v=` |
| Tests | `tests/*.test.js` (**35 files**, `node --test`) | Pure-logic + static-markup assertions |

**Confirmed:** the stack is exactly as briefed — vanilla ES modules, no build step, provider talks to `api.rdecants.com`. `credentials: 'omit'` is already correctly set on all public fetches (`api/client.js:14,25,58`). ✅

---

## 2. Confirmed current problems

### P1 — Positioning is editorial, not a concrete customer promise
- `index.html:107-117` hero reads _"Nueva Colección 2026 / El arte / De oler bien / Fragancias de lujo…"_ — poetic, vague, luxury-first. It never states the concrete value ("prueba antes de gastar en la botella") above the fold as the headline.
- Only **one** hero CTA (`Ver Catálogo`, `index.html:120`). The briefed primary action **`Encontrar mi fragancia`** (guided finder) does not exist in the hero.

### P2 — Male-only framing (brand guardrail violation)
- `index.html:171-173`: catalog intro copy _"…para hombres que entienden el poder de oler bien."_ Explicitly excludes women/unisex/gift audiences.
- `data/products.js`: **all 12 fallback products are `masculine` or `unisex`; zero `feminine`.** The demo/fallback dataset itself encodes the male bias.
- `catalog/search.js:446-456` `GENDER_PRIORITY` down-ranks `feminine` as a tiebreaker (documented as audience-weighted, but compounds the bias when combined with the copy).

### P3 — No intent-based discovery
- There are **no discovery shortcuts** (Para diario, Citas, Calor, Noche, Oficina, Regalo). Customers can only browse the raw grid or run the finder. Intent → filter mapping exists in the engine (`search.js` MOOD_MAP, assistant `OCCASION_USE_CASES`) but is not surfaced as one-tap entry points.

### P4 — Guided finder exceeds the briefed limits
- `recommendations/assistant.js:29-69` defines **4 questions** (family, occasion, budget, gender). Brief: **≤3**.
- `assistant.js:20-21` `MAX_RESULTS = 4`. Brief: **≤3 recommendations**.
- `ui/assistant.js:194-199` the "Agregar" handler calls `window.__rd?.ui?.openCart?.()` — **force-opens the cart on add**, contradicting the established "no forced cart open" rule (which was fixed for catalog cards & modal but not here).
- Finder result cards (`ui/assistant.js:170`) show only the budget-matched variant price; the **10 ml upgrade price is not shown** as the natural step-up.
- No single visually-distinct **top** recommendation beyond a match-tier chip.

### P5 — Dead demo-hide flag / demo fallback reachable in production
- `index.html:14` sets `<meta name="DECANTS_HIDE_DEMO_PRODUCTS" content="true">`, but **grep confirms nothing in JS ever reads it**. It is decorative.
- `providers/catalog.js:34-39`: on any catalog API throw, the provider falls back to `PRODUCTS` from `data/products.js` **unconditionally** — including in production. If `api.rdecants.com` is briefly unreachable, real users would see 12 hardcoded demo SKUs with invented stock/badges as if purchasable. This violates "No demo-product fallback in production." (Note: an **empty** successful API response degrades cleanly to the empty state — only a thrown error triggers the demo fallback.)

### P6 — Information architecture is thin on trust & "how it works"
- The only trust surface is a 4-item emoji bar (`index.html:132-154`) with generic slogans ("Envío Express", "Atención Personal"). There is **no** "Cómo funciona el decant flow", **no** authenticity/preparation proof section, and **no** shipping/payment/order FAQ — all explicitly briefed.
- Footer legal line is fine; no fake ratings anywhere (good).

### P7 — SEO / sharing gaps
- No `robots.txt`, no `sitemap.xml` (confirmed absent).
- `index.html`: has `og:title/description/type` but **no `og:image`, no `og:url`, no canonical, no Twitter card, no JSON-LD**.
- Meta description (`index.html:11`) says _"desde 3ml"_ — contradicts the 5 ml-default positioning; OG description (`:17`) hardcodes _"desde $120 MXN"_ (a fragile price claim).
- `product.html:10-16` PDP metadata is static/generic — not per-product (deep-link infra exists via `netlify.toml /perfume/*`, but the page doesn't set product-specific title/OG/JSON-LD).

### P8 — Header lacks navigation
- `index.html:84-95`: header has only search + cart. No `Catálogo`, `Encuentra tu fragancia`, `Ayuda` links. Discovery relies entirely on scroll.

### P9 — Inline handlers & minor a11y/markup issues
- Inline `onclick` throughout (`index.html:91,120,223,233,309,317`; same in `product.html`, `mood.html`). Brief prefers no inline handlers.
- `index.html:57` logo `href="#"` (should be a real anchor / no-op button).
- Intro splash (`#intro`, `index.html:49-53`) adds a 700 ms branded gate on first visit — acceptable but adds friction to "understand the offer immediately".

### P10 — Design token system is too small for a design system
- `tokens.css` has colors, type scale, spacing, radius, shadow, one transition. Missing the briefed tokens: **surfaces**, **text hierarchy aliases**, **success/WhatsApp state**, **warning/low-stock state**, **motion duration + easing** scale. Components hardcode the WhatsApp green and low-stock colors inline.

### P11 — Suspicious/irrelevant binary asset
- `assets/featured/FileZilla_3.70.5_win64_sponsored2-setup.exe` — a Windows installer committed into the storefront's image folder. It is not referenced anywhere and does not belong in a web repo. **Flagged to the owner for manual review/removal** (not auto-deleted).

---

## 3. Already-fixed history (do NOT regress)

These were fixed in prior sprints and verified still-correct in current code:

- **Cart never blocks WhatsApp.** Minimum-order gate removed; `$170` is a *shipping* threshold, not a checkout gate (`cart/momentum.js:14`, `checkout.js:376-398`). Order minimum = `$0`.
- **WhatsApp-first checkout.** WA window opens synchronously inside the click gesture *before* any await; system order is created fire-and-forget in the background (`checkout.js:93-151`). Popup-blocked path keeps the cart + shows a manual link (`:133-138,187-198`). Cart is cleared **only after** a successful open (`:147`).
- **Discount is backend-authoritative & code-only.** Frontend previews via `/discounts/preview` and forwards only the code; never computes final totals (`api/client.js:79`, `checkout.js:164-176,271-272`).
- **No `alert()`/`confirm()`.** Replaced by toasts + inline messages.
- **Add-to-cart does not force-open the drawer** for catalog cards (`catalog/render.js:288-298`) and the modal (`modal.js:322-324`). _(But still does in the finder & discovery sets — see P4 / Regression risks.)_
- **5 ml is the default** selectable/priced size; 2 ml excluded from headline pricing (`utils/prices.js:13,67-75`); modal labels 5 ml "Recomendado" (`modal.js:398-405`).
- **Tracking is deduped & PII-safe** (`tracker.js:126-133,613-619`); catalog-grid appearance does **not** fire per-product view events beyond the intended single bulk `viewed_product`.
- **Public fetches omit credentials** (`api/client.js`).
- **Accents/encoding** issues (Windows-1252) previously repaired; current strings render UTF-8.
- **Mobile cart** scroll/density fixes and 44px tap targets are in place.

---

## 4. Regression risks (guard during redesign)

1. **CSS cache-bust lockstep.** CSS is served `immutable, max-age=31536000` (`_headers:21-22`). Any `assets/css/*` edit **must** bump `?v=` in all three HTML pages **+** `VERSION` **+** the hard-pinned assertion in `tests/cacheFreshness.test.js`. Missing this = real phones serve year-old CSS (this exact miss happened in Jul 2026).
2. **Finder result cap & question count are asserted by tests** (`tests/assistant.test.js`). Changing 4→3 questions / 4→3 results requires updating logic *and* tests together.
3. **Cart drawer markup is duplicated across `index.html`, `product.html`, `mood.html`.** Any drawer change must be applied to all three or the pages diverge.
4. **`buildDiscoverySetsHtml`, `getAssistantRecommendations`, price helpers are pure and test-pinned.** Keep signatures stable; add options rather than rewrite.
5. **Force-open-cart cleanup must be surgical.** `openCart()` is legitimately user-initiated in the toast action (`cart.js:79`) — do **not** remove that. Only remove the *automatic* opens in `ui/assistant.js:198` and `ui/discoverySets.js:270` (and PDP `productPage.js` if we align it).
6. **CRLF churn.** `git status` shows many files "modified" with zero real diff. Stage only files actually edited; never `git add -A`.
7. **Demo-fallback gating must preserve local-dev behavior.** Gating the fallback to non-production must still let `localhost` render something usable (or a clean empty state) — don't break the dev preview.

---

## 5. Backend limitations (R Supply OS — out of this repo)

- **No numeric MSRP / full-bottle price** is exposed → cannot show "una botella cuesta $X, pruébala desde $Y" numerically. Keep the qualitative phrasing.
- **No real sales/bestseller counts** → "bestseller" badges must come from real `badge`/`featured`/`commercial_role` fields, never fabricated.
- **No margin/cost data** → operational scoring uses honest proxies (stock health + featured + demand), documented in `recommendations/scoring.js`.
- **Discount final total** is only known after order creation → preview is an estimate by contract; frontend must not present it as final.
- **Catalog gender coverage** depends on what R Supply OS publishes; the frontend must render feminine/unisex/gift correctly *when present* and must not hardcode a male-only catalog.

No backend change is required for the redesign scope below. If numeric MSRP or verified bestseller data is later wanted, that is a separate R Supply OS contract (documented in the redesign spec's "content gaps").

---

## 6. Frontend-only opportunities (safe, high-leverage)

1. **Rewrite hero** to the concrete promise + dual CTA (finder-first). _(P1)_
2. **De-gender** catalog/hero copy; make discovery gender-agnostic. _(P2)_
3. **Add discovery shortcuts** wired to the existing filter/finder engine. _(P3)_
4. **Tighten the finder** to 3 questions / 3 results, add a distinct top pick, show the 10 ml upgrade, stop force-opening the cart. _(P4)_
5. **Gate the demo fallback** behind hostname/flag so production never shows demo SKUs. _(P5)_
6. **Add trust / how-it-works / authenticity / FAQ** sections with concrete, non-fabricated content. _(P6)_
7. **SEO**: canonical, full OG + Twitter, `og:image`, `robots.txt`, `sitemap.xml`, JSON-LD **Organization** (not ratings). _(P7)_
8. **Add header nav** (Catálogo / Encuentra tu fragancia / Ayuda). _(P8)_
9. **Expand design tokens** (surfaces, text hierarchy, WhatsApp/success, low-stock/warning, motion). _(P10)_
10. **PDP polish (later phase)**: add up-to-3 differentiated alternatives + per-product SEO metadata on `product.html`.

The catalog engine, cart, checkout, discount, tracking and modal are **strong** and should be **preserved**, not rewritten. The redesign is concentrated on **positioning, information architecture, discovery, trust and SEO** — exactly where the gap between "landing page + catalog" and "coherent product" lives.

---

## 7. Content / asset gaps (need real data or owner input — not to be faked)

| Gap | Needed from | Interim handling |
|---|---|---|
| Real authenticity/sourcing statement | Owner | Use honest, verifiable phrasing already true (decants from original bottles, prepared to order) — no invented certifications |
| Real packaging photo | Owner assets | Use existing hero photography; mark a placeholder slot in spec |
| `og:image` social card | Owner/design | Point to an existing `assets/featured/*.webp` for now |
| Numeric MSRP comparison | R Supply OS | Keep qualitative ("una botella completa cuesta miles") |
| Verified bestseller/ratings | R Supply OS | Use real `badge`/`featured` only; no star ratings, no schema `aggregateRating` |
| Shipping cost rules | Owner | State honestly: envío a todo México, se confirma por WhatsApp; `$170`+ recomendado para envío, menos = entrega local |

No fictional content is published anywhere. Where real data is missing, the redesign hides the field rather than inventing it.
