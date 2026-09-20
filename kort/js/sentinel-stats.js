// Sentinel Hub Statistical API — punkt-sampling for validation og pixel-info.
//
// Kaldene går gennem proxyen /sermilik/api (GEO_site/Sermilik_api/server.js).
// OAuth-nøglen og evalscripts ligger dér — ikke i den offentlige kode. Klienten
// sender kun {layer, lat, lng, side, from, to, maxcc}; proxyen bygger selve
// Statistical API-requesten (P1D-buckets, skymaskering via SCL, width/height i
// pixels) og afviser punkter uden for Danmark og Sermilik.
//
// API-doku: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html

// Lokalt (dev på :5173) kaldes den rigtige proxy; den tillader denne origin.
// Med ?api=local i adressen bruges en proxy der kører lokalt på port 3018.
const STATS_PROXY = (typeof location === 'undefined' || location.hostname === 'geo.sg.dk')
  ? '/sermilik/api/stats'
  : (new URLSearchParams(location.search).get('api') === 'local'
      ? 'http://localhost:3018/api/stats'
      : 'https://geo.sg.dk/sermilik/api/stats');

const STATS_CACHE_KEY = 'sermilik_sh_stats_cache_v4';  // v4: proxy, width/height i pixels, samlet opslag
const MAX_TOLERANCE_DAGE = 30;                         // proxyen tillader højst 62 dages vindue

// Visningsinfo pr. lag. Evalscripts ligger i proxyen.
const DATA_LAYERS = {
  S2_ALBEDO:   { label: 'Sentinel-2 albedo (Liang 2001)', unit: '' },
  S2_NDVI:     { label: 'Sentinel-2 NDVI', unit: '' },
  S2_NDSI:     { label: 'Sentinel-2 NDSI (sne)', unit: '' },
  LANDSAT_LST: { label: 'Landsat overfladetemperatur', unit: '°C' },
};

/**
 * Sample en variabel for ét punkt + dato med tolerance.
 *
 * @param {string} layerKey - nøgle i DATA_LAYERS
 * @param {number} lat
 * @param {number} lng
 * @param {string} centerDateIso - 'YYYY-MM-DD'
 * @param {number} toleranceDays - ± dage rundt om centerDate
 * @param {object} opts - { maxcc, sideMeters }
 * @returns {Promise<{value, count, validCount, sceneDate, error?}>}
 */
export async function samplePoint(layerKey, lat, lng, centerDateIso, toleranceDays = 15, opts = {}) {
  const layer = DATA_LAYERS[layerKey];
  if (!layer) throw new Error(`Ukendt lag: ${layerKey}`);

  // Cache-tjek
  const cacheKey = `${layerKey}|${lat.toFixed(5)},${lng.toFixed(5)}|${Math.round(opts.sideMeters ?? 200)}|${centerDateIso}|${toleranceDays}|${opts.maxcc ?? 60}`;
  const cached = readStatsCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  toleranceDays = Math.min(toleranceDays, MAX_TOLERANCE_DAGE);
  const center = new Date(centerDateIso);
  const from = new Date(center); from.setDate(center.getDate() - toleranceDays);
  const to = new Date(center); to.setDate(center.getDate() + toleranceDays);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const res = await fetch(STATS_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      layer: layerKey, lat, lng,
      side: opts.sideMeters ?? 200,
      from: fromIso, to: toIso,
      maxcc: opts.maxcc ?? 60,
    }),
  });

  if (!res.ok) {
    let besked = `HTTP ${res.status}`;
    try { besked = (await res.json()).error || besked; } catch { /* ikke JSON */ }
    throw new Error(`Satellitopslag fejlede: ${besked}`);
  }
  const data = await res.json();

  // Format: data.data[*].outputs.default.bands.B0.stats
  // P1D-aggregering giver ét bucket pr. dag. Vi vælger den scene-dag der ligger
  // NÆRMEST den ønskede dato og har valide (ikke sky-maskerede) pixels — ikke
  // bare den første i vinduet.
  if (!data?.data?.length) {
    return { value: null, count: 0, validCount: 0, sceneDate: null, error: 'Ingen scene fundet i tidsinterval' };
  }
  const centerMs = new Date(centerDateIso).getTime();
  let interval = null;
  let stats = null;
  let bestDist = Infinity;
  for (const iv of data.data) {
    const s = iv?.outputs?.default?.bands?.B0?.stats;
    if (!s || s.sampleCount <= 0) continue;
    const valid = s.sampleCount - (s.noDataCount || 0);
    if (valid <= 0) continue;   // alt sky-maskeret eller uden data
    const d = Math.abs(new Date(iv.interval?.from).getTime() - centerMs);
    if (d < bestDist) { bestDist = d; interval = iv; stats = s; }
  }
  if (!stats) {
    return { value: null, count: 0, validCount: 0, sceneDate: null, error: 'Ingen skyfri scene i tidsintervallet' };
  }
  const result = {
    value: stats.mean,
    stDev: stats.stDev,
    min: stats.min,
    max: stats.max,
    count: stats.sampleCount,
    validCount: stats.sampleCount - (stats.noDataCount || 0),
    sceneDate: interval.interval?.from,
    fetchedAt: new Date().toISOString(),
  };
  writeStatsCache(cacheKey, result);
  return result;
}

