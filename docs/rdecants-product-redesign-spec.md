# RDecants — Product Redesign Spec

_Companion to `rdecants-product-audit.md`. Defines the target product, the design system deltas, and the phased implementation. Evolution of the existing identity — not a rebrand, not a stack change._

---

## 1. Positioning

**Customer promise (headline):**
> **Encuentra el perfume que sí usarías.**

**Supporting line:**
> Prueba fragancias originales en 5 ml y sube a 10 ml cuando ya sabes que es para ti.

Rules:
- Concrete over poetic. The value ("prueba antes de gastar en la botella") is stated as the headline, not buried.
- Gender-agnostic. Masculine, feminine, unisex and gift discovery are all first-class. No "para hombres" copy anywhere.
- 5 ml is the default entry; 10 ml is the natural upgrade; 3 ml optional trial; 2 ml only a completion size.
- Refined Spanish (Mexico). No translated-sounding phrasing, no generic luxury clichés, no fake urgency/counters/testimonials.

---

## 2. Information architecture (home)

1. **Header** — identity · Catálogo · Encuentra tu fragancia · Ayuda · Search · Cart _(mobile: compact, search+catalog immediate)_
2. **Hero** — promise + supporting line + default size + **primary `Encontrar mi fragancia`** / secondary `Ver catálogo`. Real product photography.
3. **Discovery shortcuts** — Para diario · Citas · Calor · Noche · Oficina · Regalo → each applies a **real** filter or launches the finder. No dead buttons.
4. **Guided fragrance finder** — ≤3 questions, ≤3 results, 1 clear top pick, 5 ml price + 10 ml upgrade, deterministic reasons.
5. **Catalog** — first-class surface: search, intent filters > taxonomy filters, house/availability, active-filter state, count, clear-all, skeletons, empty/error states.
6. **How purchasing works** — 3 honest steps (elige 5 ml → pruébalo → sube a 10 ml / pide por WhatsApp).
7. **Authenticity & preparation** — original bottles, decant prepared to order, careful packaging. Concrete, no invented certs.
8. **Discovery kits** — only the honest Discovery Sets (no fabricated "Ahorra").
9. **Shipping / payment / order FAQ** — how shipping is calculated, payment via WhatsApp, delivery, incidents, contact. No private address.
10. **Footer** — identity, WhatsApp, catalog, kits, legal.

`mood.html` and `product.html` inherit the header/footer/token changes; deep PDP redesign is a later phase.

---

## 3. Design system (token deltas)

Additive to `tokens.css` (keep every existing value; the site is dark charcoal + warm ivory + muted gold already). New tokens:

```
/* Surfaces */
--surface-0/1/2, --surface-raised, --overlay-scrim
/* Text hierarchy aliases */
--text-strong (=white), --text (=muted), --text-soft (=soft), --text-onGold
/* State */
--wa: #25d366; --wa-strong; --success; --success-soft;
--warn (low-stock amber); --warn-soft;
/* Gold scale */
--accent (existing), --accent-strong, --accent-soft, --accent-line
/* Motion */
--dur-fast 140ms; --dur 240ms; --dur-slow 420ms;
--ease-out cubic-bezier(.19,1,.22,1); --ease-standard cubic-bezier(.4,0,.2,1)
/* Safe areas */
--safe-b env(safe-area-inset-bottom)
```

Visual direction: deep charcoal/black backgrounds, warm ivory text, **muted** gold accents (never neon, never excessive), real photography, editorial serif display (`Cormorant Garamond`) + `DM Sans` body, generous controlled spacing, subtle 1px separators, minimal purposeful motion, `prefers-reduced-motion` respected. No glassmorphism/particles/gradients-for-their-own-sake.

---

## 4. Component specs (this phase)

### Header nav
- Add `.header-nav` links: Catálogo (`#catalog`), Encuentra tu fragancia (`#finder`), Ayuda (`#faq`). Real anchors; smooth-scroll.
- Desktop: inline between search and cart. Mobile: nav links collapse; search icon + cart remain; keep header compact and sticky-stable.

### Hero
- H1 = promise; sub = supporting line; a one-line size cue ("Entra por 5 ml · sube a 10 ml").
- Dual CTA: `.btn-primary` **Encontrar mi fragancia** → smooth-scroll to `#finder` (focuses first question); `.btn-ghost` **Ver catálogo** → `#catalog`.
- Keep the existing eager hero image (LCP). Remove "Nueva Colección 2026 / El arte de oler bien".

