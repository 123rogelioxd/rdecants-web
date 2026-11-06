# RDECANTS deployment

Production is the `production` branch of `123rogelioxd/rdecants-web`. GitHub Actions `.github/workflows/deploy-production.yml` publishes the static tree to the existing Hostinger FTPS destination. `.htaccess` controls routing and caching; Netlify files are legacy compatibility files and are not the live hosting authority.

Before a production merge, run `node --test`, review the storefront CI check and confirm compatibility with the backend production contract. Do not bypass backend merge/deploy preflight when the `/api/web/*` contract changes; deploy backend first in that case. A static-only storefront release does not deploy Laravel. The frontend degrades honestly against an older API: context chips fall back to the existing badge derivation, no vibe copy renders, the delivery-window selector stays hidden when `delivery_windows` is absent, and "Mis pedidos" shows its guest state.

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

The note above about the unpublished candidate was superseded on 2026-11-06:
`2026.11.05.7` is deployed and verified by SSH. See the release close below.

## Publicación SSH/SFTP directa a Hostinger

La publicación estática RDECANTS puede hacerse por SSH cuando Actions no debe
ejecutarse. No es un despliegue de Laravel. El único docroot de esta operación
es:

```text
/home/u377797534/domains/rdecants.com/public_html
```

El alias `rsupply-prod` también alcanza `api.rdecants.com` y otros proyectos:
no uses comodines, espejo con borrado ni recorridos fuera de ese docroot. Laravel,
Nexus, `.env`, ventas e inventario quedan fuera del paquete.

Procedimiento:

1. Lee `AGENTS.md`, `CLAUDE.md`, este runbook, el cierre vigente y las decisiones.
   Comprueba `origin/production`, la rama candidata y `VERSION`; confirma en los
   YAML que la rama subida no satisface un filtro `push` ni abre un PR. No
   empujes a `production` para evitar Actions de pago.
2. Construye un paquete sólo con archivos estáticos `A/M`: excluye `.git`,
   `.github`, `.claude`, `node_modules`, `tests`, `scripts`, `docs`, todos los
   `*.md` y `*.zip`. El manifiesto incluye ruta, SHA-256 base y SHA-256 candidata.
   Cada archivo existente debe coincidir exactamente con la base en el host; cada
   alta debe estar ausente. Rechaza symlinks y rutas fuera del docroot.
3. Envía el paquete y script UTF-8 sin BOM, con saltos LF, por una sola sesión
   SSH. Usa OpenSSH de Windows (Git Bash sólo como shell envolvente):

   ```bash
   /c/Windows/System32/OpenSSH/ssh.exe -T -o BatchMode=yes -o ConnectTimeout=20 rsupply-prod 'bash -s' < deploy-storefront.sh
   ```

   El script valida la ruta canónica y `VERSION`, compara las huellas de base y
   candidata y se detiene antes de escribir si algo no coincide.
4. Antes del primer reemplazo, crea
   `/home/u377797534/backups/<release>-<UTC>/` con permisos `0700`, el tar de
   archivos existentes, la lista de nuevas rutas, los marcadores de versión,
   commits base/candidato, hashes y `rollback.sh`. Valida el tar y su SHA-256.
5. Instala atómicamente con copia temporal + `mv`: assets primero, HTML después,
   `VERSION` al final. No borres archivos anteriores ni toques configuración o
   datos comerciales. Ante un fallo durante la instalación, el script ejecuta el
   rollback creado.
6. Humo público de sólo lectura: `VERSION`, catálogo, fotos, modal móvil,
   presentaciones/precios, perfil y consola. No agregues productos en una sesión
   real compartida ni registres pedidos/cobros. Conserva el carrito del usuario.

Rollback:

```bash
bash /home/u377797534/backups/<release>-<UTC>/rollback.sh
```

El respaldo restaura sólo archivos reemplazados y elimina sólo las altas que el
preflight comprobó ausentes. Este canal publica archivos estáticos y no requiere
respaldo de BD. Conserva el directorio y SHA impresos por cada release.

### Release `2026.11.05.7` · 2026-11-06

- Publicado en `rdecants.com/public_html` desde el commit
  `18c49348751686140376b02517e31d29a00c66ed`; no se publicó backend.
- Respaldo:
  `/home/u377797534/backups/rdecants-web-20261105-7-20261106T060429Z/`.
  SHA-256 de `storefront-before.tar.gz`:
  `844be8d184d9447392fff168c093ff898e6e8c4f578428d1a54f9a7f52209142`.
- 260 archivos verificados: 21 reemplazos y 239 altas. El rollback local de
  prueba restauró los 21 archivos y eliminó las 239 altas.
- Push sólo a `trabajo/rediseno-rdecants-20261105`; los workflows filtran
  `production` o PR con base `production`. La consulta posterior dio 0 runs para
  la rama candidata. GitHub `production` sigue en `c9d58897` para no iniciar
  Actions de pago.
- `VERSION=2026.11.05.7`; navegador posterior: 108 ofertas, 14 fotos de frascos
  válidas, cuatro fotos de ingredientes en modal móvil, perfil y precios
  3/5/10 ml. Consola sin errores/avisos. Sin pedido o pago de prueba.
