// Sentinel Hub WMS-integration:
//  - Spektrale lag (S2 L2A default-template: TrueColor, NDVI, SWIR, ...)
//  - Glaciologiske indekser via custom evalscript (NDSI, albedo, NDWI)
//  - Termiske lag fra Landsat 8/9 TIRS L1
//  - Datovælger: range vs. specifik dato + tolerance + skytærskel
//  - localStorage persistens af instance ID og dato-state

import { map } from './map.js';
import {
  SH_DEFAULT_INSTANCE_ID, SH_LS_KEY, SH_DATE_LS_KEY, SH_WMS_BASE,
  SH_DEFAULT_DATES,
  NDSI_EVALSCRIPT, ALBEDO_EVALSCRIPT, NDWI_EVALSCRIPT,
  LANDSAT_LST_FULL_EVALSCRIPT, LANDSAT_LST_SUMMER_EVALSCRIPT,
  LANDSAT_TIRS_LAYER,
} from './config.js';
import { activeLegendLayers, updateLegendBox } from './ui.js';

const OPACITY_LS_KEY = 'sermilik_layer_opacity';
function loadOpacities() {
  try { return JSON.parse(localStorage.getItem(OPACITY_LS_KEY) || '{}'); }
  catch { return {}; }
}
function saveOpacities(o) {
  try { localStorage.setItem(OPACITY_LS_KEY, JSON.stringify(o)); } catch {}
}
const opacities = loadOpacities();

// Default opacities: spektrale 100%, glaciologiske 70% (de er overlays), thermal 70%
const DEFAULT_OPACITY = {
  spectral: 1.0,
  glacial: 0.7,
  thermal: 0.75,
};

function getOpacity(id, category) {
  if (id in opacities) return opacities[id];
  return DEFAULT_OPACITY[category] ?? 1.0;
}

function setOpacity(id, v, layer) {
  opacities[id] = v;
  saveOpacities(opacities);
  if (layer && typeof layer.setOpacity === 'function') layer.setOpacity(v);
}

// Lille slider-row HTML der tilføjes per lag
function makeOpacityRow(id, category, layer, hidden) {
  const row = document.createElement('div');
  row.className = 'layer-controls-row';
  row.style.display = hidden ? 'none' : 'flex';
  const pct = Math.round(getOpacity(id, category) * 100);
  row.innerHTML = `
    <span>Transparens</span>
    <input type="range" class="layer-opacity-slider" min="0" max="100" value="${pct}" step="5">
    <span class="layer-opacity-val">${pct}%</span>
  `;
  const slider = row.querySelector('input');
  const valSpan = row.querySelector('.layer-opacity-val');
  slider.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    valSpan.textContent = v + '%';
    setOpacity(id, v / 100, layer);
  });
  L.DomEvent.disableClickPropagation(row);
  return row;
}

let SH_INSTANCE_ID = localStorage.getItem(SH_LS_KEY) || SH_DEFAULT_INSTANCE_ID;
let shDates = { ...SH_DEFAULT_DATES, ...(JSON.parse(localStorage.getItem(SH_DATE_LS_KEY) || '{}')) };

// ─── Tidsvindue ────────────────────────────────────────────────────────────────
function getCurrentTimeRange() {
  if (shDates.mode === 'single') {
    const t = new Date(shDates.target);
    const tol = shDates.tolerance;
    const from = new Date(t); from.setDate(t.getDate() - tol);
    const to = new Date(t); to.setDate(t.getDate() + tol);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }
  return { from: shDates.from, to: shDates.to };
}

function getDescriptionForCurrentMode() {
  if (shDates.mode === 'single') return `${shDates.target} ±${shDates.tolerance} dage`;
  return `${shDates.from} → ${shDates.to}`;
}

