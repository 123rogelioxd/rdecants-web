import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {buildScentNotesHtml, buildContextChipHtml, getFullDescription, getSensoryDescription, getStoryDescription, ingredientImageKind, ingredientImageUrl, normalizeScentNote, usesIllustratedScent} from '../assets/js/ui/scentNotes.js';
import {CONTEXT_SYMBOLS, SCENT_FAMILY_SYMBOLS, SCENT_VOCABULARY, resolveContextSymbol} from '../assets/js/ui/scentVocabulary.js';
import {buildProductModalGuidanceHtml, _displayName} from '../assets/js/ui/modal.js';
import {buildProductPageHtml} from '../assets/js/ui/productPage.js';

const drawingsOf = html => [...html.matchAll(/ingredients\/(?:photo\/|accord\/)?([a-z_]+)\.webp/g)].map(m => m[1]);

const pilot = () => ({
  id:'156',product_id:156,slug:'donna-extradose-valentino',name:'DONNA EXTRADOSE',house:'VALENTINO',
  desc:'Frutal, licoroso y avainillado, con cassis y cítricos al inicio, un corazón cálido de ron y jazmín sambac y un fondo intenso de vainilla Bourbon de Madagascar.',
  variants:[],fragrance:{},
  scent_profile:{short_description:'Avainillado, frutal y licoroso.',context_chips:['Cita','Dulce','Noche'],main_notes:[
    {id:'blackcurrant',label:'Grosella negra',family:'fruit'}, {id:'rum',label:'Ron',family:'drink'},
    {id:'vanilla',label:'Vainilla',family:'gourmand'}, {id:'bergamot',label:'Bergamota',family:'citrus'},
    {id:'jasmine',label:'Jazmín',family:'floral'},
  ]},
});

test('Donna renders its five approved drawings and its summary once', () => {
  const p = pilot(), html = buildScentNotesHtml(p);
  assert.deepEqual(drawingsOf(html), ['blackcurrant','rum','vanilla','bergamot','jasmine']);
  assert.equal((html.match(/Avainillado, frutal y licoroso\./g)||[]).length, 1);
  assert.ok(!html.includes(p.desc));
  assert.match(html, /data-count="5"/);
});

