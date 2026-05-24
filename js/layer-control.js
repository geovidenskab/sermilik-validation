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

const layerDefs = [
  // Baggrundskort — radio
  { group: 'basemaps', type: 'radio', id: 'esri', name: '🛰️ Esri World Imagery (~1 m)', desc: 'Højeste gratis opløsning over Grønland (Maxar). Bedst til detaljer og drone-planlægning.', layer: basemaps.esri, on: true },
  { group: 'basemaps', type: 'radio', id: 'esri_hybrid', name: '🛰️ Esri Hybrid (med stednavne)', desc: 'Samme satellit + stednavne — godt under feltture.', layer: basemaps.esri_hybrid },
  { group: 'basemaps', type: 'radio', id: 's2_2024', name: '🛰️ Sentinel-2 cloudless 2024', desc: 'Skyfri årsmosaik, 10 m. Sammenlign med tidligere år for is-/sneændringer.', layer: basemaps.s2_2024 },
  { group: 'basemaps', type: 'radio', id: 's2_2023', name: '🛰️ Sentinel-2 cloudless 2023', desc: 'Mellemvalg til serieanalyse.', layer: basemaps.s2_2023 },
  { group: 'basemaps', type: 'radio', id: 's2_2022', name: '🛰️ Sentinel-2 cloudless 2022', desc: 'Toggle 2022 ↔ 2024 for at se ændringer over 2 år.', layer: basemaps.s2_2022 },
  { group: 'basemaps', type: 'radio', id: 's2_2020', name: '🛰️ Sentinel-2 cloudless 2020', desc: '4 års forskel til 2024 — tydeligst for langsomme ændringer.', layer: basemaps.s2_2020 },
  { group: 'basemaps', type: 'radio', id: 'topo', name: 'Topografisk (OpenTopoMap)', desc: 'Højdekurver og terrænskygning.', layer: basemaps.topo },
  { group: 'basemaps', type: 'radio', id: 'osm', name: 'OpenStreetMap', desc: 'Standardkort med byer, veje og navne.', layer: basemaps.osm },

  // Lokaliteter
  { group: 'poi-layers', id: 'stations', name: '🏠 Forskningsstation & gletsjere', desc: 'Sermilik feltstation, Mittivakkat- og Helheim-gletsjeren.', teach: 'Anker for hele turen — start her når du planlægger ruter eller forklarer geografien.', layer: stationsLayer, on: true, noOpacity: true },
  { group: 'poi-layers', id: 'aws', name: '📡 PROMICE vejrstationer', desc: 'AWS MIT_B (fjeld), MIT (på gletsjer), SER_B (kyst). Klik for direkte CSV-link til timedata fra GEUS THREDDS.', teach: 'Lad eleverne hente CSV og plotte temperatur eller stråling over en uge — ægte arktisk data.', layer: awsLayer, on: true, noOpacity: true },
  { group: 'poi-layers', id: 'towns', name: '🏘️ Tasiilaq & Kulusuk', desc: 'By og lufthavn. Logistik-noter i popups.', teach: 'Brug til samtaler om mennesker, klimaforandringer og samfund i Østgrønland.', layer: townsLayer, on: true, noOpacity: true },

  // Terræn & relief — har transparens-slider, og to af dem har legends
  { group: 'terrain-layers', id: 'arcticdem_hs', name: '🏔️ ArcticDEM hillshade (2 m)', desc: 'Højeste-opløsnings relief over Grønland — Maxar stereopar via PGC.', teach: 'Læg ovenpå Esri Imagery for 1 m farve + 2 m relief. Få eleverne til at finde moræne-rygge og fjordvægge visuelt.', layer: arcticDemHillshade, defaultOpacity: 0.55 },
  { group: 'terrain-layers', id: 'arcticdem_tinted', name: '🏔️ ArcticDEM tonet efter højde (2 m)', desc: 'Hillshade tonet efter elevation — dale i blå/grøn, toppe i gul/rød.', teach: 'Tydeligt højdegradient — kobl til energibalance, snegrænse og ligevægtslinje (515 m.o.h.).', layer: arcticDemTinted, defaultOpacity: 0.65, legendId: 'arcticdem_tinted' },
  { group: 'terrain-layers', id: 'arcticdem_slope', name: '📐 ArcticDEM hældningskort (2 m)', desc: 'Stejle skråninger i rød. Fremhæver fjordvægge, skred-zoner, terrasser.', teach: 'Risiko-snak: hvor må vi ikke bevæge os på turen? Hvilke flader er fluviale terrasser?', layer: arcticDemSlope, defaultOpacity: 0.5, legendId: 'arcticdem_slope' },
  { group: 'terrain-layers', id: 'esri_hillshade', name: 'Esri global hillshade', desc: 'Fallback når ArcticDEM ikke svarer. Lavere opløsning, men virker overalt.', layer: esriHillshade, defaultOpacity: 0.5 },
];

// Sæt initial opacity for hvert lag (fra localStorage eller default)
function getInitialOpacity(def) {
  if (def.id in opacities) return opacities[def.id];
  return def.defaultOpacity ?? 1.0;
}

// Sæt opacity på et Leaflet-lag (Leaflet TileLayer + ImageMapLayer understøtter setOpacity)
function applyOpacity(layer, opacity) {
  if (!layer) return;
  if (typeof layer.setOpacity === 'function') {
    layer.setOpacity(opacity);
  } else if (layer.eachLayer) {
    // L.LayerGroup (fx esri_hybrid)
    layer.eachLayer(l => { if (typeof l.setOpacity === 'function') l.setOpacity(opacity); });
  }
}

function buildLayerControl(def, onBasemapChange) {
  const wrap = document.createElement('label');
  wrap.className = 'layer';

  const input = document.createElement('input');
  input.type = def.type === 'radio' ? 'radio' : 'checkbox';
  if (def.type === 'radio') input.name = def.group;
  input.checked = !!def.on;

  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `
    <div class="name">${def.name}</div>
    <div class="desc">${def.desc}</div>
    ${def.teach ? `<div class="teach">${def.teach}</div>` : ''}
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
    // Stop event propagation så klik på slider ikke toggle'r checkbox
    L.DomEvent.disableClickPropagation(opacityRow);
  }
  // Sæt initial opacity selv om laget ikke er aktivt endnu
  applyOpacity(def.layer, getInitialOpacity(def));

  wrap.appendChild(input);
  wrap.appendChild(label);
  if (opacityRow) wrap.appendChild(opacityRow);

  input.addEventListener('change', () => {
    if (def.type === 'radio') {
      Object.values(basemaps).forEach(l => map.removeLayer(l));
      def.layer.addTo(map);
      setActiveBasemap(def.id);
      onBasemapChange?.();
    } else {
      if (input.checked) {
        def.layer.addTo(map);
        if (def.legendId) {
          activeLegendLayers.add(def.legendId);
          updateLegendBox();
        }
        if (opacityRow) opacityRow.style.display = 'flex';
      } else {
        map.removeLayer(def.layer);
        if (def.legendId) {
          activeLegendLayers.delete(def.legendId);
          updateLegendBox();
        }
        if (opacityRow) opacityRow.style.display = 'none';
      }
    }
  });

  // Hvis laget allerede er aktivt (on:true), registrer dets legend
  if (input.checked && def.legendId) {
    activeLegendLayers.add(def.legendId);
  }

  document.getElementById(def.group).appendChild(wrap);
}

export function buildAllLayerControls(onBasemapChange) {
  layerDefs.forEach(def => buildLayerControl(def, onBasemapChange));
  updateLegendBox();  // initial render hvis nogle lag starter aktive
}
