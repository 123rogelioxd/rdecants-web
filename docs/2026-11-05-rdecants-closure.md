# RDECANTS · cierre de fotos y experiencia de producto

Fecha: 2026-11-05. Estado: **candidata local; no publicada**.

## Código y producción

- Frontend: la rama `trabajo/rediseno-rdecants-20261105` recupera los 14 commits
  hasta `c9b317d` sobre `origin/production` (`c9d5889`); el commit de cierre
  incorpora la versión y documentación de esta misión.
- GitHub `production`: `c9d58897f0a96d97f6dcc3ceec619aba01c26c65`.
- Tienda leída por SSH: `VERSION=2026.11.02.1`; su SHA-256 coincide con el
  archivo de `origin/production`, por lo que la tienda coincide con la base
  GitHub; no contiene la candidata `2026.11.05.7`.
- Laravel/R Supply OS no cambia. SSH reportó el último respaldo de packs
  (`packs-20261105-072615`) con candidata `df09e4f2`; el marcador histórico
  `deployment-commit.txt` sigue en `2b7191b2`. No se desplegó backend ni se tocó
  Nexus, rentabilidad, packs, flags o esquema.
- El deploy oficial de tienda usa Actions/FTPS y está bloqueado por facturación.
  No se inició Actions, no se creó pedido ni cobro de prueba. Sin deploy oficial
  operativo y sin un rollback del storefront ensayado no se publicó por un
  canal improvisado.

## Biblioteca visual verificada

- 168 de 168 fotos listadas: archivo presente, ID del vocabulario, WebP
  decodificable, 384 × 384, canal alfa y contenido dentro del lienzo.
- 8 de 8 medallones únicos presentes; los 9 IDs de acorde comparten esos 8
  archivos (`aquatic` usa `marine`). No hay hashes duplicados en la biblioteca.
- Alias `Azúcar`/`brown sugar` → `sugar`; `Caña de azúcar` → `sugar_cane`.
  Son archivos distintos y sus imágenes corresponden a azúcar cristalizada y
  caña. También se mantienen «limón» amarillo frente a «lima» verde, y «cuero»
  liso frente a «ante/gamuza».
- 12 WebP detallados superan la guía preferida de 40 KB; el mayor ronda 53 KB.
  Se conservaron las fuentes para evitar degradación. No se regeneraron fotos.
- La captura del catálogo es de 112 perfumes (107 con notas, 250 etiquetas de
  nota distintas, 140 ingredientes físicos canónicos y 50 acordes). Los assets
  de la biblioteca no implican foto para cada etiqueta: se conserva el fallback
  de ilustración y luego la gota neutra.
- Créditos: 32 fotos iniciales tienen fuente documentada como láminas de Roger.
  Las láminas originales de las otras 136 fotos no están en el checkout; falta
  confirmar fuente/licencia por escrito. Ver `assets/img/ingredients/photo/CREDITS.md`.

## Perfumes, perfil y compra

- El contrato frontend contiene 112 productos; su fixture verifica identidad,
  campos consumidos, variantes, género y presentaciones 3/5/10 ml para los
  productos vendibles. La lectura del catálogo API devolvió 112/112 campos
  `image` con una ruta `/storage/...`.
- En el preview externo `http://5.5.5.244:8080/`, la página recibe 404 en
  `/storage/...`; las fotografías de ingredientes y dibujos cargan. El servidor
  oficial `scripts/preview.mjs` sí trae un proxy `/storage/` al API. Esto confirma
  el defecto de ese preview, no una falta de archivos en producción. La lectura
  de `VERSION` en producción dio `2026.11.02.1`; no se descargaron los 112
  binarios de producción porque ya se había agotado el presupuesto local de
  sondeos. Su existencia en host queda sin comprobar.
- La vista de catálogo del preview mostró 108 artículos con oferta orderable de
  112 recibidos; el proveedor filtra los que no tienen una presentación activa.
  No se atribuye esa diferencia a imágenes.
- Browser QA local: modal, perfil completo de Zara Bogos Vibrant Leather Coco
  Suede, notas/ocasiones, tres presentaciones, precios, añadir y aumentar
  cantidades. Carrito local vaciado al final. No se registró orden ni pago.
- Sin rediseño de identidad ni cambio del contrato `/api/web/*`.

## Versionado, pruebas y publicación

- Versión de recursos subida de `2026.11.05.6` a `2026.11.05.7` en `VERSION`,
  `BUILD_VERSION`, pruebas de frescura y 11 entradas HTML.
