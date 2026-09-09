# RDECANTS customer experience — implementation and validation

This vertical reuses RSupplyOS as the sole source of fragrance facts, prices, delivery quotes and inventory. Backend PR: https://github.com/123rogelioxd/r-supply-os/pull/128.

## Contract and architecture

The existing ProductProfile / PerfumeProfileDetail aggregate projects an additive `scent_profile`: human description, deterministic principal notes (maximum five), accords, two profile tags, occasions, climates, gender, scores and review status. Principal notes interleave top, heart and base while preserving authored ordering and removing normalized duplicates. No migration, duplicate perfume database or enrichment write is introduced.

`normal_decant.presentations` carries exact configured 3/5/10 ml prices and stock. Empty canonical presentations are authoritative and cannot fall back to bottle stock or legacy price fields. Legacy 30 ml remains in backend/domain data, outside normal storefront purchase surfaces. `publication` explicitly uses creation time and a 30-day window, not an invented publication date; editing an old product does not make it new.

The storefront provider preserves these fields and refreshes its memory cache after 60 seconds. Cards show only 5 ml pricing/direct add plus at most two tags. Opening the product reveals 3/5/10, with 5 ml selected, exact unavailable states, description and principal SVG notes. The same reusable note renderer serves quick view, PDP and bottle quick view. Search groups decants and bottles separately. Bottle cards are two columns on mobile and four on desktop; selecting a tester or partial adds the exact offer key. Reference photos are identified honestly when no unit photo exists.

Recommendations remain bounded to three. Reasons combine contributing answer dimensions, actual note labels, grounded traits and the available presentation/price. Relative labels such as “Una opción más fresca” require an actual score difference; ranking is not replaced by a second engine. Cotiza hides onboarding after meaningful search and focuses the selected quote, retaining the basket when searching again.

Cart is purchase review only. Delivery, confirmation and registration are separate screens with back/edit controls. Cart/address/coupon changes invalidate delivery quotes; late responses cannot restore stale prices. Known total uses authoritative merchandise pricing, discount and delivery. Unknown delivery remains null and the UI shows products plus “Por confirmar,” never free shipping or a final total. Registration uses only the existing WebOrder endpoint, retains idempotency protection and does not create a Sale or collect payment. Failure retains the cart and requires refreshed delivery review. WhatsApp is an explicit folio handoff after registration.

## Vocabulary and coverage

See `scent-coverage.json` for all 93 canonical note IDs, family-note vocabulary, 484 backend aliases and coverage details. The SVG sprite uses shared currentColor symbols rather than hundreds of duplicate drawings. All canonical backend IDs resolve in the frontend; every frontend alias is regression-tested against an existing SVG symbol. Unknown labels are escaped and shown with a generic scent icon.

Public catalog snapshot: 113 products, all 113 with notes and descriptions, 274 unique note labels, 993 occurrences, 986 recognized. Seven occurrences intentionally preserve source text with fallback: `acorde solar` (1), `ambergris, ambroxan` (1), `ladano` (3), `notas acuaticas, romero, salvia, geranio` (1), `pomelo, jengibre, bergamota` (1). Compound source strings are not silently split into newly asserted facts. No perfume facts were invented or overwritten. Existing machine naming/concentration combinations remain source data.

## Verification

Backend: full PHPUnit 6,925 tests / 45,425 assertions passed; 28 existing skips and 95 existing deprecations. Focused catalog 55 tests / 206 assertions. Composer autoload and tenancy architecture audit passed. PR #128 required risk-scoped CI and “Full gate (merge SHA)” passed.

Frontend: full Node suite, plus new normalization/sprite/empty-pool/30-ml/pricing/registered-total/Cotiza/quote-race regression cases. Cache version 2026.09.06.1 covers HTML, VERSION, API, dynamically loaded checkout CSS and SVG sprite. Full results and release SHAs belong in the final release report.

Browser QA used the actual working tree and public catalog GETs through `scripts/preview.mjs`. Every write was handled locally or rejected, so no production customer order, quote request or Sale was created. Mobile grid and checkout geometry checked at 375, 390, 393 and 430 px; desktop at 1280 px. No horizontal overflow. Bottle columns were 2/2/2/2/4; checkout changed from single column to two columns. Visual inspection covered decant and bottle quick views, desktop PDP, bottle catalog, recommendation cards and checkout.

Verified Hawas Fire: 3 ml $75, default 5 ml $120, 10 ml $230, and direct 5 ml addition. Verified local synthetic delivery: $120 + $30 = $150. Verified national unresolved delivery through separate confirmation and local registered folio WEB-QA-LOCAL: no final total and no payment claim. Editing cart retained address and changed Hawas Fire quantity to two while invalidating the old quote. Synthetic sealed/tester/partial fixture proved exact `qa:partial` selection at 65 ml / $650. Yara Candy search grouped decant 5 ml $100 separately from sealed bottle 100 ml $690. Cotiza Hawas search hid onboarding; selection focused the $1,350 quote and “Buscar otro perfume” retained the basket. Finder daytime male 25–34 example returned exactly three: 212 NYC MEN EDT, TORINO 21, DYLAN BLUE POUR HOMME, with source notes, actual 5 ml prices, and a supported fresher-alternative label.

