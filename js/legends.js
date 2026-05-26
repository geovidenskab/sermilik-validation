// Signaturforklaringer for alle satellit-lag.
//
// To typer legends:
//   - 'gradient': kvantitativ farveskala med numeriske grænser (NDSI, Albedo, NDWI, LST)
//   - 'rgb-bands': RGB-komposit der viser hvad de tre kanaler er (TrueColor, SWIR, ...)
//
// Farver er udledt direkte fra evalscriptene i config.js, så de matcher 1:1.

// Hjælper: vendt liste til at lave en CSS-gradient (browseren går top-bottom)
const grad = (stops) => stops.map(([color, pct]) => `${color} ${pct}%`).join(', ');

export const LEGENDS = {
  // ─── Glaciologiske indekser (custom evalscript) ──────────────────────────────
  NDSI: {
    title: 'NDSI — Normalized Difference Snow Index',
    type: 'gradient',
    unit: '',
    description: '(B3−B11)/(B3+B11). Adskiller sne, firn, bar is og jord/debris.',
    stops: [
      { value: '1.0', label: 'frisk sne', color: '#ffffff' },
      { value: '0.8', label: '', color: '#e1f2ff' },
      { value: '0.6', label: 'firn', color: '#b3e6f2' },
      { value: '0.4', label: '', color: '#f2d966' },
      { value: '0.2', label: 'bar is', color: '#e69940' },
      { value: '0.0', label: '', color: '#a6662e' },
      { value: '−0.1', label: 'jord / debris', color: '#73401f' },
    ],
  },

  ALBEDO: {
    title: 'Albedo (broadband shortwave, Liang 2001)',
    type: 'gradient',
    unit: 'andel reflekteret stråling (0-1)',
    description: 'Hvor meget af solens kortbølgede stråling overfladen kaster tilbage.',
    stops: [
      { value: '0.85', label: 'frisk sne', color: '#ffffff' },
      { value: '0.75', label: '', color: '#d9f2fa' },
      { value: '0.65', label: 'firn', color: '#e6f2d9' },
      { value: '0.55', label: '', color: '#f2d973' },
      { value: '0.45', label: 'bar is', color: '#f29940' },
      { value: '0.35', label: '', color: '#cc5944' },
      { value: '0.25', label: 'mørk is / debris', color: '#8c2e59' },
      { value: '0.15', label: 'lav (smelt-intens)', color: '#1a0533' },
    ],
  },

  NDWI_LAKES: {
    title: 'NDWI — smeltesøer (McFeeters)',
    type: 'gradient',
    unit: '',
    description: '(B3−B8)/(B3+B8). Detekterer overfladevand; resten transparent.',
    stops: [
      { value: '> 0.3', label: 'dybt vand', color: '#0d66d9' },
      { value: '0.15', label: 'lavt vand', color: '#40bff2' },
      { value: '0.0', label: 'fugtigt', color: '#8ccdff' },
      { value: '< 0.0', label: 'tør', color: 'transparent' },
    ],
  },

  // ─── Landsat termiske lag (TIRS B10 → brightness temperature) ────────────────
  LANDSAT_LST_FULL: {
    title: 'Landsat overfladetemperatur (bred skala)',
    type: 'gradient',
    unit: '°C — brightness temperature, B10 (~11 μm)',
    description: 'TIRS L1, ikke atmosfærisk korrigeret. Afvigelse ±2-5 °C i fugtig luft.',
    stops: [
      { value: '+20', label: 'varm', color: '#800000' },
      { value: '+15', label: '', color: '#d91a0d' },
      { value: '+10', label: '', color: '#ff5933' },
      { value: '+5', label: '', color: '#ffa633' },
      { value: '0', label: 'frysepunkt', color: '#fff280' },
      { value: '−5', label: '', color: '#b3d9ff' },
      { value: '−10', label: '', color: '#66a6f2' },
      { value: '−20', label: '', color: '#1a3399' },
      { value: '−30', label: 'meget kold', color: '#0d004d' },
    ],
  },

  LANDSAT_LST_SUMMER: {
    title: 'Landsat sommer-temperatur (smal skala)',
    type: 'gradient',
    unit: '°C — brightness temperature, B10',
    description: 'Smallere ramme til sommerforhold. Tydeligt skift ved 0 °C.',
    stops: [
      { value: '+16', label: 'varm', color: '#800000' },
      { value: '+12', label: '', color: '#cc260d' },
      { value: '+8', label: '', color: '#ff9933' },
      { value: '+5', label: '', color: '#ffd966' },
      { value: '+2', label: '', color: '#fffab3' },
      { value: '0', label: 'frysepunkt', color: '#b3d9ff' },
      { value: '−2', label: '', color: '#73a6f2' },
      { value: '−5', label: 'kold', color: '#3366d9' },
    ],
  },

  // ─── Sentinel-2 default-template lag (rendered af Sentinel Hub) ──────────────
  // For RGB-komposit viser vi hvad de tre kanaler er.
  TRUE_COLOR: {
    title: 'True Color (naturlige farver)',
    type: 'rgb-bands',
    bands: { red: 'B4 (rød, 665 nm)', green: 'B3 (grøn, 560 nm)', blue: 'B2 (blå, 490 nm)' },
    description: 'Hvad det menneskelige øje ville se. Vand mørkt, vegetation grøn, is/sne hvid.',
  },

  COLOR_INFRARED: {
    title: 'Color Infrared (CIR)',
    type: 'rgb-bands',
    bands: { red: 'B8 (NIR, 842 nm)', green: 'B4 (rød)', blue: 'B3 (grøn)' },
    description: 'Vegetation reflekterer NIR kraftigt → lyser RØDT. Pioneer-planter på morænerne bliver tydelige.',
  },

  VEGETATION_INDEX: {
    title: 'NDVI — vegetationsindeks',
    type: 'gradient',
    unit: '(B8−B4)/(B8+B4) — −1 til +1',
    description: 'Sentinel Hub default-style: rainbow colormap. Rød = høj NDVI (tæt vegetation), gul = mellem, cyan/blå = lav NDVI (bart/sne/vand). Bemærk: i Arktis er højeste værdier kun ~0.4-0.6 fordi det er lave græs/mos/dværgbuske.',
    stops: [
      { value: '+0.6', label: 'tæt arktisk vegetation', color: '#cc1f1a' },
      { value: '+0.4', label: 'pioner-vegetation', color: '#ed7822' },
      { value: '+0.2', label: 'sparsomt', color: '#f0d529' },
      { value: '0.0', label: 'bart / sne', color: '#7fcf6b' },
      { value: '−0.2', label: 'sne / sky', color: '#3da7cc' },
      { value: '< −0.4', label: 'vand', color: '#1a4a99' },
    ],
  },

  MOISTURE_INDEX: {
    title: 'Moisture Index (NDMI)',
    type: 'gradient',
    unit: '(B8A−B11)/(B8A+B11) — −1 til +1',
    description: 'Sentinel Hub default-style: brun (tør) → grøn (mellem) → blå (våd). Vand og fugtige overflader får højeste værdier.',
    stops: [
      { value: '+0.6', label: 'vand / våd', color: '#0a4a99' },
      { value: '+0.2', label: 'fugtig', color: '#3a8ccc' },
      { value: '0.0', label: 'mellem', color: '#a8d99e' },
      { value: '−0.2', label: 'tør', color: '#d9b04a' },
      { value: '< −0.4', label: 'meget tør / bart', color: '#7a4a1c' },
    ],
  },

  // ─── Terræn — ArcticDEM ──────────────────────────────────────────────────────
  arcticdem_tinted: {
    title: 'ArcticDEM tonet efter højde',
    type: 'gradient',
    unit: 'meter over havet — tilpasset Sermilik 0-1500 m',
    description: 'Custom colormap optimeret til Tasiilaq-området. Markeret med stationer: TAS_L 250 m, Mittivakkat ligevægtslinje ~515 m, TAS_A 890 m.',
    stops: [
      { value: '> 1500', label: 'indlandsis', color: '#dcdce6' },
      { value: '1100', label: 'højeste fjeld', color: '#a05050' },
      { value: '900', label: 'TAS_A / Mittivakkat top', color: '#c86438' },
      { value: '700', label: '', color: '#e69646' },
      { value: '500', label: 'ligevægtslinje', color: '#f0c864' },
      { value: '300', label: '', color: '#d2dc8c' },
      { value: '150', label: '', color: '#a0d28c' },
      { value: '50', label: 'kystland', color: '#64b48c' },
      { value: '0', label: 'havniveau / fjord', color: '#1e508c' },
    ],
  },

  // ─── MODIS Combined Albedo Daily ─────────────────────────────────────────
  // NASA's faktiske colormap (verificeret mod gibs.earthdata.nasa.gov/colormaps/
  // v1.3/MODIS_Combined_Albedo_Daily.xml): JET-spektrum 0-750, hvor sourceValue/750
  // er reel albedo. Mørkeblå = lav, rød = høj.
  gibs_albedo: {
    title: 'MODIS daglig albedo (Black-Sky)',
    type: 'gradient',
    unit: '0-1 — broadband shortwave',
    description: 'NASA GIBS MODIS Combined Aqua+Terra. JET-spektrum: mørkeblå=lav, rød=høj. Bemærk over 0.75 er grupperet (sjælden i naturen). Vand/sky/no-data = transparent.',
    stops: [
      { value: '0.75', label: 'frisk sne', color: '#ff1100' },
      { value: '0.65', label: 'firn / våd sne', color: '#ff5900' },
      { value: '0.55', label: '', color: '#ffa125' },
      { value: '0.45', label: 'lyse områder', color: '#ffe92e' },
      { value: '0.35', label: 'tundra / græsland', color: '#d2ff12' },
      { value: '0.25', label: '', color: '#4dff34' },
      { value: '0.15', label: 'mørk overflade', color: '#00ffb3' },
      { value: '0.10', label: 'vegetation', color: '#005ed1' },
      { value: '0.05', label: '', color: '#000080' },
      { value: '0.00', label: 'vand / no-data', color: '#000005' },
    ],
  },

  // ─── MODIS Ice Surface Temperature ───────────────────────────────────────
  // Verificeret mod NASA colormap: hue går fra magenta (-50°C) gennem blå/cyan/grøn
  // (-30 til 0°C) til gul/orange/rød (+10 til +30°C). Middelhavet (~290 K = +15°C)
  // viser orange-gul i screenshot — bekræftet matchende.
  gibs_ice_temp: {
    title: 'MODIS overfladetemperatur (dag)',
    type: 'gradient',
    unit: 'K (°C i parentes) — MODIS Terra Ice Surface Temperature (1 km)',
    description: 'NASA GIBS JET colormap. Renderer ALLE pixels — også hav/land hvor "ice surface" ikke er meningsfuldt (læs som "overflade-temp"). Bemærk: 1 km opløsning — bedst til regional sammenligning, for grov til Mittivakkat-detalje.',
    stops: [
      { value: '303 K  (+30°C)', label: 'meget varm (ørken)', color: '#ff5b00' },
      { value: '293 K  (+20°C)', label: 'tempereret hav', color: '#ffaf00' },
      { value: '283 K  (+10°C)', label: '', color: '#ffff00' },
      { value: '273 K   (0°C)', label: 'frysepunkt', color: '#99ff00' },
      { value: '263 K  (−10°C)', label: '', color: '#37ff80' },
      { value: '253 K  (−20°C)', label: '', color: '#00bdff' },
      { value: '243 K  (−30°C)', label: '', color: '#0033ff' },
      { value: '233 K  (−40°C)', label: '', color: '#4d00ff' },
      { value: '223 K  (−50°C)', label: 'koldest', color: '#c500ff' },
    ],
  },

  arcticdem_slope: {
    title: 'ArcticDEM hældningskort',
    type: 'gradient',
    unit: 'grader hældning (0° flad → 90° lodret)',
    description: 'Esri "Slope Map". Stejle skråninger i rød.',
    stops: [
      { value: '> 60°', label: 'lodret', color: '#cc0000' },
      { value: '45°', label: 'meget stejlt', color: '#ff6600' },
      { value: '30°', label: 'stejlt', color: '#ffcc00' },
      { value: '15°', label: 'moderat', color: '#bbe07a' },
      { value: '< 5°', label: 'fladt', color: '#5a8c5a' },
    ],
  },
};

