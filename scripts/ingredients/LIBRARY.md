# Biblioteca de ingredientes · plan de láminas

Generado el 2026-11-05 a partir del catálogo capturado (112 perfumes, 107 con notas) y del vocabulario de la tienda.
Fuente reproducible: `audit_notes.mjs` (catálogo → notas) + `plan_library.py` (alias, acordes, láminas) → `sheets.json` y este archivo. Para un catálogo nuevo, volver a ejecutar ambos; no investigar a mano.

## Resumen

- Escrituras de notas distintas en el catálogo (pirámide completa): **250**.
- Ingredientes físicos canónicos tras unir alias: **140** · acordes abstractos: **50**.
- Cubiertos por las 4 láminas actuales: **32** (las 32 imágenes corresponden a notas del catálogo).
- Faltantes del catálogo: **108** · completados con ingredientes futuros hasta múltiplos de 8.
- Láminas pendientes: **17** (láminas 5 a 21) + 1 opcional de acordes.

## Ajustes sobre las 32 imágenes actuales

- **lemon**: The first sheets used a green lime for «Limón». Catalogue «limón» (siciliano, Amalfi) is the yellow lemon: on integration move photo/lemon.webp to photo/lime.webp and use the new yellow lemon for lemon.
- **leather**: photo/leather.webp is suede (ante/gamuza). Catalogue «cuero» gets its own smooth-leather image (leather_smooth) or keeps the suede.
- **amber**: Perfumery «ámbar» is an accord, not fossil amber: its current drawing of amber stones should become the accord treatment.

## Cubiertos (perfumes que los usan)

Vainilla (43), Bergamota (41), Cedro (36), Jazmín (23), Sándalo (21), Mandarina (20), Manzana (19), Cardamomo (16), Rosa (14), Jengibre (12), Canela (11), Geranio (11), Flor de azahar (11), Incienso (11), Grosella negra (9), Musgo (9), Ante (6), Piña (6), Muguete (5), Violeta (4), Cacao (4), Ciruela (4), Mango (3), Maracuyá (3), Peonía (3), Ron (3), Sal marina (3), Oud (2), Albaricoque (1), Bambú (1), Azucena (1), Lima (1)

## Faltantes por prioridad (perfumes que los usan)

