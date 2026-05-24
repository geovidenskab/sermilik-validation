// ArcticDEM 2 m via esri-leaflet ImageMapLayer + Esri global hillshade som fallback.

import { ARCTICDEM_URL, ARCTICDEM_ATTRIB } from './config.js';

export const arcticDemHillshade = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: { rasterFunction: 'Hillshade Multidirectional' },
  opacity: 0.55,
  attribution: ARCTICDEM_ATTRIB,
});

// Custom colormap tilpasset Sermilik-området (0-1500 m.o.h.).
//
// ArcticDEM-pixels er F32 (float meter), så ESRI's "Colormap" raster function
// virker ikke direkte (den forventer int-indeks). Vi chainer derfor:
//   1. Remap (float meter → int-index 1-9 baseret på højdebånd)
//   2. Colormap (int-index → RGB)
//
// Højde-bånd er kalibreret til Tasiilaq-området:
//   −∞   →  50 m  = mørkeblå   (fjord, havniveau)
//    50  → 150 m  = grøn       (kystland)
//   150  → 300 m  = lysgrøn    (TAS_L 250 m)
//   300  → 500 m  = gul-grøn
//   500  → 700 m  = gul        (Mittivakkat ligevægtslinje ~515 m, TAS_U 570 m)
//   700  → 900 m  = orange
//   900  → 1100 m = rødorange  (Mittivakkat top ~880 m, TAS_A 890 m)
//  1100  → 1500 m = mørkrød    (højeste fjeld)
//  1500  → +∞    = lys grå     (overgang til indlandsis)

const SERMILIK_HEIGHT_REMAP = {
  rasterFunction: 'Remap',
  rasterFunctionArguments: {
    InputRanges: [
      -200, 50,
        50, 150,
       150, 300,
       300, 500,
       500, 700,
       700, 900,
       900, 1100,
      1100, 1500,
      1500, 7000,
    ],
    OutputValues: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    AllowUnmatched: false,
  },
};

const SERMILIK_TINT_COLORMAP = [
  [1,  30,  80, 140],   // < 50 m   fjord
  [2, 100, 180, 140],   // 50-150   kystland
  [3, 160, 210, 140],   // 150-300  TAS_L
  [4, 210, 220, 140],   // 300-500
  [5, 240, 200, 100],   // 500-700  ligevægtslinje
  [6, 230, 150,  70],   // 700-900
  [7, 200, 100,  60],   // 900-1100 TAS_A / Mittivakkat top
  [8, 160,  80,  80],   // 1100-1500
  [9, 220, 220, 230],   // > 1500   indlandsis
];

export const arcticDemTinted = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: {
    rasterFunction: 'Colormap',
    rasterFunctionArguments: {
      Colormap: SERMILIK_TINT_COLORMAP,
      Raster: SERMILIK_HEIGHT_REMAP,
    },
  },
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
