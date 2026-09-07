import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENT_VOCABULARY, resolveScentId, normalizeScentNote, mainScentNotes, buildScentNotesHtml, getCommercialProfileTags, getShortDescription } from '../assets/js/ui/scentNotes.js';
import { mapApiProduct } from '../assets/js/providers/catalog.js';
import { getPrimaryVariants, hasDecantPresentations } from '../assets/js/utils/prices.js';
import { checkoutTotals, checkoutSummaryHtml, registeredOrderTotals } from '../assets/js/ui/checkoutFlow.js';
import { quoteExperienceState } from '../assets/js/pages/quote.js';
import { getRecommendations } from '../assets/js/recommendations/engine.js';

test('every scent vocabulary entry and alias resolves to an existing SVG symbol', () => {
 const sprite = readFileSync(new URL('../assets/img/scent-icons.svg', import.meta.url), 'utf8');
 const ids = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
 assert.ok(Object.keys(SCENT_VOCABULARY).length >= 85);
 for (const note of Object.values(SCENT_VOCABULARY)) {
  assert.ok(ids.has(note.symbol), note.id);
  for (const alias of [note.id, note.label, ...note.aliases]) assert.equal(resolveScentId(alias.toUpperCase()), note.id, alias);
 }
 assert.ok(ids.has('scent'));
});
test('principal notes normalize accents, deduplicate aliases, interleave the pyramid and stop at five', () => {
 const product = { fragrance: { notes: {top:['BERGAMOTA','limón','bergamot orange'],heart:['jazmín','rosa'],base:['bourbon vanilla','cedro','musk']}}};
 assert.deepEqual(mainScentNotes(product).map(n=>n.id),['bergamot','jasmine','vanilla','lemon','rose']);
 assert.deepEqual(mainScentNotes(product),mainScentNotes(product));
 assert.deepEqual(mainScentNotes({...product,scent_profile:{main_notes:[]}}),[]);
});
test('a related note preserves its factual name and unknown notes remain readable and escaped', () => {
 assert.equal(normalizeScentNote({id:'ambroxan',label:'Ambroxan',icon:'resin',known:true}).label,'Ambroxan');
 const html = buildScentNotesHtml({scent_profile:{main_notes:[{label:'<Desconocida>',icon:'missing'}]}});
 assert.match(html, /#scent/); assert.match(html,/&lt;Desconocida&gt;/); assert.doesNotMatch(html,/<Desconocida>/);
});
test('canonical commercial metadata wins over legacy descriptions and tags', () => {
 const p={desc:'Legacy',scent_profile:{short_description:'Fresco y acuático.',profile_tags:['Fresco','Fresco','Marino','Dulce']}};
 assert.equal(getShortDescription(p),'Fresco y acuático.');
 assert.deepEqual(getCommercialProfileTags(p),['Fresco','Marino']);
});
test('sealed inventory and legacy prices cannot create decant presentations', () => {
 const p=mapApiProduct({id:1,stock:100,prices:{5:120},normal_decant:{presentations:[]},bottles:[{offer_key:'sealed:1',stock:1,price:1200}]});
 assert.deepEqual(getPrimaryVariants(p),[]);assert.equal(hasDecantPresentations(p),false);
});
test('canonical decant pool keeps configured unavailable sizes and legacy 30 outside the normal UX', () => {
 const p=mapApiProduct({id:1,normal_decant:{presentations:[{id:3,ml:3,price:70,stock:2,available:true},{id:5,ml:5,price:100,stock:1,available:true},{id:10,ml:10,price:180,stock:0,available:false}]},variants:[{id:30,size:30,price:400,stock:3}]});
 assert.deepEqual(getPrimaryVariants(p).map(v=>[v.size,v.price,v.soldOut]),[[3,70,false],[5,100,false],[10,180,true]]);
 const legacyOnly=mapApiProduct({id:2,variants:[{id:30,size:30,price:400,stock:3}]});
 assert.equal(getRecommendations([legacyOnly],{}, {limit:50}).picks.length,0);
});
test('known checkout total uses server pricing, discount and delivery; unresolved never implies free', () => {
 const known=checkoutTotals({subtotal:999,discount:0,pricing:{subtotal:300,discount:40,merchandise_total:260},deliveryCost:35});
 assert.equal(known.total,295);assert.match(checkoutSummaryHtml(known),/Total/);
 const pending=checkoutTotals({subtotal:300,deliveryCost:null});assert.equal(pending.total,null);
 assert.match(checkoutSummaryHtml(pending),/Por confirmar/);assert.doesNotMatch(checkoutSummaryHtml(pending),/<dt>Total<|Sin costo/);
 assert.equal(checkoutTotals({subtotal:300,deliveryCost:0}).total,300);
});
test('registered order respects explicit null shipping and final authoritative money', () => {
 const reviewed=checkoutTotals({subtotal:300,discount:20,deliveryCost:35});
 const order={subtotal:320,discount:30,total:290,delivery:{shipping_cost:null},grand_total:null};
 assert.deepEqual(registeredOrderTotals(order,reviewed),{subtotal:320,discount:30,merchandise:290,delivery:null,total:null});
 assert.equal(registeredOrderTotals({...order,delivery:{shipping_cost:45},grand_total:335},reviewed).total,335);
});
test('Cotiza onboarding is only an initial state', () => {
 assert.equal(quoteExperienceState('',0,true),'intro');
 assert.equal(quoteExperienceState('Hawas',0,true),'search');
 assert.equal(quoteExperienceState('Hawas',1,false),'selected');
 assert.equal(quoteExperienceState('',1,true),'search');
});
