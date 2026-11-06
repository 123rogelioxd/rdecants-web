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
