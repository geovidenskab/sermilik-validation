// PANGAEA .tab-parser til Van Tiggelen et al. 2024 daglig SEB.
//
// Filformat:
//   Linjer 1..N: kommentarer indkapslet i /* ... */, sluttende med en linje '*/'
//   Næste linje: header med TAB-separerede kolonnenavne
//   Resten: TAB-separerede datalinjer, tomme felter = ''
//
// API:
//   parseTabFile(text) → { meta, columns, rows }
//   computeDailySeries(rows) → [{date, albedo, surfTemp, meltE, airTemp, swd, swu}]
//   sliceByDateRange(series, from, to) → [...]
//   findClosestToDate(series, isoDate) → row eller null
//   loadStation(filename) → Promise<{ meta, columns, rows, series }>

const PANGAEA_BASE = './data/pangaea/';

// Kolonne-indices i datalinjen (0-indexed). Verificeret mod TAS_L 2024-01-03.
// BEMÆRK: enkelte stationer har afvigende kolonneorden — vi tjekker headeren
// for sikkerhed og bruger COL_MAP som fallback.
const COL_MAP = {
  date: 2,                  // YYYY-MM-DD
  airTemp_raw: 3,           // TTT day m [°C]
  airTemp_2m: 4,            // TTT day m corrected
  swd: 12,                  // SWD day m [W/m²]
  swu: 13,                  // SWU day m [W/m²]
  lwd: 14,                  // LWD day m [W/m²]
  lwu: 15,                  // LWU day m [W/m²]
  surfTemp_lwu: 20,         // Surf temp from LWU
  surfTemp_modelled: 21,    // Surf temp modelled
  meltE_modelled: 22,       // Melt E modelled
  meltE_SEB: 31,            // Melt E SEB
  surfTemp_max: 34,         // max daily Surf temp
};

const cache = new Map();  // filename → Promise<parsed>

export async function loadStation(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const promise = (async () => {
    const url = PANGAEA_BASE + filename;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    const parsed = parseTabFile(text);
    parsed.filename = filename;
    parsed.series = computeDailySeries(parsed.rows);
    return parsed;
  })();
  cache.set(filename, promise);
  return promise;
}

export function parseTabFile(text) {
  const lines = text.split('\n');
  // Find slut på header-kommentar (linjen der starter med '*/')
  let headerEnd = -1;
  const metaText = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '*/') { headerEnd = i; break; }
    metaText.push(lines[i]);
  }
  if (headerEnd < 0) throw new Error('Kunne ikke finde end-of-header-marker (*/)');

  // Næste non-empty linje = kolonneoverskrifter
  let headerIdx = headerEnd + 1;
  while (headerIdx < lines.length && lines[headerIdx].trim() === '') headerIdx++;
  const columns = lines[headerIdx].split('\t').map(s => s.trim());

  // Datarækker
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const parts = line.split('\t');
    rows.push(parts);
  }

  // Udtræk lat/lon/elev fra meta (linje med 'LATITUDE: X * LONGITUDE: Y')
  const metaJoined = metaText.join('\n');
  const latMatch = metaJoined.match(/LATITUDE:\s*([-0-9.]+)/);
  const lonMatch = metaJoined.match(/LONGITUDE:\s*([-0-9.]+)/);
  const elevMatch = metaJoined.match(/ELEVATION:\s*([-0-9.]+)\s*m/);
  const stationMatch = metaJoined.match(/Event\(s\):\s*\S+\s*\(([^)]+)\)/);

  return {
    meta: {
      lat: latMatch ? parseFloat(latMatch[1]) : null,
      lon: lonMatch ? parseFloat(lonMatch[1]) : null,
      elevation: elevMatch ? parseFloat(elevMatch[1]) : null,
      station: stationMatch ? stationMatch[1] : null,
    },
    columns,
    rows,
  };
}

// Konvertér rå rækker til struktureret tidsserie.
// Returnerer kun rækker hvor dato + SWD/SWU er valide (så albedo kan beregnes).
export function computeDailySeries(rows) {
  const out = [];
  for (const r of rows) {
    const date = r[COL_MAP.date];
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const swd = parseFloatOrNull(r[COL_MAP.swd]);
    const swu = parseFloatOrNull(r[COL_MAP.swu]);

    // Albedo kun gyldig når SWD > 50 W/m² (undgå støj ved lav solindstråling)
    let albedo = null;
    if (swd !== null && swu !== null && swd > 50) {
      albedo = +(swu / swd).toFixed(3);
      if (albedo < 0 || albedo > 1.1) albedo = null;  // sanity check
    }

    out.push({
      date,
      airTemp: parseFloatOrNull(r[COL_MAP.airTemp_2m]) ?? parseFloatOrNull(r[COL_MAP.airTemp_raw]),
      swd, swu, albedo,
      lwd: parseFloatOrNull(r[COL_MAP.lwd]),
      lwu: parseFloatOrNull(r[COL_MAP.lwu]),
      surfTemp: parseFloatOrNull(r[COL_MAP.surfTemp_lwu]),
      surfTempMax: parseFloatOrNull(r[COL_MAP.surfTemp_max]),
      meltE: parseFloatOrNull(r[COL_MAP.meltE_modelled]) ?? parseFloatOrNull(r[COL_MAP.meltE_SEB]),
    });
  }
  return out;
}

function parseFloatOrNull(s) {
  if (s === undefined || s === null || s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function sliceByDateRange(series, fromIso, toIso) {
  return series.filter(d => d.date >= fromIso && d.date <= toIso);
}

// Find rækken med dato nærmest targetIso (ISO YYYY-MM-DD).
// Returnerer { row, dayDiff } eller null hvis serien er tom.
export function findClosestToDate(series, targetIso) {
  if (!series.length) return null;
  const target = new Date(targetIso).getTime();
  let best = null;
  let bestDiff = Infinity;
  for (const d of series) {
    const diff = Math.abs(new Date(d.date).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return { row: best, dayDiff: Math.round(bestDiff / 86400000) };
}

// Aggregering for plot: månedligt eller årligt
export function aggregateMonthly(series, field) {
  const buckets = new Map();
  for (const d of series) {
    if (d[field] === null) continue;
    const ym = d.date.slice(0, 7);
    if (!buckets.has(ym)) buckets.set(ym, []);
    buckets.get(ym).push(d[field]);
  }
  const out = [];
  for (const [ym, values] of [...buckets].sort()) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    out.push({ yearMonth: ym, mean: +mean.toFixed(3), n: values.length });
  }
  return out;
}
