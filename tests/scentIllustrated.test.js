import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {buildScentNotesHtml, buildContextChipHtml, getFullDescription, getSensoryDescription, getStoryDescription, ingredientImageUrl, normalizeScentNote, usesIllustratedScent} from '../assets/js/ui/scentNotes.js';
import {CONTEXT_SYMBOLS, SCENT_FAMILY_SYMBOLS, SCENT_VOCABULARY, resolveContextSymbol} from '../assets/js/ui/scentVocabulary.js';
import {buildProductModalGuidanceHtml, _displayName} from '../assets/js/ui/modal.js';
import {buildProductPageHtml} from '../assets/js/ui/productPage.js';

const drawingsOf = html => [...html.matchAll(/ingredients\/([a-z_]+)\.webp/g)].map(m => m[1]);

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
  assert.deepEqual(drawingsOf(html), ['bergamot','neutral','neutral','neutral']);
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
  assert.match(ingredientImageUrl(drink), /\/neutral\.webp\?v=/);
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
  assert.deepEqual(drawingsOf(html), ['pineapple','salt','sandalwood','leather']);
  assert.ok(html.includes('>Ante<'), 'the imported word stays; only its drawing is resolved');
  assert.equal(_displayName(zara.name), 'Bogos Vibrant Leather Coco Suede EDP');
});

test('imported notes reach their drawing through ids and existing aliases, one drawing per ingredient', () => {
  const cases = {'Cassis':'blackcurrant','jengibre':'ginger','geranio Bourbon':'geranium','peonía roja':'peony','maracuyá':'passion_fruit','Toronja':'grapefruit','pimienta negra':'pepper','Notas marinas':'marine','gamuza':'leather','cedro de Virginia':'cedar','muguete':'lily_of_the_valley','lirio de los valles':'lily_of_the_valley','azucena':'lily','bambú':'bamboo'};
  for (const [label, id] of Object.entries(cases)) {
    const n = normalizeScentNote({label});
    assert.equal(n.illustration, 'ingredient-'+id, label);
    assert.equal(n.label, label, 'the canonical label is never rewritten');
  }
  // Not the same material: grey amber and oud get the neutral drop, not a misleading drawing.
  for (const label of ['Ámbar gris','Oud']) assert.match(ingredientImageUrl(normalizeScentNote({label})), /neutral\.webp/, label);
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
