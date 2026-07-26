/* =============================================================
   THE CATALOG AUDITOR

   Runs over every product R Supply OS sends and reports what is missing,
   contradictory or suspicious — with the field to fix upstream and the
   effect on recommendations.

   The rule these tests protect: the storefront is RESISTANT to bad
   metadata but never INVENTS metadata to hide it. A product whose
   description says "unisex" while its gender field says masculine stays in
   the catalog, stays out of the high-confidence recommendations, and lands
   in a report someone can act on.

   Nothing here is fragrance-specific. Torino 21 appears only because the
   generic rules find something in its data, never because it is named.
   ============================================================= */
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import {
  auditProduct, auditCatalog, formatAuditCsv, formatAuditMarkdown,
  SEVERITIES, CLASSIFICATIONS, CLASSIFICATION_LABELS,
} from '../assets/js/recommendations/audit.js';
import { loadLiveCatalog, findProduct } from './helpers/liveCatalog.js';

const CATALOG = loadLiveCatalog();
const REPORT = auditCatalog(CATALOG);

const rowFor = id => REPORT.products.find(r => r.id === id);
const codesFor = id => (rowFor(id)?.issues ?? []).map(i => i.code);

const variant = (size, price, stock = 10) => ({
  size, price, stock, availability: stock,
  available: stock > 0, soldOut: stock <= 0, variant_id: `v${size}`,
});

const GOOD = {
  gender_raw: 'masculine',
  occasions: ['diario', 'oficina'],
  climates: ['calido', 'templado'],
  moods: ['limpio', 'moderno'],
  style_tags: ['fresco'],
  recommendation_tags: ['diario'],
  accords: ['citrico'],
  scent_family_normalized: 'citrico',
  scores: {
    freshness: 80, sweetness: 25, elegance: 65, compliment: 65, projection: 45,
    longevity: 65, versatility: 85, intensity: 40, mass_appeal: 80,
    beginner_friendly: 82, office_safe: 85, night_out: 35, date_night: 55,
    summer: 80, cold_weather: 45, blind_buy_safe: 80,
  },
};

const product = (id, fragrance, extra = {}) => ({
  id, name: id, house: 'House',
  gender: 'gender' in extra ? extra.gender : 'masculine',
  gender_raw: fragrance?.gender_raw ?? ('gender' in extra ? extra.gender : 'masculine'),
  concentration: 'concentration' in extra ? extra.concentration : 'EDP',
  notes: [], desc: extra.desc ?? '', story: extra.desc ?? '',
  badge: extra.badge ?? 'Disponible', stock: extra.stock ?? 10,
  variants: extra.variants ?? [variant(3, 180), variant(5, 300), variant(10, 580)],
  fragrance,
});

/* ── A clean product produces no findings ───────────────────────── */

test('a fully documented product is classified valid with no issues', () => {
  const row = auditProduct(product('Clean', GOOD));
  assert.deepEqual(row.issues, []);
  assert.equal(row.classification, 'valida');
  assert.deepEqual(row.classifications, ['valida']);
  assert.equal(row.worstSeverity, null);
});

/* ── Each rule, on its own ──────────────────────────────────────── */

