import { SCENT_VOCABULARY, normalizeNoteKey, resolveScentId } from './scentVocabulary.js';
import { sentenceCase } from '../utils/presentation.js';
import { BUILD_VERSION } from '../api/config.js';

export { SCENT_VOCABULARY, resolveScentId } from './scentVocabulary.js';
export const MAX_MAIN_NOTES = 5;
const SPRITE_URL = new URL(`../../img/scent-icons.svg?v=${BUILD_VERSION}`, import.meta.url).href;
const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function normalizeScentNote(raw) {
  const label = text(typeof raw === 'string' ? raw : raw?.label ?? raw?.name ?? raw?.id);
  if (!label) return null;
  const id = resolveScentId(raw?.id) ?? resolveScentId(label);
  const note = id ? SCENT_VOCABULARY[id] : null;
  const graphic = note ?? SCENT_VOCABULARY[resolveScentId(raw?.icon)];
  return { id: id ?? raw?.id ?? null, label: typeof raw === 'object' ? label : note?.label ?? label, icon: graphic?.symbol ?? 'scent', family: graphic?.family ?? 'other', known: Boolean(note) || raw?.known === true };
}

/** Canonical API ordering wins, including an intentionally empty list. Before
 * backend rollout only, interleave top/heart/base notes, then legacy notes.
 * Never turn accords, product names or descriptions into factual notes. */
export function mainScentNotes(product, limit = MAX_MAIN_NOTES) {
  const ceiling = Math.min(MAX_MAIN_NOTES, Math.max(0, Number(limit) || 0));
  if (!ceiling) return [];
  let candidates = product?.scent_profile?.main_notes;
  if (!Array.isArray(candidates)) {
    const f = product?.fragrance ?? {};
    const pyramid = [list(f.notes_top ?? f.notes?.top), list(f.notes_middle ?? f.notes?.heart), list(f.notes_base ?? f.notes?.base)];
    candidates = [];
    for (let i = 0; i < Math.max(0, ...pyramid.map(notes => notes.length)); i++) {
      for (const notes of pyramid) if (notes[i]) candidates.push(notes[i]);
    }
    if (!candidates.length) candidates = list(product?.notes);
  }
  const seen = new Set();
  return candidates.map(normalizeScentNote).filter(note => {
    if (!note) return false;
    const key = note.id ?? normalizeNoteKey(note.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, ceiling);
}

export function buildScentNotesHtml(product, { heading = '¿A qué huele?', className = '' } = {}) {
  const notes = mainScentNotes(product);
  if (!notes.length) return '';
  return `<section class="scent-notes ${escape(className)}" aria-label="${escape(heading)}">
    <h3 class="scent-notes-title">${escape(heading)}</h3>
    <ul class="scent-notes-list">${notes.map(note => `<li class="scent-note" data-scent-note="${escape(note.id ?? 'unknown')}">
      <svg class="scent-note-icon" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="${escape(SPRITE_URL)}#${note.icon}"></use></svg>
      <span>${escape(note.label)}</span></li>`).join('')}</ul>
  </section>`;
}

export function getShortDescription(product) {
  // A sent canonical profile is authoritative, even when deliberately empty.
  if (product?.scent_profile && 'short_description' in product.scent_profile) return sentenceCase(text(product.scent_profile.short_description));
  return sentenceCase(text(product?.fragrance?.summary) || text(product?.desc) || text(product?.story));
}

export function getCommercialProfileTags(product, limit = 2) {
  const profile = product?.scent_profile;
  const raw = profile ? list(profile.profile_tags ?? profile.accords) : list(product?.fragrance?.accords);
  const seen = new Set();
  return raw.map(value => sentenceCase(text(value?.label ?? value))).filter(value => {
    const key = normalizeNoteKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, Math.min(2, Math.max(0, limit)));
}
