/* Photorealistic ingredient images for «¿A qué huele?».

   A vocabulary id listed here has a photorealistic, studio-style image cut out
   on a transparent background at assets/img/ingredients/photo/<id>.webp
   (384 px square, subject centred). It is shown instead of the illustration for
   every perfume that has that note; synonyms reach it through the same
   vocabulary entry. Source of each file: photo/CREDITS.md.

   The cut-outs keep a soft natural shadow blended for light backgrounds (the
   cream scent block); they are not meant for dark backgrounds.

   Ids without an image keep their illustration, then the neutral drop.
   The green citrus delivered as «Limón» is a lime (lime); the catalogue's «limón»
   (siciliano, Amalfi) is the yellow lemon, which keeps its drawing until sheet 6.
   Abstract accords (musk, amber, ambergris, marine…) never get a photo here.
   How to add one: scripts/ingredients/README.md. */
export const INGREDIENT_PHOTOS = Object.freeze(new Set([
  // Zara Bogos + Donna Extradose
  'pineapple', 'salt', 'sandalwood', 'leather',
  'vanilla', 'rum', 'bergamot', 'jasmine', 'blackcurrant',
  // Flowers
  'rose', 'lily', 'lily_of_the_valley', 'peony', 'orange_blossom', 'geranium', 'bamboo', 'violet',
  // Fruit
  'apple', 'plum', 'mandarin', 'lime', 'mango', 'passion_fruit', 'apricot',
  // Woods, spices, resins, moss
  'cedar', 'oud', 'cardamom', 'ginger', 'cocoa', 'cinnamon', 'incense', 'moss',
]));
