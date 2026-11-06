# Ingredient library plan: consolidate every catalogue note into canonical
# ingredients, separate abstract accords, and lay out the sheets still to produce.
#
#   node scripts/ingredients/audit_notes.mjs . <catalog.json> notes-audit.json   (raw audit)
#   (<catalog.json>: a saved GET /api/web/catalog response; 2026-11-05 used the 112-perfume capture)
#   python scripts/ingredients/plan_library.py notes-audit.json
#
# Writes scripts/ingredients/sheets.json and scripts/ingredients/LIBRARY.md.
# Edit CANON / ABSTRACT / FUTURE below, never the generated files.
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
audit = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
# The green image delivered as «Limón» is a lime: it becomes lime; yellow lemon is still to produce.
PHOTOS = (set(audit['photos']) - {'lemon'}) | {'lime'}

# canonical id: (Spanish label for the sheet, family, what to show, aliases for the vocabulary)
CANON = {
 # ── covered by the first four sheets (2026-11-05) ──
 'pineapple': ('Piña', 'fruta', '', 'pina|ananas'), 'salt': ('Sal marina', 'material', '', 'sal|sea salt'),
 'sandalwood': ('Sándalo', 'madera', '', 'sandalo'), 'leather': ('Ante', 'material', '', 'ante|gamuza|suede'),
 'vanilla': ('Vainilla', 'dulce', '', 'vainilla bourbon|vainilla absoluta|vainilla negra|vainilla de madagascar|vainilla de tahiti|vainilla amaderada|orquidea de vainilla'),
 'rum': ('Ron', 'bebida', '', 'ron'), 'bergamot': ('Bergamota', 'fruta', '', 'bergamota de calabria'),
 'jasmine': ('Jazmín', 'flor', '', 'jazmin sambac'), 'rose': ('Rosa', 'flor', '', 'rosa bulgara|rosa damascena|rosa de damasco|rosa de mayo|rosa turca|rosa blanca'),
 'lily': ('Azucena', 'flor', '', 'azucena'), 'lily_of_the_valley': ('Muguete', 'flor', '', 'lirio de los valles|lirio del valle'),
 'peony': ('Peonía', 'flor', '', 'peonia roja'), 'orange_blossom': ('Flor de azahar', 'flor', '', 'azahar|neroli'),
 'geranium': ('Geranio', 'flor', '', 'geranio bourbon'), 'bamboo': ('Bambú', 'planta', '', 'bambu'),
 'violet': ('Violeta', 'flor', '', 'violetas'), 'apple': ('Manzana', 'fruta', '', 'manzana verde|manzana roja|manzana confitada'),
 'plum': ('Ciruela', 'fruta', '', 'ciruela mirabel'), 'mandarin': ('Mandarina', 'fruta', '', 'mandarina verde|mandarina siciliana'),
 'lime': ('Lima', 'fruta', '', 'lima|limas'), 'blackcurrant': ('Grosella negra', 'fruta', '', 'cassis|nectar de grosella negra'),
 'mango': ('Mango', 'fruta', '', ''), 'passion_fruit': ('Maracuyá', 'fruta', '', 'maracuya'), 'apricot': ('Albaricoque', 'fruta', '', 'chabacano'),
 'cedar': ('Cedro', 'madera', '', 'cedro del atlas|cedro de texas|cedro ambarado|cedro de virginia'), 'oud': ('Oud', 'madera', '', 'agarwood'),
 'cardamom': ('Cardamomo', 'especia', '', ''), 'ginger': ('Jengibre', 'especia', '', ''), 'cocoa': ('Cacao', 'dulce', '', 'vaina de cacao'),
 'cinnamon': ('Canela', 'especia', '', 'canela de ceilan'), 'incense': ('Incienso', 'resina', '', 'olibano|olibano incienso'),
 'moss': ('Musgo', 'planta', '', 'musgo de roble'),
 # ── still to produce: present in the catalogue ──
 'lemon': ('Limón amarillo', 'fruta', 'limón amarillo entero y medio limón cortado mostrando la pulpa amarilla (no lima verde)', 'limon|limon siciliano|limon de amalfi'),
 'orange': ('Naranja', 'fruta', 'naranja entera con hoja y media naranja cortada con pulpa jugosa', 'naranja amarga|naranja brasilena|naranja italiana|naranja siciliana'),
 'grapefruit': ('Toronja', 'fruta', 'toronja rosada entera y media toronja con pulpa rosa', 'pomelo|toronja rosa|pomelo rosa'),
 'coconut': ('Coco', 'fruta', 'coco marrón peludo entero y medio coco abierto con pulpa blanca', 'agua de coco|leche de coco'),
 'pear': ('Pera', 'fruta', 'pera verde amarillenta entera con hoja y una rebanada', ''),
 'melon': ('Melón', 'fruta', 'medio melón chino naranja con red en la cáscara y una tajada', ''),
 'peach': ('Durazno', 'fruta', 'durazno aterciopelado con hoja y medio durazno con hueso', 'melocoton'),
 'raspberry': ('Frambuesa', 'fruta', 'grupo de frambuesas rojas con hojas', ''),
 'watermelon': ('Sandía', 'fruta', 'tajada triangular de sandía roja con semillas negras y cáscara verde', ''),
 'cherry': ('Cereza', 'fruta', 'par de cerezas rojas brillantes con tallos', ''),
 'fig': ('Higo', 'fruta', 'higo morado entero y medio higo mostrando el interior rosado', 'higo verde'),
 'kiwi': ('Kiwi', 'fruta', 'kiwi entero peludo y medio kiwi con pulpa verde y semillas', ''),
 'lychee': ('Lichi', 'fruta', 'lichis de cáscara rosada rugosa, uno pelado con pulpa blanca translúcida', ''),
 'pitaya': ('Pitaya', 'fruta', 'pitaya rosa con escamas verdes y media pitaya con pulpa blanca y semillas', ''),
 'dates': ('Dátiles', 'fruta', 'dátiles marrones brillantes, uno abierto', ''),
 'white_currant': ('Grosella blanca', 'fruta', 'racimo de grosellas blancas translúcidas', ''),
 'blueberry': ('Arándanos', 'fruta', 'puñado de arándanos azules con pruina', ''),
 'yuzu': ('Yuzu', 'fruta', 'yuzu amarillo de cáscara rugosa y medio yuzu', ''),
 'chinotto': ('Chinotto', 'fruta', 'pequeñas naranjas amargas chinotto con hojas', ''),
 'citron': ('Cidra', 'fruta', 'cidra grande amarilla de cáscara gruesa y una rebanada', ''),
 'rhubarb': ('Ruibarbo', 'fruta', 'tallos de ruibarbo rojo-verde con una hoja', ''),
 'hazelnut': ('Avellana', 'dulce', 'avellanas con cáscara y algunas peladas', ''),
 'pistachio': ('Pistache', 'dulce', 'pistaches con cáscara abierta mostrando el fruto verde', 'pistacho'),
 'candied_chestnut': ('Castaña azucarada', 'dulce', 'castañas glaseadas brillantes (marron glacé)', 'castana azucarada'),
 'gardenia': ('Gardenia', 'flor', 'gardenia blanca cremosa con hojas verde oscuro brillantes', ''),
 'ylang_ylang': ('Ylang-ylang', 'flor', 'flores de ylang-ylang amarillas con pétalos largos y caídos', 'ylang ylang'),
 'magnolia': ('Magnolia', 'flor', 'flor de magnolia blanca rosada abierta con hojas', ''),
 'frangipani': ('Frangipani', 'flor', 'flores de frangipani blancas con centro amarillo', 'plumeria'),
 'mimosa': ('Mimosa', 'flor', 'ramillete de mimosa con pompones amarillos esponjosos', ''),
 'peach_blossom': ('Flor de durazno', 'flor', 'rama con flores de durazno rosadas', 'flor de durazno'),
 'tuberose': ('Tuberosa', 'flor', 'vara de tuberosa con flores blancas cerosas', 'nardo|nardos'),
 'iris': ('Iris', 'flor', 'flor de iris violeta azulado con su rizoma (raíz) limpio', 'lirio|orris|raiz de iris'),
 'lotus': ('Loto', 'flor', 'flor de loto rosa abierta con una hoja redonda', 'flor de loto|loto azul'),
 'freesia': ('Fresia', 'flor', 'vara de fresia con flores blancas y amarillas', ''),
 'hibiscus': ('Hibisco', 'flor', 'flor de hibisco roja abierta', 'jamaica'),
 'narcissus': ('Narciso', 'flor', 'narcisos blancos con corona amarilla', ''),
 'osmanthus': ('Osmanto', 'flor', 'ramita con racimos de diminutas flores naranja de osmanto', 'osmanthus'),
 'mignonette': ('Reseda', 'flor', 'espiga de reseda (mignonette) verde amarillenta', 'mignonette'),
 'bluebell': ('Campanilla', 'flor', 'tallo con campanillas azul violeta', 'campanilla'),
 'marigold': ('Tagetes', 'flor', 'flores de tagetes (cempasúchil) naranjas', 'tagetes|cempasuchil'),
 'lavender': ('Lavanda', 'planta', 'ramillete de espigas de lavanda morada', 'lavandin|lavanda diva|lavanda negra'),
 'patchouli': ('Pachulí', 'planta', 'ramita de pachulí con hojas verdes y hojas secas', 'hoja de pachuli de indonesia'),
 'vetiver': ('Vetiver', 'planta', 'manojo de raíces de vetiver beige atadas', 'vetiver de haiti|vetiver de madagascar|vetiver de uruguay'),
 'mint': ('Menta', 'planta', 'ramita de menta fresca', 'hierbabuena'),
 'sage': ('Salvia', 'planta', 'ramita de salvia con hojas gris verdosas aterciopeladas', 'salvia esclarea|salvia sclarea|esclarea|salvia de provenza'),
 'rosemary': ('Romero', 'planta', 'ramitas de romero', ''),
 'basil': ('Albahaca', 'planta', 'ramita de albahaca', ''),
 'tobacco': ('Tabaco', 'planta', 'hojas de tabaco curadas color miel, enrolladas', 'hoja de tabaco'),
 'violet_leaf': ('Hoja de violeta', 'planta', 'hojas de violeta verdes en forma de corazón, sin flor', 'hoja de violeta'),
 'coriander': ('Cilantro', 'planta', 'semillas de cilantro y una ramita de hojas', 'cilantro'),
 'juniper': ('Enebro', 'planta', 'ramita de enebro con bayas azul oscuro', 'enebro|bayas de enebro'),
 'davana': ('Davana', 'planta', 'ramitas de davana plateadas con pequeñas flores amarillas', ''),
 'wormwood': ('Ajenjo', 'planta', 'ramas de ajenjo (artemisia) de hojas plateadas', 'ajenjo|artemisia'),
 'black_tea': ('Té negro', 'planta', 'hojas de té negro secas enrolladas', 'te negro'),
 'thyme': ('Tomillo', 'planta', 'ramitas de tomillo', ''),
 'oregano': ('Orégano', 'planta', 'ramita de orégano fresco', ''),
 'fennel': ('Hinojo', 'planta', 'bulbo de hinojo con hojas plumosas', ''),
 'verbena': ('Verbena', 'planta', 'ramitas de verbena de limón (hierba luisa)', 'verbena de limon|hierba luisa'),
 'mastic': ('Lentisco', 'planta', 'ramita de lentisco con lágrimas de resina de almáciga', 'lentisco|almaciga'),
 'petitgrain': ('Petitgrain', 'planta', 'ramita de naranjo amargo con hojas y pequeños frutos verdes', ''),
 'carrot_seed': ('Semilla de zanahoria', 'planta', 'semillas de zanahoria y una zanahoria con hojas', 'semilla de zanahoria'),
 'calamus': ('Cálamo', 'planta', 'rizomas de cálamo y hojas en espada', 'calamo'),
 'guaiac': ('Guayaco', 'madera', 'trozos de madera de guayaco verde oscuro', 'madera de guayaco'),
 'birch': ('Abedul', 'madera', 'troncos de abedul con corteza blanca', 'abedul'),
 'palo_santo': ('Palo santo', 'madera', 'palitos de palo santo amarillos', 'santo palo'),
 'rosewood': ('Palo de rosa', 'madera', 'trozos de madera de palo de rosa rojiza', 'palo de rosa'),
 'mahogany': ('Caoba', 'madera', 'tablillas de caoba pulida rojiza', 'caoba'),
 'oak': ('Roble', 'madera', 'trozos de roble y bellotas', 'roble'),
 'cypress': ('Ciprés', 'madera', 'ramita de ciprés con dos gálbulos', 'cipres|cipres italiano'),
 'driftwood': ('Madera flotante', 'madera', 'pieza de madera flotante pulida por el mar, gris clara', 'madera flotante|madera a la deriva'),
 'pink_pepper': ('Pimienta rosa', 'especia', 'bayas rosadas secas de pimienta rosa (schinus), no pimienta negra', ''),
 'pepper': ('Pimienta negra', 'especia', 'granos de pimienta negra', 'pimienta|pimienta negra'),
 'white_pepper': ('Pimienta blanca', 'especia', 'granos de pimienta blanca', 'pimienta blanca'),
 'sichuan_pepper': ('Pimienta de Sichuan', 'especia', 'cápsulas rojizas abiertas de pimienta de Sichuan', 'pimienta de sichuan'),
 'nutmeg': ('Nuez moscada', 'especia', 'nueces moscadas enteras y una con macis rojo', ''),
 'saffron': ('Azafrán', 'especia', 'hebras de azafrán rojo y una flor de azafrán morada', 'azafran'),
 'cloves': ('Clavo', 'especia', 'clavos de olor', 'clavo|clavo de olor'),
 'anise': ('Anís', 'especia', 'semillas de anís verde y una ramita', 'anis'),
 'star_anise': ('Anís estrellado', 'especia', 'estrellas de anís estrellado', 'aniz estrellado|anis estrellado|badiana'),
 'cumin': ('Comino', 'especia', 'semillas de comino', ''),
 'chili': ('Chile rojo', 'especia', 'chiles rojos frescos', 'chile rojo'),
 'allspice': ('Pimienta de Jamaica', 'especia', 'granos de pimienta de Jamaica marrones', 'pimienta de jamaica'),
 'ambrette': ('Ambreta', 'especia', 'semillas de ambreta grises', 'ambreta'),
 'benzoin': ('Benjuí', 'resina', 'trozos de resina de benjuí ámbar', 'benjui'),
 'elemi': ('Elemí', 'resina', 'resina de elemí blanca amarillenta y pegajosa', 'elemi'),
 'opoponax': ('Opopónaco', 'resina', 'lágrimas de resina de opopónaco marrón dorado', 'opoponax'),
 'styrax': ('Estoraque', 'resina', 'bálsamo de estoraque denso y trozos de corteza', 'estoraque|styrax'),
 'peru_balsam': ('Bálsamo del Perú', 'resina', 'bálsamo del Perú marrón oscuro en cuchara de madera', 'balsamo del peru'),
 'labdanum': ('Ládano', 'resina', 'resina oscura de ládano y una ramita de jara', 'ladano|labdano|jara'),
 'tonka_bean': ('Haba tonka', 'dulce', 'habas tonka negras arrugadas, una partida', 'tonka|haba tonka'),
 'caramel': ('Caramelo', 'dulce', 'trozos de caramelo dorado y un hilo de caramelo', 'caramelo salado|caramelo de fresa'),
 'honey': ('Miel', 'dulce', 'panal de miel y miel dorada goteando', ''),
 'coffee': ('Café', 'dulce', 'granos de café tostado', ''),
 'chocolate': ('Chocolate', 'dulce', 'trozos de chocolate oscuro', ''),
 'sugar': ('Azúcar', 'dulce', 'terrones de azúcar y azúcar morena', 'azucar|azucar morena'),
 'sugar_cane': ('Caña de azúcar', 'dulce', 'trozos de caña de azúcar cortada', 'cana de azucar'),
 'praline': ('Praliné', 'dulce', 'trozos de praliné de avellana caramelizado', 'praline'),
 'marshmallow': ('Malvavisco', 'dulce', 'malvaviscos blancos y rosas', 'malvavisco'),
 'licorice': ('Regaliz', 'dulce', 'raíz de regaliz y piezas de regaliz negro', 'regaliz negro'),
 'candied_fruit': ('Frutas confitadas', 'dulce', 'frutas confitadas de colores', 'frutas confitadas'),
 'knafeh': ('Knafeh', 'dulce', 'porción de knafeh dorado con pistache', ''),
 'whiskey': ('Whisky', 'bebida', 'vaso de whisky con hielo grande', 'whisky|bourbon'),
 'liqueur': ('Licor', 'bebida', 'copita de licor ámbar', 'licor'),
 'champagne_rose': ('Champagne rosé', 'bebida', 'copa flauta de champagne rosé con burbujas', 'champagne rose'),
 'gin': ('Ginebra', 'bebida', 'vaso de gin con rodaja de pepino y enebro', 'gin'),
 'tonic_water': ('Agua tónica', 'bebida', 'vaso de agua tónica con burbujas y rodaja de limón', 'agua tonica'),
 'absinthe': ('Absenta', 'bebida', 'copa de absenta verde con cuchara perforada y terrón de azúcar', 'absenta'),
 'leather_smooth': ('Cuero', 'material', 'muestra de cuero liso marrón doblada (no gamuza)', 'cuero'),
 'cotton': ('Algodón y lino', 'material', 'flor de algodón abierta junto a un lienzo de lino doblado', 'lino|algodon'),
}

