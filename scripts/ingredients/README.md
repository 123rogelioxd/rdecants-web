# Ingredient drawings («¿A qué huele?»)

The storefront shows each scent note with a drawing from
`assets/img/ingredients/<id>.webp` (192 px, transparent). `<id>` is the
vocabulary id in `assets/js/ui/scentVocabulary.js`; its sixth field
(`ingredient-<id>`) says the drawing exists. A note whose id/alias has no
drawing shows `neutral.webp`.

- `donna-approved.svg`: the five drawings approved on the Donna Extradose pilot, verbatim.
- `drawings.py`: every other drawing (`sym('<id>', body, defs)`); a later `sym` with the same id wins.
- `render.py`: renders all drawings with local headless Edge and writes the WebP files.

Add a drawing: write `sym('<id>', …)` in `drawings.py`, run
`python scripts/ingredients/render.py <id>`, check `.work/review.png`, then set
the sixth field of the vocabulary entry (add Spanish aliases there, never a second
entry for a synonym). Raster on purpose: iOS Safari drops gradients referenced from
an external SVG sprite.
