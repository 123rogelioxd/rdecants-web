/* Photorealistic ingredient images for «¿A qué huele?».

   A vocabulary id in INGREDIENT_PHOTOS has a studio-style cut-out on a transparent
   background at assets/img/ingredients/photo/<id>.webp (384 px square). It is shown
   for every perfume with that note; synonyms reach it through the vocabulary entry.
   Source of each file: photo/CREDITS.md. Cut-outs keep a soft natural shadow blended
   for light backgrounds (the cream scent block), not for dark ones.

   Abstract accords (musk, amber, ambergris, woody, marine, mineral, green, cashmere)
   are never shown as a material: INGREDIENT_ACCORDS maps them to an essence-drop
   medallion in assets/img/ingredients/accord/<file>.webp.

   «Limón» is the yellow lemon (lemon); the green citrus is lime. «Cuero» is smooth
   leather (leather); «ante»/«gamuza» is suede (suede).
   Ids without an image keep their illustration, then the neutral drop.
   How to add one: scripts/ingredients/README.md and LIBRARY.md. */
export const INGREDIENT_PHOTOS = Object.freeze(new Set([
  'pineapple', 'salt', 'sandalwood', 'leather', 'suede', 'vanilla', 'rum', 'bergamot', 'jasmine',
  'blackcurrant', 'rose', 'lily', 'lily_of_the_valley', 'peony', 'orange_blossom', 'geranium',
  'bamboo', 'violet', 'apple', 'plum', 'mandarin', 'lime', 'mango', 'passion_fruit', 'apricot',
  'cedar', 'oud', 'cardamom', 'ginger', 'cocoa', 'cinnamon', 'incense', 'moss', 'lychee', 'pitaya',
  'rhubarb', 'yuzu', 'cherry', 'strawberry', 'pomegranate', 'blackberry', 'watermelon', 'fig',
  'blueberry', 'chinotto', 'citron', 'dates', 'white_currant', 'kiwi', 'lemon', 'orange',
  'grapefruit', 'coconut', 'pear', 'melon', 'peach', 'raspberry', 'liqueur', 'whiskey', 'absinthe',
  'tonic_water', 'champagne_rose', 'gin', 'cognac', 'red_wine', 'freesia', 'hibiscus', 'iris',
  'mignonette', 'narcissus', 'osmanthus', 'marigold', 'tuberose', 'tonka_bean', 'caramel',
  'hazelnut', 'coffee', 'honey', 'sugar_cane', 'praline', 'sugar', 'cotton', 'beeswax', 'pine',
  'ebony', 'papyrus', 'rice', 'milk', 'patchouli', 'lavender', 'vetiver', 'sage', 'mint',
  'tobacco', 'rosemary', 'juniper', 'pistachio', 'candied_chestnut', 'candied_fruit', 'knafeh',
  'marshmallow', 'licorice', 'chocolate', 'almond', 'pink_pepper', 'pepper', 'nutmeg', 'saffron',
  'anise', 'sichuan_pepper', 'cloves', 'ambrette', 'coriander', 'davana', 'violet_leaf',
  'petitgrain', 'basil', 'wormwood', 'verbena', 'calamus', 'cypress', 'guaiac', 'driftwood',
  'birch', 'mahogany', 'rosewood', 'oak', 'palo_santo', 'star_anise', 'chili', 'cumin',
  'white_pepper', 'allspice', 'caraway', 'bay_leaf', 'mace', 'elemi', 'benzoin', 'labdanum',
  'peru_balsam', 'styrax', 'opoponax', 'myrrh', 'galbanum', 'magnolia', 'gardenia', 'ylang_ylang',
  'lotus', 'peach_blossom', 'frangipani', 'mimosa', 'bluebell', 'lilac', 'carnation',
  'honeysuckle', 'orchid', 'cherry_blossom', 'champaca', 'wisteria', 'sweet_pea', 'fennel',
  'mastic', 'oregano', 'carrot_seed', 'black_tea', 'thyme', 'eucalyptus', 'fig_leaf',
]));

export const INGREDIENT_ACCORDS = Object.freeze({
  musk: 'musk', amber: 'amber', ambergris: 'ambergris', woods: 'woods',
  marine: 'marine', aquatic: 'marine', mineral: 'mineral', green: 'green', cashmeran: 'cashmeran',
});
