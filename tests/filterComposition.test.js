/* =============================================================
   FILTER COMPOSITION — occasion and gender are not modes.

   ── The production bug ─────────────────────────────────────────────
   Home → "Prefiero elegir yo" → "De día" lands on the catalog with the De
   día guided result. The customer then taps "Caballero" and gets ALL men's
   fragrances: `SearchBar.applyGender()` began with `_state.guide = null`,
   so choosing a gender silently threw the occasion away.

   Occasion and gender were mutually exclusive MODES. A filter row that
   shows two chips promises they compose, and they did not.

   ── What is asserted here ──────────────────────────────────────────
   Behaviour, not implementation: for every pair the brief names, both
   dimensions must survive, each must be individually removable, and every
   surface that reports the state — chips, badge, drawer pill, the quick
   buttons, the URL — must agree with what is actually filtering the grid.
   ============================================================= */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ── Fake DOM: enough for SearchBar to mount and render its chip row ── */

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(n) { this.values.add(n); }
  remove(n) { this.values.delete(n); }
  contains(n) { return this.values.has(n); }
  toggle(n, force) { const on = force ?? !this.contains(n); on ? this.add(n) : this.remove(n); return on; }
}

/* SearchBar builds its bar and drawer as innerHTML strings, then queries the
   result by id. Rather than pull in a DOM library for four assertions, this
   element indexes the `id="…"` attributes it is handed and answers
   `querySelector('#x')` with a stub — enough that the component's own render
   path runs end to end and the tests read what it actually wrote. */
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._byId = new Map();
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
  }

  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = String(html);
    for (const [, id] of this._html.matchAll(/id="([^"]+)"/g)) {
      if (!this._byId.has(id)) this._byId.set(id, new FakeElement());
    }
    _registry.absorb(this._byId);
  }

  addEventListener(t, h) { this.listeners.set(t, h); }
  removeEventListener(t) { this.listeners.delete(t); }
  setAttribute(n, v) { this._attrs[n] = String(v); }
  getAttribute(n) { return this._attrs[n] ?? null; }
  appendChild(c) { this.children.push(c); return c; }
  insertAdjacentElement(_, el) { this.children.push(el); return el; }
  remove() {}
  focus() {}
  closest() { return null; }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this._byId.has(id)) return this._byId.get(id);
    }
    return _registry.get(sel);
  }
  querySelectorAll(sel) { return _registry.getAll(sel); }
}

/* Ids seen anywhere, so `document.getElementById` and cross-element lookups
   resolve the same stub the component wrote into. */
const _registry = {
  map: new Map(),
  get(sel) { return this.map.get(sel) ?? null; },
  getAll() { return []; },
  set(sel, el) { this.map.set(sel, el); },
  absorb(byId) { for (const [id, el] of byId) this.map.set(`#${id}`, el); },
  reset() { this.map.clear(); },
};

const _url = { pathname: '/catalogo.html', search: '', hash: '', href: 'https://rdecants.com/catalogo.html' };
let _replaced = [];

globalThis.window = {
  location: _url,
  history: {
    state: null,
    replaceState(state, _title, url) { _replaced.push(url); _url.href = `https://rdecants.com${url}`; },
    pushState(...args) { this.replaceState(...args); },
  },
  addEventListener() {},
};
globalThis.history = globalThis.window.history;

const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};

const _grid = new FakeElement();
globalThis.document = {
  body: new FakeElement('body'),
  createElement: tag => new FakeElement(tag),
  getElementById: id => (id === 'products-grid' ? _grid : _registry.get(`#${id}`)),
  querySelector: sel => _registry.get(sel),
  addEventListener() {},
  removeEventListener() {},
  get activeElement() { return null; },
};

const { SearchBar } = await import('../assets/js/ui/searchbar.js');
const { loadLiveCatalog } = await import('./helpers/liveCatalog.js');

const CATALOG = loadLiveCatalog();

/* The products the grid was last handed. `SearchBar.init`'s callback is the
   only honest source for "what is actually on screen". */
let _rendered = [];
let _lastMeta = null;

function mount() {
  _registry.reset();
  _replaced = [];
  _rendered = [];
  _lastMeta = null;
  _url.search = '';
  _url.href = 'https://rdecants.com/catalogo.html';

  SearchBar.init(CATALOG, (products, meta) => { _rendered = products; _lastMeta = meta ?? null; });
}

