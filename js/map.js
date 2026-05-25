// Leaflet-kort + alle baggrundskort-lag.
// Eksporterer kort-instansen samt basemaps-objektet og activeBasemap-tilstanden.

import { MAP_CENTER, MAP_INITIAL_ZOOM, eoxAttribution, GEBCO_WMS, GIBS_WMTS_BASE } from './config.js';

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

// Esri har MEGET VARIERENDE coverage over Grønland:
//   - Tasiilaq/Kulusuk: Maxar 1m op til z~16
//   - Sermilik feltstation (Mittivakkat): KUN low-res placeholder z>11
//   - Nuuk: ingen high-res
// Hvis vi tillader zoom forbi z14 vil Esri vise en lavopløsnings-placeholder.
// Vi sætter derfor maxNativeZoom: 14 så Leaflet upscaler eksisterende z14-tiles
// for konsistent visning (slørede men ikke skiftende). Den der vil have
// høj-opløsning over fjeldet skal bruge ArcticDEM tinted eller Sentinel-2.
const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri — Maxar/Earthstar — varieret opløsning over Grønland',
  maxNativeZoom: 14,
  maxZoom: 18,
});

const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels © Esri',
  maxNativeZoom: 16,
  maxZoom: 18,
});

// GEBCO bathymetri-baggrund — viser havdybde med bedrock topo under Grønland
export const gebcoBathymetry = L.tileLayer.wms(GEBCO_WMS, {
  layers: 'GEBCO_LATEST_SUB_ICE_TOPO',
  format: 'image/png',
  version: '1.1.1',
  attribution: 'GEBCO Compilation Group (2024) GEBCO 2024 Grid — CC BY 4.0',
});

// NASA GIBS overlay-lag (WMTS, daglig dækning)
// Default-tid 'default' = seneste tilgængelige scene
function gibsLayer(layerId, tileMatrixSet, ext, attribution, date = 'default') {
  return L.tileLayer(
    `${GIBS_WMTS_BASE}/${layerId}/default/${date}/${tileMatrixSet}/{z}/{y}/{x}.${ext}`,
    {
      attribution: 'NASA EOSDIS GIBS — ' + attribution,
      tileSize: 256,
      maxNativeZoom: parseInt(tileMatrixSet.match(/Level(\d+)/)?.[1] || '6', 10),
      maxZoom: 12,
    }
  );
}
// VIIRS_SNPP har bredere swath (3000 km vs MODIS 2300 km) — typisk ingen sorte
// huller mellem orbital tracks ved polerne. Daglig, ~375 m i band I.
export const gibsMODISTrueColor = gibsLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'GoogleMapsCompatible_Level9', 'jpg', 'VIIRS SNPP daglig — bred swath uden polare huller');
export const gibsMODISIceTemp = gibsLayer('MODIS_Terra_Ice_Surface_Temp_Day', 'GoogleMapsCompatible_Level7', 'png', 'MODIS Terra Ice Surface Temperature Day');
export const gibsMODISAlbedo = gibsLayer('MODIS_Combined_L3_Black_Sky_Albedo_Daily', 'GoogleMapsCompatible_Level7', 'png', 'MODIS Combined L3 Black-Sky Albedo Daily');
export const gibsSeaIceConc = gibsLayer('AMSRU2_Sea_Ice_Concentration_12km', 'GoogleMapsCompatible_Level6', 'png', 'AMSR2 Sea Ice Concentration 12 km');

export const basemaps = {
  esri: esriImagery,
  esri_hybrid: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri — Maxar/Earthstar',
      maxNativeZoom: 18,
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
  gebco: gebcoBathymetry,
  modis_truecolor: gibsMODISTrueColor,
};

basemaps.esri.addTo(map);

// Mutabel via setActiveBasemap() — UI-badges aflæser den.
export const state = {
  activeBasemap: 'esri',
};

export function setActiveBasemap(id) {
  state.activeBasemap = id;
}