| # | Nota | ID | Perfumes | Lámina |
| --- | --- | --- | --- | --- |
| 1 | Pachulí | `patchouli` | 33 | 5 |
| 2 | Lavanda | `lavender` | 30 | 5 |
| 3 | Vetiver | `vetiver` | 24 | 5 |
| 4 | Haba tonka | `tonka_bean` | 23 | 7 |
| 5 | Limón amarillo | `lemon` | 22 | 6 |
| 6 | Pimienta rosa | `pink_pepper` | 13 | 8 |
| 7 | Salvia | `sage` | 13 | 5 |
| 8 | Naranja | `orange` | 13 | 6 |
| 9 | Menta | `mint` | 12 | 5 |
| 10 | Toronja | `grapefruit` | 12 | 6 |
| 11 | Coco | `coconut` | 8 | 6 |
| 12 | Pera | `pear` | 8 | 6 |
| 13 | Pimienta negra | `pepper` | 8 | 8 |
| 14 | Ciprés | `cypress` | 7 | 12 |
| 15 | Tabaco | `tobacco` | 7 | 5 |
| 16 | Caramelo | `caramel` | 6 | 7 |
| 17 | Nuez moscada | `nutmeg` | 6 | 8 |
| 18 | Romero | `rosemary` | 5 | 5 |
| 19 | Enebro | `juniper` | 5 | 5 |
| 20 | Elemí | `elemi` | 4 | 11 |
| 21 | Benjuí | `benzoin` | 4 | 11 |
| 22 | Melón | `melon` | 4 | 6 |
| 23 | Durazno | `peach` | 4 | 6 |
| 24 | Frambuesa | `raspberry` | 4 | 6 |
| 25 | Azafrán | `saffron` | 4 | 8 |
| 26 | Ládano | `labdanum` | 4 | 11 |
| 27 | Avellana | `hazelnut` | 3 | 7 |
| 28 | Cilantro | `coriander` | 3 | 10 |
| 29 | Davana | `davana` | 3 | 10 |
| 30 | Hoja de violeta | `violet_leaf` | 3 | 10 |
| 31 | Magnolia | `magnolia` | 3 | 9 |
| 32 | Café | `coffee` | 3 | 7 |
| 33 | Gardenia | `gardenia` | 3 | 9 |
| 34 | Miel | `honey` | 3 | 7 |
| 35 | Ylang-ylang | `ylang_ylang` | 3 | 9 |
| 36 | Loto | `lotus` | 3 | 9 |
| 37 | Anís | `anise` | 2 | 8 |
| 38 | Bálsamo del Perú | `peru_balsam` | 2 | 11 |
| 39 | Caña de azúcar | `sugar_cane` | 2 | 7 |
| 40 | Flor de durazno | `peach_blossom` | 2 | 9 |
| 41 | Frangipani | `frangipani` | 2 | 9 |
| 42 | Licor | `liqueur` | 2 | 16 |
| 43 | Guayaco | `guaiac` | 2 | 12 |
| 44 | Mimosa | `mimosa` | 2 | 9 |
| 45 | Petitgrain | `petitgrain` | 2 | 10 |
| 46 | Pimienta de Sichuan | `sichuan_pepper` | 2 | 8 |
| 47 | Albahaca | `basil` | 2 | 10 |
| 48 | Clavo | `cloves` | 2 | 8 |
| 49 | Praliné | `praline` | 2 | 7 |
| 50 | Azúcar | `sugar` | 2 | 7 |
| 51 | Sandía | `watermelon` | 2 | 13 |
| 52 | Whisky | `whiskey` | 2 | 16 |
| 53 | Ajenjo | `wormwood` | 2 | 10 |
| 54 | Estoraque | `styrax` | 2 | 11 |
| 55 | Higo | `fig` | 2 | 13 |
| 56 | Madera flotante | `driftwood` | 2 | 12 |
| 57 | Pistache | `pistachio` | 2 | 14 |
| 58 | Verbena | `verbena` | 2 | 10 |
| 59 | Abedul | `birch` | 1 | 12 |
| 60 | Absenta | `absinthe` | 1 | 16 |
| 61 | Agua tónica | `tonic_water` | 1 | 16 |
| 62 | Ambreta | `ambrette` | 1 | 8 |
| 63 | Anís estrellado | `star_anise` | 1 | 19 |
| 64 | Arándanos | `blueberry` | 1 | 13 |
| 65 | Cálamo | `calamus` | 1 | 10 |
| 66 | Campanilla | `bluebell` | 1 | 9 |
| 67 | Caoba | `mahogany` | 1 | 12 |
| 68 | Castaña azucarada | `candied_chestnut` | 1 | 14 |
| 69 | Champagne rosé | `champagne_rose` | 1 | 16 |
| 70 | Chile rojo | `chili` | 1 | 19 |
| 71 | Chinotto | `chinotto` | 1 | 13 |
| 72 | Cidra | `citron` | 1 | 13 |
| 73 | Comino | `cumin` | 1 | 19 |
| 74 | Dátiles | `dates` | 1 | 13 |
| 75 | Fresia | `freesia` | 1 | 15 |
| 76 | Frutas confitadas | `candied_fruit` | 1 | 14 |
| 77 | Ginebra | `gin` | 1 | 16 |
| 78 | Grosella blanca | `white_currant` | 1 | 13 |
| 79 | Hibisco | `hibiscus` | 1 | 15 |
| 80 | Hinojo | `fennel` | 1 | 17 |
| 81 | Kiwi | `kiwi` | 1 | 13 |
| 82 | Knafeh | `knafeh` | 1 | 14 |
| 83 | Lentisco | `mastic` | 1 | 17 |
| 84 | Lichi | `lychee` | 1 | 18 |
| 85 | Iris | `iris` | 1 | 15 |
| 86 | Malvavisco | `marshmallow` | 1 | 14 |
| 87 | Reseda | `mignonette` | 1 | 15 |
| 88 | Narciso | `narcissus` | 1 | 15 |
| 89 | Opopónaco | `opoponax` | 1 | 11 |
| 90 | Orégano | `oregano` | 1 | 17 |
| 91 | Osmanto | `osmanthus` | 1 | 15 |
| 92 | Palo de rosa | `rosewood` | 1 | 12 |
| 93 | Pimienta blanca | `white_pepper` | 1 | 19 |
| 94 | Pimienta de Jamaica | `allspice` | 1 | 19 |
| 95 | Pitaya | `pitaya` | 1 | 18 |
| 96 | Regaliz | `licorice` | 1 | 14 |
| 97 | Roble | `oak` | 1 | 12 |
| 98 | Ruibarbo | `rhubarb` | 1 | 18 |
| 99 | Palo santo | `palo_santo` | 1 | 12 |
| 100 | Semilla de zanahoria | `carrot_seed` | 1 | 17 |
| 101 | Tagetes | `marigold` | 1 | 15 |
| 102 | Té negro | `black_tea` | 1 | 17 |
| 103 | Tomillo | `thyme` | 1 | 17 |
| 104 | Tuberosa | `tuberose` | 1 | 15 |
| 105 | Yuzu | `yuzu` | 1 | 18 |
| 106 | Cereza | `cherry` | 1 | 18 |
| 107 | Chocolate | `chocolate` | 1 | 14 |
| 108 | Algodón y lino | `cotton` | 1 | 20 |

