// Every scent note in the captured catalogue (full pyramid + shown main notes),
// normalised through the storefront vocabulary, with photo/drawing status.
//   node audit-notes.mjs <web-root> <catalog.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [web, catalogPath, outPath] = process.argv.slice(2);
const notesMod = await import(pathToFileURL(`${web}/assets/js/ui/scentNotes.js`));
const vocabMod = await import(pathToFileURL(`${web}/assets/js/ui/scentVocabulary.js`));
const { INGREDIENT_PHOTOS } = await import(pathToFileURL(`${web}/assets/js/ui/ingredientPhotos.js`));
const { normalizeScentNote, ingredientImageKind } = notesMod;
const { SCENT_VOCABULARY, normalizeNoteKey } = vocabMod;
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const flat = v => Array.isArray(v) ? v : (v && typeof v === 'object') ? Object.values(v).flat() : [];
const rows = new Map();
let perfumesWithNotes = 0;
for (const p of catalog) {
  const shown = (p.scent_profile?.main_notes || []).slice(0, 5);
  const all = [
    ...shown,
    ...flat(p.notes), ...flat(p.fragrance?.notes),
    ...flat(p.fragrance?.notes_top), ...flat(p.fragrance?.notes_middle), ...flat(p.fragrance?.notes_base),
  ];
  if (all.length) perfumesWithNotes++;
  const seen = new Set();
  for (const raw of all) {
    const n = normalizeScentNote(typeof raw === 'string' ? { label: raw } : raw);
    if (!n) continue;
    const key = n.known && SCENT_VOCABULARY[n.id] ? n.id : `?${normalizeNoteKey(n.label)}`;
    const r = rows.get(key) || { key, vocab: SCENT_VOCABULARY[n.id]?.label ?? null, labels: new Map(), perfumes: new Set(), shown: 0, kind: null };
    r.labels.set(n.label, (r.labels.get(n.label) || 0) + 1);
    if (!seen.has(key)) { r.perfumes.add(p.slug); seen.add(key); }
    r.kind = ingredientImageKind(n).kind;
    rows.set(key, r);
  }
  for (const raw of shown) {
    const n = normalizeScentNote(raw);
    const key = n.known && SCENT_VOCABULARY[n.id] ? n.id : `?${normalizeNoteKey(n.label)}`;
    if (rows.get(key)) rows.get(key).shown++;
  }
}
const list = [...rows.values()].map(r => ({
  key: r.key, known: !r.key.startsWith('?'), vocabLabel: r.vocab,
  labels: [...r.labels.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} (${c})`),
  perfumes: r.perfumes.size, slugs: [...r.perfumes], shownSlots: r.shown, kind: r.kind,
})).sort((a, b) => b.perfumes - a.perfumes || a.key.localeCompare(b.key));
const vocabIds = Object.keys(SCENT_VOCABULARY);
writeFileSync(outPath, JSON.stringify({
  perfumes: catalog.length, perfumesWithNotes, unique: list.length,
  photos: [...INGREDIENT_PHOTOS], vocabIds,
  vocabWithoutPhotoNotInCatalog: vocabIds.filter(id => !INGREDIENT_PHOTOS.has(id) && !rows.has(id)),
  photosNotInCatalog: [...INGREDIENT_PHOTOS].filter(id => !rows.has(id)),
  list,
}, null, 1));
console.log('perfumes', catalog.length, 'with notes', perfumesWithNotes, 'unique', list.length,
  'known', list.filter(r => r.known).length, 'unknown', list.filter(r => !r.known).length,
  'photo', list.filter(r => r.kind === 'photo').length);