# raw catalogue key (accent-free, lower case) → canonical id, when it is not the vocabulary id itself
RAW = {
 'bergamota de calabria': 'bergamot', 'mandarina verde': 'mandarin', 'mandarina siciliana': 'mandarin',
 'manzana verde': 'apple', 'manzana roja': 'apple', 'manzana confitada': 'apple', 'vetiver de haiti': 'vetiver',
 'vetiver de madagascar': 'vetiver', 'vetiver de uruguay': 'vetiver', 'vainilla absoluta': 'vanilla', 'vainilla de madagascar': 'vanilla',
 'vainilla negra': 'vanilla', 'vainilla de tahiti': 'vanilla', 'vainilla amaderada': 'vanilla', 'orquidea de vainilla': 'vanilla',
 'hoja de violeta': 'violet_leaf', 'avellana': 'hazelnut', 'cilantro': 'coriander', 'davana': 'davana', 'enebro': 'juniper', 'bayas de enebro': 'juniper',
 'magnolia': 'magnolia', 'agua de coco': 'coconut', 'leche de coco': 'coconut', 'anis': 'anise', 'aniz estrellado': 'star_anise',
 'balsamo del peru': 'peru_balsam', 'cana de azucar': 'sugar_cane', 'cedro del atlas': 'cedar', 'cedro de texas': 'cedar', 'cedro ambarado': 'cedar',
 'flor de durazno': 'peach_blossom', 'frangipani': 'frangipani', 'jara': 'labdanum', 'ladano': 'labdanum', 'labdano': 'labdanum', 'licor': 'liqueur',
 'limon siciliano': 'lemon', 'limon de amalfi': 'lemon', 'madera de guayaco': 'guaiac', 'mimosa': 'mimosa', 'petitgrain': 'petitgrain',
 'pimienta de sichuan': 'sichuan_pepper', 'abedul': 'birch', 'absenta': 'absinthe', 'agua tonica': 'tonic_water', 'ajenjo': 'wormwood', 'artemisia': 'wormwood',
 'ambreta': 'ambrette', 'arandanos': 'blueberry', 'calamo': 'calamus', 'campanilla': 'bluebell', 'canela de ceilan': 'cinnamon', 'caoba': 'mahogany',
 'caramelo de fresa': 'caramel', 'caramelo salado': 'caramel', 'castana azucarada': 'candied_chestnut', 'champagne rose': 'champagne_rose',
 'chile rojo': 'chili', 'chinotto': 'chinotto', 'cidra': 'citron', 'ciruela mirabel': 'plum', 'comino': 'cumin', 'datiles': 'dates',
 'esclarea': 'sage', 'salvia sclarea': 'sage', 'salvia de provenza': 'sage', 'estoraque': 'styrax', 'styrax': 'styrax', 'flor de loto': 'lotus', 'loto': 'lotus', 'loto azul': 'lotus',
 'fresia': 'freesia', 'frutas confitadas': 'candied_fruit', 'gin': 'gin', 'grosella blanca': 'white_currant', 'hibisco': 'hibiscus', 'higo': 'fig', 'higo verde': 'fig',
 'hinojo': 'fennel', 'hoja de pachuli de indonesia': 'patchouli', 'kiwi': 'kiwi', 'knafeh': 'knafeh', 'lavanda diva': 'lavender', 'lavanda negra': 'lavender',
 'lentisco': 'mastic', 'lichi': 'lychee', 'lirio': 'iris', 'madera a la deriva': 'driftwood', 'madera flotante': 'driftwood', 'malvavisco': 'marshmallow',
 'mignonette': 'mignonette', 'naranja amarga': 'orange', 'naranja brasilena': 'orange', 'naranja italiana': 'orange', 'naranja siciliana': 'orange',
 'narciso': 'narcissus', 'nectar de grosella negra': 'blackcurrant', 'olibano incienso': 'incense', 'opoponax': 'opoponax', 'oregano': 'oregano',
 'osmanthus': 'osmanthus', 'palo de rosa': 'rosewood', 'pimienta blanca': 'white_pepper', 'pimienta de jamaica': 'allspice', 'pistache': 'pistachio',
 'pistacho': 'pistachio', 'pitaya': 'pitaya', 'pomelo rosa': 'grapefruit', 'toronja rosa': 'grapefruit', 'regaliz negro': 'licorice', 'roble': 'oak',
 'rosa blanca': 'rose', 'rosa damascena': 'rose', 'rosa de damasco': 'rose', 'rosa de mayo': 'rose', 'rosa turca': 'rose', 'ruibarbo': 'rhubarb',
 'santo palo': 'palo_santo', 'semilla de zanahoria': 'carrot_seed', 'tagetes': 'marigold', 'te negro': 'black_tea', 'tomillo': 'thyme',
 'tuberosa': 'tuberose', 'vaina de cacao': 'cocoa', 'verbena': 'verbena', 'verbena de limon': 'verbena', 'yuzu': 'yuzu',
 'almizcles blancos': 'musk', 'almizclado': 'musk', 'cotton': 'cotton', 'leather': 'leather', 'cloves': 'cloves', 'praline': 'praline',
}
# perfumery accords / synthetics / families: never drawn as an invented material
ABSTRACT = {
 'musk': 'Almizcle', 'amber': 'Ámbar (acorde)', 'ambergris': 'Ámbar gris', 'woods': 'Maderas / notas amaderadas', 'citrus': 'Cítricos (mezcla)',
 'fruit': 'Frutal', 'floral': 'Floral', 'white_flowers': 'Flores blancas', 'green': 'Notas verdes', 'marine': 'Notas marinas', 'aquatic': 'Acuático',
 'mineral': 'Mineral', 'fresh': 'Fresco', 'spices': 'Especias (mezcla)', 'balsamic': 'Balsámico',
 'madera ambarada': 'Madera ambarada', 'ambroxan': 'Ambroxan', 'amberwood': 'Amberwood', 'ambrox': 'Ambrox', 'ambrofix': 'Ambrofix',
 'ambar extremo': 'Ámbar extremo', 'ambar seco': 'Ámbar seco', 'madera de cachemira': 'Madera de cachemira', 'cachemira': 'Cachemira',
 'cashmeran': 'Cashmeran', 'cashmere wood': 'Cashmere wood', 'akigalawood': 'Akigalawood', 'sylkolide': 'Sylkolide', 'queenwood': 'Queenwood',
 'aldehidos': 'Aldehídos', 'heliotropina': 'Heliotropina', 'acorde acuatico': 'Acorde acuático', 'acorde de arena': 'Acorde de arena',
 'acorde de chicle': 'Acorde de chicle', 'acorde gourmand': 'Acorde gourmand', 'acorde helado': 'Acorde helado', 'acorde lacteo': 'Acorde lácteo',
 'acorde solar': 'Acorde solar', 'afrutado': 'Afrutado', 'amaderado': 'Amaderado', 'floral blanco': 'Floral blanco', 'frutas amarillas': 'Frutas amarillas',
 'especias amaderadas': 'Especias amaderadas', 'maderas almizcladas': 'Maderas almizcladas', 'maderas aromaticas': 'Maderas aromáticas',
 'maderas claras': 'Maderas claras', 'musgo cristal': 'Musgo cristal', 'musgo cristalizado': 'Musgo cristalizado', 'sorbete': 'Sorbete',
 'hojas verdes': 'Hojas verdes',
}
# common in future imports, used to complete sheets of eight (same family)
FUTURE = {
 'fruta': [('strawberry', 'Fresa', 'fresas rojas con hojas y una fresa partida', 'fresa|fresas'),
           ('pomegranate', 'Granada', 'granada abierta mostrando granos rojos', 'granada'),
           ('blackberry', 'Zarzamora', 'zarzamoras negras brillantes con hojas', 'mora|zarzamora|moras')],
 'dulce': [('almond', 'Almendra', 'almendras con cáscara y peladas', 'almendra|almendras')],
 'flor': [('lilac', 'Lila', 'racimo de lilas moradas', 'lila'), ('carnation', 'Clavel', 'clavel rosa con borde ondulado', 'clavel'),
          ('honeysuckle', 'Madreselva', 'ramita de madreselva con flores blancas y amarillas', 'madreselva'),
          ('orchid', 'Orquídea', 'vara de orquídea blanca con centro rosado', 'orquidea'),
          ('cherry_blossom', 'Flor de cerezo', 'rama de flor de cerezo rosa claro', 'flor de cerezo|sakura'),
          ('champaca', 'Champaca', 'flores de champaca amarillo anaranjado', 'champaca'),
          ('wisteria', 'Glicina', 'racimo colgante de glicina lila', 'glicina'),
          ('sweet_pea', 'Guisante de olor', 'flores de guisante de olor pastel', 'guisante de olor')],
 'planta': [('eucalyptus', 'Eucalipto', 'ramita de eucalipto de hojas azul verdoso', 'eucalipto'),
            ('fig_leaf', 'Hoja de higuera', 'hojas de higuera grandes y lobuladas', 'hoja de higuera')],
 'especia': [('caraway', 'Alcaravea', 'semillas de alcaravea', 'alcaravea'), ('bay_leaf', 'Laurel', 'hojas de laurel', 'laurel'),
             ('mace', 'Macis', 'macis rojo anaranjado seco', 'macis')],
 'resina': [('myrrh', 'Mirra', 'lágrimas de mirra rojizas', 'mirra'), ('galbanum', 'Gálbano', 'resina de gálbano verdosa', 'galbano')],
 'bebida': [('cognac', 'Coñac', 'copa balón de coñac', 'cognac|coñac'), ('red_wine', 'Vino tinto', 'copa de vino tinto', 'vino|vino tinto')],
 'material': [('leather_smooth', 'Cuero', 'muestra de cuero liso marrón doblada (no gamuza)', 'cuero'),
              ('beeswax', 'Cera de abejas', 'bloque de cera de abejas dorada con panal', 'cera de abejas'),
              ('pine', 'Pino', 'ramita de pino con piña de pino', 'pino'), ('ebony', 'Ébano', 'trozos de ébano negro pulido', 'ebano'),
              ('papyrus', 'Papiro', 'tallos y umbelas de papiro', 'papiro'), ('rice', 'Arroz', 'granos de arroz blanco', 'arroz'),
              ('milk', 'Leche', 'vaso de leche y salpicadura', 'leche')],
}
FAMILY = {'fruta': 'Frutas y cítricos', 'dulce': 'Dulces y frutos secos', 'flor': 'Flores', 'planta': 'Plantas, hojas y hierbas',
          'madera': 'Maderas', 'especia': 'Especias y semillas', 'resina': 'Resinas y bálsamos', 'bebida': 'Bebidas', 'material': 'Materiales y complementos'}

