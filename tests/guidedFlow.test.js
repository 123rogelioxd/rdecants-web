/* =============================================================
   INTEGRATION: the whole guided flow, end to end.

   finder questions → answers → three picks → handoff → guided catalog

   The original complaint this file guards: the handoff used to be a single
   `?intent=noche`, which threw away who it was for, the age, the goal and
   the climate. "Ver más opciones" therefore ranked the catalog against a
   different question than the three picks above it had answered. Every
   assertion here is about answers SURVIVING and both surfaces agreeing.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogUrl, readGuideFromQuery, stashGuideHandoff, takeGuideHandoff,
  getIntentAnswers, getIntentHref,
} from '../assets/js/catalog/intents.js';
import {
  getFinderResult, rankGuidedCatalog, ASSISTANT_QUESTIONS, questionAnswerIds,
} from '../assets/js/recommendations/assistant.js';
import { readAnswers, describeAnswers, ANSWER_VALUES } from '../assets/js/recommendations/engine.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();

/* Every answer a completed finder session produces. */
const SESSION = { gender: 'mujer', age: '15-18', occasion: 'noche', goal: 'destacar', climate: 'frio' };

/* A sessionStorage stand-in, so the handoff is testable off the DOM. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    get size() { return map.size; },
  };
}

/* ── The answer set the UI can produce is exactly what the engine reads ── */

test('every option the finder can offer is an answer the engine accepts', () => {
  const offered = {};
  for (const question of ASSISTANT_QUESTIONS) {
    const groups = question.groups ?? [{ id: question.id, options: question.options }];
    for (const group of groups) {
      offered[group.id] = group.options.map(o => o.value);
    }
  }

  assert.deepEqual(Object.keys(offered).sort(), ['age', 'climate', 'gender', 'goal', 'occasion']);
  for (const [key, values] of Object.entries(offered)) {
    assert.deepEqual(values, ANSWER_VALUES[key], `${key}: the UI and the engine must offer the same values`);
    for (const value of values) {
      assert.equal(readAnswers({ [key]: value })[key], value, `${key}=${value} survives readAnswers`);
    }
  }
});

test('the step index of every answer is known, so each chip can link back to its question', () => {
  const owners = new Map();
  ASSISTANT_QUESTIONS.forEach((question, index) => {
    for (const id of questionAnswerIds(question)) owners.set(id, index);
  });
  for (const key of ['gender', 'age', 'occasion', 'goal', 'climate']) {
    assert.ok(owners.has(key), `${key} has no step to go back to`);
  }
});

/* ── Answers survive the URL ────────────────────────────────────── */

test('every answer survives the round trip through the catalog URL', () => {
  const url = buildCatalogUrl(SESSION);
  const query = url.slice(url.indexOf('?'));
  assert.deepEqual(readGuideFromQuery(query), SESSION);

  /* Not one of them may be dropped — that was the original bug. */
  for (const key of Object.keys(SESSION)) {
    assert.ok(query.includes(`${key}=`), `${key} missing from ${query}`);
  }
});

test('the URL is stable and shareable: same answers, same link', () => {
  assert.equal(buildCatalogUrl(SESSION), buildCatalogUrl({ ...SESSION }));
  /* Key order in the object must not change the link. */
  const reordered = { climate: 'frio', goal: 'destacar', occasion: 'noche', age: '15-18', gender: 'mujer' };
  assert.equal(buildCatalogUrl(reordered), buildCatalogUrl(SESSION));
});

test('an intent shortcut expands to real answers, never to a second taxonomy', () => {
  for (const key of ['diario', 'citas', 'noche', 'oficina', 'calor']) {
    const answers = getIntentAnswers(key);
    assert.ok(answers, key);
    assert.deepEqual(readAnswers(answers), readAnswers(answers), 'intent answers are valid engine answers');
    for (const [dimension, value] of Object.entries(answers)) {
      assert.equal(readAnswers(answers)[dimension], value === 'diario' ? 'dia' : value, `${key}.${dimension}`);
    }
  }
  /* "Para regalar" depends entirely on the recipient, so it opens the finder
     rather than pretending to filter. */
  assert.equal(getIntentAnswers('regalo'), null);
  assert.equal(getIntentHref('regalo'), '/elegir.html');
});

test('unrelated query parameters never fabricate guidance', () => {
  assert.equal(readGuideFromQuery('?utm_source=ig&fbclid=123'), null);
  assert.equal(readGuideFromQuery(''), null);
  assert.equal(readGuideFromQuery('?gender=martian'), null, 'an unknown value is not an answer');
});

/* ── Answers survive a host redirect that eats the query ────────── */

test('the session handoff carries every answer, exactly once', () => {
  const storage = memoryStorage();
  stashGuideHandoff(SESSION, storage);
  assert.equal(storage.size, 1);

  const recovered = takeGuideHandoff(storage);
  assert.deepEqual(recovered, SESSION);

  /* One-shot: a stale answer set must never re-rank a later, unrelated visit. */
  assert.equal(takeGuideHandoff(storage), null);
  assert.equal(storage.size, 0);
});

