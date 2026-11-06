# Ingredient library («¿A qué huele?»)

## Estado final · 2026-11-05

- **168 fotografías** de ingredientes, 384 × 384 WebP con transparencia, enumeradas
  en `INGREDIENT_PHOTOS`; las 168 tienen archivo y entrada de vocabulario.
- **8 medallones únicos** para los 9 IDs de acorde (`aquatic` comparte el de
  `marine`). Los acordes abstractos no usan fotos de materias primas.
- Las ilustraciones siguen como respaldo si falta foto; una nota desconocida usa
  `neutral.webp`. No se asignan imágenes por perfume.
- `sugar` / «Azúcar» / `brown sugar` y `sugar_cane` / «Caña de azúcar» son IDs,
  URLs y fotografías distintas. «Limón» es amarillo (`lemon`); «lima» es verde
  (`lime`). «Cuero» es liso; «ante»/«gamuza» es `suede`.
- La captura que originó el plan contiene 112 perfumes, 107 con notas, 250
  etiquetas de nota distintas, 140 ingredientes físicos canónicos y 50 acordes.
  El número 168 describe la biblioteca de fotos, no una promesa de que cada nota
  del catálogo tenga una foto: los acordes y las notas no fotografiadas usan sus
  respaldos existentes.
- Calidad de los 168 WebP verificada localmente: decodifican, miden 384 × 384,
  conservan canal alfa y no tienen contenido recortado por el límite del lienzo.
  Se conservó la calidad fuente; los pocos archivos detallados que superan 40 KB
  son excepciones hasta ~53 KB, no se recomprimieron con pérdida adicional.
- Las URLs de fotos y medallones usan `?v=BUILD_VERSION`. El lote final queda en
  `2026.11.05.7` en `VERSION`, `config.js` y todas las entradas HTML.
- Fuentes/licencias: consultar [`photo/CREDITS.md`](../../assets/img/ingredients/photo/CREDITS.md).
  Las 32 imágenes iniciales tienen su procedencia documentada; los originales
  fuente de las 136 imágenes integradas después no están en este checkout, así
  que su atribución individual queda pendiente de confirmación.

El plan y las láminas siguientes se conservan como bitácora de cómo se llegó a
la biblioteca; las cifras antiguas describen el corte original, no el estado actual.

The storefront shows each scent note with a drawing from
`assets/img/ingredients/<id>.webp` (192 px, transparent). `<id>` is the
vocabulary id in `assets/js/ui/scentVocabulary.js`; its sixth field
(`ingredient-<id>`) says the drawing exists. A note whose id/alias has no
drawing shows `neutral.webp`.

- `donna-approved.svg`: the five drawings approved on the Donna Extradose pilot, verbatim.
- `drawings.py`: every other drawing (`sym('<id>', body, defs)`); a later `sym` with the same id wins.
- `render.py`: renders all drawings with local headless Edge and writes the WebP files.

## Photographs (preferred over drawings)

A real studio photograph wins over the drawing: put it at
`assets/img/ingredients/photo/<id>.webp` and add `<id>` to `INGREDIENT_PHOTOS`
in `assets/js/ui/ingredientPhotos.js`. Every perfume with that note (and its
aliases) shows it; nothing is assigned per perfume.

Spec: 384 × 384 transparent WebP (quality ≈ 85, < 40 KB), subject centred and
filling ~80 %, soft natural light from the upper left, natural colour, clean
cut-out without halo, no text, no shadow plate. Licence: commercial use allowed
(CC0 / own photo); record source and licence in `photo/CREDITS.md`. Never list
a drawing as a photo.

Historical first batch (2026-11-05): 32 images from Roger's sheets, cut with `cutout.py`
(`python scripts/ingredients/cutout.py <sheets-dir> assets/img/ingredients/photo <review.png>`;
edit its `SHEETS` map for new sheets: 4 × 2 labelled cells on a cream backdrop).
They cover 223 of the 509 notes shown in the catalogue.

Next sheet, by appearances still without a photo: lavender (27), tonka_bean (11),
patchouli (10), orange (9), grapefruit (9), sage, vetiver, mint, pepper, pink_pepper (8),
coconut (7), pear (6), caramel (6), amber (5), tobacco, marine.

Abstract notes (musk, amber, marine, mineral, woods, citrus/spices/green mixes)
keep their illustration: a photograph would suggest a material the perfume
does not contain.

## Drawings

Add a drawing: write `sym('<id>', …)` in `drawings.py`, run
`python scripts/ingredients/render.py <id>`, check `.work/review.png`, then set
the sixth field of the vocabulary entry (add Spanish aliases there, never a second
entry for a synonym). Raster on purpose: iOS Safari drops gradients referenced from
an external SVG sprite.