const RULE_CASES = [
  ['gender_missing', 'critical', 'no_apta_para_alta_confianza',
    product('NoGender', { ...GOOD, gender_raw: null }, { gender: null })],
  ['gender_unrecognized', 'critical', 'sospechosa',
    product('WeirdGender', { ...GOOD, gender_raw: 'androgino-premium' }, { gender: 'androgino-premium' })],
  ['gender_contradicts_description', 'high', 'contradictoria',
    product('SaysUnisex', GOOD, { desc: 'fragancia unisex frutal muy versátil' })],
  ['scores_missing', 'critical', 'no_apta_para_alta_confianza',
    product('NoScores', { ...GOOD, scores: undefined })],
  ['scores_partial', 'high', 'sospechosa',
    product('HalfScores', { ...GOOD, scores: { longevity: 70, blind_buy_safe: 60, beginner_friendly: 60 } })],
  ['scores_invalid', 'high', 'sospechosa',
    product('BadScores', { ...GOOD, scores: { ...GOOD.scores, projection: 500 } })],
  ['occasions_absent', 'critical', 'no_apta_para_alta_confianza',
    product('NoOccasions', { ...GOOD, occasions: [], recommendation_tags: [], moods: [], style_tags: [] })],
  ['occasions_empty_but_tagged', 'high', 'sospechosa',
    product('TaggedOnly', { ...GOOD, occasions: [] })],
  ['climate_values_inside_occasions', 'medium', 'sospechosa',
    product('Misfiled', { ...GOOD, occasions: ['diario', 'calor'] })],
  ['occasions_unknown_values', 'low', 'sospechosa',
    product('WeirdOccasion', { ...GOOD, occasions: ['diario', 'submarinismo'] })],
  ['climates_absent', 'high', 'incompleta',
    product('NoClimate', { ...GOOD, climates: [], climate_tags: [], seasons: [] })],
  ['scent_family_not_normalized', 'medium', 'incompleta',
    product('LooseFamily', { ...GOOD, scent_family_normalized: null, family: 'aromatico citrico' })],
  ['family_absent', 'medium', 'incompleta',
    product('NoFamily', { ...GOOD, scent_family_normalized: null, family: null, fragrance_family: null, accords: [] })],
  ['style_and_recommendation_tags_absent', 'medium', 'incompleta',
    product('NoTags', { ...GOOD, style_tags: [], recommendation_tags: [], commercial_roles: [], signature_keywords: [] })],
  ['moods_absent', 'medium', 'incompleta',
    product('NoMoods', { ...GOOD, moods: [], mood_tags: [] })],
  ['concentration_missing', 'low', 'incompleta',
    product('NoConcentration', GOOD, { concentration: null })],
  ['not_sellable', 'high', 'no_apta_para_alta_confianza',
    product('SoldOut', GOOD, { stock: 0, variants: [variant(5, 300, 0)] })],
  ['missing_core_presentation', 'medium', 'incompleta',
    product('OnlyFive', GOOD, { variants: [variant(5, 300)] })],
  ['variant_without_id', 'critical', 'no_apta_para_alta_confianza',
    product('DeadButton', GOOD, { variants: [{ ...variant(5, 300), variant_id: null }] })],
  ['badge_contradicts_stock', 'medium', 'contradictoria',
    product('FakeScarcity', GOOD, { badge: 'ÚLTIMAS UNIDADES', stock: 47 })],
  ['night_tag_vs_low_night_score', 'high', 'contradictoria',
    product('FakeNight', { ...GOOD, occasions: ['noche'], scores: { ...GOOD.scores, night_out: 20 } })],
  ['office_tag_vs_low_office_safe', 'high', 'contradictoria',
    product('FakeOffice', { ...GOOD, occasions: ['oficina'], scores: { ...GOOD.scores, office_safe: 15 } })],
  ['office_tag_vs_extreme_projection', 'medium', 'contradictoria',
    product('LoudOffice', { ...GOOD, occasions: ['oficina'], scores: { ...GOOD.scores, projection: 95 } })],
  ['warm_tag_vs_low_summer_score', 'high', 'contradictoria',
    product('FakeWarm', { ...GOOD, climates: ['calido'], scores: { ...GOOD.scores, summer: 20 } })],
  ['cold_tag_vs_low_cold_score', 'high', 'contradictoria',
    product('FakeCold', { ...GOOD, climates: ['frio'], scores: { ...GOOD.scores, cold_weather: 20 } })],
  ['school_tag_vs_high_intensity', 'medium', 'contradictoria',
    product('IntenseSchool', { ...GOOD, occasions: ['escuela'], scores: { ...GOOD.scores, intensity: 95 } })],
  ['gift_tag_vs_risky_blind_buy', 'medium', 'contradictoria',
    product('RiskyGift', { ...GOOD, occasions: ['regalo'], scores: { ...GOOD.scores, blind_buy_safe: 15 } })],
];

for (const [code, severity, classification, fixture] of RULE_CASES) {
  test(`rule: ${code}`, () => {
    const row = auditProduct(fixture);
    const issue = row.issues.find(i => i.code === code);
    assert.ok(issue, `${code} not raised. Got: ${row.issues.map(i => i.code).join(', ')}`);
    assert.equal(issue.severity, severity);
    assert.ok(row.classifications.includes(classification),
      `${code} → ${row.classifications.join(',')}, expected ${classification}`);

    /* Every finding must be actionable: what is wrong, which field to fix,
       and what it costs. A report without those is just noise. */
    assert.ok(issue.field, `${code}: no field`);
    assert.ok(issue.message && issue.message.length > 10, `${code}: no message`);
    assert.ok(issue.fixField, `${code}: nothing to fix upstream`);
    assert.ok(issue.effect && issue.effect.length > 15, `${code}: no stated effect`);
  });
}

/* ── Classification ─────────────────────────────────────────────── */

test('the classification is the most severe bucket that applies, and the rest are kept', () => {
  const bad = product('VeryBad', {
    ...GOOD,
    gender_raw: null,
    occasions: ['oficina'],
    climates: [],
    scores: { ...GOOD.scores, office_safe: 10 },
  }, { gender: null, concentration: null });

  const row = auditProduct(bad);
  assert.equal(row.classification, 'no_apta_para_alta_confianza', 'the worst bucket leads');
  assert.ok(row.classifications.includes('contradictoria'), 'but the contradiction is not hidden');
  assert.ok(row.classifications.includes('incompleta'));
  assert.equal(row.worstSeverity, 'critical');
});

