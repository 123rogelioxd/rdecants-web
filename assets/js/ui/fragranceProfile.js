/* =============================================================
   RDECANTS — FRAGRANCE PROFILE (advisor blocks)
   Builds the metadata-driven sections of the product modal:
     • Perfil Olfativo (familia / estilo / vibra / contextos)
     • ¿Para quién es?
     • ¿Cuándo usarlo?
     • Perfil (scores como barras visuales)

   Pure: receives a mapped product, returns HTML strings.
   Defensive: every section renders nothing if its data is missing.
   ============================================================= */

const FAMILY_LABELS = {
  aromatic: 'Aromático', aromatico: 'Aromático',
  woody: 'Amaderado', amaderado: 'Amaderado',
  fresh: 'Fresco', fresco: 'Fresco',
  citrus: 'Cítrico', citrico: 'Cítrico',
  floral: 'Floral',
  oriental: 'Oriental',
  gourmand: 'Gourmand',
  fougere: 'Fougère', 'fougère': 'Fougère',
  'amber-fougere': 'Ámbar Fougère',
  amber: 'Ámbar', ambar: 'Ámbar',
  spicy: 'Especiado', especiado: 'Especiado',
  aquatic: 'Acuático', acuatico: 'Acuático', marine: 'Acuático',
  chypre: 'Chipre',
  leather: 'Cuero', cuero: 'Cuero',
  musky: 'Almizclado', almizclado: 'Almizclado',
  green: 'Verde', verde: 'Verde',
};

const STYLE_LABELS = {
  masculine: 'Masculino', masculino: 'Masculino',
  feminine: 'Femenino', femenino: 'Femenino',
  unisex: 'Unisex',
  modern: 'Moderno', moderno: 'Moderno',
  classic: 'Clásico', clasico: 'Clásico',
  youthful: 'Juvenil', juvenil: 'Juvenil',
  sophisticated: 'Sofisticado', sofisticado: 'Sofisticado',
  bold: 'Audaz', audaz: 'Audaz',
  minimal: 'Minimalista',
  elegant: 'Elegante', elegante: 'Elegante',
  sporty: 'Deportivo', deportivo: 'Deportivo',
  luxurious: 'Lujoso', lujoso: 'Lujoso',
};

const MOOD_LABELS = {
  clean: 'Limpio', limpio: 'Limpio',
  fresh: 'Fresco', fresco: 'Fresco',
  confident: 'Seguro',
  sensual: 'Sensual',
  playful: 'Divertido',
  mysterious: 'Misterioso',
  romantic: 'Romántico', romantico: 'Romántico',
  energetic: 'Energético', energetico: 'Energético',
  relaxed: 'Relajado',
  powerful: 'Poderoso',
  warm: 'Cálido', calido: 'Cálido',
  cool: 'Frío', frio: 'Frío',
  soft: 'Suave',
  intense: 'Intenso',
  joyful: 'Alegre',
};

const CONTEXT_LABELS = {
  office: 'Oficina', oficina: 'Oficina',
  daily: 'Uso diario', diario: 'Uso diario', 'daily-use': 'Uso diario',
  date: 'Citas', citas: 'Citas', 'date-night': 'Citas',
  night: 'Noche', noche: 'Noche', evening: 'Noche',
  summer: 'Verano', verano: 'Verano',
  winter: 'Invierno', invierno: 'Invierno',
  spring: 'Primavera', primavera: 'Primavera',
  fall: 'Otoño', autumn: 'Otoño', otono: 'Otoño',
  formal: 'Formal',
  casual: 'Casual',
  gym: 'Gimnasio', gimnasio: 'Gimnasio',
  university: 'Universidad', school: 'Universidad', escuela: 'Universidad',
  meetings: 'Reuniones', reuniones: 'Reuniones',
  party: 'Fiesta', fiesta: 'Fiesta',
  travel: 'Viajes', viajes: 'Viajes',
  'warm-weather': 'Clima cálido', 'hot-weather': 'Clima cálido',
  'cold-weather': 'Clima frío',
  beach: 'Playa', playa: 'Playa',
  outdoor: 'Aire libre',
  work: 'Trabajo', trabajo: 'Trabajo',
};

const SCORE_LABELS = {
  freshness: 'Frescura', frescura: 'Frescura', fresh: 'Frescura',
  sweetness: 'Dulzor', dulzor: 'Dulzor', sweet: 'Dulzor',
  projection: 'Proyección', proyeccion: 'Proyección',
  longevity: 'Duración', duracion: 'Duración', duration: 'Duración',
  versatility: 'Versatilidad', versatilidad: 'Versatilidad',
};

const SCORE_ORDER = ['freshness', 'sweetness', 'projection', 'longevity', 'versatility'];

/* ── Public API ────────────────────────────────────────────────── */

export function buildFragranceProfileHtml(product) {
  const f = product?.fragrance;
  if (!f) return '';

  return [
    _profileBlock(f),
    _audienceBlock(f),
    _contextBlock(f),
    _scoresBlock(f),
  ].filter(Boolean).join('');
}