beforeEach(mount);

/** The chip labels currently offered, read from the rendered bar markup. */
function chipKeys() {
  const bar = _registry.get('#sf-active');
  const html = bar?.innerHTML ?? '';
  return [...html.matchAll(/data-clear="([^"]+)"/g)]
    .map(m => m[1])
    .filter(key => key !== 'all');
}

function badgeCount() {
  const badge = _registry.get('#sf-badge');
  return Number(badge?.textContent ?? 0);
}

/* ── The state model ─────────────────────────────────────────────── */

test('a guided occasion survives a gender choice', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  assert.deepEqual(SearchBar.getState().guide, { occasion: 'dia' });

  SearchBar.applyGender('hombre');

  const guide = SearchBar.getState().guide;
  assert.equal(guide.occasion, 'dia', 'the occasion was NOT thrown away');
  assert.equal(guide.gender, 'hombre');
});

test('every home pairing the brief names composes', () => {
  for (const occasion of ['dia', 'salir']) {
    for (const gender of ['hombre', 'mujer']) {
      mount();
      SearchBar.applyGuide({ occasion });
      SearchBar.applyGender(gender);

      const guide = SearchBar.getState().guide;
      assert.deepEqual(guide, { occasion, gender }, `${occasion} + ${gender}`);
    }
  }
});

test('switching gender replaces only the gender', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');
  SearchBar.applyGender('mujer');

  assert.deepEqual(SearchBar.getState().guide, { occasion: 'dia', gender: 'mujer' });
});

test('tapping the active gender again removes only the gender', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');
  const cleared = SearchBar.applyGender('hombre');

  assert.equal(cleared, null, 'the button reports the filter is off');
  assert.deepEqual(SearchBar.getState().guide, { occasion: 'dia' }, 'the occasion stays');
});

test('removing the occasion keeps the gender', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('mujer');
  SearchBar.relaxGuide('occasion');

  assert.deepEqual(SearchBar.getState().guide, { gender: 'mujer' });
});

test('removing the last remaining answer leaves guided mode entirely', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.relaxGuide('occasion');

  assert.equal(SearchBar.getState().guide, null);
  assert.equal(SearchBar.isGuided(), false);
});

test('clearing everything returns the default full catalog', () => {
  SearchBar.applyGuide({ occasion: 'salir' });
  SearchBar.applyGender('hombre');
  SearchBar.clearAll();

  const state = SearchBar.getState();
  assert.equal(state.guide, null);
  assert.equal(state.gender, null);
  assert.equal(_rendered.length, CATALOG.length, 'the whole catalog is back');
});

/* ── One gender, one place ───────────────────────────────────────── */

test('there is never a gender in two places at once', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');

  const state = SearchBar.getState();
  assert.equal(state.gender, null, 'guided mode owns it');
  assert.equal(state.guide.gender, 'hombre');
  assert.equal(SearchBar.effectiveGender(), 'hombre', 'and one reader resolves it');
});

test('outside guided mode the gender still lives on the plain filter state', () => {
  SearchBar.applyGender('mujer');

  const state = SearchBar.getState();
  assert.equal(state.guide, null);
  assert.equal(state.gender, 'mujer');
  assert.equal(SearchBar.effectiveGender(), 'mujer');
});

/* ── The surfaces agree ──────────────────────────────────────────── */

test('each guided dimension gets its own removable chip', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');

  assert.deepEqual(chipKeys(), ['guide:occasion', 'guide:gender'],
    'occasion first, gender second, both removable');
});

test('the badge counts what the chip row shows', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  assert.equal(badgeCount(), 1);

  SearchBar.applyGender('hombre');
  assert.equal(badgeCount(), 2, 'two chips, badge says two');

  SearchBar.relaxGuide('gender');
  assert.equal(badgeCount(), 1);
});

test('the rendered products satisfy the combined state', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  const dayOnly = _rendered.length;

  SearchBar.applyGender('mujer');
  const dayWomen = _rendered.length;

  assert.ok(dayWomen > 0, 'the combination returns something');
  assert.ok(dayWomen <= dayOnly, 'adding a gender narrows, never widens');
  assert.ok(_lastMeta?.guided, 'still the guided engine, not a second one');
  assert.deepEqual(_lastMeta.answers.gender, 'mujer', 'the engine saw the gender');
  assert.deepEqual(_lastMeta.answers.occasion, 'dia', 'and the occasion');
});

