/* =============================================================
   RDECANTS — SHOPPING INTENTS
   One source of truth for "what are you shopping for?".

   An intent is nothing more than a preset set of finder answers, so
   the home tiles, the catalog URL contract and the guided finder all
   rank the catalog through the SAME engine
   (recommendations/assistant.js → SearchBar.applyGuide). There is no
   second taxonomy and no intent that filters by a different rule than
   the questions do.
   ============================================================= */

/* `answers: null` means the intent carries no scent/occasion signal on
   its own — "para regalar" depends entirely on who receives it — so it
   routes to the guided finder instead of pretending to filter. */
export const INTENT_PRESETS = [
  { key: 'diario', label: 'Para diario', hint: 'Ligero y fácil de usar',   answers: { occasion: 'dia' } },
  { key: 'citas',  label: 'Para citas',  hint: 'Cercano y memorable',      answers: { occasion: 'cita' } },
  { key: 'noche',  label: 'Para la noche', hint: 'Con más presencia',      answers: { occasion: 'noche' } },
  { key: 'regalo', label: 'Para regalar', hint: 'Te ayudamos a elegir',    answers: null },
  /* Kept for existing surfaces (guide bar chips, campaign links). */
  { key: 'calor',   label: 'Calor',   hint: 'Fresco para clima cálido', answers: { family: 'fresco', climate: 'calido' } },
  { key: 'oficina', label: 'Oficina', hint: 'Discreto y correcto',      answers: { occasion: 'oficina' } },
];

/* The four entry points the home surfaces, in order. */
export const HOME_INTENTS = ['diario', 'citas', 'noche', 'regalo'];

export function getIntent(key) {
  return INTENT_PRESETS.find(i => i.key === String(key ?? '').toLowerCase()) ?? null;
}

/* Answers a given intent should apply. Null for intents that need the finder. */
export function getIntentAnswers(key) {
  return getIntent(key)?.answers ?? null;
}

/* Where a home tile points. Intents that carry a real signal deep-link into
   the catalog with the filter already applied; the rest open the finder. */
export function getIntentHref(key) {
  const intent = getIntent(key);
  if (!intent) return '/catalogo.html';
  return intent.answers ? `/catalogo.html?intent=${intent.key}` : '/elegir.html';
}

/* ── URL contract ─────────────────────────────────────────────────
   /catalogo.html?intent=noche
   /catalogo.html?family=fresco&occasion=dia&gender=hombre
   /catalogo.html?q=sauvage
   Both forms are readable and shareable; `intent` is just shorthand for
   a known answer set. Unknown values are ignored rather than guessed. */

/* Every answer the ranking engine reads. `preference` and `age` belong here
   too: leaving them out meant "Ver más opciones" handed the catalog a
   different question than the one the three picks answered, so the wider
   list was ranked differently from the recommendations above it. */
const ANSWER_KEYS = ['family', 'occasion', 'gender', 'climate', 'budget', 'preference', 'age'];

/* Pure: turn a query string into the answers the ranking engine accepts.
   Returns null when the URL asks for no guidance at all. */
export function readGuideFromQuery(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));

  const intentAnswers = getIntentAnswers(params.get('intent'));
  const explicit = {};
  for (const key of ANSWER_KEYS) {
    const value = params.get(key);
    if (value) explicit[key] = value;
  }

  const answers = { ...(intentAnswers ?? {}), ...explicit };
  return Object.keys(answers).length ? answers : null;
}

/* Pure: the search query a URL asks the catalog to run, if any. */
export function readQueryFromQuery(search = '') {
  const q = new URLSearchParams(String(search).replace(/^\?/, '')).get('q');
  return q ? String(q) : '';
}

/* Pure: build the catalog URL for a finished set of finder answers. */
export function buildCatalogUrl(answers = {}) {
  const params = new URLSearchParams();
  for (const key of ANSWER_KEYS) {
    if (answers[key]) params.set(key, answers[key]);
  }
  const qs = params.toString();
  return qs ? `/catalogo.html?${qs}` : '/catalogo.html';
}

/* ── Handoff fallback ─────────────────────────────────────────────
   The URL is the contract, but it is not guaranteed to survive the trip:
   some static hosts answer `/catalogo.html?…` with a 301 to the
   extensionless path and drop the query on the way (the `serve` dev
   server does exactly this). Losing the answers there would silently
   drop a visitor who just answered three questions into an unranked
   catalog. So the finder also parks them for one read.

   One-shot and session-scoped on purpose: a stale answer set must never
   re-rank a later, unrelated visit to the catalog. */
const HANDOFF_KEY = 'rd_guide_handoff';

export function stashGuideHandoff(answers, storage = globalThis.sessionStorage) {
  if (!answers || !Object.keys(answers).length) return;
  try { storage?.setItem(HANDOFF_KEY, JSON.stringify(answers)); } catch { /* private mode */ }
}

export function takeGuideHandoff(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(HANDOFF_KEY);
    storage?.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const answers = {};
    for (const key of ANSWER_KEYS) {
      if (parsed?.[key]) answers[key] = String(parsed[key]);
    }
    return Object.keys(answers).length ? answers : null;
  } catch {
    return null;
  }
}
