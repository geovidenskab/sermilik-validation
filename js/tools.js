// Interaktive værktøjer på kortet:
//   - 📏 Mål afstand
//   - 📍 Afsæt punkt (simpel pin med koordinat — bliver erstattet/udvidet i validation.js)
//   - 📐 Tegn polygon (med areal)
//   - 〰️ Tegn polyline (med længde)
//   - 💾 GeoJSON-eksport
//   - 🗑️ Ryd målinger og pins
// Tegninger persisteres i localStorage.

import { map } from './map.js';
import { makeIcon } from './markers.js';
import { DRAWN_LS_KEY } from './config.js';

let activeTool = null;
const measureLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const drawnLayer = L.featureGroup().addTo(map);
let measurePoints = [];
let measureLine = null;
let measurePopup = null;
let pinCounter = 0;

let activeDrawType = null;       // 'polygon' | 'polyline' | null
let drawingPoints = [];
let tempShape = null;
let cursorLine = null;
const drawnFeatures = [];

// ─── Toolbar UI ────────────────────────────────────────────────────────────────
export function addToolBar() {
  const toolBar = L.control({ position: 'topleft' });
  toolBar.onAdd = function () {
    const div = L.DomUtil.create('div', 'tool-bar leaflet-bar');
    div.innerHTML = `
      <button class="tool-btn" data-tool="measure" title="Mål afstand (klik waypoints, dobbeltklik afslutter, Esc annullerer)">⟷</button>
      <button class="tool-btn" data-tool="pin" title="Afsæt punkt — klik på kortet for at lægge en markør med koordinat">◉</button>
      <button class="tool-btn" data-tool="polygon" title="Tegn areal — klik vertices, dobbeltklik afslutter. Bruges fx til ablationsområde.">⬡</button>
      <button class="tool-btn" data-tool="polyline" title="Tegn linje — klik vertices, dobbeltklik afslutter. Bruges fx til gletsjerfront.">∿</button>
      <button class="tool-btn" data-tool="export" title="Eksportér alle tegninger som GeoJSON (åbnes direkte i QGIS)">⇩</button>
      <button class="tool-btn danger" data-tool="clear" title="Ryd målinger og pins (tegninger bevares — slet enkelt-tegninger via popup)">✕</button>
    `;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  toolBar.addTo(map);

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool === 'clear') { clearAll(); return; }
      if (tool === 'export') { exportGeoJSON(); return; }
      if (activeTool === tool) deactivateTool();
      else activateTool(tool);
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') deactivateTool();
    if (e.key === 'Enter' && activeDrawType) finishDrawing();
  });

  map.on('click', e => {
    if (activeTool === 'measure') addMeasurePoint(e.latlng);
    else if (activeTool === 'pin') addPin(e.latlng);
    else if (activeDrawType) addDrawPoint(e.latlng);
  });
  map.on('dblclick', e => {
    if (activeTool === 'measure') { L.DomEvent.preventDefault(e.originalEvent); deactivateTool(); }
    else if (activeDrawType) { L.DomEvent.preventDefault(e.originalEvent); finishDrawing(); }
  });
  map.on('mousemove', e => {
    if (activeDrawType && drawingPoints.length > 0) {
      if (cursorLine) drawnLayer.removeLayer(cursorLine);
      const lastPt = drawingPoints[drawingPoints.length - 1];
      cursorLine = L.polyline([lastPt, e.latlng], {
        color: '#888', weight: 1, dashArray: '4 4', interactive: false,
      }).addTo(drawnLayer);
    }
  });
}

function activateTool(tool) {
  deactivateTool();
  activeTool = tool;
  document.querySelector(`.tool-btn[data-tool="${tool}"]`).classList.add('active');
  document.getElementById('map').classList.add('tool-active');
  if (tool === 'polygon' || tool === 'polyline') {
    activeDrawType = tool;
    drawingPoints = [];
    map.doubleClickZoom.disable();
  }
}