// ─── WMS factories ─────────────────────────────────────────────────────────────
const shWMS = (layerId) => {
  if (!SH_INSTANCE_ID) return null;
  const range = getCurrentTimeRange();
  return L.tileLayer.wms(`${SH_WMS_BASE}/${SH_INSTANCE_ID}`, {
    layers: layerId,
    format: 'image/png',
    transparent: false,
    maxcc: shDates.maxcc,
    time: `${range.from}/${range.to}`,
    attribution: `Sentinel-2 © ESA/Copernicus — ${getDescriptionForCurrentMode()}, max ${shDates.maxcc}% skydække`,
  });
};

function glacialWMS(evalscript) {
  if (!SH_INSTANCE_ID) return null;
  const range = getCurrentTimeRange();
  return L.tileLayer.wms(`${SH_WMS_BASE}/${SH_INSTANCE_ID}`, {
    layers: 'TRUE_COLOR',
    format: 'image/png',
    transparent: true,
    maxcc: shDates.maxcc,
    time: `${range.from}/${range.to}`,
    evalscript: btoa(evalscript),
    attribution: `Sentinel-2 © ESA/Copernicus — custom indeks, ${getDescriptionForCurrentMode()}, max ${shDates.maxcc}% sky`,
  });
}

function thermalWMS(evalscript) {
  if (!SH_INSTANCE_ID) return null;
  const range = getCurrentTimeRange();
  return L.tileLayer.wms(`${SH_WMS_BASE}/${SH_INSTANCE_ID}`, {
    layers: LANDSAT_TIRS_LAYER,
    format: 'image/png',
    transparent: true,
    maxcc: shDates.maxcc,
    time: `${range.from}/${range.to}`,
    evalscript: btoa(evalscript),
    attribution: `Landsat 8/9 TIRS L1 © USGS — ${getDescriptionForCurrentMode()}, max ${shDates.maxcc}% sky`,
  });
}

// ─── Layer-definitioner ────────────────────────────────────────────────────────
const spectralLayerDefs = [
  { id: 'TRUE_COLOR', name: 'True Color (B4-B3-B2)', desc: 'Native Sentinel-2 RGB med kendt dato. Lavere skydække end EOX-mosaikken når man rammer en god dag.' },
  { id: 'COLOR_INFRARED', name: 'Color Infrared (B8-B4-B3)', desc: 'Vegetation lyser rødt. Pioneer-planter på morænerne fra Lille Istid bliver tydelige.' },
  { id: 'VEGETATION_INDEX', name: 'NDVI — vegetationsindeks', desc: 'Grønt = vegetation. Kvantificér prograderede områder siden Mittivakkats tilbagetrækning.' },
  { id: 'MOISTURE_INDEX', name: 'Moisture Index (B8A-B11)', desc: 'Fugtighed i terrænet — finder smelteområder og våde overflader.' },
  { id: 'GEOLOGY', name: 'Geology composite (B12-B11-B2)', desc: 'Fremhæver mineralforskelle og bjergartstyper. Supplement til GEUS\' geologiske kort.' },
  { id: 'SWIR', name: 'SWIR (B12-B8A-B4)', desc: 'Kortbølget infrarød — adskiller is, vand, sne og bare jordoverflader.' },
  { id: 'ATMOSPHERIC_PENETRATION', name: 'Atmospheric Penetration (B12-B11-B8A)', desc: 'Reducerer atmosfærisk slør — godt til klar visning ved svag dis.' },
  { id: 'BATHYMETRIC', name: 'Bathymetric', desc: 'Lavvandede områder i fjorden — undervands-relief tæt på kysten.' },
  { id: 'COLOR_INFRARED__URBAN_', name: 'False Color (urban)', desc: 'Anden falsk-farve-variant. God til at adskille bart fjeld fra dækkede områder.' },
];