def raw_key(k):
    return k[1:] if k.startswith('?') else k

slugsets, labels, unmapped = {}, {}, []
abstract_rows = {}
for r in audit['list']:
    key = raw_key(r['key'])
    canon = RAW.get(key, key if (r['known'] or key in CANON) else None)
    if key in ABSTRACT or canon in ABSTRACT:
        a = key if key in ABSTRACT else canon
        abstract_rows.setdefault(a, set()).update(r['slugs'])
        continue
    if canon not in CANON:
        unmapped.append(key); continue
    slugsets.setdefault(canon, set()).update(r['slugs'])
    labels.setdefault(canon, []).extend(r['labels'][:3])
if unmapped:
    sys.exit(f'unmapped catalogue notes: {unmapped}')
counts = {c: len(v) for c, v in slugsets.items()}

covered = sorted([c for c in counts if c in PHOTOS], key=lambda c: -counts[c])
missing = sorted([c for c in counts if c not in PHOTOS], key=lambda c: -counts[c])
abstract = sorted([(a, len(abstract_rows[a])) for a in ABSTRACT if a in abstract_rows], key=lambda x: -x[1])

# sheets: per family, catalogue items by frequency, then future items to fill eights
sheets = []
for fam in FAMILY:
    items = [(c, CANON[c][0], CANON[c][2], CANON[c][3], counts[c]) for c in missing if CANON[c][1] == fam]
    fut = [(i, l, d, a, 0) for i, l, d, a in FUTURE.get(fam, [])]
    pool = items + fut
    need = (-len(pool)) % 8
    if need:
        sys.exit(f'{fam}: {len(pool)} items, add {need} more FUTURE entries to fill the last sheet')
    for k in range(0, len(pool), 8):
        chunk = pool[k:k + 8]
        sheets.append({'family': fam, 'title': FAMILY[fam], 'items': [
            {'id': i, 'label': l, 'show': d, 'aliases': a, 'catalogPerfumes': n} for i, l, d, a, n in chunk]})
