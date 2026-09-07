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