const glacialLayerDefs = [
  { id: 'NDSI', name: 'NDSI — sne / firn / bar is',
    desc: 'Normalized Difference Snow Index, (B3−B11)/(B3+B11). Hvid = ren sne, lyseblå = firn, gul/orange = bar is, brun = jord/debris. Brug juli-september for tydeligst kontrast.',
    teach: 'Det videnskabelige standardindeks til sne/is-adskillelse. Eleverne kan se ligevægtslinjen som en farvegrænse op ad gletsjeren — Mittivakkats ligger ca. 515 m.o.h.',
    evalscript: NDSI_EVALSCRIPT,
  },
  { id: 'ALBEDO', name: 'Albedo (broadband shortwave)',
    desc: 'Liang-formel fra B2, B4, B8, B11, B12. Mørk lilla = lav albedo (mørk is, smelt-intens), orange = bar is, gul = firn, hvid = frisk sne. Faldende albedo over sommeren = stigende smelte.',
    teach: 'Kvantitativ smelte-intensitet. Sammenlign juli og september for samme år: albedoen falder når sneen smelter væk fra ablationszonen og blotter mørkere is. Kobl til energibalance fra MIT_B-stationen.',
    evalscript: ALBEDO_EVALSCRIPT,
  },
  { id: 'NDWI_LAKES', name: 'NDWI — smeltesøer',
    desc: 'McFeeters NDWI, (B3−B8)/(B3+B8). Mørkblå = dybt vand/sø, lyseblå = lavt eller fugtigt. Resten transparent — lægges som overlay på baggrundskort.',
    teach: 'Lokalisér smeltesøer på gletsjeroverflade og i forland. Tæl, mål areal, sammenlign mellem år for at vise hydrologisk udvikling.',
    evalscript: NDWI_EVALSCRIPT,
  },
];

const thermalLayerDefs = [
  { id: 'LANDSAT_LST_FULL', name: 'Landsat overfladetemperatur (−30 → +20 °C)',
    desc: 'Brightness temperature fra TIRS bånd 10. Bred farveramme — virker hele året. Bemærk: ikke atmosfærisk korrigeret (L1) — kan afvige 2-5 °C fra ægte overfladetemperatur i fugtig luft.',
    teach: 'Find opvarmede områder — bare fjeldsider, mørk is, smeltesøer. Sammenlign direkte med albedo-laget: lav albedo = høj overfladetemperatur i sollys (eleverne ser strålingsbalance i praksis).',
    evalscript: LANDSAT_LST_FULL_EVALSCRIPT,
  },
  { id: 'LANDSAT_LST_SUMMER', name: 'Landsat sommer-temperatur (−5 → +16 °C)',
    desc: 'Samme datakilde med smal farveramme tilpasset sommerforhold. Tydeligt skift fra lyseblå til gul ved 0 °C — frysepunktslinjen.',
    teach: 'Brug i juli-august på Mittivakkat. Frysepunktslinjen viser hvor smelte aktivt sker. Sammenlign over en sæson: ligger 0 °C-grænsen højere op ad gletsjeren i august end i juni?',
    evalscript: LANDSAT_LST_SUMMER_EVALSCRIPT,
  },
];

const spectralLayers = {};
const glacialLayers = {};
const thermalLayers = {};
export const activeSpectralIds = new Set();
export const activeGlacialIds = new Set();
export const activeThermalIds = new Set();

