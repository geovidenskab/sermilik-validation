// Bygger lag-panelet ud fra layerDefs. Håndterer radio (baggrund) og checkbox (overlays).
// Tilføjer transparens-slider per overlay-lag og registrerer legends når lag aktiveres.

import { map, basemaps, setActiveBasemap } from './map.js';
import { stationsLayer, awsLayer, townsLayer } from './markers.js';
import { arcticDemHillshade, arcticDemTinted, arcticDemSlope, esriHillshade } from './arcticdem.js';
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

// Sentinel: en pseudo-radio for "ingen baggrund" — har ikke en faktisk Leaflet-layer
const NONE_BASEMAP = { id: 'none', __none: true };

const layerDefs = [
  // ─── BAGGRUNDSKORT — grupperet i sub-containers ─────────────────────────────
  { group: 'basemaps-none', type: 'radio', radioGroup: 'basemap', id: 'none',
    name: 'Intet baggrundskort',
    desc: 'Tom baggrund — godt hvis du kun vil se overlay-lag.',
    layer: null, __none: true },

  { group: 'basemaps-satellit', type: 'radio', radioGroup: 'basemap', id: 'esri',
    name: 'Esri World Imagery (~1 m)',
    desc: 'Højeste gratis opløsning over Grønland (Maxar). Bedst til detaljer og drone-planlægning.',
    layer: basemaps.esri, on: true },
  { group: 'basemaps-satellit', type: 'radio', radioGroup: 'basemap', id: 'esri_hybrid',
    name: 'Esri Hybrid (med stednavne)',
    desc: 'Samme satellit + stednavne — godt under feltture.',
    layer: basemaps.esri_hybrid },

  { group: 'basemaps-sentinel', type: 'radio', radioGroup: 'basemap', id: 's2_2024',
    name: 'Sentinel-2 cloudless 2024',
    desc: 'Skyfri årsmosaik, 10 m. Sammenlign med tidligere år for is-/sneændringer.',
    layer: basemaps.s2_2024 },
  { group: 'basemaps-sentinel', type: 'radio', radioGroup: 'basemap', id: 's2_2023',
    name: 'Sentinel-2 cloudless 2023',
    desc: 'Mellemvalg til serieanalyse.',
    layer: basemaps.s2_2023 },
  { group: 'basemaps-sentinel', type: 'radio', radioGroup: 'basemap', id: 's2_2022',
    name: 'Sentinel-2 cloudless 2022',
    desc: 'Toggle 2022 ↔ 2024 for at se ændringer over 2 år.',
    layer: basemaps.s2_2022 },
  { group: 'basemaps-sentinel', type: 'radio', radioGroup: 'basemap', id: 's2_2020',
    name: 'Sentinel-2 cloudless 2020',
    desc: '4 års forskel til 2024 — tydeligst for langsomme ændringer.',
    layer: basemaps.s2_2020 },

  { group: 'basemaps-vektor', type: 'radio', radioGroup: 'basemap', id: 'topo',
    name: 'Topografisk (OpenTopoMap)',
    desc: 'Højdekurver og terrænskygning.',
    layer: basemaps.topo },
  { group: 'basemaps-vektor', type: 'radio', radioGroup: 'basemap', id: 'osm',
    name: 'OpenStreetMap',
    desc: 'Standardkort med byer, veje og navne.',
    layer: basemaps.osm },

  // ─── TERRÆN & RELIEF ────────────────────────────────────────────────────────
  { group: 'terrain-layers', id: 'arcticdem_hs',
    name: 'ArcticDEM hillshade (2 m)',
    desc: 'Højeste-opløsnings relief over Grønland — Maxar stereopar via PGC.',
    layer: arcticDemHillshade, defaultOpacity: 0.55 },
  { group: 'terrain-layers', id: 'arcticdem_tinted',
    name: 'ArcticDEM tonet efter højde (2 m)',
    desc: 'Højde-tinting tilpasset Sermilik-området (0-1500 m). Markerede stationer: TAS_L 250 m, ligevægtslinje ~515 m, TAS_A 890 m.',
    layer: arcticDemTinted, defaultOpacity: 0.85, legendId: 'arcticdem_tinted' },
  { group: 'terrain-layers', id: 'arcticdem_slope',
    name: 'ArcticDEM hældningskort (2 m)',
    desc: 'Stejle skråninger i rød. Fremhæver fjordvægge, skred-zoner, terrasser.',
    layer: arcticDemSlope, defaultOpacity: 0.5, legendId: 'arcticdem_slope' },
  { group: 'terrain-layers', id: 'esri_hillshade',
    name: 'Esri global hillshade',
    desc: 'Fallback når ArcticDEM ikke svarer. Lavere opløsning, men virker overalt.',
    layer: esriHillshade, defaultOpacity: 0.5 },

  // ─── LOKALITETER ────────────────────────────────────────────────────────────
  { group: 'poi-layers', id: 'stations',
    name: 'Forskningsstation & gletsjere',
    desc: 'Sermilik feltstation, Mittivakkat- og Helheim-gletsjeren.',
    layer: stationsLayer, on: true, noOpacity: true },
  { group: 'poi-layers', id: 'aws',
    name: 'PROMICE vejrstationer',
    desc: 'AWS MIT_B (fjeld), MIT (på gletsjer), SER_B (kyst), TAS_L/U/A (Tasiilaq-transekt). Klik for direkte CSV-link til timedata fra GEUS THREDDS.',
    layer: awsLayer, on: true, noOpacity: true },
  { group: 'poi-layers', id: 'towns',
    name: 'Tasiilaq & Kulusuk',
    desc: 'By og lufthavn. Logistik-noter i popups.',
    layer: townsLayer, on: true, noOpacity: true },
];