test('every perfume gets the illustrated block: a drawing where one exists, the neutral drop otherwise, never a line icon', () => {
  const other = {slug:'otro-perfume',desc:'Descripción larga.',scent_profile:{short_description:'Cítrico y fresco.',context_chips:['Diario','Fresco'],main_notes:[
    {id:'bergamot',label:'Bergamota',family:'citrus'},{id:'iris',label:'Iris',family:'floral'},
    {id:'albaricoque',label:'albaricoque',family:'fruit',icon:'fruit',known:true},{label:'Nota futura',family:'scent'},
  ]}};
  assert.equal(usesIllustratedScent(other), true);
  const html = buildScentNotesHtml(other);
  assert.ok(html.includes('scent-notes--illustrated'));
  assert.deepEqual(drawingsOf(html), ['bergamot','iris','apricot','neutral']);
  assert.ok(!html.includes('<svg'), 'no monochrome icon inside the block');
  assert.ok(html.includes('>Nota futura<'));
  assert.ok(html.includes('>Albaricoque<'), 'family-matched lowercase labels are capitalised for display');
  assert.match(html, /data-count="4"/);
  assert.match(buildContextChipHtml('Diario',{withIcon:true}), /#context-calendar/);
});

test('the narrative paragraph appears only when there is no short phrase, so copy is never repeated or lost', () => {
  const p = pilot();
  assert.equal(getStoryDescription(p), '');
  const legacy = {...p,scent_profile:{...p.scent_profile,short_description:p.desc}};
  assert.equal(getSensoryDescription(legacy), '');
  assert.equal(getStoryDescription(legacy), p.desc);
  const empty = {...p,desc:'',scent_profile:{...p.scent_profile,short_description:null}};
  assert.equal(getStoryDescription(empty), '');
});

test('every drawing named by the vocabulary ships as a WebP, and interface icons stay in the sprite', () => {
  const dir = new URL('../assets/img/ingredients/', import.meta.url);
  const drawn = Object.values(SCENT_VOCABULARY).map(n => n.illustration).filter(Boolean);
  assert.ok(drawn.length >= 60);
  for (const id of [...drawn.map(d => d.slice('ingredient-'.length)), 'neutral']) assert.ok(existsSync(new URL(`${id}.webp`, dir)), id);
  const sprite = readFileSync(new URL('../assets/img/scent-icons.svg', import.meta.url), 'utf8');
  const ids = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
  for (const symbol of [...Object.values(CONTEXT_SYMBOLS), ...Object.values(SCENT_FAMILY_SYMBOLS), ...Object.values(SCENT_VOCABULARY).map(n => n.symbol), 'scent', 'context-neutral']) assert.ok(ids.has(symbol), symbol);
  assert.ok(![...ids].some(id => id.startsWith('ingredient-')), 'drawings are not served from the sprite (iOS drops their gradients)');
  for (const label of ['Cita','Dulce','Noche','Oficina','Escuela','Evento formal','Frío','Ámbar','Todo clima','Suave','Aromático','Templado']) assert.notEqual(resolveContextSymbol(label), 'context-neutral');
  for (const label of ['constructor','Una ocasión nueva']) assert.equal(resolveContextSymbol(label), 'context-neutral');
  assert.match(buildContextChipHtml('<Nueva>',{withIcon:true}), /&lt;Nueva&gt;/);
});

test('canonical IDs and aliases resolve before the neutral drop without changing ingredient facts', () => {
  assert.equal(normalizeScentNote({label:'Cassis'}).illustration, 'ingredient-blackcurrant');
  const drink = normalizeScentNote({id:'champagne_rose',label:'Champagne rosé',family:'drink',known:true});
  assert.equal(drink.label, 'Champagne rosé');
  assert.match(ingredientImageUrl(drink), /\/photo\/champagne_rose\.webp\?v=/);
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Nota futura'})), /\/neutral\.webp\?v=/);
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Piña'})), /\/pineapple\.webp\?v=/);
});

test('short copy is bounded, full profile retains the detailed description, and empty canonical chips stay empty', () => {
  const p = pilot();
  assert.ok([...getSensoryDescription(p)].length <= 70);
  assert.equal(getFullDescription(p), p.desc);
  assert.ok(buildProductPageHtml(p).includes(p.desc));
  assert.equal(getSensoryDescription({...p,scent_profile:{...p.scent_profile,short_description:p.desc}}), '');
  assert.equal(buildProductModalGuidanceHtml({...p,scent_profile:{...p.scent_profile,context_chips:[]}}), '');
});

test('Zara Bogos Vibrant Leather Coco Suede: pineapple, salt, sandalwood and suede are drawn, names untouched', () => {
  const zara = {slug:'bogos-vibrant-leather-coco-suede-zara',name:'BOGOS VIBRANT LEATHER COCO SUEDE EDP',scent_profile:{short_description:'Frutal, amaderado y cremoso.',context_chips:['Diario','Frutal','Oficina'],main_notes:[
    {id:'pineapple',label:'Piña',family:'fruit'},{id:'salt',label:'Sal',family:'mineral'},
    {id:'sandalwood',label:'Sándalo',family:'woods'},{id:null,label:'ante',family:'scent'},
  ]}};
  const html = buildScentNotesHtml(zara);
  assert.deepEqual(drawingsOf(html), ['pineapple','salt','sandalwood','suede'], '«ante» is suede, not smooth leather');
  assert.ok(html.includes('>Ante<'), 'the imported word stays; only its drawing is resolved');
  assert.equal(_displayName(zara.name), 'Bogos Vibrant Leather Coco Suede EDP');
});

test('imported notes reach their drawing through ids and existing aliases, one drawing per ingredient', () => {
  const cases = {'Cassis':'blackcurrant','jengibre':'ginger','geranio Bourbon':'geranium','peonía roja':'peony','maracuyá':'passion_fruit','Toronja':'grapefruit','pimienta negra':'pepper','Notas marinas':'marine','cedro de Virginia':'cedar','muguete':'lily_of_the_valley','lirio de los valles':'lily_of_the_valley','azucena':'lily','bambú':'bamboo'};
  for (const [label, id] of Object.entries(cases)) {
    const n = normalizeScentNote({label});
    assert.equal(n.illustration, 'ingredient-'+id, label);
    assert.equal(n.label, label, 'the canonical label is never rewritten');
  }
  // Suede and smooth leather are two ingredients; grey amber is an accord medallion, not a material.
  for (const label of ['gamuza','ante']) assert.match(ingredientImageUrl(normalizeScentNote({label})), /photo\/suede\.webp/, label);
  for (const label of ['cuero','Leather']) assert.match(ingredientImageUrl(normalizeScentNote({label})), /photo\/leather\.webp/, label);
  assert.match(ingredientImageUrl(normalizeScentNote({id:'leather',label:'ante'})), /photo\/suede\.webp/, 'the label is more specific than the backend id');
  for (const label of ['Ámbar gris','Ambroxan']) assert.match(ingredientImageUrl(normalizeScentNote({label})), /accord\/ambergris\.webp/, label);
  // Synonyms share an entry, so no ingredient is drawn twice.
  const drawings = Object.values(SCENT_VOCABULARY).map(n => n.illustration).filter(Boolean);
  assert.equal(new Set(drawings).size, drawings.length);
});

test('display names: title case for all-caps names only, acronyms and numbers kept', () => {
  assert.equal(_displayName('DONNA EXTRADOSE'), 'Donna Extradose');
  assert.equal(_displayName('THE ONE EDP'), 'The One EDP');
  assert.equal(_displayName('212 VIP MEN'), '212 VIP Men');
  assert.equal(_displayName("L'EAU D'ISSEY"), "L'Eau D'Issey");
  assert.equal(_displayName('Light Blue'), 'Light Blue', 'mixed-case names are left as authored');
});

test('phone quick view: a compact card with one scroll area and nothing pinned', () => {
  const css = readFileSync(new URL('../assets/css/components.css', import.meta.url), 'utf8');
  const phone = css.slice(css.indexOf('Phones: a compact modal window, one scroll area'));
  assert.match(phone, /\.pdm-modal \{[^}]*border-radius: 24px[^}]*display: grid[^}]*overflow-y: auto/, 'the card itself is the only scroll area');
  assert.match(phone, /\.pdm-info,\s*\.pdm-info-scroll \{\s*display: contents;/, 'no nested scroll inside it');
  assert.match(phone, /\.pdm-name \{[^}]*-webkit-line-clamp: none/, 'long names are not clamped');
  assert.match(phone, /\.pdm-buybar \{[^}]*position: static/, 'the buy block is not pinned');
  assert.match(phone, /env\(safe-area-inset-top\)/, 'Safari safe areas respected');
});