sheets.sort(key=lambda s: -sum(i['catalogPerfumes'] for i in s['items']))
for n, s in enumerate(sheets, start=5):
    s['sheet'] = n
    fam_sheets = [x for x in sheets if x['family'] == s['family']]
    s['name'] = f"{s['title']}" + (f" {fam_sheets.index(s) + 1}" if len(fam_sheets) > 1 else '')
abstract_sheet = {'sheet': 5 + len(sheets), 'family': 'acorde', 'name': 'Acordes (opcional, no son materias primas)', 'items': [
    {'id': 'accord_musk', 'label': 'Almizcle', 'show': 'gota de esencia transparente sobre seda blanca'},
    {'id': 'accord_amber', 'label': 'Ámbar', 'show': 'gota de esencia ámbar dorada con luz cálida'},
    {'id': 'accord_ambergris', 'label': 'Ámbar gris', 'show': 'gota de esencia gris perla sobre piedra lisa'},
    {'id': 'accord_woods', 'label': 'Amaderado', 'show': 'gota de esencia sobre una lámina fina de madera clara'},
    {'id': 'accord_marine', 'label': 'Marino', 'show': 'gota de esencia azul transparente con una ola suave al fondo'},
    {'id': 'accord_mineral', 'label': 'Mineral', 'show': 'gota de esencia transparente sobre piedra gris húmeda'},
    {'id': 'accord_green', 'label': 'Verde', 'show': 'gota de esencia verde translúcida sobre una hoja'},
    {'id': 'accord_cashmeran', 'label': 'Cachemira', 'show': 'gota de esencia sobre un tejido suave beige'}]}

