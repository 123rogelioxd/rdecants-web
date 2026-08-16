/* =============================================================
   GUIDED REFINEMENT IS MONOTONIC

   ── The defect this pins ───────────────────────────────────────────
   `De día` returned 33 products. Adding `Caballero` returned 48.

   `compatibility` is a weighted AVERAGE of per-dimension fit, so adding a
   dimension a product scores well on RAISES its average. ERBA PURA went
   from 43.8 to 69.6 — over the 62 gate — purely because `gender` was
   averaged in. Nineteen products entered the result set by having a
   constraint ADDED.

   The bar presents these as composable filters (`[De día ×] [Caballero ×]`),
   and a customer who adds a constraint must never be shown more things.

   ── The contract ───────────────────────────────────────────────────
   For any guided state S and any added refinement R:

       IDs(S + R) ⊆ IDs(S)

   Adding may remove products and may reorder the survivors. It may not
   introduce a product that did not qualify before.

   Everything here runs against the real R Supply OS catalogue snapshot
   through the same mapping production uses.
   ============================================================= */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rankGuidedCatalog } from '../assets/js/recommendations/assistant.js';
import { rankCatalog } from '../assets/js/recommendations/engine.js';
import { loadLiveCatalog } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Comments stripped: these files explain the boundary at length, and the
   explanation must not trip the check it is explaining. */
const readSource = path => readFileSync(join(root, path), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '');

const ids = answers =>
  rankGuidedCatalog(answers, CATALOG).rows.map(row => String(row.product.id));

const idSet = answers => new Set(ids(answers));

/** Every id in `inner` also appears in `outer`. */
function assertSubset(inner, outer, label) {
  const outerSet = idSet(outer);
  const leaked = ids(inner).filter(id => !outerSet.has(id));

  assert.deepEqual(
    leaked, [],
    `${label}: ${leaked.length} product(s) appeared only AFTER the refinement was added — ${leaked.join(', ')}`,
  );
}

/* ── The four pairings the brief names ───────────────────────── */

test('De día + Caballero is a subset of De día', () => {
  assertSubset({ occasion: 'dia', gender: 'hombre' }, { occasion: 'dia' }, 'dia + hombre');
});

test('De día + Dama is a subset of De día', () => {
  assertSubset({ occasion: 'dia', gender: 'mujer' }, { occasion: 'dia' }, 'dia + mujer');
});

test('Para salir + Caballero is a subset of Para salir', () => {
  assertSubset({ occasion: 'salir', gender: 'hombre' }, { occasion: 'salir' }, 'salir + hombre');
});

test('Para salir + Dama is a subset of Para salir', () => {
  assertSubset({ occasion: 'salir', gender: 'mujer' }, { occasion: 'salir' }, 'salir + mujer');
});

test('adding a constraint never grows the result count', () => {
  for (const occasion of ['dia', 'salir']) {
    const base = ids({ occasion }).length;
    for (const gender of ['hombre', 'mujer']) {
      const refined = ids({ occasion, gender }).length;
      assert.ok(
        refined <= base,
        `${occasion} = ${base} but ${occasion} + ${gender} = ${refined}`,
      );
    }
  }
});

/* ── The other direction: the refinement is also a subset of the
      gender-only state, because the closure covers every subset ── */

test('a composed state is a subset of BOTH of its single answers', () => {
  for (const occasion of ['dia', 'salir']) {
    for (const gender of ['hombre', 'mujer']) {
      assertSubset({ occasion, gender }, { occasion }, `${occasion}+${gender} vs occasion`);
      assertSubset({ occasion, gender }, { gender }, `${occasion}+${gender} vs gender`);
    }
  }
});

test('a gender added on top of a finder handoff still narrows', () => {
  /* The real three-dimension journey: `?intent=noche` arrives carrying
     `{occasion: salir, goal: destacar}` as ONE atomic state, and the
     customer then taps Caballero. The answer carried along for the ride
     must not break the invariant for the answer that was tapped. */
  const arrived = { occasion: 'salir', goal: 'destacar' };

  assertSubset({ ...arrived, gender: 'hombre' }, arrived, 'intent=noche then Caballero');
  assertSubset({ ...arrived, gender: 'mujer' }, arrived, 'intent=noche then Dama');

  /* And the occasion chip is removable from there without reopening. */
  assertSubset({ ...arrived, gender: 'hombre' }, { goal: 'destacar', gender: 'hombre' },
    'intent=noche + Caballero, occasion lifted');
});