function deactivateTool() {
  if (activeTool === 'measure') finishMeasure();
  if (activeTool === 'polygon' || activeTool === 'polyline') cancelDrawing();
  activeTool = null;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('map').classList.remove('tool-active');
  map.doubleClickZoom.enable();
}

// ─── MÅL AFSTAND ───────────────────────────────────────────────────────────────
function addMeasurePoint(latlng) {
  measurePoints.push(latlng);
  L.circleMarker(latlng, {
    radius: 4, color: '#D4763C', fillColor: '#D4763C', fillOpacity: 1, weight: 2,
  }).addTo(measureLayer);

  if (measurePoints.length >= 2) {
    if (measureLine) measureLayer.removeLayer(measureLine);
    measureLine = L.polyline(measurePoints, {
      color: '#D4763C', weight: 3, dashArray: '6 4',
    });
    measureLayer.addLayer(measureLine);

    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += map.distance(measurePoints[i - 1], measurePoints[i]);
    }
    const distStr = total < 1000 ? `${total.toFixed(0)} m` : `${(total / 1000).toFixed(2)} km`;

    if (measurePopup) map.closePopup(measurePopup);
    measurePopup = L.popup({
      closeButton: false, autoClose: false, closeOnClick: false, className: 'tool-popup',
    })
      .setLatLng(latlng)
      .setContent(`<b>${distStr}</b><br><span style="font-size:0.75rem; color:#666;">${measurePoints.length - 1} segment${measurePoints.length - 1 === 1 ? '' : 'er'} · dobbeltklik for at afslutte</span>`)
      .openOn(map);
  }
}

function finishMeasure() {
  measurePoints = [];
  measureLine = null;
}

// ─── AFSÆT PUNKT ───────────────────────────────────────────────────────────────
function addPin(latlng) {
  pinCounter++;
  const id = pinCounter;
  const latStr = latlng.lat.toFixed(6);
  const lngStr = latlng.lng.toFixed(6);
  const ns = latlng.lat >= 0 ? 'N' : 'S';
  const ew = latlng.lng >= 0 ? 'E' : 'W';

  const popupHtml = `
    <div class="tool-popup">
      <h3>Afsat punkt #${id}</h3>
      <p class="coord">${Math.abs(latlng.lat).toFixed(6)}°${ns}, ${Math.abs(latlng.lng).toFixed(6)}°${ew}</p>
      <p style="font-family: ui-monospace, monospace; font-size:0.78rem; background:#f5f7fa; padding:0.3rem; border-radius:3px;">[${latStr}, ${lngStr}]</p>
      <p>
        <button onclick="navigator.clipboard.writeText('[${latStr}, ${lngStr}]'); this.textContent='✓ Kopieret';">Kopiér som [lat, lng]</button>
        <button onclick="window.removePin(${id})">Slet</button>
      </p>
    </div>`;

  const m = L.marker(latlng, {
    icon: makeIcon('dropped-pin', 14),
    title: `Punkt #${id}`,
  }).bindPopup(popupHtml);
  m._pinId = id;
  pinLayer.addLayer(m);
  m.openPopup();
}

window.removePin = function (id) {
  pinLayer.eachLayer(m => { if (m._pinId === id) pinLayer.removeLayer(m); });
};

// ─── TEGN POLYGON / POLYLINE ───────────────────────────────────────────────────
function addDrawPoint(latlng) {
  if (drawingPoints.length > 0) {
    const last = drawingPoints[drawingPoints.length - 1];
    if (map.distance(last, latlng) < 5) return;
  }
  drawingPoints.push(latlng);
  L.circleMarker(latlng, {
    radius: 3,
    color: activeDrawType === 'polygon' ? '#D4763C' : '#0A0F3C',
    fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false,
  }).addTo(drawnLayer)._isTempVertex = true;
  redrawTempShape();
}