plan = {'generated': '2026-11-05', 'catalogPerfumes': audit['perfumes'], 'perfumesWithNotes': audit['perfumesWithNotes'],
        'rawUniqueNotes': audit['unique'], 'canonicalPhysical': len(counts), 'abstract': len(abstract),
        'covered': covered, 'missing': missing, 'counts': counts,
        'notes': {'lemon': 'The first sheets used a green lime for «Limón». Catalogue «limón» (siciliano, Amalfi) is the yellow lemon: on integration move photo/lemon.webp to photo/lime.webp and use the new yellow lemon for lemon.',
                  'leather': 'photo/leather.webp is suede (ante/gamuza). Catalogue «cuero» gets its own smooth-leather image (leather_smooth) or keeps the suede.',
                  'amber': 'Perfumery «ámbar» is an accord, not fossil amber: its current drawing of amber stones should become the accord treatment.'},
        'sheets': sheets, 'optionalAccordSheet': abstract_sheet}
(HERE / 'sheets.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding='utf-8')

PROMPT = '''Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: {r1}
Fila 2: {r2}

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.'''

def cell(i):
    return f"«{i['label']}» ({i['show']})"

md = ['# Biblioteca de ingredientes · plan de láminas', '',
      f"Generado el 2026-11-05 a partir del catálogo capturado ({audit['perfumes']} perfumes, {audit['perfumesWithNotes']} con notas) y del vocabulario de la tienda.",
      'Fuente reproducible: `audit_notes.mjs` (catálogo → notas) + `plan_library.py` (alias, acordes, láminas) → `sheets.json` y este archivo. Para un catálogo nuevo, volver a ejecutar ambos; no investigar a mano.', '',
      '## Resumen', '',
      f"- Escrituras de notas distintas en el catálogo (pirámide completa): **{audit['unique']}**.",
      f"- Ingredientes físicos canónicos tras unir alias: **{len(counts)}** · acordes abstractos: **{len(abstract)}**.",
      f"- Cubiertos por las 4 láminas actuales: **{len(covered)}** (las 32 imágenes corresponden a notas del catálogo).",
      f"- Faltantes del catálogo: **{len(missing)}** · completados con ingredientes futuros hasta múltiplos de 8.",
      f"- Láminas pendientes: **{len(sheets)}** (láminas 5 a {4 + len(sheets)}) + 1 opcional de acordes.", '',
      '## Ajustes sobre las 32 imágenes actuales', ''] + [f'- **{k}**: {v}' for k, v in plan['notes'].items()] + ['',
      '## Cubiertos (perfumes que los usan)', '', ', '.join(f"{CANON[c][0]} ({counts[c]})" for c in covered), '',
      '## Faltantes por prioridad (perfumes que los usan)', '', '| # | Nota | ID | Perfumes | Lámina |', '| --- | --- | --- | --- | --- |']
where = {i['id']: s['sheet'] for s in sheets for i in s['items']}
for k, c in enumerate(missing, 1):
    md.append(f"| {k} | {CANON[c][0]} | `{c}` | {counts[c]} | {where.get(c, '')} |")
md += ['', '## Acordes abstractos (no se dibujan como materia prima)', '',
       'Se quedan con la gota neutral o con la lámina opcional de acordes (gotas de esencia, nunca un material inventado).', '',
       ', '.join(f'{ABSTRACT[a]} ({n})' for a, n in abstract), '',
       '## Láminas y prompts (copiar tal cual en ChatGPT Images)', '']
for s in sheets + [abstract_sheet]:
    items = s['items']
    md += [f"### Lámina {s['sheet']} · {s['name']}", '',
           'IDs en orden de celdas: ' + ', '.join(f"`{i['id']}`" for i in items), '',
           '```text', PROMPT.format(r1=' · '.join(cell(i) for i in items[:4]), r2=' · '.join(cell(i) for i in items[4:])), '```', '']
md += ['## Integración de una lámina nueva', '',
       '1. Guardar la imagen como `scripts/ingredients/sheets/lamina-NN.webp` (o .png).',
       '2. `python scripts/ingredients/cutout.py --plan scripts/ingredients/sheets.json --sheet NN <imagen> assets/img/ingredients/photo <revision.png>`.',
       '3. Revisar la hoja de revisión; añadir cada ID a `INGREDIENT_PHOTOS` y su entrada/alias en `scentVocabulary.js` (los alias de cada ID están en `sheets.json`).',
       '4. Pruebas: `node --test tests/scentIllustrated.test.js`.', '']
(HERE / 'LIBRARY.md').write_text('\n'.join(md), encoding='utf-8')
print(json.dumps({k: plan[k] for k in ['rawUniqueNotes', 'canonicalPhysical', 'abstract']}), 'covered', len(covered), 'missing', len(missing), 'sheets', len(sheets))