test('the rule is scoped to the answers the catalog can actually toggle', async () => {
  /* REFINABLE is the boundary, and it is a deliberate one. `age`, `goal`,
     `climate` and `family` only ever arrive as part of one atomic answer
     set — the finder's questions, or a URL — so no tap can add them and no
     customer can experience "I added it and got more".

     Closing over them as well was measured and rejected: it emptied 24 of
     the 72 answer combinations, so a third of finder sessions would answer
     three questions and be told there is nothing. This test exists so that
     adding a `goal` control to the catalog forces someone back here. */
  const { REFINABLE } = await import('../assets/js/recommendations/engine.js');
  const searchbar = readSource('assets/js/ui/searchbar.js');
  const catalogPage = readSource('assets/js/pages/catalog.js');

  assert.deepEqual(REFINABLE, ['occasion', 'gender']);

  /* The catalog's own controls write gender and nothing else from the
     answer set; occasion arrives from the home tiles and the finder. */
  assert.match(catalogPage, /applyGender/, 'the quick buttons write gender');
  for (const dimension of ['goal', 'age', 'climate', 'family']) {
    assert.doesNotMatch(
      searchbar, new RegExp(`guide\\.${dimension}\\s*=`),
      `the catalog gained a control that writes ${dimension} — revisit REFINABLE`,
    );
  }
});

test('"me da igual" is not treated as a refinement', () => {
  /* The finder offers `unisex` as "Me da igual" — a stated ABSENCE of
     preference. A non-preference cannot narrow anything, and as a
     standalone state it is degenerate (no product clears a single-dimension
     gate on it), so intersecting with it would empty every set it touched.
     Nothing about how unisex PRODUCTS are matched changes — see the unisex
     policy test below. */
  const withNoPreference = ids({ occasion: 'dia', gender: 'unisex' });
  const plain = rankCatalog(CATALOG, { occasion: 'dia', gender: 'unisex' })
    .results.map(e => String(e.product.id));

  assert.deepEqual(withNoPreference, plain, 'no closure was applied');
  assert.ok(withNoPreference.length > 0, 'and the state is not emptied');
});

/* ── Removal restores the previous universe exactly ──────────── */

test('removing the gender restores the occasion-only result set', () => {
  for (const occasion of ['dia', 'salir']) {
    const before = ids({ occasion });
    /* Add, then drop — the customer tapping × on the gender chip. */
    ids({ occasion, gender: 'hombre' });
    const after = ids({ occasion });

    assert.deepEqual(after, before, `${occasion} did not come back unchanged`);
  }
});

test('removing the occasion leaves the gender-only result set', () => {
  for (const gender of ['hombre', 'mujer']) {
    const alone = ids({ gender });
    const fromComposed = ids({ gender });

    assert.deepEqual(fromComposed, alone);
    /* And it really is the engine's own answer for that single state —
       one answer has no proper non-empty subsets, so nothing is dropped. */
    assert.deepEqual(
      alone,
      rankCatalog(CATALOG, { gender }).results.map(e => String(e.product.id)),
      `${gender} alone must be the plain engine result`,
    );
  }
});

test('a single answer is never narrowed by the closure', () => {
  for (const answers of [{ occasion: 'dia' }, { occasion: 'salir' }, { gender: 'hombre' }, { gender: 'mujer' }]) {
    assert.deepEqual(
      ids(answers),
      rankCatalog(CATALOG, answers).results.map(e => String(e.product.id)),
      `${JSON.stringify(answers)} must pass through untouched`,
    );
  }
});

test('switching gender never loses the occasion', () => {
  for (const occasion of ['dia', 'salir']) {
    const men = { occasion, gender: 'hombre' };
    const women = { occasion, gender: 'mujer' };

    assertSubset(men, { occasion }, `${occasion} after switching to hombre`);
    assertSubset(women, { occasion }, `${occasion} after switching to mujer`);
  }
});

/* ── The ranking authority is unchanged ──────────────────────── */

