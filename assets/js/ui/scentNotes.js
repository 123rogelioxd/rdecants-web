import { SCENT_VOCABULARY, SCENT_FAMILY_SYMBOLS, normalizeNoteKey, resolveScentId, resolveContextSymbol } from './scentVocabulary.js';
import { sentenceCase } from '../utils/presentation.js';
import { BUILD_VERSION } from '../api/config.js';

export { SCENT_VOCABULARY, resolveScentId } from './scentVocabulary.js';
export const MAX_MAIN_NOTES = 5;
// Presentation rollout only. Canonical perfume facts and ingredient mappings
// remain shared; broaden this switch only after the Donna pilot is approved.
export const SCENT_CATALOG_ROLLOUT = false;
export function usesScentPilot(product) {
  return SCENT_CATALOG_ROLLOUT || product?.slug === 'donna-extradose-valentino';
}
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
  const family = text(raw?.family) || graphic?.family || 'other';
  const familyKey = normalizeNoteKey(family);
  const familySymbol = Object.hasOwn(SCENT_FAMILY_SYMBOLS, familyKey) ? SCENT_FAMILY_SYMBOLS[familyKey] : null;
  return { id: id ?? raw?.id ?? null, label: typeof raw === 'object' ? label : note?.label ?? label, icon: graphic?.symbol ?? 'scent', illustration: note?.illustration ?? note?.symbol ?? familySymbol ?? graphic?.symbol ?? 'scent', family, known: Boolean(note) || raw?.known === true };
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
  const illustrated = usesScentPilot(product);
  const description = illustrated ? getSensoryDescription(product) : '';
  if (!notes.length && !description) return '';
  return `<section class="scent-notes ${illustrated ? 'scent-notes--illustrated' : ''} ${escape(className)}" aria-label="${escape(heading)}">
    <h3 class="scent-notes-title">${escape(heading)}</h3>
    ${description ? `<p class="scent-notes-summary">${escape(description)}</p>` : ''}
    ${notes.length ? `<ul class="scent-notes-list">${notes.map(note => `<li class="scent-note" data-scent-note="${escape(note.id ?? 'unknown')}">
      <svg class="scent-note-icon" viewBox="${illustrated && note.illustration.startsWith('ingredient-') ? '0 0 96 96' : '0 0 32 32'}" width="${illustrated ? 56 : 32}" height="${illustrated ? 56 : 32}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="${escape(SPRITE_URL)}#${illustrated ? note.illustration : note.icon}"></use></svg>
      <span>${escape(note.label)}</span></li>`).join('')}</ul>
    ` : ''}
  </section>`;
}

/** Read only the backend's bounded sensory phrase. Never truncate a long
 * narrative or derive a second opinion from product names in the browser. */
export function getSensoryDescription(product) {
  const value = getShortDescription(product);
  return [...value].length <= 70 ? value : '';
}

/** Full canonical copy remains available on the complete profile and keeps
 * non-pilot views unchanged when the API starts sending a truly short summary. */
export function getFullDescription(product) {
  return sentenceCase(text(product?.desc) || text(product?.fragrance?.summary) || text(product?.story)) || getShortDescription(product);
}

export function buildContextChipHtml(label, { withIcon = false } = {}) {
  if (!withIcon) return `<span class="guidance-chip">${escape(label)}</span>`;
  const symbol = resolveContextSymbol(label);
  return `<span class="guidance-chip guidance-chip--icon"><svg class="guidance-chip-icon" viewBox="0 0 32 32" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="${escape(SPRITE_URL)}#${symbol}"></use></svg><span>${escape(label)}</span></span>`;
}

export function getShortDescription(product) {
  // A sent canonical profile is authoritative, even when deliberately empty.
  if (product?.scent_profile && 'short_description' in product.scent_profile) return sentenceCase(text(product.scent_profile.short_description));
  return sentenceCase(text(product?.fragrance?.summary) || text(product?.desc) || text(product?.story));
}

/* WHAT IS THIS FOR — at most three chips, from RSupplyOS.

   Deliberately a passthrough with a hard cap, not a derivation. The rules that
   pick these ("the authored occasion leads", "a family accord outranks an
   ingredient one", "templado separates nothing") live in the canonical
   projection beside the metadata they read, because a copy of them here would
   be a second opinion about a perfume that the business cannot see or review.

   The cap is enforced anyway: a payload is data, and three is a layout
   guarantee this page makes on its own. */
export function getContextChips(product, limit = 3) {
  const chips = list(product?.scent_profile?.context_chips)
    .map(value => text(typeof value === 'string' ? value : value?.label))
    .filter(Boolean);

  const seen = new Set();

  return chips.filter(value => {
    const key = normalizeNoteKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, Math.max(0, Math.min(3, Number(limit) || 0)));
}

/* WHAT DOES IT FEEL LIKE — one first-person sentence, or nothing.

   Empty string when the backend sent none, and never a fallback built from the
   description: the projection returns null precisely when a perfume's metadata
   cannot support a phrase, and filling that silence here would reintroduce the
   invented copy it refuses to write. */
export function getVibeCopy(product) {
  return text(product?.scent_profile?.vibe);
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