function getInitialOpacity(def) {
  if (def.id in opacities) return opacities[def.id];
  return def.defaultOpacity ?? 1.0;
}

function applyOpacity(layer, opacity) {
  if (!layer) return;
  if (typeof layer.setOpacity === 'function') {
    layer.setOpacity(opacity);
  } else if (layer.eachLayer) {
    layer.eachLayer(l => { if (typeof l.setOpacity === 'function') l.setOpacity(opacity); });
  }
}

// Saml alle basemap-defs til en samlet liste for radio-håndtering
function getAllBasemapDefs() {
  return layerDefs.filter(d => d.radioGroup === 'basemap');
}

function buildLayerControl(def, onBasemapChange) {
  const wrap = document.createElement('label');
  wrap.className = 'layer';

  const input = document.createElement('input');
  input.type = def.type === 'radio' ? 'radio' : 'checkbox';
  if (def.type === 'radio') input.name = def.radioGroup || def.group;
  input.checked = !!def.on;

  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `
    <div class="name">${def.name}</div>
    <div class="desc">${def.desc}</div>
  `;

  // Opacity-slider — kun for overlay-lag (ikke radio, ikke POI), kun synlig når aktivt
  let opacityRow = null;
  if (def.type !== 'radio' && !def.noOpacity) {
    opacityRow = document.createElement('div');
    opacityRow.className = 'layer-controls-row';
    opacityRow.style.display = input.checked ? 'flex' : 'none';
    const initialPct = Math.round(getInitialOpacity(def) * 100);
    opacityRow.innerHTML = `
      <span>Transparens</span>
      <input type="range" class="layer-opacity-slider" min="0" max="100" value="${initialPct}" step="5">
      <span class="layer-opacity-val">${initialPct}%</span>
    `;
    const slider = opacityRow.querySelector('input');
    const valSpan = opacityRow.querySelector('.layer-opacity-val');
    slider.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      valSpan.textContent = v + '%';
      applyOpacity(def.layer, v / 100);
      opacities[def.id] = v / 100;
      saveOpacities(opacities);
    });
    L.DomEvent.disableClickPropagation(opacityRow);
  }
  applyOpacity(def.layer, getInitialOpacity(def));

  wrap.appendChild(input);
  wrap.appendChild(label);
  if (opacityRow) wrap.appendChild(opacityRow);

  input.addEventListener('change', () => {
    if (def.type === 'radio') {
      // Fjern alle baggrundskort (også ikke-valgte)
      getAllBasemapDefs().forEach(b => {
        if (b.layer && map.hasLayer(b.layer)) map.removeLayer(b.layer);
      });
      // Tilføj den valgte (medmindre 'none')
      if (def.layer) def.layer.addTo(map);
      setActiveBasemap(def.id);
      onBasemapChange?.();
    } else {
      if (input.checked) {
        def.layer.addTo(map);
        if (def.legendId) { activeLegendLayers.add(def.legendId); updateLegendBox(); }
        if (opacityRow) opacityRow.style.display = 'flex';
      } else {
        map.removeLayer(def.layer);
        if (def.legendId) { activeLegendLayers.delete(def.legendId); updateLegendBox(); }
        if (opacityRow) opacityRow.style.display = 'none';
      }
    }
  });

  if (input.checked && def.legendId) {
    activeLegendLayers.add(def.legendId);
  }

  document.getElementById(def.group).appendChild(wrap);
}

export function buildAllLayerControls(onBasemapChange) {
  layerDefs.forEach(def => buildLayerControl(def, onBasemapChange));
  updateLegendBox();
}