### Discovery shortcuts (`#discovery-shortcuts`)
- 6 chips, ≥44px targets, keyboard + touch. Icon optional (restrained).
- Mapping (real behavior):
  - Para diario → `SearchBar.applyMood('diario')`
  - Citas → `applyMood('fiesta')` (date/seductor cluster) or finder occasion=noche
  - Calor → `applyMood('fresco')`
  - Noche → `applyMood('fiesta')`
  - Oficina → finder occasion=oficina (or a new `oficina` mood filter)
  - Regalo → scroll to finder with a "para regalar" framing (gender=any)
- Each click scrolls the catalog/finder into view and shows the active-filter state. Tracks `filter_applied` / finder open.

### Guided finder (`#finder`, reuse `#assistant` engine)
- **3 questions**: `family` (Fresco/Dulce/Intenso), `occasion` (Diario/Noche/Oficina/Cita), `gender` (Me da igual/Hombre/Mujer/Unisex). **Drop `budget`** as a required question (least differentiating; the price is always shown on the card).
- **≤3 results**, `MAX_RESULTS = 3`, `MIN_RESULTS = 2`. Top result gets a distinct `.asst-card--top` treatment + "Nuestra recomendación" label.
- Card price = 5 ml (default variant); add a `+ 10 ml $X` upgrade line when a 10 ml variant exists.
- **Add ≠ open cart.** Replace `openCart()` with the actionable toast (consistent with catalog/modal).
- Preserve all tracking (impression, click, add).

### How-it-works / Authenticity / FAQ
- Static, semantic sections (`<h2>`, real lists). Concrete copy only (see audit §7). FAQ uses `<details>`/`<summary>` for native, accessible disclosure — no JS, no fake content.

### Demo-fallback gate (`providers/catalog.js`)
- Read `DECANTS_HIDE_DEMO_PRODUCTS` meta **and** hostname. In production (or when the flag is `true`), a catalog API failure resolves to `[]` (clean empty state) instead of `PRODUCTS`. On `localhost`/`127.0.0.1` keep the local fallback for development.

### SEO
- `index.html`: canonical, `og:url`, `og:image` (existing hero webp), `twitter:card=summary_large_image`, corrected description (5 ml framing, no hardcoded fragile price), JSON-LD **Organization** (name, url, logo, sameAs WhatsApp) — **no** ratings/offers with invented values.
- Add `robots.txt` (allow all, point to sitemap) and `sitemap.xml` (home, catalog anchor, WhatsApp is external so excluded).

---

## 5. Analytics (unchanged semantics, preserve)

Keep every canonical event. New surfaces reuse existing events: discovery shortcut → `filter_applied`; finder → `assistant_started`/`assistant_completed`/`recommendation_*`. No new duplicate view events. No product-view on grid appearance.

---

## 6. Accessibility & mobile (acceptance)

- Semantic headings, real buttons/links, visible focus, `aria-live` cart confirmations (already present), `prefers-reduced-motion`.
- Discovery chips & finder chips: `role`/`aria-pressed`, 44px targets.
- FAQ via native `<details>`.
- Test viewports: 360×800, 390×844, 430×932, 768×1024, 1440×900 — no horizontal overflow, stable sticky header, safe-area bottom on cart CTA.

---

## 7. Phasing

**Phase A (this task — implemented + verified):**
Tokens delta · header nav · hero rewrite · discovery shortcuts · de-gender copy · finder (3Q/3R/top pick/10 ml/ no force-open) · how-it-works + authenticity + FAQ · demo-fallback gate · cart force-open cleanup (finder + discovery sets) · SEO (meta/OG/canonical/JSON-LD/robots/sitemap) · tests · version bump · browser verification.

**Phase B (documented, not in this task):**
PDP `product.html` per-product SEO + up-to-3 alternatives · catalog filter bottom-sheet refinement on mobile · modal "similar alternatives" block · `mood.html` visual alignment · componentized CSS split.

**Phase C (needs owner/backend input):**
Real packaging photography · numeric MSRP comparison (R Supply OS contract) · verified bestseller data.

---

## 8. Definition of done (Phase A)

- [ ] New customer understands the offer above the fold (concrete promise + finder CTA).
- [ ] Discovery by intent works (shortcuts apply real filters).
- [ ] Finder: ≤3 questions, ≤3 results, 1 top pick, 5 ml + 10 ml pricing, no forced cart open.
- [ ] No "para hombres" / male-only framing.
- [ ] Trust/how-it-works/authenticity/FAQ are concrete and non-fabricated.
- [ ] Production never renders demo products.
- [ ] Public fetches keep `credentials: 'omit'`; discount stays backend-authoritative.
- [ ] SEO metadata complete, no fake ratings.
- [ ] Full test suite green; CSS version bumped in lockstep.
- [ ] Manual desktop + mobile walkthrough passes.
