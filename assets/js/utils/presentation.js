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