## Acordes abstractos (no se dibujan como materia prima)

Se quedan con la gota neutral o con la lámina opcional de acordes (gotas de esencia, nunca un material inventado).

Almizcle (43), Ámbar (acorde) (27), Maderas / notas amaderadas (9), Cítricos (mezcla) (6), Madera ambarada (6), Ámbar gris (5), Notas marinas (5), Ambroxan (5), Frutal (4), Notas verdes (4), Amberwood (4), Madera de cachemira (4), Mineral (3), Cachemira (3), Floral (2), Acuático (2), Especias (mezcla) (2), Flores blancas (1), Fresco (1), Balsámico (1), Ambrox (1), Ambrofix (1), Ámbar extremo (1), Ámbar seco (1), Cashmeran (1), Cashmere wood (1), Akigalawood (1), Sylkolide (1), Queenwood (1), Aldehídos (1), Heliotropina (1), Acorde acuático (1), Acorde de arena (1), Acorde de chicle (1), Acorde gourmand (1), Acorde helado (1), Acorde lácteo (1), Acorde solar (1), Afrutado (1), Amaderado (1), Floral blanco (1), Frutas amarillas (1), Especias amaderadas (1), Maderas almizcladas (1), Maderas aromáticas (1), Maderas claras (1), Musgo cristal (1), Musgo cristalizado (1), Sorbete (1), Hojas verdes (1)

## Láminas y prompts (copiar tal cual en ChatGPT Images)

### Lámina 5 · Plantas, hojas y hierbas 1

IDs en orden de celdas: `patchouli`, `lavender`, `vetiver`, `sage`, `mint`, `tobacco`, `rosemary`, `juniper`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Pachulí» (ramita de pachulí con hojas verdes y hojas secas) · «Lavanda» (ramillete de espigas de lavanda morada) · «Vetiver» (manojo de raíces de vetiver beige atadas) · «Salvia» (ramita de salvia con hojas gris verdosas aterciopeladas)
Fila 2: «Menta» (ramita de menta fresca) · «Tabaco» (hojas de tabaco curadas color miel, enrolladas) · «Romero» (ramitas de romero) · «Enebro» (ramita de enebro con bayas azul oscuro)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 6 · Frutas y cítricos 1