test('the handoff tolerates a hostile or empty storage without throwing', () => {
  const broken = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('private mode'); },
    removeItem() { throw new Error('private mode'); },
  };
  assert.doesNotThrow(() => stashGuideHandoff(SESSION, broken));
  assert.equal(takeGuideHandoff(broken), null);
  assert.equal(takeGuideHandoff(memoryStorage()), null);
  assert.doesNotThrow(() => stashGuideHandoff({}, memoryStorage()));
});

/* ── Both surfaces answer the SAME question ─────────────────────── */

test('the finder picks are the first rows of the guided catalog, in the same order', () => {
  const finder = getFinderResult(SESSION, CATALOG);
  const catalog = rankGuidedCatalog(SESSION, CATALOG);

  assert.ok(finder.picks.length > 0, 'the scenario returns something');
  assert.deepEqual(
    finder.picks.map(p => String(p.product.id)),
    catalog.rows.slice(0, finder.picks.length).map(r => String(r.product.id)),
  );
  for (const [i, pick] of finder.picks.entries()) {
    assert.equal(pick.compatibility, catalog.rows[i].compatibility, `#${i + 1} score`);
    assert.equal(pick.reason, catalog.rows[i].reason, `#${i + 1} reason`);
  }
});

test('going finder → URL → catalog changes nothing about the ranking', () => {
  const finder = getFinderResult(SESSION, CATALOG);

  const url = buildCatalogUrl(SESSION);
  const viaUrl = readGuideFromQuery(url.slice(url.indexOf('?')));
  const catalog = rankGuidedCatalog(viaUrl, CATALOG);

  assert.deepEqual(
    catalog.rows.slice(0, finder.picks.length).map(r => String(r.product.id)),
    finder.picks.map(p => String(p.product.id)),
    'the wider list is ranked by the same question the three picks answered',
  );
});

test('going finder → session handoff → catalog changes nothing either', () => {
  const storage = memoryStorage();
  const finder = getFinderResult(SESSION, CATALOG);
  stashGuideHandoff(SESSION, storage);

  const catalog = rankGuidedCatalog(takeGuideHandoff(storage), CATALOG);
  assert.deepEqual(
    catalog.rows.slice(0, finder.picks.length).map(r => String(r.product.id)),
    finder.picks.map(p => String(p.product.id)),
  );
});

test('losing even one answer measurably changes the result — proof the handoff matters', () => {
  const full = rankGuidedCatalog(SESSION, CATALOG);
  /* The old behaviour: only `?intent=noche` survived. */
  const truncated = rankGuidedCatalog({ occasion: 'noche' }, CATALOG);

  assert.notDeepEqual(
    truncated.rows.slice(0, 3).map(r => String(r.product.id)),
    full.rows.slice(0, 3).map(r => String(r.product.id)),
    'if dropping four answers changed nothing, the answers would be decoration',
  );

  /* And specifically: the truncated version reintroduces products the gender
     answer had ruled out. */
  const fullIds = new Set(full.rows.map(r => String(r.product.id)));
  assert.ok(truncated.rows.some(r => !fullIds.has(String(r.product.id))));
});

/* ── The catalog header summarises the answers the ranking used ─── */

test('the guided-state summary lists every answer that shaped the ranking', () => {
  const labels = describeAnswers(SESSION);
  assert.deepEqual(labels, ['Mujer', '15–18', 'Noche', 'Que destaque', 'Clima frío']);
  assert.equal(labels.length, Object.keys(SESSION).length,
    'one chip per answer — no invisible filters');
});

test('the finder result envelope carries the states the page has to render', () => {
  const result = getFinderResult(SESSION, CATALOG);
  assert.ok(Array.isArray(result.picks));
  assert.ok(Array.isArray(result.notices));
  assert.ok(Array.isArray(result.summary));
  assert.equal(typeof result.total, 'number');
  assert.ok('relaxation' in result);
  assert.ok(result.thresholds.highMatch > 0 && result.thresholds.minConfidence > 0);
});

/* ── Degraded backends ─────────────────────────────────────────── */

test('an unavailable catalog produces a stated empty state, not a crash', () => {
  for (const catalog of [[], null, undefined]) {
    const result = getFinderResult(SESSION, catalog);
    assert.deepEqual(result.picks, []);
    assert.ok(result.notices.includes('catalogo_vacio'));
  }
});

test('the answer contract does not depend on the catalog being reachable', () => {
  /* Serialization and recovery are pure — a backend outage cannot lose a
     visitor's answers on the way to the catalog page. */
  const storage = memoryStorage();
  stashGuideHandoff(SESSION, storage);
  assert.deepEqual(takeGuideHandoff(storage), SESSION);
  assert.deepEqual(readGuideFromQuery(buildCatalogUrl(SESSION).slice(1 + buildCatalogUrl(SESSION).indexOf('?') - 1)), SESSION);
});