test('issues are ordered worst first', () => {
  const row = auditProduct(product('Mixed', {
    ...GOOD, scores: undefined, moods: [],
  }, { concentration: null }));
  const order = row.issues.map(i => SEVERITIES.indexOf(i.severity));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('every classification has a human label', () => {
  for (const key of CLASSIFICATIONS) {
    assert.ok(CLASSIFICATION_LABELS[key], key);
  }
});

test('auditing junk never throws', () => {
  for (const value of [null, undefined, {}, { id: 'x' }, { id: 'y', variants: 'no' }]) {
    assert.doesNotThrow(() => auditProduct(value), JSON.stringify(value));
  }
  assert.doesNotThrow(() => auditCatalog([null, undefined, {}]));
  assert.equal(auditCatalog(null).summary.total, 0);
});

/* ── The whole live catalog ─────────────────────────────────────── */

test('every live product is audited and classified', () => {
  assert.equal(REPORT.products.length, CATALOG.length);
  assert.equal(REPORT.summary.total, CATALOG.length);

  const counted = Object.values(REPORT.summary.byClassification).reduce((a, b) => a + b, 0);
  assert.equal(counted, CATALOG.length, 'every product lands in exactly one bucket');

  for (const row of REPORT.products) {
    assert.ok(row.id, 'a row without an id is unusable');
    assert.ok(CLASSIFICATIONS.includes(row.classification), `${row.id}: ${row.classification}`);
    /* The report has to show BOTH what arrived and what we made of it. */
    assert.ok('raw' in row.gender && 'normalized' in row.gender, row.id);
    assert.ok(Array.isArray(row.normalized.occasions), row.id);
    assert.ok(Array.isArray(row.normalized.scoreKeys), row.id);
  }
});

test('the audit finds real defects in the live catalog, not zero and not everything', () => {
  const s = REPORT.summary;
  assert.ok(s.withIssues > 0, 'a report that finds nothing is not auditing');
  assert.ok(s.clean > 0, 'a report that flags everything is not discriminating');
  assert.ok(s.recommendable > 0 && s.recommendable < s.total);
  assert.ok(s.byClassification.no_apta_para_alta_confianza > 0);
  assert.ok(s.byClassification.contradictoria > 0);
});

test('the products the auditor rules out are exactly the ones the engine refuses', async () => {
  const { rankCatalog } = await import('../assets/js/recommendations/engine.js');
  const answers = { gender: 'hombre', age: '25-34', occasion: 'dia', goal: 'versatil', climate: 'templado' };
  const { all } = rankCatalog(CATALOG, answers);

  const blockedByAudit = new Set(REPORT.products
    .filter(r => r.classifications.includes('no_apta_para_alta_confianza'))
    .map(r => r.id));

  for (const e of all) {
    if (!blockedByAudit.has(String(e.product.id))) continue;
    assert.equal(e.eligible, false,
      `${e.product.id} is flagged not-recommendable but the engine accepted it`);
  }
});

/* The known live anomalies, pinned. These are the rows the delivery report
   quotes; a silent change here means the backend data moved. */
test('the documented live anomalies are still found', () => {
  /* Five products whose own copy says "unisex" while the field says lean_masculine. */
  const contradictsCopy = REPORT.products
    .filter(r => r.issues.some(i => i.code === 'gender_contradicts_description'))
    .map(r => r.id).sort();
  assert.deepEqual(contradictsCopy, [
    'CREED-MILLESIME-IMPERIAL',
    'MAISON-ALHAMBRA-JEAN-LOWE-AZURE',
    'MAISON-ALHAMBRA-JEAN-LOWE-VIBE',
    'XERJOFF-ERBA-GOLD',
    'XERJOFF-ERBA-PURA',
  ]);

  /* The one product with no gender at all. */
  assert.ok(codesFor('XERJOFF-NAXOS').includes('gender_missing'));

  /* The one half-filled scores object. */
  assert.ok(codesFor('VALENTINO-BORN-IN-ROMA-INTENSE').includes('scores_partial'));

  /* Torino 21 appears because a GENERIC rule found something, not because it
     is named: its occasions array is empty while its tags describe occasions. */
  const torino = rowFor('XERJOFF-TORINO-21');
  assert.ok(torino.issues.some(i => i.code === 'occasions_empty_but_tagged'));
  assert.equal(torino.gender.raw, 'lean_masculine');
  assert.equal(torino.gender.normalized, 'lean_masculine');

  /* And the two sold-out products. */
  const notSellable = REPORT.products
    .filter(r => r.issues.some(i => i.code === 'not_sellable')).map(r => r.id).sort();
  assert.deepEqual(notSellable, ['ARMAF-ODYSSEY-BAHAMAS', 'RASASSI-HAWAS-VERDE-K9WD']);
});

test('no rule is dead code — every registered rule fires somewhere', () => {
  const firedOnFixtures = new Set(RULE_CASES.map(([code]) => code));
  const firedOnLive = new Set(Object.keys(REPORT.summary.byCode));
  const documented = new Set([...firedOnFixtures, ...firedOnLive]);
  /* Every rule in RULE_CASES is proven to fire; this guards the reverse —
     that the live report does not contain a code no test knows about. */
  for (const code of firedOnLive) {
    assert.ok(documented.has(code), `${code} appears in the live report but has no test`);
  }
  assert.ok(firedOnLive.size >= 10, `only ${firedOnLive.size} distinct findings in the live catalog`);
});

/* ── Exports ────────────────────────────────────────────────────── */

test('the CSV export has one row per issue and quotes safely', () => {
  const csv = formatAuditCsv(REPORT);
  const lines = csv.split('\n');
  const totalIssues = REPORT.products.reduce((sum, r) => sum + r.issues.length, 0);

  assert.equal(lines.length, totalIssues + 1, 'header plus one row per issue');
  assert.match(lines[0], /^product_id,name,house,classification,severity,code,field,/);

  /* Every row must parse to exactly the header's column count — otherwise a
     comma or a quote inside a message silently shifts a spreadsheet column. */
  const columns = parseCsvRow(lines[0]).length;
  for (const line of lines.slice(1)) {
    assert.equal(parseCsvRow(line).length, columns, `column drift: ${line.slice(0, 140)}`);
  }

  /* And the values survive the round trip intact, quotes and all. */
  const first = REPORT.products.find(r => r.issues.length);
  const firstRow = parseCsvRow(lines.find(l => l.startsWith(first.id)));
  assert.equal(firstRow[0], first.id);
  assert.equal(firstRow[9], first.issues[0].message);
});

/* Minimal RFC-4180 reader, so the export is checked by parsing rather than by
   guessing at a regex. */
function parseCsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

test('the markdown export is readable and states the fix and the effect for each row', () => {
  const md = formatAuditMarkdown(REPORT);
  assert.match(md, /^# Auditoría de metadata del catálogo/);
  assert.match(md, /Corregir en R Supply OS/);
  assert.match(md, /Efecto en recomendaciones/);
  assert.match(md, /Valores recibidos vs\. normalizados/);

  for (const key of CLASSIFICATIONS) {
    assert.ok(md.includes(CLASSIFICATION_LABELS[key]), key);
  }
  /* Every product appears in the per-product table, clean ones included. */
  for (const row of REPORT.products) {
    assert.ok(md.includes(`\`${row.id}\``), `${row.id} missing from the report`);
  }
  /* Pipes inside a value would break the table. */
  const tableLines = md.split('\n').filter(l => l.startsWith('|'));
  assert.ok(tableLines.length > REPORT.products.length);
});

/* The previous engine carried a `knownHeavyNight` list of seven fragrance
   NAMES used to fake contradictions the metadata could have expressed. This
   guards against that ever coming back. Comments are stripped first: naming a
   case in a comment is documentation, naming it in a branch is a hack. */
function executableSource(file) {
  const { readFileSync } = require('node:fs');
  return readFileSync(new URL(`../assets/js/recommendations/${file}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .toLowerCase();
}

const NEVER_NAMED = [
  'torino', 'sauvage', 'erba', 'xerjoff', 'creed', 'yara', 'cloud', 'hawas',
  'le male', 'spicebomb', '9pm', 'invictus', 'stronger with you', 'naxos',
  'coco mademoiselle', 'jean lowe', 'millesime',
];

test('no recommendation module branches on a product name', () => {
  for (const file of ['engine.js', 'normalize.js', 'assistant.js', 'audit.js']) {
    const source = executableSource(file);
    for (const name of NEVER_NAMED) {
      /* Word-bounded: "herbal" legitimately contains "erba". None of the
         names in NEVER_NAMED contain regex metacharacters. */
      const pattern = new RegExp(String.raw`\b` + name + String.raw`\b`);
      assert.ok(!pattern.test(source), `${file} names "${name}" in executable code`);
    }
    assert.ok(!/\.name\s*===\s*['"]/.test(source), `${file} has a product-name equality check`);
    assert.ok(!/product\.(name|house|slug)\s*[.=]?\s*(includes|startswith|match)/.test(source),
      `${file} matches against a product name`);
  }
});

test('no recommendation module is non-deterministic', () => {
  for (const file of ['engine.js', 'normalize.js', 'assistant.js', 'audit.js']) {
    const source = executableSource(file);
    assert.ok(!/math\.random/.test(source), `${file} uses Math.random`);
    assert.ok(!/date\.now\(\)|new date\(/.test(source), `${file} reads the clock`);
  }
});
