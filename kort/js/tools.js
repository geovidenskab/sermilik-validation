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
let vertexMarkers = [];          // klikbare vertex-markører (kan slettes)
const drawnFeatures = [];
let drawHintBarEl = null;        // hint-bar øverst i kort
let drawHintBarCtrl = null;
let measureHintBarEl = null;
let measureHintBarCtrl = null;
let nameDialogEl = null;         // modal til navngivning

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
    // Cmd/Ctrl+Z fortryder sidste punkt mens man tegner
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && activeDrawType && drawingPoints.length > 0) {
      e.preventDefault();
      undoLastPoint();
    }
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
    vertexMarkers = [];
    map.doubleClickZoom.disable();
    showDrawHintBar();
  } else if (tool === 'measure') {
    showMeasureHintBar();
  }
}

function deactivateTool() {
  if (activeTool === 'measure') finishMeasure();
  if (activeTool === 'polygon' || activeTool === 'polyline') cancelDrawing();
  activeTool = null;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('map').classList.remove('tool-active');
  map.doubleClickZoom.enable();
  hideDrawHintBar();
  hideMeasureHintBar();
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
  const idx = drawingPoints.length - 1;
  const color = activeDrawType === 'polygon' ? '#D4763C' : '#0A0F3C';
  // Klikbar vertex-markør: klik på den for at slette punktet (handy hvis man tager fejl)
  const vm = L.circleMarker(latlng, {
    radius: 5, color, fillColor: '#fff', fillOpacity: 1, weight: 2,
  }).addTo(drawnLayer);
  vm._isTempVertex = true;
  vm._vertexIdx = idx;
  vm.on('click', e => {
    L.DomEvent.stopPropagation(e);
    removeVertex(vm._vertexIdx);
  });
  vm.bindTooltip(`Punkt ${idx + 1} — klik for at slette`, { direction: 'top', offset: [0, -6] });
  vertexMarkers.push(vm);
  redrawTempShape();
  updateDrawHintBar();
}

function removeVertex(idx) {
  if (idx < 0 || idx >= drawingPoints.length) return;
  drawingPoints.splice(idx, 1);
  // Genopbyg vertex-markører helt (indeks ændrer sig)
  vertexMarkers.forEach(m => drawnLayer.removeLayer(m));
  vertexMarkers = [];
  const color = activeDrawType === 'polygon' ? '#D4763C' : '#0A0F3C';
  drawingPoints.forEach((p, i) => {
    const vm = L.circleMarker(p, {
      radius: 5, color, fillColor: '#fff', fillOpacity: 1, weight: 2,
    }).addTo(drawnLayer);
    vm._isTempVertex = true;
    vm._vertexIdx = i;
    vm.on('click', e => { L.DomEvent.stopPropagation(e); removeVertex(vm._vertexIdx); });
    vm.bindTooltip(`Punkt ${i + 1} — klik for at slette`, { direction: 'top', offset: [0, -6] });
    vertexMarkers.push(vm);
  });
  redrawTempShape();
  updateDrawHintBar();
}

function undoLastPoint() {
  if (drawingPoints.length === 0) return;
  removeVertex(drawingPoints.length - 1);
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
  vertexMarkers.forEach(m => drawnLayer.removeLayer(m));
  vertexMarkers = [];
  drawnLayer.eachLayer(l => { if (l._isTempVertex) drawnLayer.removeLayer(l); });
  drawingPoints = [];
  activeDrawType = null;
}

