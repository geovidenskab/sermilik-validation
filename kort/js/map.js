// Leaflet-kort + alle baggrundskort-lag.
// Eksporterer kort-instansen samt basemaps-objektet og activeBasemap-tilstanden.

import { eoxAttribution, GEBCO_WMS, GIBS_WMTS_BASE, DF_BASE, DF_TOKEN } from './config.js';
import { profil } from './profiles.js';

// Centrum, zoom og eventuel ramme kommer fra den aktive områdeprofil.
// Rammen bruges af det danske kort: den holder eleverne inden for landet, så
// et tændt satellitlag ikke kan sende forespørgsler ud over hele kloden.
export const map = L.map('map', {
  center: profil.center,
  zoom: profil.zoom,
  zoomControl: true,
  ...(profil.minZoom ? { minZoom: profil.minZoom } : {}),
  ...(profil.maxBounds ? { maxBounds: profil.maxBounds, maxBoundsViscosity: 0.75 } : {}),
});

// ─── Danske baggrundskort (Dataforsyningen) ───────────────────────────────────
// Gratis og ucachet af Sentinel Hub-kvoten. På geo.sg.dk går de gennem den
// samme cachende proxy som landskabskortet, så flisene ofte er varme.
const dfWMS = (service, layer, format) => L.tileLayer.wms(
  `${DF_BASE}/${service}?token=${DF_TOKEN}`,
  {
    layers: layer,
    format,
    transparent: false,
    version: '1.1.1',
    updateWhenIdle: true,
    updateWhenZooming: false,
    maxZoom: 21,
    attribution: 'Dataforsyningen',
  }
);

// 12,5 cm ortofoto — det er opløsningen, der gør den blandede pixel synlig:
// en Sentinel-2 pixel på 10 m dækker her 80×80 luftfoto-pixels.
export const dkOrtofoto = dfWMS('orto_foraar_DAF', 'orto_foraar_12_5', 'image/jpeg');
export const dkSkaermkort = dfWMS('topo_skaermkort_DAF', 'topo_skaermkort', 'image/png');

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
// VIGTIGT: GIBS produkter understøtter IKKE 'default' som time. Vi angiver
// eksplicit en dato. Forsinkelse afhænger af produkt-type:
//   - VIIRS/MODIS True Color: typisk 1 dag (yesterday)
//   - MODIS L3 Black-Sky Albedo: 2-3 dages forsinkelse
function gibsDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function gibsLayer(layerId, tileMatrixSet, ext, attribution, date = gibsDaysAgo(1)) {
  return L.tileLayer(
    `${GIBS_WMTS_BASE}/${layerId}/default/${date}/${tileMatrixSet}/{z}/{y}/{x}.${ext}`,
    {
      attribution: `NASA EOSDIS GIBS — ${attribution} (${date})`,
      tileSize: 256,
      maxNativeZoom: parseInt(tileMatrixSet.match(/Level(\d+)/)?.[1] || '6', 10),
      maxZoom: 12,
    }
  );
}
// VIIRS_SNPP har bredere swath (3000 km vs MODIS 2300 km) — typisk ingen sorte
// huller mellem orbital tracks ved polerne. Daglig, ~375 m i band I.
// True Color: 1 dags forsinkelse — VIIRS-tiles for "i går" er klar
export const gibsMODISTrueColor = gibsLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'GoogleMapsCompatible_Level9', 'jpg', 'VIIRS SNPP daglig — bred swath uden polare huller', gibsDaysAgo(1));
// MODIS Ice Temp: 1-2 dages forsinkelse — bruger 2 dage tilbage for sikkerhed
export const gibsMODISIceTemp = gibsLayer('MODIS_Terra_Ice_Surface_Temp_Day', 'GoogleMapsCompatible_Level7', 'png', 'MODIS Terra Ice Surface Temperature Day', gibsDaysAgo(2));
// MODIS Black-Sky Albedo: KRÆVER Level8 (ikke 7) — verificeret mod WMTSCapabilities.
// L3-produkt med 2-3 dages forsinkelse — bruger 3 dage tilbage.
export const gibsMODISAlbedo = gibsLayer('MODIS_Combined_L3_Black_Sky_Albedo_Daily', 'GoogleMapsCompatible_Level8', 'png', 'MODIS Combined L3 Black-Sky Albedo Daily', gibsDaysAgo(3));

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
  modis_truecolor: gibsMODISTrueColor,  // tilbageholdt for layer-control fallback
  ortofoto: dkOrtofoto,
  skaermkort: dkSkaermkort,
};

const startBasemap = basemaps[profil.defaultBasemap] ? profil.defaultBasemap : 'esri';
basemaps[startBasemap].addTo(map);

// Mutabel via setActiveBasemap() — UI-badges aflæser den.
export const state = {
  activeBasemap: startBasemap,
};

export function setActiveBasemap(id) {
  state.activeBasemap = id;
}
