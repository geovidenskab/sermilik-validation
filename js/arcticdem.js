// ArcticDEM 2 m via esri-leaflet ImageMapLayer + Esri global hillshade som fallback.

import { ARCTICDEM_URL, ARCTICDEM_ATTRIB } from './config.js';

export const arcticDemHillshade = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: { rasterFunction: 'Hillshade Multidirectional' },
  opacity: 0.55,
  attribution: ARCTICDEM_ATTRIB,
});

export const arcticDemTinted = L.esri.imageMapLayer({
  url: ARCTICDEM_URL,
  renderingRule: { rasterFunction: 'Hillshade Elevation Tinted' },
  opacity: 0.65,
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
