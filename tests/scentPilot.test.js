import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildScentNotesHtml, buildContextChipHtml, getFullDescription, getSensoryDescription, normalizeScentNote, usesScentPilot} from '../assets/js/ui/scentNotes.js';
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

test('the Donna pilot renders five distinct ingredient drawings and leaves other perfumes on the current presentation',()=>{
  const p=pilot(), html=buildScentNotesHtml(p);
  assert.equal((html.match(/#ingredient-/g)||[]).length,5);
  for(const note of p.scent_profile.main_notes)assert.ok(html.includes('#ingredient-'+note.id));
  assert.equal((html.match(/Avainillado, frutal y licoroso\./g)||[]).length,1);
  assert.ok(!html.includes(p.desc));
  const other={...p,slug:'otro-perfume'};
  assert.equal(usesScentPilot(other),false);
  assert.ok(!buildScentNotesHtml(other).includes('scent-notes--illustrated'));
  assert.ok(!buildScentNotesHtml(other).includes('#ingredient-'));
});

test('all shared graphic mappings exist, and unknown labels preserve their text with a neutral symbol',()=>{
  const sprite=readFileSync(new URL('../assets/img/scent-icons.svg',import.meta.url),'utf8');
  const ids=new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]));
  const symbols=[...Object.values(CONTEXT_SYMBOLS),...Object.values(SCENT_FAMILY_SYMBOLS),...Object.values(SCENT_VOCABULARY).map(n=>n.illustration).filter(Boolean)];
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
