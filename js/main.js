// Entry point. Initialiserer alle moduler i korrekt rækkefølge.
//
// Rækkefølge er vigtig:
//   1. map.js + markers.js har allerede side-effekter ved import (kort + markører oprettes)
//   2. layer-control.js bygger UI for de allerede-oprettede lag
//   3. sentinel-hub.js sætter sin egen UI op og loader instance ID fra localStorage
//   4. tools.js tilføjer værktøjslinje
//   5. ui.js tilføjer badges, legend, scalebar
//   6. validation.js er en stub indtil Sprint 2

import './map.js';
import './markers.js';
import { buildAllLayerControls } from './layer-control.js';
import { initSentinelHubUI, setOnLayersChanged } from './sentinel-hub.js';
import { addToolBar, loadDrawings } from './tools.js';
import {
  addBasemapBadge, updateBasemapBadge, addLegend, addScaleBar, addCoordReadout, addMobileToggle,
  addSpectralLegendBox, addPanelCollapseToggles,
} from './ui.js';
import { initValidation } from './validation.js';
import './promice-viewer.js';  // side-effekt: registrerer window.__openPromiceViewer

// 1. Lag-panelet — basemap-radioer, POI-overlays, geologi, terræn
buildAllLayerControls(updateBasemapBadge);

// 2. Sentinel Hub UI (dato-vælger, spektral/glacial/thermal-lag)
setOnLayersChanged(updateBasemapBadge);
initSentinelHubUI();

// 3. Værktøjer
addToolBar();
loadDrawings();

// 4. Kort-overlays (badges, legend, koord-readout, mobile)
addBasemapBadge();
addSpectralLegendBox();   // signaturforklaringer for satellit-lag (stacker når flere er aktive)
addLegend();              // marker-typer
addScaleBar();
addCoordReadout();
addMobileToggle();

// 5. Validation
initValidation();

// 6. Foldelige panel-sektioner (kører efter alt UI er bygget)
addPanelCollapseToggles();