/* ── Sections ──────────────────────────────────────────────────── */

function _profileBlock(f) {
  const family = _label(FAMILY_LABELS, f.scent_family_normalized);
  const styles = _labelList(STYLE_LABELS, f.style_tags, 3);
  const moods = _labelList(MOOD_LABELS, f.mood_tags, 3);
  const contexts = _labelList(CONTEXT_LABELS, f.recommended_context_tags, 3);

  if (!family && !styles.length && !moods.length && !contexts.length) return '';

  const rows = [
    family ? _row('Familia', family) : '',
    styles.length ? _row('Estilo', styles.join(' · ')) : '',
    moods.length ? _row('Vibra', moods.join(' · ')) : '',
    contexts.length ? _row('Ideal para', contexts.join(' · ')) : '',
  ].filter(Boolean).join('');

  return `
    <section class="fp-block fp-profile" aria-labelledby="fp-profile-h">
      <h3 class="fp-heading" id="fp-profile-h">Perfil Olfativo</h3>
      <dl class="fp-rows">${rows}</dl>
    </section>`;
}

function _audienceBlock(f) {
  const moods = _labelList(MOOD_LABELS, f.mood_tags, 3).map(s => s.toLowerCase());
  const styles = _labelList(STYLE_LABELS, f.style_tags, 2).map(s => s.toLowerCase());
  const contexts = _labelList(CONTEXT_LABELS, f.recommended_context_tags, 2).map(s => s.toLowerCase());

  const traits = _joinSpanish([...new Set([...moods, ...styles])].slice(0, 3));
  if (!traits) return '';

  let sentence = `Perfecto para alguien que busca un aroma ${traits}`;
  if (contexts.length) {
    sentence += `, ideal para ${_joinSpanish(contexts)}`;
  }
  sentence += '.';

  return `
    <section class="fp-block fp-audience" aria-labelledby="fp-audience-h">
      <h3 class="fp-heading" id="fp-audience-h">¿Para quién es?</h3>
      <p class="fp-sentence">${_escape(sentence)}</p>
    </section>`;
}

function _contextBlock(f) {
  const items = [
    ..._labelList(CONTEXT_LABELS, f.recommended_context_tags, 6),
    ..._labelList(STYLE_LABELS, f.style_tags, 2),
  ];
  const unique = [...new Set(items)].slice(0, 6);
  if (!unique.length) return '';

  return `
    <section class="fp-block fp-when" aria-labelledby="fp-when-h">
      <h3 class="fp-heading" id="fp-when-h">¿Cuándo usarlo?</h3>
      <ul class="fp-checklist">
        ${unique.map(label => `<li><span class="fp-check" aria-hidden="true">✓</span>${_escape(label)}</li>`).join('')}
      </ul>
    </section>`;
}

function _scoresBlock(f) {
  const scores = f.scores;
  if (!scores || typeof scores !== 'object') return '';

  const bars = SCORE_ORDER
    .map(key => {
      const raw = _findScore(scores, key);
      if (raw === null) return null;
      return { key, label: SCORE_LABELS[key] ?? key, pct: _toPercent(raw) };
    })
    .filter(Boolean);

  if (!bars.length) return '';

  return `
    <section class="fp-block fp-scores" aria-labelledby="fp-scores-h">
      <h3 class="fp-heading" id="fp-scores-h">Perfil</h3>
      <ul class="fp-bars">
        ${bars.map(b => `
          <li class="fp-bar">
            <span class="fp-bar-label">${_escape(b.label)}</span>
            <span class="fp-bar-track" role="img"
                  aria-label="${_escape(b.label)} ${b.pct} de 100">
              <span class="fp-bar-fill" style="width:${b.pct}%"></span>
            </span>
          </li>`).join('')}
      </ul>
    </section>`;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function _row(label, value) {
  return `
    <div class="fp-row">
      <dt class="fp-row-label">${_escape(label)}</dt>
      <dd class="fp-row-value">${_escape(value)}</dd>
    </div>`;
}

function _label(map, value) {
  if (!value) return '';
  const key = _normKey(value);
  return map[key] ?? _titleCase(String(value).replace(/[-_]+/g, ' '));
}

function _labelList(map, list, limit) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const label = _label(map, raw);
    if (!label) continue;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

function _findScore(scores, key) {
  const candidates = [key, key + '_es', _spanishScoreKey(key)];
  for (const k of candidates) {
    if (k && Object.prototype.hasOwnProperty.call(scores, k)) {
      const n = Number(scores[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function _spanishScoreKey(key) {
  return ({
    freshness: 'frescura',
    sweetness: 'dulzor',
    projection: 'proyeccion',
    longevity: 'duracion',
    versatility: 'versatilidad',
  })[key] ?? null;
}

/** Accepts 0–1, 0–10, or 0–100; clamps to [0, 100]. */
function _toPercent(n) {
  let v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v <= 1) v *= 100;
  else if (v <= 10) v *= 10;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function _joinSpanish(items) {
  const arr = items.filter(Boolean);
  if (!arr.length) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} y ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;
}

function _normKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function _titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function _escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