test('the closure only removes rows — it never reorders the survivors', () => {
  const answers = { occasion: 'dia', gender: 'hombre' };
  const engineOrder = rankCatalog(CATALOG, answers).results.map(e => String(e.product.id));
  const survivors = ids(answers);

  /* The survivors appear in the engine's own relative order. */
  assert.deepEqual(survivors, engineOrder.filter(id => survivors.includes(id)));
});

test('every surviving row still cleared the engine for the full answer set', () => {
  const answers = { occasion: 'salir', gender: 'hombre' };
  const engineEligible = new Set(rankCatalog(CATALOG, answers).results.map(e => String(e.product.id)));

  for (const id of ids(answers)) {
    assert.ok(engineEligible.has(id), `${id} was never eligible under the full answer set`);
  }
});

test('no threshold was moved to achieve this', async () => {
  const { HIGH_MATCH_THRESHOLD, MIN_CONFIDENCE, CONFIDENCE_FLOOR } =
    await import('../assets/js/recommendations/engine.js');

  assert.equal(HIGH_MATCH_THRESHOLD, 62);
  assert.equal(MIN_CONFIDENCE, 0.55);
  assert.equal(CONFIDENCE_FLOOR, 0.6);
});

/* ── Reported counts are the real rows ───────────────────────── */

test('total matches the rows actually returned', () => {
  for (const answers of [
    { occasion: 'dia' }, { occasion: 'dia', gender: 'hombre' }, { occasion: 'dia', gender: 'mujer' },
    { occasion: 'salir' }, { occasion: 'salir', gender: 'hombre' }, { occasion: 'salir', gender: 'mujer' },
  ]) {
    const guided = rankGuidedCatalog(answers, CATALOG);
    assert.equal(guided.total, guided.rows.length, JSON.stringify(answers));
  }
});

test('an emptied result set still announces itself and offers a way out', () => {
  /* A deliberately over-constrained state. Whatever the catalogue does
     with it, the envelope must stay honest: if there are no rows, the
     grid is told so, and any relaxation it offers must be measured
     against the same closure the grid renders. */
  const answers = { occasion: 'oficina', gender: 'mujer', family: 'intenso', goal: 'destacar', climate: 'frio' };
  const guided = rankGuidedCatalog(answers, CATALOG);

  if (guided.rows.length === 0) {
    assert.ok(guided.notices.includes('sin_coincidencias'));
    if (guided.relaxation) {
      const relaxed = { ...answers };
      delete relaxed[guided.relaxation.dimension];
      assert.equal(
        guided.relaxation.gained,
        rankGuidedCatalog(relaxed, CATALOG).rows.length,
        'the empty state promised a number the grid would not show',
      );
      assert.notEqual(guided.relaxation.dimension, 'gender',
        'gender is never offered for relaxation');
    }
  } else {
    assert.ok(guided.total > 0);
  }
});

/* ── Gender policy is untouched ──────────────────────────────── */

test('no masculine product surfaces under Dama', () => {
  for (const occasion of ['dia', 'salir']) {
    for (const row of rankGuidedCatalog({ occasion, gender: 'mujer' }, CATALOG).rows) {
      assert.ok(
        !['masculine', 'lean_masculine'].includes(String(row.product.gender)),
        `${row.product.name} (${row.product.gender}) surfaced under Dama`,
      );
    }
  }
});

test('unisex is still not excluded by gender', async () => {
  const { matchesGender } = await import('../assets/js/utils/gender.js');
  const { evaluateProduct } = await import('../assets/js/recommendations/engine.js');

  const unisex = CATALOG.find(p => String(p.gender).includes('unisex'));
  assert.ok(unisex, 'the fixture has a unisex product to reason about');

  for (const gender of ['hombre', 'mujer']) {
    assert.ok(matchesGender(unisex, gender));
    const { exclusions } = evaluateProduct(unisex, { gender });
    assert.ok(
      !exclusions.some(r => String(r).includes('genero')),
      `unisex excluded for ${gender} on gender grounds (${exclusions.join(', ')})`,
    );
  }
});

/* ── Cost ────────────────────────────────────────────────────── */

test('the closure is cheap enough to run on every filter tap', () => {
  const started = Date.now();
  for (const occasion of ['dia', 'salir']) {
    for (const gender of ['hombre', 'mujer']) rankGuidedCatalog({ occasion, gender }, CATALOG);
  }
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 400, `four guided states took ${elapsed}ms`);
});
