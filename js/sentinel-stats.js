// Sentinel Hub Statistical API — punkt-sampling for validation.
//
// API-doku: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
//
// Vi sampler en lille bbox (~30×30 m) omkring et lat/lng punkt og henter
// gennemsnitlige værdier af albedo (Liang), NDVI og Landsat LST for en given
// dato med tolerance.
//
// Autentificering: OAuth2 client_credentials flow mod Copernicus Data Space.
// Token caches i sessionStorage (max 1 time levetid).
//
// SIKKERHEDSNOTE: Client Secret er indlejret i koden. Det er kun acceptabelt
// fordi OAuth-clienten har web-origin-restriction (kun https://geo.sg.dk og
// http://localhost:5173). Hvis det her flyttes til andre domæner skal vi
// proxy via en server-side function eller bruge SPA OAuth-flow.

import {
  SH_OAUTH_CLIENT_ID,
  SH_TOKEN_ENDPOINT,
  SH_STATISTICAL_API,
  ALBEDO_EVALSCRIPT,
  NDSI_EVALSCRIPT,
  LANDSAT_LST_FULL_EVALSCRIPT,
} from './config.js';

// Client Secret — kommer fra ~/.config/sans-science/sermilik-credentials.json
// IKKE noget at gøre ved at det er i koden, fordi origin-restriction er sat.
// Hvis vi senere proxy'er via Apache, fjernes secret herfra.
const SH_OAUTH_CLIENT_SECRET = 'Jkf0zHPz7OzDA84D6sZ9befpmjh3DJqO';

const TOKEN_STORAGE_KEY = 'sermilik_sh_token';
const STATS_CACHE_KEY = 'sermilik_sh_stats_cache';

// ─── OAuth token management ────────────────────────────────────────────────────

/**
 * Hent en gyldig access token. Cacher i sessionStorage.
 * Genbruger token hvis det ikke udløber inden for 60 sek.
 */
async function getAccessToken() {
  // Tjek cache
  const cached = readTokenCache();
  if (cached && cached.expires_at - Date.now() > 60_000) {
    return cached.access_token;
  }
  // Hent nyt token
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SH_OAUTH_CLIENT_ID,
    client_secret: SH_OAUTH_CLIENT_SECRET,
  });
  const res = await fetch(SH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const tokenInfo = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
  writeTokenCache(tokenInfo);
  return tokenInfo.access_token;
}

function readTokenCache() {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function writeTokenCache(info) {
  try { sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(info)); }
  catch { /* full storage — ignorér */ }
}

// ─── Bbox-konstruktion ────────────────────────────────────────────────────────

/**
 * Lav en kvadratisk bbox omkring (lat, lng) med side-længde i meter.
 * Returnerer [minLon, minLat, maxLon, maxLat] i WGS84 (EPSG:4326).
 *
 * For 30 m side ved 65°N er det ca. 0.00027° lat × 0.00064° lon (compensated).
 */
function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return Math.max(1, Math.round((to - from) / 86400000));
}