// ─── Render-funktioner ────────────────────────────────────────────────────────

function renderGradientLegend(def) {
  // Byg en lodret gradient med tick-labels
  const n = def.stops.length;
  const tickRows = def.stops.map((s, i) => `
    <div class="leg-tick">
      <span class="leg-swatch" style="background:${s.color};"></span>
      <span class="leg-val">${s.value}</span>
      <span class="leg-lbl">${s.label || ''}</span>
    </div>
  `).join('');

  return `
    <div class="legend-item legend-gradient">
      <div class="leg-title">${def.title}</div>
      ${def.unit ? `<div class="leg-unit">${def.unit}</div>` : ''}
      <div class="leg-stops">${tickRows}</div>
      <div class="leg-desc">${def.description}</div>
    </div>
  `;
}

function renderRgbBandsLegend(def) {
  return `
    <div class="legend-item legend-rgb">
      <div class="leg-title">${def.title}</div>
      <div class="leg-bands">
        <div class="leg-band"><span class="leg-swatch" style="background:#e74c3c;"></span><b>R:</b> ${def.bands.red}</div>
        <div class="leg-band"><span class="leg-swatch" style="background:#27ae60;"></span><b>G:</b> ${def.bands.green}</div>
        <div class="leg-band"><span class="leg-swatch" style="background:#2980b9;"></span><b>B:</b> ${def.bands.blue}</div>
      </div>
      <div class="leg-desc">${def.description}</div>
    </div>
  `;
}

export function renderLegend(layerId) {
  const def = LEGENDS[layerId];
  if (!def) return '';
  if (def.type === 'gradient') return renderGradientLegend(def);
  if (def.type === 'rgb-bands') return renderRgbBandsLegend(def);
  return '';
}
