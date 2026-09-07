/* Display vocabulary, never a perfume database. Canonical product facts come
 * from RSupplyOS scent_profile. Related notes intentionally share an icon. */
const entries = [
  ['bergamot','Bergamota','citrus','citrus','bergamota|bergamot orange'],
  ['lemon','Limón','citrus','lemon','limon|limones|sicilian lemon'],
  ['lime','Lima','citrus','lemon','lima|limas'],
  ['orange','Naranja','citrus','citrus','naranja|naranjas|sweet orange'],
  ['mandarin','Mandarina','citrus','citrus','mandarina|mandarinas|mandarin orange|tangerine'],
  ['grapefruit','Toronja','citrus','citrus','toronja|pomelo|pink grapefruit'],
  ['citrus','Cítricos','citrus','citrus','citrico|citricos|citruses|citrus notes'],
  ['apple','Manzana','fruit','apple','manzana|manzanas|green apple'],
  ['pear','Pera','fruit','pear','pera|peras'],
  ['peach','Durazno','fruit','peach','durazno|melocoton|nectarine'],
  ['plum','Ciruela','fruit','peach','ciruela|ciruelas'],
  ['cherry','Cereza','fruit','cherry','cereza|cerezas|sour cherry'],
  ['strawberry','Fresa','fruit','berry','fresa|fresas'],
  ['raspberry','Frambuesa','fruit','berries','frambuesa|frambuesas'],
  ['red_fruits','Frutos rojos','fruit','berries','red fruits|red berries|frutos rojos|frutas rojas|bayas rojas'],
  ['blackcurrant','Grosella negra','fruit','berries','grosella negra|grosellas negras|black currant|cassis'],
  ['pineapple','Piña','fruit','pineapple','pina|ananas'],
  ['mango','Mango','fruit','mango','mangos'],
  ['coconut','Coco','fruit','coconut','coco|coconut water'],
  ['melon','Melón','fruit','melon','melon|melones'],
  ['watermelon','Sandía','fruit','watermelon','sandia'],
  ['tropical_fruits','Frutas tropicales','fruit','mango','tropical fruits|frutas tropicales|tropical fruit'],
  ['fruit','Frutal','fruit','apple','fruta|frutas|frutal|frutales|fruity|fruits|fruity notes'],
  ['rose','Rosa','floral','rose','rosa|rosas|roses|bulgarian rose|rosa bulgara|turkish rose'],
  ['jasmine','Jazmín','floral','flower','jazmin|jazmines|jasmine sambac|jazmin sambac'],
  ['lavender','Lavanda','floral','lavender','lavanda|lavandin'],
  ['iris','Iris','floral','iris','orris|orris root|raiz de iris'],
  ['violet','Violeta','floral','flower','violeta|violetas'],
  ['tuberose','Nardos','floral','stem_flower','nardo|nardos'],
  ['orange_blossom','Flor de azahar','floral','flower','orange blossom|azahar|flor de naranjo|flor de azahar'],
  ['neroli','Neroli','floral','flower','neroli|neroli oil'],
  ['gardenia','Gardenia','floral','rose','gardenias'],
  ['ylang_ylang','Ylang-ylang','floral','ylang','ylang ylang|ylang-ylang'],
  ['white_flowers','Flores blancas','floral','flower','white flowers|white floral|flores blancas'],
  ['floral','Floral','floral','flower','flor|flores|flowers|floral notes|florales'],
  ['vanilla','Vainilla','gourmand','vanilla','vainilla|bourbon vanilla|vainilla bourbon|madagascar vanilla'],
  ['caramel','Caramelo','gourmand','caramel','caramelo|caramelos'],
  ['honey','Miel','gourmand','honey','miel'],
  ['chocolate','Chocolate','gourmand','chocolate','dark chocolate'],
  ['cocoa','Cacao','gourmand','cocoa','cacao'],
  ['coffee','Café','gourmand','coffee','cafe'],
  ['sugar','Azúcar','gourmand','sugar','azucar|brown sugar|sugar cane|azucar morena'],
  ['praline','Praliné','gourmand','chocolate','praline|pralina'],
  ['cinnamon','Canela','spice','cinnamon','canela'],
  ['almond','Almendra','gourmand','almond','almendra|almendras|almonds'],
  ['tonka_bean','Haba tonka','gourmand','almond','tonka bean|tonka|haba tonka|habas tonka'],
  ['gourmand','Dulce','gourmand','caramel','gourmand notes|notas gourmand|dulce|sweet'],
  ['cedar','Cedro','woods','wood','cedro|cedarwood|virginia cedar|cedro de virginia'],
  ['sandalwood','Sándalo','woods','wood','sandalo|sandal wood'],
  ['oud','Oud','woods','wood','agarwood|madera de agar|oud wood'],
  ['vetiver','Vetiver','woods','roots','vetiver haitiano|haitian vetiver'],
  ['patchouli','Pachulí','woods','leaf','pachuli|patchuli'],
  ['guaiac','Guayaco','woods','wood','guayaco|guaiac wood|guaiacwood'],
  ['woods','Maderas','woods','wood','madera|maderas|wood|woody|woody notes|notas amaderadas'],
  ['pepper','Pimienta','spice','pepper','pimienta|black pepper|pimienta negra'],
  ['pink_pepper','Pimienta rosa','spice','pepper','pink pepper|pimienta rosa|pimienta rosada'],
  ['cardamom','Cardamomo','spice','cardamom','cardamomo'],
  ['saffron','Azafrán','spice','saffron','azafran'],
  ['nutmeg','Nuez moscada','spice','almond','nuez moscada'],
  ['cloves','Clavo','spice','cloves','clavo|clavos|clove|clavo de olor'],
  ['spices','Especias','spice','pepper','especia|especias|spice|spicy|spicy notes'],
  ['mint','Menta','aromatic','leaf','menta|peppermint|hierbabuena'],
  ['basil','Albahaca','aromatic','leaf','albahaca'],
  ['sage','Salvia','aromatic','leaf','salvia|clary sage|salvia esclarea'],
  ['rosemary','Romero','aromatic','sprig','romero'],
  ['aromatic_herbs','Hierbas aromáticas','aromatic','sprig','aromatic herbs|herbs|hierbas aromaticas|aromatic|aromatico'],
  ['green','Verde','aromatic','leaf','verde|green notes|notas verdes'],
  ['fresh','Fresco','fresh','breeze','fresco|fresca|fresh notes|frescos'],
  ['aquatic','Acuático','fresh','water','acuatico|acuaticas|water notes'],
  ['marine','Notas marinas','fresh','wave','notas marinas|marine notes|sea notes|aquatic notes|marino|marina|sea water|agua de mar'],
  ['ozonic','Ozónico','fresh','breeze','ozonico|ozonic notes|ozone|ozono'],
  ['amber','Ámbar','resin','amber','ambar|amber notes|ambarado'],
  ['ambergris','Ámbar gris','resin','amber','ambar gris|grey amber'],
  ['incense','Incienso','resin','incense','incienso|frankincense|olibano|olibanum'],
  ['benzoin','Benjuí','resin','resin','benjui'],
  ['myrrh','Mirra','resin','resin','mirra'],
  ['resin','Resinas','resin','resin','resina|resinas|resins'],
  ['balsamic','Balsámico','resin','resin','balsamico|balsamo|balsam'],
  ['musk','Almizcle','other','musk','almizcle|almizcles|white musk|almizcle blanco|musks'],
  ['leather','Cuero','other','leather','cuero|suede|gamuza'],
  ['tobacco','Tabaco','other','tobacco','tabaco|tobacco leaf|hoja de tabaco'],
  ['smoke','Humo','other','smoke','humo|smoky|ahumado'],
  ['rum','Ron','other','glass','ron'],
  ['whiskey','Whisky','other','glass','whisky|bourbon'],
  ['salt','Sal','other','salt','sal|sea salt|sal marina'],
  ['mineral','Mineral','other','mineral','minerales|mineral notes|notas minerales'],
  ['powdery','Atalcado','other','powder','atalcado|talco|polvoso|powder|powdery notes'],
  ['clean','Limpio','other','soap','soap|soapy|jabon|limpio|clean notes|jabonoso'],
  ['cotton','Algodón','other','cotton','algodon|linen|lino|cotton flower|flor de algodon'],
  ['milk','Leche','other','milk','leche|cream|crema|milk cream|lactonic'],
  ['metallic','Metálico','other','metal','metalico|metal|metallic notes'],
  ['earth','Tierra','other','earth','tierra|earthy|terroso|earthy notes'],
  ['moss','Musgo','other','moss','musgo|oakmoss|musgo de roble'],
];

export const SCENT_VOCABULARY = Object.freeze(Object.fromEntries(entries.map(([id,label,family,symbol,aliases]) =>
  [id, Object.freeze({ id, label, family, symbol, aliases: aliases.split('|') })])));

export function normalizeNoteKey(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const aliases = new Map();
for (const note of Object.values(SCENT_VOCABULARY)) {
  for (const alias of [note.id, note.label, ...note.aliases]) aliases.set(normalizeNoteKey(alias), note.id);
}

export function resolveScentId(value) {
  const key = normalizeNoteKey(value);
  if (!key) return null;
  return aliases.get(key) ?? aliases.get(key.replace(/^(notas? (de )?|notes? of )/, '').replace(/ notes?$/, '')) ?? null;
}
