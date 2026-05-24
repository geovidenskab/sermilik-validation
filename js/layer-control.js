// Bygger lag-panelet ud fra layerDefs. Håndterer radio (baggrund) og checkbox (overlays).

import { map, basemaps, setActiveBasemap } from './map.js';
import { stationsLayer, awsLayer, townsLayer } from './markers.js';
import { arcticDemHillshade, arcticDemTinted, arcticDemSlope, esriHillshade } from './arcticdem.js';

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
  { group: 'poi-layers', id: 'stations', name: '🏠 Forskningsstation & gletsjere', desc: 'Sermilik feltstation, Mittivakkat- og Helheim-gletsjeren.', teach: 'Anker for hele turen — start her når du planlægger ruter eller forklarer geografien.', layer: stationsLayer, on: true },
  { group: 'poi-layers', id: 'aws', name: '📡 PROMICE vejrstationer', desc: 'AWS MIT_B (fjeld), MIT (på gletsjer), SER_B (kyst). Klik for direkte CSV-link til timedata fra GEUS THREDDS.', teach: 'Lad eleverne hente CSV og plotte temperatur eller stråling over en uge — ægte arktisk data.', layer: awsLayer, on: true },
  { group: 'poi-layers', id: 'towns', name: '🏘️ Tasiilaq & Kulusuk', desc: 'By og lufthavn. Logistik-noter i popups.', teach: 'Brug til samtaler om mennesker, klimaforandringer og samfund i Østgrønland.', layer: townsLayer, on: true },

  // Terræn & relief
  { group: 'terrain-layers', id: 'arcticdem_hs', name: '🏔️ ArcticDEM hillshade (2 m)', desc: 'Højeste-opløsnings relief over Grønland — Maxar stereopar via PGC.', teach: 'Læg ovenpå Esri Imagery for 1 m farve + 2 m relief. Få eleverne til at finde moræne-rygge og fjordvægge visuelt.', layer: arcticDemHillshade },
  { group: 'terrain-layers', id: 'arcticdem_tinted', name: '🏔️ ArcticDEM tonet efter højde (2 m)', desc: 'Hillshade tonet efter elevation — dale i blå/grøn, toppe i gul/rød.', teach: 'Tydeligt højdegradient — kobl til energibalance, snegrænse og ligevægtslinje (515 m.o.h.).', layer: arcticDemTinted },
  { group: 'terrain-layers', id: 'arcticdem_slope', name: '📐 ArcticDEM hældningskort (2 m)', desc: 'Stejle skråninger i rød. Fremhæver fjordvægge, skred-zoner, terrasser.', teach: 'Risiko-snak: hvor må vi ikke bevæge os på turen? Hvilke flader er fluviale terrasser?', layer: arcticDemSlope },
  { group: 'terrain-layers', id: 'esri_hillshade', name: 'Esri global hillshade', desc: 'Fallback når ArcticDEM ikke svarer. Lavere opløsning, men virker overalt.', layer: esriHillshade },
];

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

  wrap.appendChild(input);
  wrap.appendChild(label);

  input.addEventListener('change', () => {
    if (def.type === 'radio') {
      Object.values(basemaps).forEach(l => map.removeLayer(l));
      def.layer.addTo(map);
      setActiveBasemap(def.id);
      onBasemapChange?.();
    } else {
      if (input.checked) def.layer.addTo(map);
      else map.removeLayer(def.layer);
    }
  });

  document.getElementById(def.group).appendChild(wrap);
}

export function buildAllLayerControls(onBasemapChange) {
  layerDefs.forEach(def => buildLayerControl(def, onBasemapChange));
}