test('unisex is never excluded BY GENDER from a gendered result', async () => {
  /* The two-button UI must not start hiding legitimate unisex fragrances.
     This is the semantics change the composition fix could have introduced
     silently: the quick buttons used to run the plain catalog filter
     (`matchesGender`, which admits unisex) and now run the guided engine.
     If those two disagreed about unisex, the same tap would mean different
     things depending on whether the customer had come from a home tile.

     Asserted as the RULE rather than as a count of rendered cards: the live
     fixture happens to contain exactly one unisex product and it is out of
     stock, so an outcome assertion here would be measuring availability. */
  const { matchesGender } = await import('../assets/js/utils/gender.js');
  const { evaluateProduct } = await import('../assets/js/recommendations/engine.js');

  const unisex = CATALOG.find(p => String(p.gender).includes('unisex'));
  assert.ok(unisex, 'the fixture has a unisex product to reason about');

  for (const gender of ['hombre', 'mujer']) {
    assert.ok(matchesGender(unisex, gender), `the catalog filter admits unisex for ${gender}`);

    const { exclusions } = evaluateProduct(unisex, { gender });
    assert.ok(
      !exclusions.some(reason => String(reason).includes('genero') || String(reason).includes('gender')),
      `the guided engine excluded unisex for ${gender} on gender grounds (${exclusions.join(', ')})`,
    );
  }
});

test('a gendered guided result contains only compatible products', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('mujer');

  for (const product of _rendered) {
    assert.ok(
      !['masculine', 'lean_masculine'].includes(String(product.gender)),
      `${product.name} (${product.gender}) surfaced under Dama`,
    );
  }
});

/* ── URL state ───────────────────────────────────────────────────── */

function currentSearch() {
  const last = _replaced[_replaced.length - 1] ?? '';
  const q = last.indexOf('?');
  return q === -1 ? '' : last.slice(q + 1);
}

test('a composed state is serialized into the address bar', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');

  const params = new URLSearchParams(currentSearch());
  assert.equal(params.get('occasion'), 'dia');
  assert.equal(params.get('gender'), 'hombre');
});

test('every pairing round-trips through the URL', async () => {
  const { readGuideFromQuery } = await import('../assets/js/catalog/intents.js');

  for (const occasion of ['dia', 'salir']) {
    for (const gender of ['hombre', 'mujer']) {
      mount();
      SearchBar.applyGuide({ occasion });
      SearchBar.applyGender(gender);

      const restored = readGuideFromQuery(`?${currentSearch()}`);
      assert.deepEqual(restored, { occasion, gender }, `${occasion} + ${gender} did not survive`);
    }
  }
});

test('removing a dimension removes it from the URL too', () => {
  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');
  SearchBar.relaxGuide('gender');

  const params = new URLSearchParams(currentSearch());
  assert.equal(params.get('gender'), null, 'the URL must not describe a filter that is off');
  assert.equal(params.get('occasion'), 'dia');
});

test('the URL is never pushed onto the history stack', () => {
  /* Back has to leave the catalog, not undo one filter tap at a time. */
  const pushed = [];
  const original = globalThis.window.history.pushState;
  globalThis.window.history.pushState = (...args) => { pushed.push(args); };

  SearchBar.applyGuide({ occasion: 'dia' });
  SearchBar.applyGender('hombre');
  SearchBar.relaxGuide('gender');

  globalThis.window.history.pushState = original;
  assert.deepEqual(pushed, [], 'replaceState only');
});

test('legacy shared links still resolve', async () => {
  const { readGuideFromQuery } = await import('../assets/js/catalog/intents.js');

  /* ?intent=citas and ?intent=noche were shared before the taxonomy
     collapsed them into `salir`. They must not 404 into an unranked grid. */
  assert.deepEqual(readGuideFromQuery('?intent=citas'), { occasion: 'salir' });
  assert.deepEqual(readGuideFromQuery('?intent=noche'), { occasion: 'salir', goal: 'destacar' });
  assert.deepEqual(readGuideFromQuery('?intent=dia'), { occasion: 'dia' });
});