function redrawTempShape() {
  if (tempShape) drawnLayer.removeLayer(tempShape);
  if (drawingPoints.length < 2) return;
  if (activeDrawType === 'polygon' && drawingPoints.length >= 3) {
    tempShape = L.polygon(drawingPoints, {
      color: '#D4763C', weight: 2, fillColor: '#D4763C', fillOpacity: 0.18,
      dashArray: '4 4', interactive: false,
    }).addTo(drawnLayer);
  } else {
    tempShape = L.polyline(drawingPoints, {
      color: activeDrawType === 'polygon' ? '#D4763C' : '#0A0F3C',
      weight: 2, dashArray: '4 4', interactive: false,
    }).addTo(drawnLayer);
  }
}

function cancelDrawing() {
  if (cursorLine) { drawnLayer.removeLayer(cursorLine); cursorLine = null; }
  if (tempShape) { drawnLayer.removeLayer(tempShape); tempShape = null; }
  drawnLayer.eachLayer(l => { if (l._isTempVertex) drawnLayer.removeLayer(l); });
  drawingPoints = [];
  activeDrawType = null;
}

function finishDrawing() {
  const minPoints = activeDrawType === 'polygon' ? 3 : 2;
  if (drawingPoints.length < minPoints) {
    cancelDrawing(); deactivateTool(); return;
  }

  const isPolygon = activeDrawType === 'polygon';
  const defaultName = isPolygon ? `Areal ${drawnFeatures.length + 1}` : `Linje ${drawnFeatures.length + 1}`;
  const name = prompt(`Navn for ${isPolygon ? 'arealet' : 'linjen'}:`, defaultName);
  if (name === null) { cancelDrawing(); deactivateTool(); return; }
  const yearInput = prompt('Årstal (valgfrit — fx for gletsjerfront 2024):', new Date().getFullYear());

  const id = 'd_' + Date.now();
  const coords = drawingPoints.map(p => [p.lng, p.lat]);
  let feature;

  if (isPolygon) {
    coords.push(coords[0]);
    const area = computePolygonArea(drawingPoints);
    feature = {
      type: 'Feature',
      properties: {
        id, name: name || defaultName, type: 'polygon', color: '#D4763C',
        year: yearInput ? Number(yearInput) || yearInput : null,
        area_m2: Math.round(area),
        area_km2: +(area / 1e6).toFixed(4),
        created: new Date().toISOString(),
      },
      geometry: { type: 'Polygon', coordinates: [coords] },
    };
  } else {
    const length = computePolylineLength(drawingPoints);
    feature = {
      type: 'Feature',
      properties: {
        id, name: name || defaultName, type: 'polyline', color: '#0A0F3C',
        year: yearInput ? Number(yearInput) || yearInput : null,
        length_m: Math.round(length),
        length_km: +(length / 1000).toFixed(3),
        created: new Date().toISOString(),
      },
      geometry: { type: 'LineString', coordinates: coords },
    };
  }

  cancelDrawing();
  addFeatureFromGeoJSON(feature, true);
  saveDrawings();
  deactivateTool();
}

function computePolygonArea(latlngs) {
  if (latlngs.length < 3) return 0;
  const R = 6378137;
  const toRad = d => d * Math.PI / 180;
  let total = 0;
  const n = latlngs.length;
  for (let i = 0; i < n; i++) {
    const p1 = latlngs[i];
    const p2 = latlngs[(i + 1) % n];
    total += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs(total * R * R / 2);
}

function computePolylineLength(latlngs) {
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    total += map.distance(latlngs[i - 1], latlngs[i]);
  }
  return total;
}

