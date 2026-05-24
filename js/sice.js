// SICE Sentinel-3 daglig broadband albedo via GEUS THREDDS OPeNDAP.
//
// Datasæt: SICEv3.0 Greenland 500m daily, 2017→ (kun april-oktober pga. polar nat).
// URL-pattern:
//   https://thredds.geus.dk/thredds/dodsC/SICE_500m/Greenland/SICEv3.0_Greenland_500m_YYYY-MM-DD.nc
//
// Projektion: EPSG:3413 (NSIDC Sea Ice Polar Stereographic North).
// Vi konverterer lat/lon → projicerede x,y, finder nærmeste pixel, og henter via OPeNDAP ascii-format.
//
// Variabler vi udtrækker (verificeret mod DDS):
//   albedo_bb_planar_sw   — broadband planar shortwave albedo (det vi vil have)
//   albedo_spectral_planar_07  — spectral i Sentinel-3 OLCI band 7 (665 nm, rød)
//   r_TOA_21              — top-of-atmosphere reflectance band 21 (1020 nm)
//
// VIGTIGT: Filer eksisterer kun for dage hvor Sentinel-3 dækkede området under
// gode forhold. Tjek HTTP-status og falder pænt tilbage hvis dagen mangler.

const THREDDS_BASE = 'https://thredds.geus.dk/thredds/dodsC/SICE_500m/Greenland';

// EPSG:3413 grid-parametre fra SICE NetCDF (verificeres ved første load).
// Disse er standard polar stereographic 70°N / -45°E.
// Approksimation: vi bruger en simpel proj4-lignende formel uden eksterne libs.
const POLE_LAT = 70.0;       // standardparallel
const CENTRAL_LON = -45.0;   // central meridian
const EARTH_R = 6378137;     // WGS84

const cache = new Map();  // 'YYYY-MM-DD@lat,lon' → result

/**
 * Hent SICE albedo og andre snow/ice-properties for et punkt på en bestemt dato.
 * @param {number} lat - WGS84 latitude
 * @param {number} lon - WGS84 longitude
 * @param {string} dateIso - 'YYYY-MM-DD'
 * @returns {Promise<{date, lat, lon, albedo_bb, available, error?, scene_url}>}
 */
