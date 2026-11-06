# Ingredient drawings («¿A qué huele?»)

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

Priority (Zara Bogos + Donna Extradose first, then by appearances in the catalogue):
1. pineapple, salt (sea salt), sandalwood, leather (suede swatch)
2. blackcurrant, rum, vanilla, bergamot, jasmine
3. lavender (27), lemon (15), cedar (15), apple (14), tonka_bean (11), mandarin (11),
   patchouli (10), cardamom (10), orange (9), grapefruit (9)
4. sage, vetiver, mint, pepper, rose, pink_pepper (8 each), coconut, orange_blossom (7)

Abstract notes (musk, amber, marine, mineral, woods, citrus/spices/green mixes)
keep their illustration: a photograph would suggest a material the perfume
does not contain.

## Drawings

Add a drawing: write `sym('<id>', …)` in `drawings.py`, run
`python scripts/ingredients/render.py <id>`, check `.work/review.png`, then set
the sixth field of the vocabulary entry (add Spanish aliases there, never a second
entry for a synonym). Raster on purpose: iOS Safari drops gradients referenced from
an external SVG sprite.
