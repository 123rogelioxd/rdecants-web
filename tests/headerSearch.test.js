import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('header search imports the same SearchBar module instance as the catalog', () => {
  const header = read('assets/js/ui/header.js');
  const render = read('assets/js/catalog/render.js');

  /* Single module identity: both import searchbar.js with the SAME bare
     specifier (no ?v= query). A divergent query string would load a second,
     un-initialised SearchBar instance — the exact duplicate-state bug the
     guided-catalog Phase 0 dedup removed. */
  assert.match(header, /from '\.\/searchbar\.js'/);
  assert.match(render, /from '\.\.\/ui\/searchbar\.js'/);
  assert.doesNotMatch(header, /searchbar\.js\?v=/);
  assert.doesNotMatch(render, /searchbar\.js\?v=/);
});

test('header has the only global search input and delegates to SearchBar.applyQuery', () => {
  const html = read('index.html');
  const header = read('assets/js/ui/header.js');

  assert.equal((html.match(/id="hs-input"/g) ?? []).length, 1);
  assert.match(header, /input\.addEventListener\('input'/);
  assert.match(header, /SearchBar\.applyQuery\(q\)/);
});

test('mobile live search remains part of the document scroll instead of taking a body lock', () => {
  const header = read('assets/js/ui/header.js');

  assert.doesNotMatch(header, /scrollLock\.js/);
  assert.doesNotMatch(header, /lockBodyScroll|unlockBodyScroll/);
  assert.match(header, /wrap\.classList\.add\('hs-wrap--open'\)/);
});

test('an active query shows Relevancia and clearing it restores the saved sort', () => {
  const src = read('assets/js/ui/searchbar.js');

  assert.match(src, /<option value="relevance" hidden>Relevancia<\/option>/);
  assert.match(
    src,
    /s\.value = _state\.query\?\.trim\(\) \? 'relevance' : _state\.sort/,
    'the visible sort must follow the effective search order without overwriting the saved sort',
  );
  assert.match(
    src,
    /_state\.sort === 'for_you' && !_state\.query\?\.trim\(\)/,
    'personalization must not replace relevance while a query is active',
  );
});

test('typing Sauvage in the open mobile search does not prevent window scroll', async () => {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(name) { this.values.add(name); }
    remove(name) { this.values.delete(name); }
    contains(name) { return this.values.has(name); }
    toggle(name, force) {
      const on = force ?? !this.contains(name);
      on ? this.add(name) : this.remove(name);
    }
  }

  class FakeElement {
    constructor() {
      this.classList = new FakeClassList();
      this.listeners = new Map();
      this.attributes = new Map();
      this.style = {};
      this.value = '';
      this.hidden = false;
    }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    dispatch(type, event = {}) { this.listeners.get(type)?.({ target: this, ...event }); }
    focus() { this.focused = true; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
  }

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const elements = Object.fromEntries(
    ['hs-wrap', 'hs-input', 'hs-x', 'hs-cancel', 'btn-hs-mobile', 'catalog']
      .map(id => [id, new FakeElement()]),
  );
  const header = new FakeElement();
  const body = new FakeElement();
  elements.catalog.getBoundingClientRect = () => ({ top: 100, bottom: 1200 });
  elements.catalog.scrollIntoView = () => {};

  globalThis.document = {
    body,
    querySelector: selector => selector === '.header' ? header : null,
    getElementById: id => elements[id] ?? null,
  };
  globalThis.window = {
    scrollY: 0,
    innerHeight: 844,
    addEventListener() {},
    scrollTo(_x, y) {
      /* A fixed body cannot advance the document scroll position. */
      if (body.style.position !== 'fixed') this.scrollY = y;
    },
  };

  try {
    const { setupHeader } = await import('../assets/js/ui/header.js');
    setupHeader();

    elements['btn-hs-mobile'].dispatch('click');
    elements['hs-input'].value = 'Sauvage';
    elements['hs-input'].dispatch('input');
    await new Promise(resolve => setTimeout(resolve, 320));

    assert.equal(elements['hs-wrap'].classList.contains('hs-wrap--open'), true);
    assert.notEqual(body.style.position, 'fixed', 'live search must not pin the document body');
    window.scrollTo(0, 600);
    assert.equal(window.scrollY, 600, 'the page scroll position can advance with a query active');

    elements['hs-x'].dispatch('click');
    assert.equal(body.style.position, undefined, 'clearing search leaves no inline scroll lock');
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