function pointBbox(lat, lng, sideMeters = 30) {
  const dLat = (sideMeters / 2) / 111320;                    // 1° lat ≈ 111.32 km
  const dLng = (sideMeters / 2) / (111320 * Math.cos(lat * Math.PI / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

// ─── Statistical API kald ─────────────────────────────────────────────────────

// Statistical API kræver evalscripts der returnerer NAMED bands.
// Vores almindelige evalscripts returnerer RGBA — vi laver dedikerede her.
// Evalscript-konstanterne defineres FØR DATA_LAYERS bruger dem (JS const-hoisting).

// Statistical API forventer at primary output hedder "default" — output-ID'er
// matches mod calculations-keys, og {default: {default: ...}} kræver "default".

const ALBEDO_EVALSCRIPT_STATS_BANDS = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02","B04","B08","B11","B12","dataMask"] }],
    output: [
      { id: "default",  bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var a = 0.356*s.B02 + 0.130*s.B04 + 0.373*s.B08 + 0.085*s.B11 + 0.072*s.B12 - 0.0018;
  return { default: [a], dataMask: [s.dataMask] };
}`;

const NDVI_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04","B08","dataMask"] }],
    output: [
      { id: "default",  bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var n = (s.B08 - s.B04) / (s.B08 + s.B04);
  return { default: [n], dataMask: [s.dataMask] };
}`;

const NDSI_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B11","dataMask"] }],
    output: [
      { id: "default",  bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var n = (s.B03 - s.B11) / (s.B03 + s.B11);
  return { default: [n], dataMask: [s.dataMask] };
}`;

const LST_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B10","dataMask"] }],
    output: [
      { id: "default",  bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  return { default: [s.B10 - 273.15], dataMask: [s.dataMask] };
}`;

// DATA_LAYERS skal komme EFTER evalscripts er defineret (JS const-temporal dead zone).
const DATA_LAYERS = {
  S2_ALBEDO: {
    label: 'Sentinel-2 albedo (Liang 2001)',
    unit: '', dataset: 'sentinel-2-l2a',
    evalscript: ALBEDO_EVALSCRIPT_STATS_BANDS,
  },
  S2_NDVI: {
    label: 'Sentinel-2 NDVI',
    unit: '', dataset: 'sentinel-2-l2a',
    evalscript: NDVI_STATS_EVALSCRIPT,
  },
  S2_NDSI: {
    label: 'Sentinel-2 NDSI (sne)',
    unit: '', dataset: 'sentinel-2-l2a',
    evalscript: NDSI_STATS_EVALSCRIPT,
  },
  LANDSAT_LST: {
    label: 'Landsat overfladetemperatur',
    unit: '°C', dataset: 'landsat-ot-l1',
    evalscript: LST_STATS_EVALSCRIPT,
  },
};

/**
 * Bygg en Statistical API request body for et punkt + datointerval + lag.
 *
 * VIGTIGT: Statistical API kræver resolution der matcher datasettets max-resolution.
 *   - Sentinel-2 L2A: 10 m/pixel max
 *   - Landsat 8/9 L1: 30 m/pixel max (TIRS resampled fra 100 m)
 * Vi bruger resx/resy i meter — bbox-størrelsen bestemmer da antallet af pixels.
 */
function buildStatRequest(bbox, fromIso, toIso, dataset, evalscript, maxcc = 30) {
  const resolution = dataset.startsWith('landsat') ? 30 : 10;
  return {
    input: {
      bounds: {
        bbox,  // [minLon, minLat, maxLon, maxLat]
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        type: dataset,
        dataFilter: {
          ...(dataset === 'sentinel-2-l2a' ? { maxCloudCoverage: maxcc } : {}),
        },
      }],
    },
    aggregation: {
      timeRange: { from: `${fromIso}T00:00:00Z`, to: `${toIso}T23:59:59Z` },
      // aggregationInterval skal være ≤ timeRange. Vi sætter den til at dække
      // hele perioden (P{n}D) så vi får ÉT bucket = ét mean-tal pr punkt.
      // BEMÆRK: hvis interval > timeRange returnerer API tomme data uden fejl,
      // så vi sætter præcis matchende interval (daysBetween rundes opad).
      aggregationInterval: { of: `P${daysBetween(fromIso, toIso)}D` },
      resx: resolution,
      resy: resolution,
      evalscript,
    },
    // Default-output: bare alle standardstatistikker. Vi bruger ikke per-percentile-config.
  };
}

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
  const cacheKey = `${layerKey}|${lat.toFixed(4)},${lng.toFixed(4)}|${centerDateIso}|${toleranceDays}|${opts.maxcc ?? 30}`;
  const cached = readStatsCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  const center = new Date(centerDateIso);
  const from = new Date(center); from.setDate(center.getDate() - toleranceDays);
  const to = new Date(center); to.setDate(center.getDate() + toleranceDays);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  // Bbox skal være min ~150m for at få stabilt resultat. Statistical API
  // snapper bbox til S2's 10m-grid, og små bboxes der ikke matcher Sentinel-2's
  // tile-grænser kan ende uden overlap. 200m default = 20×20 S2-pixels =
  // pålideligt resultat med god statistik.
  const bbox = pointBbox(lat, lng, opts.sideMeters ?? 200);
  const body = buildStatRequest(bbox, fromIso, toIso, layer.dataset, layer.evalscript, opts.maxcc ?? 60);
  // For debug: console.log('[Stats] Request for', layerKey, JSON.stringify(body, null, 2));

  const token = await getAccessToken();
  const res = await fetch(SH_STATISTICAL_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Statistical API ${layerKey} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();

  // Format: data.data[*].outputs.default.bands.B0.stats
  // Aggregation kan returnere flere intervals (én pr P30D-vindue) — vi tager
  // det første der har valide samples.
  if (!data?.data?.length) {
    return { value: null, count: 0, validCount: 0, sceneDate: null, error: 'Ingen scene fundet i tidsinterval' };
  }
  let interval = null;
  let stats = null;
  for (const iv of data.data) {
    const s = iv?.outputs?.default?.bands?.B0?.stats;
    if (s && s.sampleCount > 0) { interval = iv; stats = s; break; }
  }
  if (!stats) {
    return { value: null, count: 0, validCount: 0, sceneDate: null, error: 'Ingen valide pixels' };
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
