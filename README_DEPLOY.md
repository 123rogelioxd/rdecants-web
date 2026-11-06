# RDECANTS deployment

Production is the `production` branch of `123rogelioxd/rdecants-web`. GitHub Actions `.github/workflows/deploy-production.yml` publishes the static tree to the existing Hostinger FTPS destination. `.htaccess` controls routing and caching; Netlify files are legacy compatibility files and are not the live hosting authority.

Before merging, run `node --test`, review the storefront CI check and confirm compatibility with the backend production contract. Do not bypass backend merge/deploy preflight. The backend always deploys first. The frontend degrades honestly against an older API: context chips fall back to the existing badge derivation, no vibe copy renders, the delivery-window selector stays hidden when `delivery_windows` is absent, and "Mis pedidos" shows its guest state.

`VERSION`, `BUILD_VERSION` in `assets/js/api/config.js`, and HTML asset query strings must agree — `cuenta.html` included. Public API data is refreshed after 60 seconds in memory; no per-product frontend deploy is needed. Product images remain on the canonical API storage host.

## Cierre de biblioteca olfativa · 2026-11-05

La candidata local `c9b317d` integra el modal aprobado, 168 fotografías de
ingredientes y 8 medallones de acorde. Las URLs usan `?v=2026.11.05.7` y esa
versión coincide en `VERSION`, `BUILD_VERSION` y las 11 entradas HTML. No se
cambió el contrato `/api/web/*`, precios, inventario ni checkout.

La lectura SSH de `rdecants.com/VERSION` devolvió `2026.11.02.1`; su SHA-256
coincide con el archivo de `origin/production` (`c9d5889`). La candidata no se
ha publicado.

Las 112 filas observadas en el catálogo de la API incluyen un campo `image` con
ruta `/storage/...`; las 112 filas del snapshot frontend conservan sus campos y
presentaciones. La vista de catálogo local mostró 108 artículos orderables; los
otros cuatro no pasaron el filtro de oferta disponible y no se cuentan como
fallas de imagen.

Las botellas que aparecen rotas en `http://5.5.5.244:8080/` son un fallo de ese
servidor de vista previa: su ruta `/storage/...` respondió 404, aunque las fotos
olfativas sí cargaron. `scripts/preview.mjs` ya incluye el proxy de `/storage/`
hacia el host canónico de la API. Esto no verifica las imágenes de botellas en
producción: las rutas binarias de los 112 productos no se volvieron a consultar
tras agotar el límite de sondeos de esta PC. No se cambió ningún componente para
compensar el preview externo.

La suite local frontend y la sesión visual cubrieron el modal, ficha completa,
presentaciones y carrito local; no se registró pedido ni cobro. Véase
`docs/2026-11-05-rdecants-closure.md` y `scripts/ingredients/LIBRARY.md` para la
evidencia, el detalle de alias y el estado de procedencia de las imágenes.

For isolated browser QA against a REAL backend — the only way to exercise the
customer session, CORS credentials and `/api/web/account/*` as they behave in
production — serve the tree on `127.0.0.1:5050` and run R Supply OS on
`127.0.0.1:8000`. `assets/js/api/config.js` points at that port automatically for
localhost, and `config/cors.php` allows the 5050 origin while `APP_ENV=local`.
Register orders only against a local database.

For QA with no backend at all, run `node scripts/preview.mjs` and open `http://127.0.0.1:8080`. GETs use the public catalog. Every POST is handled locally or rejected: local delivery is a synthetic $30 quote, national delivery is unresolved, quote pricing uses previously read public references, and registration returns `WEB-QA-LOCAL`. Never treat these fixtures as production delivery prices. `/tests/fixtures/customer-experience.html` exercises exact sealed/tester/partial offer selection without persisting an order.

After merge, verify the deploy workflow on the exact merge SHA, public `VERSION`, stylesheet/module availability, SVG sprite and API `scent_profile`/`normal_decant`/`publication`. Smoke-test public catalog, PDP, bottles, finder and checkout up to review without registering production test orders. The current candidate is **not published**: Actions is billing-blocked, source/licence for 136 photos remains unconfirmed, and production bottle binaries remain unverified. Do not mark `2026.11.05.7` deployed until those checks pass.

Rollback through a revert PR to `production`, then verify the deploy and public version. Backend projection is additive and can remain while the frontend is reverted. No migrations or inventory writes are part of this release.