// ─── Build functions ───────────────────────────────────────────────────────────
function buildSpectralLayers() {
  const previouslyActive = new Set(activeSpectralIds);
  Object.values(spectralLayers).forEach(l => { if (l && map.hasLayer(l)) map.removeLayer(l); });
  Object.keys(spectralLayers).forEach(k => delete spectralLayers[k]);
  activeSpectralIds.clear();

  const container = document.getElementById('spectral-layers');
  container.innerHTML = '';

  if (!SH_INSTANCE_ID) {
    container.innerHTML = '<p style="font-size:0.78rem; color:#888; padding:0.4rem;">Indsæt instance ID ovenfor for at aktivere disse lag.</p>';
    return;
  }

  spectralLayerDefs.forEach(def => {
    const layer = shWMS(def.id);
    spectralLayers[def.id] = layer;
    if (layer) layer.setOpacity(getOpacity(def.id, 'spectral'));

    const wrap = document.createElement('label');
    wrap.className = 'layer';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = previouslyActive.has(def.id);
    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<div class="name">${def.name}</div><div class="desc">${def.desc}</div>`;
    wrap.appendChild(input);
    wrap.appendChild(label);
    const opacityRow = makeOpacityRow(def.id, 'spectral', layer, !input.checked);
    wrap.appendChild(opacityRow);
    container.appendChild(wrap);

    if (input.checked) {
      layer.addTo(map);
      activeSpectralIds.add(def.id);
      activeLegendLayers.add(def.id);
    }

    input.addEventListener('change', () => {
      if (input.checked) {
        layer.addTo(map); activeSpectralIds.add(def.id); activeLegendLayers.add(def.id);
        opacityRow.style.display = 'flex';
      } else {
        map.removeLayer(layer); activeSpectralIds.delete(def.id); activeLegendLayers.delete(def.id);
        opacityRow.style.display = 'none';
      }
      updateLegendBox();
      onLayersChanged();
    });
  });
}

function buildGlacialLayers() {
  const previouslyActive = new Set(activeGlacialIds);
  Object.values(glacialLayers).forEach(l => { if (l && map.hasLayer(l)) map.removeLayer(l); });
  Object.keys(glacialLayers).forEach(k => delete glacialLayers[k]);
  activeGlacialIds.clear();

  const container = document.getElementById('glacial-layers');
  container.innerHTML = '';

  if (!SH_INSTANCE_ID) {
    container.innerHTML = '<p style="font-size:0.78rem; color:#888; padding:0.4rem;">Indtast Sentinel Hub instance ID ovenfor for at aktivere indekser.</p>';
    return;
  }

  glacialLayerDefs.forEach(def => {
    const layer = glacialWMS(def.evalscript);
    glacialLayers[def.id] = layer;
    if (layer) layer.setOpacity(getOpacity(def.id, 'glacial'));

    const wrap = document.createElement('label');
    wrap.className = 'layer';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = previouslyActive.has(def.id);
    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `
      <div class="name">${def.name}</div>
      <div class="desc">${def.desc}</div>
      ${def.teach ? `<div class="teach">${def.teach}</div>` : ''}
    `;
    wrap.appendChild(input);
    wrap.appendChild(label);
    const opacityRow = makeOpacityRow(def.id, 'glacial', layer, !input.checked);
    wrap.appendChild(opacityRow);
    container.appendChild(wrap);

    if (input.checked) {
      layer.addTo(map); activeGlacialIds.add(def.id); activeLegendLayers.add(def.id);
    }

    input.addEventListener('change', () => {
      if (input.checked) {
        layer.addTo(map); activeGlacialIds.add(def.id); activeLegendLayers.add(def.id);
        opacityRow.style.display = 'flex';
      } else {
        map.removeLayer(layer); activeGlacialIds.delete(def.id); activeLegendLayers.delete(def.id);
        opacityRow.style.display = 'none';
      }
      updateLegendBox();
      onLayersChanged();
    });
  });
}

function buildThermalLayers() {
  const previouslyActive = new Set(activeThermalIds);
  Object.values(thermalLayers).forEach(l => { if (l && map.hasLayer(l)) map.removeLayer(l); });
  Object.keys(thermalLayers).forEach(k => delete thermalLayers[k]);
  activeThermalIds.clear();

  const container = document.getElementById('thermal-layers');
  container.innerHTML = '';

  if (!SH_INSTANCE_ID) {
    container.innerHTML = '<p style="font-size:0.78rem; color:#888; padding:0.4rem;">Sentinel Hub-instance kræves.</p>';
    return;
  }

  thermalLayerDefs.forEach(def => {
    const layer = thermalWMS(def.evalscript);
    thermalLayers[def.id] = layer;
    if (layer) layer.setOpacity(getOpacity(def.id, 'thermal'));

    const wrap = document.createElement('label');
    wrap.className = 'layer';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = previouslyActive.has(def.id);
    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `
      <div class="name">${def.name}</div>
      <div class="desc">${def.desc}</div>
      ${def.teach ? `<div class="teach">${def.teach}</div>` : ''}
    `;
    wrap.appendChild(input);
    wrap.appendChild(label);
    const opacityRow = makeOpacityRow(def.id, 'thermal', layer, !input.checked);
    wrap.appendChild(opacityRow);
    container.appendChild(wrap);

    if (input.checked) {
      layer.addTo(map); activeThermalIds.add(def.id); activeLegendLayers.add(def.id);
    }

    input.addEventListener('change', () => {
      if (input.checked) {
        layer.addTo(map); activeThermalIds.add(def.id); activeLegendLayers.add(def.id);
        opacityRow.style.display = 'flex';
      } else {
        map.removeLayer(layer); activeThermalIds.delete(def.id); activeLegendLayers.delete(def.id);
        opacityRow.style.display = 'none';
      }
      updateLegendBox();
      onLayersChanged();
    });
  });
}

export function rebuildAllSentinelLayers() {
  buildSpectralLayers();
  buildGlacialLayers();
  buildThermalLayers();
}

// Callback for UI-laget (badges osv.) — sættes af ui.js via setOnLayersChanged()
let onLayersChanged = () => {};
export function setOnLayersChanged(fn) { onLayersChanged = fn; }

// ─── Status og UI for instance-input + dato-vælger ─────────────────────────────
function updateShStatus() {
  const config = document.getElementById('sh-config');
  const input = document.getElementById('sh-instance-input');
  const datesPanel = document.getElementById('sh-dates');
  if (SH_INSTANCE_ID) {
    config.classList.add('connected');
    if (input) input.value = SH_INSTANCE_ID;
    datesPanel.style.display = 'block';
  } else {
    config.classList.remove('connected');
    datesPanel.style.display = 'none';
  }
}

function setShDateMode(mode, save = true) {
  shDates.mode = mode;
  document.querySelectorAll('#sh-dates .mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  document.getElementById('mode-range').style.display = (mode === 'range') ? 'block' : 'none';
  document.getElementById('mode-single').style.display = (mode === 'single') ? 'block' : 'none';
  if (save) localStorage.setItem(SH_DATE_LS_KEY, JSON.stringify(shDates));
  rebuildAllSentinelLayers();
  onLayersChanged();
}

function setShTarget(target, save = true) {
  shDates.target = target;
  document.getElementById('sh-target').value = target;
  if (save) localStorage.setItem(SH_DATE_LS_KEY, JSON.stringify(shDates));
  rebuildAllSentinelLayers();
  onLayersChanged();
}

function setShTolerance(tol, save = true) {
  shDates.tolerance = tol;
  document.getElementById('sh-tolerance').value = tol;
  document.getElementById('sh-tolerance-val').textContent = tol + ' dage';
  if (save) localStorage.setItem(SH_DATE_LS_KEY, JSON.stringify(shDates));
  rebuildAllSentinelLayers();
  onLayersChanged();
}

function scrubTarget(deltaDays) {
  const d = new Date(shDates.target);
  d.setDate(d.getDate() + deltaDays);
  setShTarget(d.toISOString().slice(0, 10));
}

function setShDates(from, to, save = true) {
  shDates.from = from;
  shDates.to = to;
  document.getElementById('sh-from').value = from;
  document.getElementById('sh-to').value = to;
  if (save) localStorage.setItem(SH_DATE_LS_KEY, JSON.stringify(shDates));
  rebuildAllSentinelLayers();
  onLayersChanged();
  updatePresetButtons();
}

function setShMaxcc(val, save = true) {
  shDates.maxcc = val;
  document.getElementById('sh-maxcc').value = val;
  document.getElementById('sh-maxcc-val').textContent = val + '%';
  if (save) localStorage.setItem(SH_DATE_LS_KEY, JSON.stringify(shDates));
  rebuildAllSentinelLayers();
  onLayersChanged();
}

const datePresets = {
  'latest-summer': () => {
    const now = new Date();
    const lastJulyYear = now.getMonth() < 9 ? now.getFullYear() - 1 : now.getFullYear();
    return [`${lastJulyYear}-06-01`, `${lastJulyYear}-09-30`];
  },
  'this-summer': () => {
    const y = new Date().getFullYear();
    return [`${y}-06-01`, `${y}-09-30`];
  },
  'winter': () => ['2024-02-01', '2024-04-30'],
  'full-2024': () => ['2024-01-01', '2024-12-31'],
  'full-2020': () => ['2020-01-01', '2020-12-31'],
};

function updatePresetButtons() {
  document.querySelectorAll('#sh-dates .presets button').forEach(btn => {
    const preset = btn.dataset.preset;
    const [pFrom, pTo] = datePresets[preset]();
    btn.classList.toggle('active', pFrom === shDates.from && pTo === shDates.to);
  });
}

// ─── Init event-listeners ──────────────────────────────────────────────────────
export function initSentinelHubUI() {
  document.querySelectorAll('#sh-dates .mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => setShDateMode(btn.dataset.mode));
  });

  document.querySelectorAll('#sh-dates .presets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const [from, to] = datePresets[btn.dataset.preset]();
      setShDates(from, to);
    });
  });

  document.getElementById('sh-from').addEventListener('change', e => setShDates(e.target.value, shDates.to));
  document.getElementById('sh-to').addEventListener('change', e => setShDates(shDates.from, e.target.value));
  document.getElementById('sh-target').addEventListener('change', e => setShTarget(e.target.value));
  document.getElementById('sh-tolerance').addEventListener('input', e => setShTolerance(parseInt(e.target.value, 10)));
  document.querySelectorAll('#sh-dates .scrub-row button').forEach(btn => {
    btn.addEventListener('click', () => scrubTarget(parseInt(btn.dataset.scrub, 10)));
  });
  document.getElementById('sh-maxcc').addEventListener('input', e => setShMaxcc(parseInt(e.target.value, 10)));

  document.getElementById('sh-toggle-edit').addEventListener('click', () => {
    const edit = document.getElementById('sh-instance-edit');
    edit.style.display = (edit.style.display === 'none' || !edit.style.display) ? 'block' : 'none';
  });

  document.getElementById('sh-save-btn').addEventListener('click', () => {
    const val = document.getElementById('sh-instance-input').value.trim();
    SH_INSTANCE_ID = val || SH_DEFAULT_INSTANCE_ID;
    if (val && val !== SH_DEFAULT_INSTANCE_ID) localStorage.setItem(SH_LS_KEY, val);
    else localStorage.removeItem(SH_LS_KEY);
    document.getElementById('sh-instance-edit').style.display = 'none';
    updateShStatus();
    rebuildAllSentinelLayers();
    onLayersChanged();
  });

  updateShStatus();
  rebuildAllSentinelLayers();
  document.getElementById('sh-from').value = shDates.from;
  document.getElementById('sh-to').value = shDates.to;
  document.getElementById('sh-target').value = shDates.target;
  document.getElementById('sh-tolerance').value = shDates.tolerance;
  document.getElementById('sh-tolerance-val').textContent = shDates.tolerance + ' dage';
  document.getElementById('sh-maxcc').value = shDates.maxcc;
  document.getElementById('sh-maxcc-val').textContent = shDates.maxcc + '%';
  updatePresetButtons();
  setShDateMode(shDates.mode, false);
}

// Eksportér state-getters til UI-laget (badges)
export function getShDates() { return { ...shDates }; }
export function getShTimeRange() { return getCurrentTimeRange(); }
