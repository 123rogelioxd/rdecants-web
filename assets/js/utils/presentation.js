/* =============================================================
   RDECANTS — PRODUCT PRESENTATION NORMALIZATION
   Pure, DOM-free formatting applied to the raw R Supply OS feed
   before anything renders. It NEVER invents product information —
   it only reshapes strings the backend already sent so the
   storefront reads like an established brand instead of a raw
   database dump.

     sentenceCase(text)          machine prose → readable sentences
     composeDisplayName(name, concentration)
                                 disambiguate duplicate names
                                 (e.g. two "SAUVAGE" → "SAUVAGE EDT" / "SAUVAGE EDP")
     stripPictographs(text)      "🌎 PACK TODOTERRENO" → "PACK TODOTERRENO"
     titleCaseName(text)         "BORN IN ROMA EDT" → "Born in Roma EDT"

   Backend data errors (typos, wrong house fields) are OUT of scope
   here — those are corrected at the source; this layer only fixes
   casing and name composition, which are safe to derive.
   ============================================================= */

/* Capitalize the first letter of the string and of every sentence that
   follows a terminator (. ! ?). Leaves already-capitalized text and
   embedded acronyms untouched — we only ever raise a lowercase leading
   letter, never lowercase anything, so brand names keep their casing. */
export function sentenceCase(text) {
  const str = String(text ?? '').trim();
  if (!str) return '';
  return str.replace(/(^\s*|[.!?]\s+)([a-zà-ÿ])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

/* Compose a display name that disambiguates products sharing a base name.
   Appends the concentration when it is not already present in the name,
   matching the name's case (all-caps feed name → all-caps concentration)
   so "SAUVAGE" + "EDT" reads "SAUVAGE EDT", and "Le Male" + "Elixir"
   reads "Le Male Elixir". Returns the name unchanged when there is no
   concentration or it is already contained in the name. */
export function composeDisplayName(name, concentration) {
  const base = String(name ?? '').trim();
  const conc = String(concentration ?? '').trim();
  if (!base || !conc) return base;

  const haystack = base.toLowerCase();
  if (haystack.includes(conc.toLowerCase())) return base;

  const isAllCaps = base === base.toUpperCase() && /[A-Za-zÀ-ÿ]/.test(base);
  const concOut = isAllCaps ? conc.toUpperCase() : conc;
  return `${base} ${concOut}`;
}

/* Emoji and their joiners / variation selectors / keycap marks. Operators
   type them into back-office copy; the storefront's voice uses none. */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︎️‍⃣]/gu;

export function stripPictographs(text) {
  return String(text ?? '').replace(PICTOGRAPHS, '').replace(/\s{2,}/g, ' ').trim();
}

/* Shorthand that must stay upper-case when a shouting feed name is softened. */
const KEEP_UPPER = new Set(['EDP', 'EDT', 'EDC', 'VIP', 'YSL', 'CK', 'DKNY', 'D&G', 'JPG', 'CH', 'TF', 'NYC', 'XS', 'OS', 'MYSLF']);
const KEEP_LOWER = new Set(['in', 'di', 'de', 'del', 'da', 'du', 'des', 'la', 'of', 'et']);

/* Title-case an ALL-CAPS feed name. Mixed-case input is returned unchanged:
   once someone has cased a name by hand, that casing is the decision. Words
   with digits ("9PM", "212") and known shorthand keep their capitals. */
export function titleCaseName(text) {
  const str = String(text ?? '').trim();
  if (!str || str !== str.toUpperCase() || !/[A-ZÀ-Ý]/.test(str)) return str;

  return str.split(/\s+/).map((word, index) => {
    if (/\d/.test(word)) return word;
    if (KEEP_UPPER.has(word.replace(/[^A-ZÀ-Ý&]/g, ''))) return word;
    const lower = word.toLowerCase();
    if (index > 0 && KEEP_LOWER.has(lower)) return lower;
    const cased = lower.replace(/(^|['’])(\p{L})/gu, (_, lead, letter) => lead + letter.toUpperCase());
    /* Elided particle inside a name stays lower: "L'Eau d'Issey". */
    return index > 0 ? cased.replace(/^([DL])(['’])/, (_, p, apos) => p.toLowerCase() + apos) : cased;
  }).join(' ');
}