- `node --test`: 1,189 pruebas, 1,188 aprobadas, 1 omitida, 0 fallas.
- QA Local Principal, filtros Laravel para contrato de perfil, oferta de
  botella, buyability y recomendación: 36 pruebas, 95 aserciones, 0 fallas,
  1 omitida y 69 deprecaciones existentes. El filtro amplio `Storefront` mostró
  2 fallas entre 287 pruebas, pero el wrapper oficial sólo devolvió el resumen;
  no se identificaron los nombres y el backend no cambió en esta tarea.
- La prueba Laravel directa en el worktree de backend no arrancó porque no tiene
  `vendor/`; se usó la QA Principal oficial para los filtros focalizados.
- El workflow excluye `*.md` para no publicar documentación interna en el sitio.
- Pendiente publicar sólo después de habilitar el canal oficial y verificar el
  rollback. Para comprobar binarios del API, usar el pipeline de despliegue
  aprobado; no repetir sondeos desde esta PC.

## Actualización del cierre · 2026-11-06

La versión `2026.11.05.7` quedó **publicada** en Hostinger mediante una única
sesión SSH limitada a `/home/u377797534/domains/rdecants.com/public_html`. El
paquete vino de la rama local/remota
`trabajo/rediseno-rdecants-20261105`, commit
`18c49348751686140376b02517e31d29a00c66ed`; GitHub `production` permanece en
`c9d58897f0a96d97f6dcc3ceec619aba01c26c65`. No hubo PR ni ejecuciones Actions.

- Preflight: `VERSION` anterior `.1`, las 21 rutas existentes coincidían con
  los SHA-256 de la base y las 239 rutas nuevas estaban ausentes. Sin symlinks,
  eliminaciones ni cambios a API/Laravel, Nexus, ventas, inventario o `.env`.
- Resultado SSH: 260 archivos; assets primero, HTML después, `VERSION` al final.
  Backup `/home/u377797534/backups/rdecants-web-20261105-7-20261106T060429Z/`;
  SHA-256 de `storefront-before.tar.gz`:
  `844be8d184d9447392fff168c093ff898e6e8c4f578428d1a54f9a7f52209142`.
  Rollback: `bash /home/u377797534/backups/rdecants-web-20261105-7-20261106T060429Z/rollback.sh`.
- Navegador real después del deploy: catálogo con 108 ofertas, 14 fotos de
  frascos con ancho natural válido y cero imágenes rotas; modal de 390×844 sin
  overflow horizontal y cuatro WebP olfativos cargados a 384 px; precios 3 ml
  $60, 5 ml $100 y 10 ml $150; perfil completo cargado; consola sin errores ni
  avisos. No se manipuló el carrito durante el chequeo público y no se
  registraron pedidos/cobros.
- Los 168 archivos fotográficos y 8 medallones fueron desplegados con hashes
  verificados. En la página se observaron las cuatro fotos del perfil de prueba;
  no se solicitó cada foto de todos los perfiles. Las 14 fotos de frasco son
  muestras renderizadas, no las 112 rutas binarias individualmente.
- Las 136 láminas nuevas se generaron para RDECANTS con ChatGPT Images según
  confirmación de Roger; no son stock ni se afirma licencia CC0. Fuente y
  procesamiento: `assets/img/ingredients/photo/CREDITS.md`.
- La biblioteca 168/168, los 8 medallones, aliases de azúcar/caña y 1,188 de
  1,189 pruebas frontend aprobadas (una omitida) se conservan. El proxy del
  preview oficial elimina el falso 404 `/storage/`; las fotos de botellas
  cargaron también desde `api.rdecants.com/storage/` en producción.
- Laravel no cambió. En QA Principal los filtros focalizados pasaron 36 pruebas,
  95 aserciones y una omitida. El filtro amplio `Storefront` conserva 2 fallas
  entre 287. El wrapper autorizado oculta nombres/trazas; la revisión automática
  no permitió invocar PHPUnit por fuera del wrapper. Sus causas no se atribuyen
  sin evidencia; el alcance de este release es frontend estático.

El canal SSH y el mecanismo de respaldo/rollback se describen en
[`README_DEPLOY.md`](../README_DEPLOY.md). Pendientes actuales: alinear el
puntero de GitHub `production` en una sesión sin Actions de pago y recuperar,
mediante el entrypoint autorizado de QA, nombres y causas de las dos fallas
Laravel.