test('a licensed ingredient photo, once listed, replaces the illustration for every perfume with that note', async () => {
  const {INGREDIENT_PHOTOS} = await import('../assets/js/ui/ingredientPhotos.js');
  for (const id of INGREDIENT_PHOTOS) assert.ok(existsSync(new URL(`../assets/img/ingredients/photo/${id}.webp`, import.meta.url)), `photo/${id}.webp`);
  const pineapple = normalizeScentNote({label:'Piña'});
  assert.equal(ingredientImageKind(pineapple).kind, INGREDIENT_PHOTOS.has('pineapple') ? 'photo' : 'illustration');
  const had = INGREDIENT_PHOTOS.has('pineapple');
  INGREDIENT_PHOTOS.add('pineapple');
  try {
    assert.match(ingredientImageUrl(pineapple), /\/ingredients\/photo\/pineapple\.webp\?v=/);
    assert.match(buildScentNotesHtml({scent_profile:{main_notes:[{id:'pineapple',label:'Piña'}]}}), /data-kind="photo"/);
  } finally { if (!had) INGREDIENT_PHOTOS.delete('pineapple'); }
  assert.equal(ingredientImageKind(normalizeScentNote({label:'Nota futura'})).kind, 'neutral');
});

test('the supplied ingredient images: every listed id is a vocabulary entry with a file, and they win over drawings', async () => {
  const {INGREDIENT_PHOTOS} = await import('../assets/js/ui/ingredientPhotos.js');
  assert.equal(INGREDIENT_PHOTOS.size, 168);
  for (const id of INGREDIENT_PHOTOS) {
    assert.ok(SCENT_VOCABULARY[id], `${id} is a vocabulary id`);
    assert.ok(existsSync(new URL(`../assets/img/ingredients/photo/${id}.webp`, import.meta.url)), id);
  }
  const zara = buildScentNotesHtml({scent_profile:{main_notes:[{id:'pineapple',label:'Piña'},{id:'salt',label:'Sal'},{id:'sandalwood',label:'Sándalo'},{id:null,label:'ante'}]}});
  assert.equal((zara.match(/data-kind="photo"/g)||[]).length, 4);
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Oud'})), /photo\/oud\.webp/, 'a note without a drawing can still have a photo');
  assert.match(ingredientImageUrl(normalizeScentNote({label:'chabacano'})), /photo\/apricot\.webp/);
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Lavanda'})), /photo\/lavender\.webp/);
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Frutal'})), /neutral\.webp/, 'a family word is not an ingredient');
});

test('lemon and lime stay apart, and abstract accords never borrow a material image', async () => {
  const {INGREDIENT_PHOTOS, INGREDIENT_ACCORDS} = await import('../assets/js/ui/ingredientPhotos.js');
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Lima'})), /photo\/lime\.webp/, 'the green citrus image is a lime');
  for (const label of ['Limón','limón siciliano','limon de amalfi']) {
    assert.match(ingredientImageUrl(normalizeScentNote({label})), /photo\/lemon\.webp/, `${label}: the yellow lemon`);
  }
  for (const label of ['Ámbar','ámbar gris','Almizcle','Notas marinas','Mineral','madera de cachemira','acuático']) {
    const url = ingredientImageUrl(normalizeScentNote({label}));
    assert.doesNotMatch(url, /\/photo\//, label);
    assert.match(url, /\/accord\//, `${label}: an essence medallion`);
  }
  assert.match(ingredientImageUrl(normalizeScentNote({label:'Ámbar'})), /accord\/amber\.webp/, 'perfumery amber is an accord, not amber stones');
  for (const [id, file] of Object.entries(INGREDIENT_ACCORDS)) {
    assert.ok(SCENT_VOCABULARY[id], `${id} is a vocabulary id`);
    assert.ok(!INGREDIENT_PHOTOS.has(id), `${id} is never a material photo`);
    assert.ok(existsSync(new URL(`../assets/img/ingredients/accord/${file}.webp`, import.meta.url)), `accord/${file}.webp`);
  }
});
