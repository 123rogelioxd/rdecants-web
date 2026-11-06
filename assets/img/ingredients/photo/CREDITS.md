# Ingredient images: source

# Ingredient photo credits

## Provenance confirmed

The first 32 photographs listed below (2026-11-05) came from four reference
sheets supplied by Roger Díaz (RDECANTS) as the business's own resource. They
were cropped locally; no stock or third-party file was downloaded for this set.

- Source: four reference sheets of photorealistic ingredient images supplied by
  Roger Díaz (RDECANTS) as the business's own resource, 4 × 2 labelled cells each.
- Processing (local, offline): cell crop without the label, background removed with
  OpenCV GrabCut, soft natural shadow blended for light backgrounds, 384 px
  transparent WebP. Script: `scripts/ingredients/cutout.py`.
- No stock or third-party file was downloaded for this set.

Files: pineapple, salt, sandalwood, leather, vanilla, rum, bergamot, jasmine,
rose, lily, lily_of_the_valley, peony, orange_blossom, geranium, bamboo, violet,
apple, plum, mandarin, lime (delivered labelled «Limón»; it is a green lime), blackcurrant, mango, passion_fruit, apricot,
cedar, oud, cardamom, ginger, cocoa, cinnamon, incense, moss.

## Additional generated ingredient photographs

The 136 additional ingredient photographs integrated in `c9b317d` were
generated for RDECANTS with ChatGPT Images. Roger confirmed this provenance on
2026-11-05. The generated sheets were cropped and processed locally into
transparent WebP files; `scripts/ingredients/cutout.py` records the processing
path and `scripts/ingredients/LIBRARY.md` records the intended subjects and
prompts. These are generated project assets: they are not stock photographs,
and no CC0 or other third-party licence is asserted. No images were regenerated
for this release.

The eight abstract accord medallions are illustrations generated from the
project's local vector drawing source in `scripts/ingredients/drawings.py` and
rendered by `scripts/ingredients/render.py`; they are not ingredient
photographs.

For future additions, add one line per source: `<id>.webp` | source | author |
licence | date. Keep the source sheet or an explicit owner/licence statement in
the project record.