function finishDrawing() {
  const minPoints = activeDrawType === 'polygon' ? 3 : 2;
  if (drawingPoints.length < minPoints) {
    const isPoly = activeDrawType === 'polygon';
    alert(`Du skal tilføje mindst ${minPoints} punkter for at lave ${isPoly ? 'et areal' : 'en linje'}.\n\nDu har ${drawingPoints.length}. Klik flere steder på kortet, eller tryk Esc for at annullere.`);
    return;
  }

  const isPolygon = activeDrawType === 'polygon';
  const defaultName = isPolygon ? `Areal ${drawnFeatures.length + 1}` : `Linje ${drawnFeatures.length + 1}`;
  // Snapshot drawing-state — vi cancel'er først efter at modal'en bekræfter
  const snapshotPoints = drawingPoints.slice();
  const snapshotType = activeDrawType;

  openNameDialog({
    title: isPolygon ? 'Navngiv areal' : 'Navngiv linje',
    defaultName,
    showYear: true,
    onSave: (name, year) => {
      const id = 'd_' + Date.now();
      const coords = snapshotPoints.map(p => [p.lng, p.lat]);
      let feature;
      if (isPolygon) {
        coords.push(coords[0]);
        const area = computePolygonArea(snapshotPoints);
        feature = {
          type: 'Feature',
          properties: {
            id, name: name || defaultName, type: 'polygon', color: '#D4763C',
            year: year ? (Number(year) || year) : null,
            area_m2: Math.round(area),
            area_km2: +(area / 1e6).toFixed(4),
            created: new Date().toISOString(),
          },
          geometry: { type: 'Polygon', coordinates: [coords] },
        };
      } else {
        const length = computePolylineLength(snapshotPoints);
        feature = {
          type: 'Feature',
          properties: {
            id, name: name || defaultName, type: 'polyline', color: '#0A0F3C',
            year: year ? (Number(year) || year) : null,
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
    },
    onCancel: () => {
      // Beholder tegningen åben så bruger kan fortsætte med at justere
    },
  });
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

// ─── Hint-bar øverst i kortet når tegne-værktøj er aktivt ────────────────────
function showDrawHintBar() {
  if (drawHintBarCtrl) return;
  drawHintBarCtrl = L.control({ position: 'topleft' });
  drawHintBarCtrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'draw-hint-bar');
    drawHintBarEl = div;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  drawHintBarCtrl.addTo(map);
  updateDrawHintBar();
}

function hideDrawHintBar() {
  if (drawHintBarCtrl) {
    drawHintBarCtrl.remove();
    drawHintBarCtrl = null;
    drawHintBarEl = null;
  }
}

function updateDrawHintBar() {
  if (!drawHintBarEl) return;
  const isPolygon = activeDrawType === 'polygon';
  const minPts = isPolygon ? 3 : 2;
  const n = drawingPoints.length;
  const enoughPoints = n >= minPts;

  let liveMeasure = '';
  if (n >= 2) {
    if (isPolygon && n >= 3) {
      const area = computePolygonArea(drawingPoints);
      liveMeasure = area < 1e6
        ? `${Math.round(area).toLocaleString('da-DK')} m²`
        : `${(area / 1e6).toFixed(3)} km²`;
    } else {
      const len = computePolylineLength(drawingPoints);
      liveMeasure = len < 1000
        ? `${Math.round(len)} m`
        : `${(len / 1000).toFixed(2)} km`;
    }
  }

  const typeLabel = isPolygon ? 'Tegner areal' : 'Tegner linje';
  drawHintBarEl.innerHTML = `
    <div class="hint-row hint-row-main">
      <span class="hint-title">${typeLabel}</span>
      <span class="hint-meta">${n} ${n === 1 ? 'punkt' : 'punkter'}${liveMeasure ? ' · ' + liveMeasure : ''}</span>
    </div>
    <div class="hint-row hint-row-actions">
      <button type="button" class="hint-btn hint-btn-primary" data-act="finish" ${enoughPoints ? '' : 'disabled'} title="Afslut og gem (Enter)">Færdig ✓</button>
      <button type="button" class="hint-btn" data-act="undo" ${n > 0 ? '' : 'disabled'} title="Fortryd sidste punkt (Cmd+Z)">↶ Fortryd</button>
      <button type="button" class="hint-btn hint-btn-cancel" data-act="cancel" title="Annullér tegning (Esc)">✕ Annullér</button>
    </div>
    <div class="hint-help">
      Klik på kortet for at tilføje punkter. Klik på et eksisterende punkt for at slette det.
      ${enoughPoints ? '' : `<br>Du skal bruge mindst ${minPts} ${isPolygon ? 'hjørner' : 'punkter'} for at gemme.`}
    </div>
  `;
  drawHintBarEl.querySelector('[data-act="finish"]')?.addEventListener('click', () => finishDrawing());
  drawHintBarEl.querySelector('[data-act="undo"]')?.addEventListener('click', () => undoLastPoint());
  drawHintBarEl.querySelector('[data-act="cancel"]')?.addEventListener('click', () => deactivateTool());
}

// ─── Mål-afstand hint-bar (mindre, simplere) ─────────────────────────────────
function showMeasureHintBar() {
  if (measureHintBarCtrl) return;
  measureHintBarCtrl = L.control({ position: 'topleft' });
  measureHintBarCtrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'draw-hint-bar measure-hint');
    measureHintBarEl = div;
    div.innerHTML = `
      <div class="hint-row hint-row-main">
        <span class="hint-title">Mål afstand</span>
      </div>
      <div class="hint-help">
        Klik på kortet for at sætte målepunkter — distance opdateres mens du klikker.<br>
        Tryk <b>Esc</b> eller klik værktøjs-knappen igen for at afslutte.
      </div>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  measureHintBarCtrl.addTo(map);
}

function hideMeasureHintBar() {
  if (measureHintBarCtrl) {
    measureHintBarCtrl.remove();
    measureHintBarCtrl = null;
    measureHintBarEl = null;
  }
}

// ─── Navngivnings-modal (erstatter prompt()) ──────────────────────────────────
function openNameDialog({ title, defaultName, showYear, onSave, onCancel }) {
  if (!nameDialogEl) {
    nameDialogEl = document.createElement('div');
    nameDialogEl.id = 'name-dialog';
    nameDialogEl.innerHTML = `
      <div class="name-dialog-backdrop"></div>
      <div class="name-dialog-card">
        <div class="name-dialog-header">
          <h2 id="nd-title">Navngiv</h2>
          <button type="button" id="nd-close">×</button>
        </div>
        <div class="name-dialog-body">
          <label>Navn
            <input type="text" id="nd-name" autocomplete="off">
          </label>
          <label id="nd-year-row">Årstal (valgfrit — fx for gletsjerfront 2024)
            <input type="number" id="nd-year" min="1900" max="2100">
          </label>
          <div class="name-dialog-actions">
            <button type="button" id="nd-cancel">Annullér</button>
            <button type="button" id="nd-save" class="primary">Gem</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(nameDialogEl);
  }

  nameDialogEl.querySelector('#nd-title').textContent = title;
  const nameIn = nameDialogEl.querySelector('#nd-name');
  const yearIn = nameDialogEl.querySelector('#nd-year');
  const yearRow = nameDialogEl.querySelector('#nd-year-row');
  nameIn.value = defaultName;
  yearIn.value = new Date().getFullYear();
  yearRow.style.display = showYear ? '' : 'none';
  nameDialogEl.classList.add('open');
  setTimeout(() => { nameIn.focus(); nameIn.select(); }, 50);

  const close = () => nameDialogEl.classList.remove('open');
  const handleSave = () => {
    const name = nameIn.value.trim();
    const year = showYear ? (yearIn.value.trim() || null) : null;
    close();
    onSave?.(name || defaultName, year);
  };
  const handleCancel = () => { close(); onCancel?.(); };

  // Clean op tidligere event-handlers ved at klone elements
  const replaceHandler = (sel, handler) => {
    const el = nameDialogEl.querySelector(sel);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('click', handler);
    return clone;
  };
  replaceHandler('#nd-save', handleSave);
  replaceHandler('#nd-cancel', handleCancel);
  replaceHandler('#nd-close', handleCancel);
  replaceHandler('.name-dialog-backdrop', handleCancel);

  // Enter gemmer, Esc annullerer
  const keyHandler = e => {
    if (!nameDialogEl.classList.contains('open')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }
    if (e.key === 'Enter' && document.activeElement?.id !== 'nd-cancel') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };
  document.addEventListener('keydown', keyHandler);
}