## Release and operations

Merge/deploy backend first, frontend second, after both checks are green and compatibility verified. Do not bypass existing branch or deployment protections. Frontend uses existing production FTPS workflow and `.htaccess`; backend deployment keeps its existing preflight. No migrations. Roll back with a revert PR if needed. Production smoke is read-only or stops before order registration. Final deployment run URLs, merge SHAs and production observations are recorded in the final report after release.

---

# Customer order continuity (2026-09-09)

Backend PR: https://github.com/123rogelioxd/r-supply-os/pull/PENDING · full
operational reference in `r-supply-os/RSNEXUS/operations/CUSTOMER-ORDER-CONTINUITY.md`.

## Perfume: three questions, answered in order

`scent_profile` gains two additive fields, both derived by the canonical
projection from the occasions, climates and accords it already publishes:
`context_chips` (at most three) and `vibe` (one first-person sentence).

The storefront renders them and derives neither. `getContextChips()` /
`getVibeCopy()` in `assets/js/ui/scentNotes.js` are passthroughs with a hard cap
— a second opinion about a perfume in the browser is one the business cannot see
or review. `getDisplayBadges` remains the fallback for a payload cached from
before the field shipped; when `vibe` is absent nothing renders in its place,
because the backend returns null precisely when metadata cannot support a
phrase.

Quick view and PDP now read: house → name → chips → vibe → `¿A qué huele?` →
description → presentations → price → Add → trust line. The technical paragraph
moved below the notes; "Decant auténtico" moved below the buy actions and is
phrased as reassurance (`.pdm-trust`). 3/5/10 with 5 ml default is unchanged.

## Cart and confirmation

Every line renders `item.image` — already on the cart line and already sent in
the order metadata, so no second image source exists. The monogram initial sits
on the wrapper via `::after`, so a photo that never loads reveals it instead of
leaving a hole. Cart hierarchy: name and line total primary in full-strength
ink, presentation under the name, stepper and money alone on row two.
"Editar carrito" / "Editar entrega" are bordered secondary actions in brand ink.

## Delivery preference

`GET /api/web/delivery/options` publishes `delivery_windows`; the storefront
hardcodes no day, hour or label. Two taps — a day, then a window — shown only
for local delivery. "Lo coordinamos por WhatsApp" is a peer choice. The days
collapse to Hoy · Mañana · "Otro día…" so a week of chips is not a list to read.

Stored and posted as identity only (`{ date, window }`). Switching away from
local clears it; a remembered day no longer on offer is dropped rather than
resubmitted. Changing the address does not clear it — when a delivery arrives
cannot change what it costs.

## Mis pedidos

`/cuenta.html` (also `/cuenta`, `/mis-pedidos` — both rewritten with `[QSA]`,
which the order deep-link depends on). `noindex`, and absent from the sitemap:
the page is empty for everyone but its owner.

Identity is an HttpOnly cookie the API sets when a first order is registered.
Nothing in the storefront reads, stores or sends a token; `credentials:
'include'` is used only on `createWebOrder` and the four account calls, and the
public catalogue stays `credentials: 'omit'` so it behaves identically for a
customer and a stranger. A `401` is the ordinary first-visit answer and renders
the guest state — there is no login form, no signup wall and no discount popup.

Every status label and sentence comes from the API already resolved. Payment is
a separate line and is never inferred from progress; only `pagado` is a positive
claim, and it arrives only when an operator marked the collection settled. A
`total` of `null` renders "Total por confirmar", never `$0`.

Returning customers are prefilled from their own last order — blanks only, never
overwriting, never locking, and never rewriting the historical snapshot.

## WhatsApp

`Hola, quiero confirmar mi pedido WEB-… de RDECANTS.` plus, when there is one,
`Horario preferido: 10/09, 4 - 7 pm.` echoed from the server's snapshot. Plain
ASCII, printed as a date rather than "Hoy"/"Mañana". No lines, no totals, no
payment claim.

## Verification

Full Node suite: 1127 tests, 1126 pass, 1 pre-existing skip — including 40 new
regressions in `tests/customerOrderContinuity.test.js` covering chip caps,
escaping, absent metadata, requested-vs-guaranteed wording, unpriced totals,
payment separation, ownership-by-cookie and navigation.

Browser QA ran against a **local** R Supply OS (sqlite `browse.sqlite`, the three
migrations applied) over the real cross-origin path — storefront on
`127.0.0.1:5050`, API on `127.0.0.1:8000` — so the cookie, CORS credentials and
account endpoints were exercised as they behave in production. Widths 375, 390,
393, 430 and 1280: no horizontal overflow anywhere. Verified end to end: quick
view hierarchy, cart thumbnails, local quote, window selection, national hiding
the selector and clearing a stale preference, confirmation thumbnails,
registration, the registered screen's facts, "Ver mi pedido", the order list and
detail, and logout revoking the session server-side (subsequent `401`).

No production order, quote or customer record was created. `scripts/preview.mjs`
(never deployed) carries local fixtures for the same loop when no backend is
running.

Cache version `2026.09.09.1` across `VERSION`, `BUILD_VERSION` and every entry
point including `cuenta.html`.
