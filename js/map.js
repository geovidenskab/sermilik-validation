// Leaflet-kort + alle baggrundskort-lag.
// Eksporterer kort-instansen samt basemaps-objektet og activeBasemap-tilstanden.

import { MAP_CENTER, MAP_INITIAL_ZOOM, eoxAttribution } from './config.js';

export const map = L.map('map', {
  center: MAP_CENTER,
  zoom: MAP_INITIAL_ZOOM,
  zoomControl: true,
});

const sentinelLayer = (year) => L.tileLayer(
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`,
  {
    attribution: eoxAttribution(year),
    maxNativeZoom: 14,
    maxZoom: 17,
    tileSize: 256,
  }
);

const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri — Maxar/Earthstar — ~1 m opløsning over Grønland',
  maxZoom: 19,
});

const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels © Esri',
  maxZoom: 19,
});

export const basemaps = {
  esri: esriImagery,
  esri_hybrid: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri — Maxar/Earthstar',
      maxZoom: 19,
    }),
    esriLabels,
  ]),
  s2_2024: sentinelLayer(2024),
  s2_2023: sentinelLayer(2023),
  s2_2022: sentinelLayer(2022),
  s2_2020: sentinelLayer(2020),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap',
    maxZoom: 17,
    subdomains: 'abc',
  }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap-bidragsydere',
    maxZoom: 19,
  }),
};

basemaps.esri.addTo(map);

// Mutabel via setActiveBasemap() — UI-badges aflæser den.
export const state = {
  activeBasemap: 'esri',
};

export function setActiveBasemap(id) {
  state.activeBasemap = id;
}