IDs en orden de celdas: `lemon`, `orange`, `grapefruit`, `coconut`, `pear`, `melon`, `peach`, `raspberry`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Limón amarillo» (limón amarillo entero y medio limón cortado mostrando la pulpa amarilla (no lima verde)) · «Naranja» (naranja entera con hoja y media naranja cortada con pulpa jugosa) · «Toronja» (toronja rosada entera y media toronja con pulpa rosa) · «Coco» (coco marrón peludo entero y medio coco abierto con pulpa blanca)
Fila 2: «Pera» (pera verde amarillenta entera con hoja y una rebanada) · «Melón» (medio melón chino naranja con red en la cáscara y una tajada) · «Durazno» (durazno aterciopelado con hoja y medio durazno con hueso) · «Frambuesa» (grupo de frambuesas rojas con hojas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 7 · Dulces y frutos secos 1

IDs en orden de celdas: `tonka_bean`, `caramel`, `hazelnut`, `coffee`, `honey`, `sugar_cane`, `praline`, `sugar`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Haba tonka» (habas tonka negras arrugadas, una partida) · «Caramelo» (trozos de caramelo dorado y un hilo de caramelo) · «Avellana» (avellanas con cáscara y algunas peladas) · «Café» (granos de café tostado)
Fila 2: «Miel» (panal de miel y miel dorada goteando) · «Caña de azúcar» (trozos de caña de azúcar cortada) · «Praliné» (trozos de praliné de avellana caramelizado) · «Azúcar» (terrones de azúcar y azúcar morena)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 8 · Especias y semillas 1

IDs en orden de celdas: `pink_pepper`, `pepper`, `nutmeg`, `saffron`, `anise`, `sichuan_pepper`, `cloves`, `ambrette`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Pimienta rosa» (bayas rosadas secas de pimienta rosa (schinus), no pimienta negra) · «Pimienta negra» (granos de pimienta negra) · «Nuez moscada» (nueces moscadas enteras y una con macis rojo) · «Azafrán» (hebras de azafrán rojo y una flor de azafrán morada)
Fila 2: «Anís» (semillas de anís verde y una ramita) · «Pimienta de Sichuan» (cápsulas rojizas abiertas de pimienta de Sichuan) · «Clavo» (clavos de olor) · «Ambreta» (semillas de ambreta grises)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 9 · Flores 1

IDs en orden de celdas: `magnolia`, `gardenia`, `ylang_ylang`, `lotus`, `peach_blossom`, `frangipani`, `mimosa`, `bluebell`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Magnolia» (flor de magnolia blanca rosada abierta con hojas) · «Gardenia» (gardenia blanca cremosa con hojas verde oscuro brillantes) · «Ylang-ylang» (flores de ylang-ylang amarillas con pétalos largos y caídos) · «Loto» (flor de loto rosa abierta con una hoja redonda)
Fila 2: «Flor de durazno» (rama con flores de durazno rosadas) · «Frangipani» (flores de frangipani blancas con centro amarillo) · «Mimosa» (ramillete de mimosa con pompones amarillos esponjosos) · «Campanilla» (tallo con campanillas azul violeta)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 10 · Plantas, hojas y hierbas 2

IDs en orden de celdas: `coriander`, `davana`, `violet_leaf`, `petitgrain`, `basil`, `wormwood`, `verbena`, `calamus`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Cilantro» (semillas de cilantro y una ramita de hojas) · «Davana» (ramitas de davana plateadas con pequeñas flores amarillas) · «Hoja de violeta» (hojas de violeta verdes en forma de corazón, sin flor) · «Petitgrain» (ramita de naranjo amargo con hojas y pequeños frutos verdes)
Fila 2: «Albahaca» (ramita de albahaca) · «Ajenjo» (ramas de ajenjo (artemisia) de hojas plateadas) · «Verbena» (ramitas de verbena de limón (hierba luisa)) · «Cálamo» (rizomas de cálamo y hojas en espada)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 11 · Resinas y bálsamos

IDs en orden de celdas: `elemi`, `benzoin`, `labdanum`, `peru_balsam`, `styrax`, `opoponax`, `myrrh`, `galbanum`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Elemí» (resina de elemí blanca amarillenta y pegajosa) · «Benjuí» (trozos de resina de benjuí ámbar) · «Ládano» (resina oscura de ládano y una ramita de jara) · «Bálsamo del Perú» (bálsamo del Perú marrón oscuro en cuchara de madera)
Fila 2: «Estoraque» (bálsamo de estoraque denso y trozos de corteza) · «Opopónaco» (lágrimas de resina de opopónaco marrón dorado) · «Mirra» (lágrimas de mirra rojizas) · «Gálbano» (resina de gálbano verdosa)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 12 · Maderas

IDs en orden de celdas: `cypress`, `guaiac`, `driftwood`, `birch`, `mahogany`, `rosewood`, `oak`, `palo_santo`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Ciprés» (ramita de ciprés con dos gálbulos) · «Guayaco» (trozos de madera de guayaco verde oscuro) · «Madera flotante» (pieza de madera flotante pulida por el mar, gris clara) · «Abedul» (troncos de abedul con corteza blanca)
Fila 2: «Caoba» (tablillas de caoba pulida rojiza) · «Palo de rosa» (trozos de madera de palo de rosa rojiza) · «Roble» (trozos de roble y bellotas) · «Palo santo» (palitos de palo santo amarillos)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 13 · Frutas y cítricos 2

IDs en orden de celdas: `watermelon`, `fig`, `blueberry`, `chinotto`, `citron`, `dates`, `white_currant`, `kiwi`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Sandía» (tajada triangular de sandía roja con semillas negras y cáscara verde) · «Higo» (higo morado entero y medio higo mostrando el interior rosado) · «Arándanos» (puñado de arándanos azules con pruina) · «Chinotto» (pequeñas naranjas amargas chinotto con hojas)
Fila 2: «Cidra» (cidra grande amarilla de cáscara gruesa y una rebanada) · «Dátiles» (dátiles marrones brillantes, uno abierto) · «Grosella blanca» (racimo de grosellas blancas translúcidas) · «Kiwi» (kiwi entero peludo y medio kiwi con pulpa verde y semillas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 14 · Dulces y frutos secos 2

IDs en orden de celdas: `pistachio`, `candied_chestnut`, `candied_fruit`, `knafeh`, `marshmallow`, `licorice`, `chocolate`, `almond`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Pistache» (pistaches con cáscara abierta mostrando el fruto verde) · «Castaña azucarada» (castañas glaseadas brillantes (marron glacé)) · «Frutas confitadas» (frutas confitadas de colores) · «Knafeh» (porción de knafeh dorado con pistache)
Fila 2: «Malvavisco» (malvaviscos blancos y rosas) · «Regaliz» (raíz de regaliz y piezas de regaliz negro) · «Chocolate» (trozos de chocolate oscuro) · «Almendra» (almendras con cáscara y peladas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 15 · Flores 2

IDs en orden de celdas: `freesia`, `hibiscus`, `iris`, `mignonette`, `narcissus`, `osmanthus`, `marigold`, `tuberose`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Fresia» (vara de fresia con flores blancas y amarillas) · «Hibisco» (flor de hibisco roja abierta) · «Iris» (flor de iris violeta azulado con su rizoma (raíz) limpio) · «Reseda» (espiga de reseda (mignonette) verde amarillenta)
Fila 2: «Narciso» (narcisos blancos con corona amarilla) · «Osmanto» (ramita con racimos de diminutas flores naranja de osmanto) · «Tagetes» (flores de tagetes (cempasúchil) naranjas) · «Tuberosa» (vara de tuberosa con flores blancas cerosas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 16 · Bebidas

IDs en orden de celdas: `liqueur`, `whiskey`, `absinthe`, `tonic_water`, `champagne_rose`, `gin`, `cognac`, `red_wine`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Licor» (copita de licor ámbar) · «Whisky» (vaso de whisky con hielo grande) · «Absenta» (copa de absenta verde con cuchara perforada y terrón de azúcar) · «Agua tónica» (vaso de agua tónica con burbujas y rodaja de limón)
Fila 2: «Champagne rosé» (copa flauta de champagne rosé con burbujas) · «Ginebra» (vaso de gin con rodaja de pepino y enebro) · «Coñac» (copa balón de coñac) · «Vino tinto» (copa de vino tinto)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 17 · Plantas, hojas y hierbas 3

IDs en orden de celdas: `fennel`, `mastic`, `oregano`, `carrot_seed`, `black_tea`, `thyme`, `eucalyptus`, `fig_leaf`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Hinojo» (bulbo de hinojo con hojas plumosas) · «Lentisco» (ramita de lentisco con lágrimas de resina de almáciga) · «Orégano» (ramita de orégano fresco) · «Semilla de zanahoria» (semillas de zanahoria y una zanahoria con hojas)
Fila 2: «Té negro» (hojas de té negro secas enrolladas) · «Tomillo» (ramitas de tomillo) · «Eucalipto» (ramita de eucalipto de hojas azul verdoso) · «Hoja de higuera» (hojas de higuera grandes y lobuladas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 18 · Frutas y cítricos 3

IDs en orden de celdas: `lychee`, `pitaya`, `rhubarb`, `yuzu`, `cherry`, `strawberry`, `pomegranate`, `blackberry`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Lichi» (lichis de cáscara rosada rugosa, uno pelado con pulpa blanca translúcida) · «Pitaya» (pitaya rosa con escamas verdes y media pitaya con pulpa blanca y semillas) · «Ruibarbo» (tallos de ruibarbo rojo-verde con una hoja) · «Yuzu» (yuzu amarillo de cáscara rugosa y medio yuzu)
Fila 2: «Cereza» (par de cerezas rojas brillantes con tallos) · «Fresa» (fresas rojas con hojas y una fresa partida) · «Granada» (granada abierta mostrando granos rojos) · «Zarzamora» (zarzamoras negras brillantes con hojas)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 19 · Especias y semillas 2

IDs en orden de celdas: `star_anise`, `chili`, `cumin`, `white_pepper`, `allspice`, `caraway`, `bay_leaf`, `mace`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Anís estrellado» (estrellas de anís estrellado) · «Chile rojo» (chiles rojos frescos) · «Comino» (semillas de comino) · «Pimienta blanca» (granos de pimienta blanca)
Fila 2: «Pimienta de Jamaica» (granos de pimienta de Jamaica marrones) · «Alcaravea» (semillas de alcaravea) · «Laurel» (hojas de laurel) · «Macis» (macis rojo anaranjado seco)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 20 · Materiales y complementos

IDs en orden de celdas: `cotton`, `leather_smooth`, `beeswax`, `pine`, `ebony`, `papyrus`, `rice`, `milk`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Algodón y lino» (flor de algodón abierta junto a un lienzo de lino doblado) · «Cuero» (muestra de cuero liso marrón doblada (no gamuza)) · «Cera de abejas» (bloque de cera de abejas dorada con panal) · «Pino» (ramita de pino con piña de pino)
Fila 2: «Ébano» (trozos de ébano negro pulido) · «Papiro» (tallos y umbelas de papiro) · «Arroz» (granos de arroz blanco) · «Leche» (vaso de leche y salpicadura)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 21 · Flores 3

IDs en orden de celdas: `lilac`, `carnation`, `honeysuckle`, `orchid`, `cherry_blossom`, `champaca`, `wisteria`, `sweet_pea`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Lila» (racimo de lilas moradas) · «Clavel» (clavel rosa con borde ondulado) · «Madreselva» (ramita de madreselva con flores blancas y amarillas) · «Orquídea» (vara de orquídea blanca con centro rosado)
Fila 2: «Flor de cerezo» (rama de flor de cerezo rosa claro) · «Champaca» (flores de champaca amarillo anaranjado) · «Glicina» (racimo colgante de glicina lila) · «Guisante de olor» (flores de guisante de olor pastel)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

### Lámina 22 · Acordes (opcional, no son materias primas)

IDs en orden de celdas: `accord_musk`, `accord_amber`, `accord_ambergris`, `accord_woods`, `accord_marine`, `accord_mineral`, `accord_green`, `accord_cashmeran`

```text
Fotografía de estudio fotorrealista para catálogo de perfumería premium. Una sola imagen horizontal 2:1 dividida en una cuadrícula fija de 4 columnas × 2 filas: ocho celdas cuadradas idénticas separadas por una línea fina gris muy clara. Fondo marfil muy claro y uniforme (#F8F2E9) en todas las celdas, sin degradados ni texturas.

En cada celda, un solo ingrediente real, centrado, ocupando cerca del 70 % del ancho de la celda, completo y sin tocar los bordes ni invadir otras celdas. Iluminación de estudio suave y difusa desde arriba a la izquierda, igual en las ocho celdas; sombra de contacto suave y corta; colores naturales, texturas físicas nítidas (piel, fibras, semillas, vetas, gotas reales), perspectiva frontal ligeramente elevada. Sin platos, cuencos, tablas, manos ni accesorios salvo que se indique.

Debajo de cada ingrediente, centrado en la franja inferior de su celda, su nombre exacto en una tipografía serif elegante gris oscuro, discreta y pequeña. Ningún otro texto, marca de agua ni logotipo.

Contenido, de izquierda a derecha:
Fila 1: «Almizcle» (gota de esencia transparente sobre seda blanca) · «Ámbar» (gota de esencia ámbar dorada con luz cálida) · «Ámbar gris» (gota de esencia gris perla sobre piedra lisa) · «Amaderado» (gota de esencia sobre una lámina fina de madera clara)
Fila 2: «Marino» (gota de esencia azul transparente con una ola suave al fondo) · «Mineral» (gota de esencia transparente sobre piedra gris húmeda) · «Verde» (gota de esencia verde translúcida sobre una hoja) · «Cachemira» (gota de esencia sobre un tejido suave beige)

Evitar: caricatura, ilustración, vector, 3D o CGI evidente, plástico, colores saturados artificiales, objetos cortados por el borde, ingredientes repetidos o mezclados entre celdas, fondos distintos entre celdas.
```

## Integración de una lámina nueva

1. Guardar la imagen como `scripts/ingredients/sheets/lamina-NN.webp` (o .png).
2. `python scripts/ingredients/cutout.py --plan scripts/ingredients/sheets.json --sheet NN <imagen> assets/img/ingredients/photo <revision.png>`.
3. Revisar la hoja de revisión; añadir cada ID a `INGREDIENT_PHOTOS` y su entrada/alias en `scentVocabulary.js` (los alias de cada ID están en `sheets.json`).
4. Pruebas: `node --test tests/scentIllustrated.test.js`.

## Cierre visual publicado · 2026-11-06

La versión `2026.11.05.7` está en Hostinger. El paquete publicado contiene las
168 fotos de ingredientes y 8 medallones de acorde con SHA-256 verificado.
Producción mostró cuatro fotos en el modal de prueba. El catálogo tiene 140
ingredientes físicos canónicos y 50 acordes; la biblioteca es ilustrativa y no
pretende incluir una imagen para cada etiqueta. Alias `sugar`/«Azúcar» y
`sugar_cane`/«Caña de azúcar» siguen separados. Las 136 láminas añadidas se
generaron para RDECANTS con ChatGPT Images según confirmación de Roger y se
procesaron localmente; no se atribuyen como stock ni se declara CC0. Ver
[`photo/CREDITS.md`](../../assets/img/ingredients/photo/CREDITS.md) y el
[cierre de release](../../docs/2026-11-05-rdecants-closure.md).