// ─── Samlet opslag: albedo, NDVI og NDSI i ét kald ───────────────────────────
const MULTI_BAAND = { S2_ALBEDO: 'B0', S2_NDVI: 'B1', S2_NDSI: 'B2' };

/**
 * Hent albedo, NDVI og NDSI for et område i ÉT kald til proxyen.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} fromIso - 'YYYY-MM-DD'
 * @param {string} toIso
 * @param {object} opts - { sideMeters, maxcc, prefer: 'latest'|'nearest', wantedIso }
 *   prefer 'latest'  = nyeste skyfri scene i vinduet (matcher kortets mosaik)
 *   prefer 'nearest' = skyfri scene nærmest wantedIso (bestemt dag)
 * @returns {Promise<{sceneDate, layers: {S2_ALBEDO, S2_NDVI, S2_NDSI}, error?}>}
 */
export async function sampleMulti(lat, lng, fromIso, toIso, opts = {}) {
  const side = Math.round(opts.sideMeters ?? 20);
  const maxcc = opts.maxcc ?? 60;
  const prefer = opts.prefer === 'nearest' ? 'nearest' : 'latest';
  const cacheKey = `MULTI|${lat.toFixed(5)},${lng.toFixed(5)}|${side}|${fromIso}|${toIso}|${maxcc}|${prefer}|${opts.wantedIso || ''}`;
  const cached = readStatsCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  const res = await fetch(STATS_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer: 'S2_MULTI', lat, lng, side, from: fromIso, to: toIso, maxcc }),
  });
  if (!res.ok) {
    let besked = `HTTP ${res.status}`;
    try { besked = (await res.json()).error || besked; } catch { /* ikke JSON */ }
    throw new Error(`Satellitopslag fejlede: ${besked}`);
  }
  const data = await res.json();

  // Ét bucket pr. scene-dag. Behold kun dage hvor området ikke er sky-maskeret.
  const gyldige = (data?.data || []).filter(iv => {
    const st = iv?.outputs?.default?.bands?.B0?.stats;
    return st && st.sampleCount - (st.noDataCount || 0) > 0;
  });
  if (!gyldige.length) {
    return { sceneDate: null, layers: {}, error: data?.data?.length ? 'Ingen skyfri scene i perioden' : 'Ingen scene fundet i perioden' };
  }
  const tid = iv => new Date(iv.interval?.from).getTime();
  let valgt;
  if (prefer === 'nearest' && opts.wantedIso) {
    const oensket = new Date(opts.wantedIso).getTime();
    valgt = gyldige.reduce((a, b) => (Math.abs(tid(b) - oensket) < Math.abs(tid(a) - oensket) ? b : a));
  } else {
    valgt = gyldige.reduce((a, b) => (tid(b) > tid(a) ? b : a));
  }
  const layers = {};
  for (const [key, baand] of Object.entries(MULTI_BAAND)) {
    const st = valgt.outputs.default.bands[baand]?.stats;
    if (!st) continue;
    layers[key] = {
      value: st.mean, stDev: st.stDev, min: st.min, max: st.max,
      count: st.sampleCount, validCount: st.sampleCount - (st.noDataCount || 0),
      sceneDate: valgt.interval?.from,
    };
  }
  const result = { sceneDate: valgt.interval?.from, layers, antalSkyfri: gyldige.length, fetchedAt: new Date().toISOString() };
  writeStatsCache(cacheKey, result);
  return result;
}

// ─── Stats cache ──────────────────────────────────────────────────────────────
function readStatsCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(STATS_CACHE_KEY) || '{}');
    return all[key] || null;
  } catch { return null; }
}

function writeStatsCache(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(STATS_CACHE_KEY) || '{}');
    all[key] = value;
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(all));
  } catch { /* full storage */ }
}

// ─── Public: hent alle relevante lag for et punkt ─────────────────────────────

/**
 * Hent satellit-statistik for et validation-punkt.
 * Returns: { S2_ALBEDO: {...}, S2_NDVI: {...}, S2_NDSI: {...}, LANDSAT_LST: {...} }
 */
export async function fetchAllStatsForPoint(lat, lng, dateIso, opts = {}) {
  const results = {};
  // Kør parallel — men separat error-håndtering per lag så én fejl ikke dræber resten
  const layerKeys = ['S2_ALBEDO', 'S2_NDVI', 'S2_NDSI', 'LANDSAT_LST'];
  const tol = opts.toleranceDays ?? 15;
  await Promise.all(layerKeys.map(async (k) => {
    try {
      // Landsat har ~8 dages revisit + lavere coverage — brug større tolerance
      const t = k === 'LANDSAT_LST' ? Math.max(tol, 20) : tol;
      results[k] = await samplePoint(k, lat, lng, dateIso, t, opts);
    } catch (e) {
      results[k] = { value: null, error: e.message };
    }
  }));
  return results;
}

export const STATS_LAYER_INFO = DATA_LAYERS;
