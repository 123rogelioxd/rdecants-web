import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildScentNotesHtml, buildContextChipHtml, getFullDescription, getSensoryDescription, getStoryDescription, normalizeScentNote, usesIllustratedScent} from '../assets/js/ui/scentNotes.js';
import {CONTEXT_SYMBOLS, SCENT_FAMILY_SYMBOLS, SCENT_VOCABULARY, resolveContextSymbol} from '../assets/js/ui/scentVocabulary.js';
import {buildProductModalGuidanceHtml} from '../assets/js/ui/modal.js';
import {buildProductPageHtml} from '../assets/js/ui/productPage.js';

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

test('Donna renders five distinct ingredient drawings and its summary once',()=>{
  const p=pilot(), html=buildScentNotesHtml(p);
  assert.equal((html.match(/#ingredient-/g)||[]).length,5);
  for(const note of p.scent_profile.main_notes)assert.ok(html.includes('#ingredient-'+note.id));
  assert.equal((html.match(/Avainillado, frutal y licoroso\./g)||[]).length,1);
  assert.ok(!html.includes(p.desc));
  assert.match(html,/data-count="5"/);
});

test('every perfume gets the illustrated block: drawings where they exist, its current icon otherwise, neutral last',()=>{
  const other={slug:'otro-perfume',desc:'Descripción larga.',scent_profile:{short_description:'Cítrico y fresco.',context_chips:['Diario','Fresco'],main_notes:[
    {id:'bergamot',label:'Bergamota',family:'citrus'},{id:'iris',label:'Iris',family:'floral'},
    {id:'albaricoque',label:'albaricoque',family:'fruit',icon:'fruit',known:true},{label:'Nota futura',family:'scent'},
  ]}};
  assert.equal(usesIllustratedScent(other),true);
  const html=buildScentNotesHtml(other);
  assert.ok(html.includes('scent-notes--illustrated'));
  assert.ok(html.includes('#ingredient-bergamot'));
  assert.ok(html.includes('#iris"'));
  assert.ok(html.includes('#apple'));
  assert.ok(html.includes('#scent"'));
  assert.ok(html.includes('>Nota futura<'));
  assert.ok(html.includes('>Albaricoque<'),'family-matched lowercase labels are capitalised for display');
  assert.equal((html.match(/scent-note-icon--line/g)||[]).length,3,'line icons are marked, drawings are not');
  assert.match(html,/data-count="4"/);
  assert.match(buildContextChipHtml('Diario',{withIcon:true}),/#context-calendar/);
});

test('the narrative paragraph appears only when there is no short phrase, so copy is never repeated or lost',()=>{
  const p=pilot();
  assert.equal(getStoryDescription(p),'');
  const legacy={...p,scent_profile:{...p.scent_profile,short_description:p.desc}};
  assert.equal(getSensoryDescription(legacy),'');
  assert.equal(getStoryDescription(legacy),p.desc);
  const empty={...p,desc:'',scent_profile:{...p.scent_profile,short_description:null}};
  assert.equal(getStoryDescription(empty),'');
});

test('all shared graphic mappings exist, and unknown labels preserve their text with a neutral symbol',()=>{
  const sprite=readFileSync(new URL('../assets/img/scent-icons.svg',import.meta.url),'utf8');
  const ids=new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]));
  const symbols=[...Object.values(CONTEXT_SYMBOLS),...Object.values(SCENT_FAMILY_SYMBOLS),...Object.values(SCENT_VOCABULARY).flatMap(n=>[n.symbol,n.illustration]).filter(Boolean),'scent','context-neutral'];
  for(const symbol of symbols)assert.ok(ids.has(symbol),symbol);
  for(const label of ['Cita','Dulce','Noche','Oficina','Escuela','Evento formal','Frío','Ámbar','Todo clima','Suave','Aromático','Templado'])assert.notEqual(resolveContextSymbol(label),'context-neutral');
  for(const family of ['citrico','fresco','acuatico','amaderado','aromatico','aromatico_dulce','especiado','oriental','oriental_dulce','gourmand','floral','frutal','cuero','oud','chipre','limpio'])assert.notEqual(resolveContextSymbol(family),'context-neutral',family);
  for(const label of ['constructor','Una ocasión nueva'])assert.equal(resolveContextSymbol(label),'context-neutral');
  assert.match(buildContextChipHtml('<Nueva>',{withIcon:true}),/#context-neutral/);
  assert.match(buildContextChipHtml('<Nueva>',{withIcon:true}),/&lt;Nueva&gt;/);
});

test('canonical IDs and aliases resolve before family fallbacks without changing ingredient facts',()=>{
  assert.equal(normalizeScentNote({label:'Cassis'}).illustration,'ingredient-blackcurrant');
  const drink=normalizeScentNote({id:'champagne_rose',label:'Champagne rosé',family:'drink',known:true});
  assert.equal(drink.illustration,'glass');assert.equal(drink.label,'Champagne rosé');
  const unknown=normalizeScentNote({label:'Nota futura',family:'constructor'});
  assert.equal(unknown.illustration,'scent');assert.equal(unknown.label,'Nota futura');
});

test('short copy is bounded, full profile retains the detailed description, and empty canonical chips stay empty',()=>{
  const p=pilot();
  assert.ok([...getSensoryDescription(p)].length<=70);
  assert.equal(getFullDescription(p),p.desc);
  assert.ok(buildProductPageHtml(p).includes(p.desc));
  assert.equal(getSensoryDescription({...p,scent_profile:{...p.scent_profile,short_description:p.desc}}),'');
  assert.equal(buildProductModalGuidanceHtml({...p,scent_profile:{...p.scent_profile,context_chips:[]}}),'');
});

test('Zara Bogos Vibrant Leather Coco Suede: every note gets an ingredient drawing, names untouched', () => {
  const zara = {slug:'bogos-vibrant-leather-coco-suede-zara',name:'BOGOS VIBRANT LEATHER COCO SUEDE EDP',scent_profile:{short_description:'Frutal, amaderado y cremoso.',context_chips:['Diario','Frutal','Oficina'],main_notes:[
    {id:'pineapple',label:'Piña',family:'fruit'},{id:'salt',label:'Sal',family:'mineral'},
    {id:'sandalwood',label:'Sándalo',family:'woods'},{id:null,label:'ante',family:'scent'},
  ]}};
  const html = buildScentNotesHtml(zara);
  for (const id of ['pineapple','salt','sandalwood','leather']) assert.ok(html.includes('#ingredient-'+id), id);
  assert.equal((html.match(/scent-note-icon--line/g)||[]).length, 0, 'no monochrome icon left in this perfume');
  assert.ok(html.includes('>Ante<'), 'the imported word stays; only its drawing is resolved');
});

test('imported notes reach their drawing through ids and existing aliases, one drawing per ingredient', () => {
  const cases = {'Cassis':'blackcurrant','jengibre':'ginger','geranio Bourbon':'geranium','peonía roja':'peony','maracuyá':'passion_fruit','Toronja':'grapefruit','pimienta negra':'pepper','Notas marinas':'marine','gamuza':'leather','cedro de Virginia':'cedar'};
  for (const [label, id] of Object.entries(cases)) {
    const n = normalizeScentNote({label});
    assert.equal(n.illustration, 'ingredient-'+id, label);
    assert.equal(n.label, label, 'the canonical label is never rewritten');
  }
  // Not the same material: grey amber and oud keep their own (line) icons instead of a misleading drawing.
  for (const label of ['Ámbar gris','Oud']) assert.ok(!normalizeScentNote({label}).illustration.startsWith('ingredient-'), label);
  // Synonyms share an entry, so no ingredient is drawn twice.
  const drawings = Object.values(SCENT_VOCABULARY).map(n => n.illustration).filter(Boolean);
  assert.equal(new Set(drawings).size, drawings.length);
});

test('quick view: the whole name, the quote and the recommended badge are in the markup', () => {
  const source = readFileSync(new URL('../assets/js/ui/modal.js', import.meta.url), 'utf8');
  assert.match(source, /pdm-title-row--long/);
  assert.match(source, /\$\{vibe \? `<p class="pdm-vibe">/);
  assert.match(source, /pdm-size-btn--recommended/);
  const css = readFileSync(new URL('../assets/css/components.css', import.meta.url), 'utf8');
  const phone = css.slice(css.indexOf('Quick view on phones: one sheet, one scroll'));
  assert.match(phone, /\.pdm-modal \{[^}]*overflow-y: auto/, 'the sheet itself is the only scroll area');
  assert.match(phone, /\.pdm-info-scroll \{[^}]*overflow: visible/, 'no nested scroll inside it');
  assert.match(phone, /\.pdm-name \{[^}]*-webkit-line-clamp: none/, 'long names are not clamped');
  assert.match(phone, /\.pdm-buybar \{[^}]*position: static/, 'the buy block is not pinned');
});