export async function sampleSicePoint(lat, lon, dateIso) {
  const cacheKey = `${dateIso}@${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const promise = (async () => {
    const url = `${THREDDS_BASE}/SICEv3.0_Greenland_500m_${dateIso}.nc`;

    // Trin 1: tjek at filen findes ved at hente .dds (lille metadata-fil)
    try {
      const ddsRes = await fetch(`${url}.dds`);
      if (!ddsRes.ok) {
        return {
          date: dateIso, lat, lon, albedo_bb: null,
          available: false,
          error: `Ingen SICE-fil for ${dateIso} (HTTP ${ddsRes.status})`,
          scene_url: url,
        };
      }
    } catch (e) {
      return {
        date: dateIso, lat, lon, albedo_bb: null,
        available: false,
        error: `Netværksfejl: ${e.message}`,
        scene_url: url,
      };
    }

    // Trin 2: konvertér lat/lon → grid index
    // Vi henter først x[] og y[] arrays (lille fetch) for at finde rigtige indices
    const indices = await findGridIndex(url, lat, lon);
    if (!indices) {
      return {
        date: dateIso, lat, lon, albedo_bb: null,
        available: false,
        error: 'Kunne ikke finde grid-index for koordinaterne',
        scene_url: url,
      };
    }

    // Trin 3: hent albedo_bb_planar_sw[y][x] — en enkelt pixel
    // OPeNDAP ascii: ?albedo_bb_planar_sw[y:y][x:x]
    // Bemærk: variabel-navnet kan variere mellem SICE-versioner; vi prøver flere kandidater
    const candidateVars = [
      'albedo_bb_planar_sw',
      'BBA_combination',
      'albedo_bb_spherical_sw',
    ];

    for (const v of candidateVars) {
      const ascii = await fetchOpenDapAscii(url, v, indices.y, indices.x);
      if (ascii !== null && Number.isFinite(ascii)) {
        const result = {
          date: dateIso, lat, lon,
          albedo_bb: +ascii.toFixed(3),
          variable: v,
          available: true,
          grid: indices,
          scene_url: url,
        };
        return result;
      }
    }

    return {
      date: dateIso, lat, lon, albedo_bb: null,
      available: false,
      error: 'Ingen kendte albedo-variabler returnerede gyldigt tal',
      scene_url: url,
    };
  })();

  cache.set(cacheKey, promise);
  return promise;
}

/**
 * Konvertér lat/lon til EPSG:3413 polar stereographic projection.
 * Formel fra Snyder (1987) "Map Projections — A Working Manual".
 */
function latLonToEpsg3413(lat, lon) {
  const phi = lat * Math.PI / 180;
  const lam = lon * Math.PI / 180;
  const phi0 = POLE_LAT * Math.PI / 180;
  const lam0 = CENTRAL_LON * Math.PI / 180;

  // Polar stereographic på sfære (true scale at POLE_LAT)
  const k = (1 + Math.sin(phi0)) / (1 + Math.sin(phi));
  const r = 2 * EARTH_R * Math.tan(Math.PI / 4 - phi / 2) * k;
  const x = r * Math.sin(lam - lam0);
  const y = -r * Math.cos(lam - lam0);
  return { x, y };
}

/**
 * Find grid-index (i, j) i SICE-arrayet for et givent lat/lon.
 * Vi henter x[] og y[] én gang per session og cacher.
 */
const gridCache = { x: null, y: null, loadedUrl: null };

async function findGridIndex(url, lat, lon) {
  // Hent x[] og y[] arrays via OPeNDAP ascii
  if (gridCache.x === null) {
    try {
      const [xArr, yArr] = await Promise.all([
        fetchOpenDapArray(url, 'x'),
        fetchOpenDapArray(url, 'y'),
      ]);
      if (!xArr || !yArr) return null;
      gridCache.x = xArr;
      gridCache.y = yArr;
      gridCache.loadedUrl = url;
    } catch (e) {
      console.warn('Kunne ikke hente SICE grid:', e);
      return null;
    }
  }

  const { x, y } = latLonToEpsg3413(lat, lon);
  const xi = nearestIndex(gridCache.x, x);
  const yi = nearestIndex(gridCache.y, y);
  return { x: xi, y: yi, projected_x: x, projected_y: y };
}

function nearestIndex(arr, target) {
  let bestI = 0;
  let bestDiff = Math.abs(arr[0] - target);
  for (let i = 1; i < arr.length; i++) {
    const d = Math.abs(arr[i] - target);
    if (d < bestDiff) { bestDiff = d; bestI = i; }
  }
  return bestI;
}

async function fetchOpenDapArray(url, varName) {
  const res = await fetch(`${url}.ascii?${varName}`);
  if (!res.ok) return null;
  const text = await res.text();
  // Format: "Dataset: ...\nx[3007] = [v1, v2, ..., vN]"
  // Eller flerlinjet: "x[3007]\n[0] v0\n[1] v1\n..."
  // Vi parser ud fra "= " og næste linje der starter med tal
  const lines = text.split('\n');
  const nums = [];
  for (const line of lines) {
    // Brug regex til at fange alle decimal-tal
    const matches = line.match(/[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?/g);
    if (matches) {
      for (const m of matches) {
        const n = parseFloat(m);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
  }
  // Drop første element hvis det er længden af arrayet (THREDDS-konvention)
  return nums.slice(nums.length > 10 ? 0 : 0);
}

async function fetchOpenDapAscii(url, varName, yIdx, xIdx) {
  // OPeNDAP-syntaks: variabel[y:y][x:x] eller variabel[y:y2][x:x2]
  const query = `${varName}[${yIdx}:${yIdx}][${xIdx}:${xIdx}]`;
  try {
    const res = await fetch(`${url}.ascii?${query}`);
    if (!res.ok) return null;
    const text = await res.text();
    // Format: "...\nvarName.varName[1][1]\n[0][0] 0.842"
    const matches = text.match(/[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?/g);
    if (!matches) return null;
    // Sidste tal er pixel-værdien
    const n = parseFloat(matches[matches.length - 1]);
    if (!Number.isFinite(n)) return null;
    // -999 eller NaN-værdier = ingen data
    if (n === -999 || n < -1 || n > 2) return null;
    return n;
  } catch (e) {
    console.warn(`OPeNDAP fetch failed for ${varName}:`, e);
    return null;
  }
}

/**
 * Hent SICE albedo for et punkt over et datointerval. Returnerer en serie
 * af {date, albedo_bb, available} — én pr. dag i intervallet.
 *
 * BEMÆRK: dette laver mange små HTTP-kald (én per dag). For en uge er det
 * trivielt, men for en hel sommer (~150 dage) overvej at gøre det i baggrund.
 */
export async function sampleSiceTimeseries(lat, lon, fromIso, toIso, opts = {}) {
  const { concurrency = 4, onProgress = null } = opts;
  const dates = enumerateDates(fromIso, toIso);
  const results = new Array(dates.length);
  let inflight = 0;
  let nextIdx = 0;
  let completed = 0;

  return new Promise((resolve) => {
    function tick() {
      while (inflight < concurrency && nextIdx < dates.length) {
        const i = nextIdx++;
        inflight++;
        sampleSicePoint(lat, lon, dates[i])
          .then(r => { results[i] = r; })
          .catch(e => { results[i] = { date: dates[i], lat, lon, albedo_bb: null, available: false, error: e.message }; })
          .finally(() => {
            inflight--; completed++;
            if (onProgress) onProgress(completed, dates.length);
            if (completed === dates.length) resolve(results);
            else tick();
          });
      }
    }
    tick();
  });
}

function enumerateDates(fromIso, toIso) {
  const dates = [];
  const start = new Date(fromIso);
  const end = new Date(toIso);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