function addFeatureFromGeoJSON(feature, openPopup = false) {
  const type = feature.geometry.type;
  const props = feature.properties || {};
  let leafletLayer;

  if (type === 'Polygon') {
    const coords = feature.geometry.coordinates[0]
      .slice(0, -1)
      .map(([lng, lat]) => [lat, lng]);
    leafletLayer = L.polygon(coords, {
      color: props.color || '#D4763C', weight: 2,
      fillColor: props.color || '#D4763C', fillOpacity: 0.22,
    });
  } else if (type === 'LineString') {
    const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    leafletLayer = L.polyline(coords, { color: props.color || '#0A0F3C', weight: 3 });
  }
  if (!leafletLayer) return;

  leafletLayer.bindPopup(makeDrawingPopupHtml(props));
  drawnLayer.addLayer(leafletLayer);
  drawnFeatures.push({ id: props.id, geojson: feature, leafletLayer });
  if (openPopup) leafletLayer.openPopup();
}

function makeDrawingPopupHtml(props) {
  const meta = props.area_m2 != null
    ? `<b>Areal:</b> ${props.area_km2} km² <span style="color:#888;">(${props.area_m2.toLocaleString('da-DK')} m²)</span>`
    : `<b>Længde:</b> ${props.length_km} km <span style="color:#888;">(${props.length_m.toLocaleString('da-DK')} m)</span>`;
  const yearLine = props.year ? `<p style="font-size:0.78rem;">Årstal: <b>${props.year}</b></p>` : '';
  return `
    <div class="tool-popup">
      <h3>${props.name}</h3>
      <p style="font-size:0.82rem;">${meta}</p>
      ${yearLine}
      <p>
        <button onclick="window.renameDrawing('${props.id}')">Omdøb</button>
        <button onclick="window.deleteDrawing('${props.id}')">Slet</button>
      </p>
    </div>
  `;
}

window.deleteDrawing = function (id) {
  const idx = drawnFeatures.findIndex(f => f.id === id);
  if (idx < 0) return;
  if (!confirm(`Slet "${drawnFeatures[idx].geojson.properties.name}"?`)) return;
  drawnLayer.removeLayer(drawnFeatures[idx].leafletLayer);
  drawnFeatures.splice(idx, 1);
  saveDrawings();
};

window.renameDrawing = function (id) {
  const f = drawnFeatures.find(x => x.id === id);
  if (!f) return;
  const newName = prompt('Nyt navn:', f.geojson.properties.name);
  if (newName === null) return;
  f.geojson.properties.name = newName;
  f.leafletLayer.setPopupContent(makeDrawingPopupHtml(f.geojson.properties));
  f.leafletLayer.openPopup();
  saveDrawings();
};

// ─── Persistens ────────────────────────────────────────────────────────────────
function saveDrawings() {
  const fc = { type: 'FeatureCollection', features: drawnFeatures.map(f => f.geojson) };
  try { localStorage.setItem(DRAWN_LS_KEY, JSON.stringify(fc)); }
  catch (e) { console.warn('Kunne ikke gemme tegninger til localStorage:', e); }
}

export function loadDrawings() {
  const raw = localStorage.getItem(DRAWN_LS_KEY);
  if (!raw) return;
  try {
    const fc = JSON.parse(raw);
    if (fc && Array.isArray(fc.features)) {
      fc.features.forEach(f => addFeatureFromGeoJSON(f, false));
    }
  } catch (e) {
    console.warn('Kunne ikke indlæse cachede tegninger:', e);
  }
}

function exportGeoJSON() {
  if (drawnFeatures.length === 0) {
    alert('Ingen tegninger at eksportere endnu. Tegn med 📐 eller 〰️ først.');
    return;
  }
  const fc = {
    type: 'FeatureCollection',
    name: 'sermilik_tegninger',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: drawnFeatures.map(f => f.geojson),
  };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sermilik-tegninger-${date}.geojson`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clearAll() {
  measureLayer.clearLayers();
  pinLayer.clearLayers();
  measurePoints = [];
  measureLine = null;
  if (measurePopup) { map.closePopup(measurePopup); measurePopup = null; }
  pinCounter = 0;
  map.closePopup();
  deactivateTool();
}
