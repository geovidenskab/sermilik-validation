// ArcticDEM 2 m via esri-leaflet ImageMapLayer + Esri global hillshade som fallback.

import { ARCTICDEM_URL, ARCTICDEM_ATTRIB } from './config.js';

export const arcticDemHillshade = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: { rasterFunction: 'Hillshade Multidirectional' },
  opacity: 0.55,
  attribution: ARCTICDEM_ATTRIB,
});

// Custom colormap tilpasset Sermilik-området (0-1500 m.o.h.).
// Standard "Hillshade Elevation Tinted" dækker hele Grønland (0-3000+m), så
// kystfjeld og dale i Sermilik (typisk 0-1000m) får kun en del af skalaen.
// Den her sætter dramatiske farveskift omkring de højder vi har i Tasiilaq:
//   0 m   = mørkeblå (fjord/havniveau)
//   50 m  = grøn (kystlinje, lavt land)
//   150 m = lysgrøn (TAS_L: 250 m)
//   300 m = gul-grøn
//   500 m = gul (Mittivakkat ligevægtslinje ~515 m, TAS_U 570 m)
//   700 m = orange
//   900 m = rødorange (Mittivakkat top ~880 m, TAS_A 890 m)
//  1100 m = mørkrød
//  1500 m = lys grå (overgang til indlandsis)
//  3000 m = hvid (indlandsisens centrum)
const SERMILIK_TINT_COLORMAP = [
  [   0,  30,  80, 140],
  [  50, 100, 180, 140],
  [ 150, 160, 210, 140],
  [ 300, 210, 220, 140],
  [ 500, 240, 200, 100],
  [ 700, 230, 150,  70],
  [ 900, 200, 100,  60],
  [1100, 160,  80,  80],
  [1500, 220, 220, 230],
  [3000, 255, 255, 255],
];

export const arcticDemTinted = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: {
    rasterFunction: 'Colormap',
    rasterFunctionArguments: { Colormap: SERMILIK_TINT_COLORMAP },
  },
  opacity: 0.8,
  attribution: ARCTICDEM_ATTRIB,
});

export const arcticDemSlope = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: { rasterFunction: 'Slope Map' },
  opacity: 0.5,
  attribution: ARCTICDEM_ATTRIB,
});

export const esriHillshade = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Hillshade © Esri',
  opacity: 0.5,
  maxZoom: 16,
});
