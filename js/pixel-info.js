// Pixel-info værktøj — klik et punkt eller markér en bbox på kortet og få
// satellit-pixel-værdier for det område.
//
// Henter via Sentinel Hub Statistical API (genbrug fra sentinel-stats.js):
//   - Sentinel-2 albedo (Liang)
//   - Sentinel-2 NDVI
//   - Sentinel-2 NDSI
//   - Landsat overfladetemperatur
//
// Plus ArcticDEM elevation via Esri ImageServer Identify endpoint.
//
// UI-flow:
//   1. Klik værktøjs-knap "🔍" i toolbar → mode aktiveres
//   2. Klik på kortet → 60×60 m bbox, viser én "pixel-stak"
//      ELLER træk-rektangel → større bbox, viser middel + range
//   3. Modal popup med tabeller af alle målte værdier
//   4. Tabel kan kopieres / eksporteres som CSV

import { map } from './map.js';
import { samplePoint } from './sentinel-stats.js';
import { SH_DEFAULT_DATES, SH_DATE_LS_KEY, ARCTICDEM_URL } from './config.js';

let active = false;
let toolButton = null;
let modalEl = null;

// Indtegning af rektangel
let drawing = null;       // { startLatLng, currentRect (L.rectangle) }
let dragStartPos = null;  // pixel-position når mousedown

// ─── Toolbar-knap ────────────────────────────────────────────────────────────
export function initPixelInfo() {
  // Tilføj toolbar-knap (placer før eksport)
  const toolBar = document.querySelector('.tool-bar');
  if (!toolBar) {
    console.warn('[pixel-info] .tool-bar ikke fundet — pixel-info værktøj ikke aktiveret');
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'tool-btn';
  btn.dataset.tool = 'pixel-info';
  btn.title = 'Pixel-info — klik på kortet for at hente satellit-værdier (albedo, NDVI, temp, elevation). Træk-rektangel for større område.';
  btn.textContent = '🔍';
  const exportBtn = toolBar.querySelector('[data-tool="export"]');
  if (exportBtn) toolBar.insertBefore(btn, exportBtn);
  else toolBar.appendChild(btn);
  toolButton = btn;
  // Forhindre at klik propagerer til kortet (ellers ville mousedown/up fyre med det samme)
  L.DomEvent.disableClickPropagation(btn);
  btn.addEventListener('click', () => {
    if (active) deactivate(); else activate();
  });

  // Esc deaktiverer
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && active) deactivate();
  });

  // Mouse-handlers — vi tracker mousedown/up så vi kan skelne klik fra drag
  map.on('mousedown', onMouseDown);
  map.on('mouseup', onMouseUp);
}

function activate() {
  active = true;
  toolButton?.classList.add('active');
  document.getElementById('map').classList.add('tool-active');
  map.dragging.disable();  // så vi kan tegne rektangel
}

function deactivate() {
  active = false;
  toolButton?.classList.remove('active');
  document.getElementById('map').classList.remove('tool-active');
  map.dragging.enable();
  if (drawing?.currentRect) map.removeLayer(drawing.currentRect);
  drawing = null;
}

// ─── Klik vs drag detection ──────────────────────────────────────────────────
function onMouseDown(e) {
  if (!active) return;
  dragStartPos = { x: e.containerPoint.x, y: e.containerPoint.y, latlng: e.latlng };
  drawing = { startLatLng: e.latlng, currentRect: null };
  map.on('mousemove', onMouseMove);
}

function onMouseMove(e) {
  if (!drawing) return;
  if (drawing.currentRect) map.removeLayer(drawing.currentRect);
  drawing.currentRect = L.rectangle(
    L.latLngBounds(drawing.startLatLng, e.latlng),
    { color: '#0A0F3C', weight: 2, fillColor: '#0A0F3C', fillOpacity: 0.15, dashArray: '4 4' }
  ).addTo(map);
}

function onMouseUp(e) {
  if (!active || !drawing) return;
  map.off('mousemove', onMouseMove);
  const distPx = dragStartPos
    ? Math.hypot(e.containerPoint.x - dragStartPos.x, e.containerPoint.y - dragStartPos.y)
    : 0;
  // Hvis brugeren bare klikkede (mindre end 5 px) — brug fast 60m bbox omkring punktet
  // Ellers brug det tegnede rektangel
  let bboxLatLng;
  if (distPx < 5) {
    bboxLatLng = makePointBbox(e.latlng, 60);  // 60m kvadrat
  } else {
    bboxLatLng = L.latLngBounds(drawing.startLatLng, e.latlng);
  }
  if (drawing.currentRect) { map.removeLayer(drawing.currentRect); }
  drawing = null;
  dragStartPos = null;
  openInfoModal(bboxLatLng);
}

function makePointBbox(latlng, sideMeters) {
  const dLat = (sideMeters / 2) / 111320;
  const dLng = (sideMeters / 2) / (111320 * Math.cos(latlng.lat * Math.PI / 180));
  return L.latLngBounds(
    L.latLng(latlng.lat - dLat, latlng.lng - dLng),
    L.latLng(latlng.lat + dLat, latlng.lng + dLng)
  );
}

// ─── Modal med resultater ────────────────────────────────────────────────────
function buildModal() {
  modalEl = document.createElement('div');
  modalEl.id = 'px-modal';
  modalEl.innerHTML = `
    <div class="px-modal-backdrop"></div>
    <div class="px-modal-card">
      <div class="px-modal-header">
        <h2>Pixel-info</h2>
        <button type="button" id="px-close">×</button>
      </div>
      <div class="px-modal-body">
        <div class="px-bbox-info" id="px-bbox"></div>
        <div class="px-date-info" id="px-date"></div>
        <div class="px-results" id="px-results">Henter…</div>
        <div class="px-actions">
          <button type="button" id="px-copy">Kopiér som tekst</button>
          <button type="button" id="px-close-btn">Luk</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalEl.querySelector('#px-close').addEventListener('click', closeModal);
  modalEl.querySelector('#px-close-btn').addEventListener('click', closeModal);
  modalEl.querySelector('.px-modal-backdrop').addEventListener('click', closeModal);
  modalEl.querySelector('#px-copy').addEventListener('click', copyAsText);
}

function closeModal() {
  if (modalEl) modalEl.classList.remove('open');
}

async function openInfoModal(bboxLatLng) {
  if (!modalEl) buildModal();
  modalEl.classList.add('open');

  const sw = bboxLatLng.getSouthWest();
  const ne = bboxLatLng.getNorthEast();
  const centerLat = (sw.lat + ne.lat) / 2;
  const centerLng = (sw.lng + ne.lng) / 2;
  // Beregn cirka størrelse i meter
  const widthM = Math.round((ne.lng - sw.lng) * 111320 * Math.cos(centerLat * Math.PI / 180));
  const heightM = Math.round((ne.lat - sw.lat) * 111320);

  // Læs Sentinel Hub-datoperiode fra localStorage (samme dato-vælger som WMS)
  const shDates = { ...SH_DEFAULT_DATES, ...(JSON.parse(localStorage.getItem(SH_DATE_LS_KEY) || '{}')) };
  let from, to, tol;
  if (shDates.mode === 'single') {
    tol = shDates.tolerance ?? 15;
    const t = new Date(shDates.target);
    from = new Date(t); from.setDate(t.getDate() - tol);
    to = new Date(t); to.setDate(t.getDate() + tol);
  } else {
    from = new Date(shDates.from);
    to = new Date(shDates.to);
  }
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const centerIso = new Date((from.getTime() + to.getTime()) / 2).toISOString().slice(0, 10);
  const halfDays = Math.round((to - from) / 86400000 / 2);

  modalEl.querySelector('#px-bbox').innerHTML = `
    <b>Område:</b> ${widthM}×${heightM} m omkring
    ${centerLat.toFixed(5)}°N · ${Math.abs(centerLng).toFixed(5)}°W
  `;
  modalEl.querySelector('#px-date').innerHTML = `
    <b>Tidsperiode:</b> ${fromIso} → ${toIso}${shDates.maxcc != null ? ` · maks ${shDates.maxcc}% skydække` : ''}
  `;

  // Hent alle 4 satellit-lag parallelt + ArcticDEM
  const resultsEl = modalEl.querySelector('#px-results');
  resultsEl.innerHTML = '<div class="px-loading">Henter satellit-data…</div>';

  // Brug centerLat/lng + tilpasset side-meter til samplePoint
  const sideM = Math.max(widthM, heightM, 60);
  const layers = [
    { key: 'S2_ALBEDO', label: 'Sentinel-2 albedo (Liang)', unit: '', decimals: 3 },
    { key: 'S2_NDVI', label: 'Sentinel-2 NDVI', unit: '', decimals: 3 },
    { key: 'S2_NDSI', label: 'Sentinel-2 NDSI (sne)', unit: '', decimals: 3 },
    { key: 'LANDSAT_LST', label: 'Landsat overflade-temp', unit: ' °C', decimals: 1 },
  ];
  // Start alle 4 + ArcticDEM
  const promises = layers.map(l =>
    samplePoint(l.key, centerLat, centerLng, centerIso, Math.max(halfDays, 15), {
      sideMeters: sideM,
      maxcc: shDates.maxcc ?? 60,
    }).catch(e => ({ value: null, error: e.message }))
  );
  const arcticPromise = fetchArcticDEMElevation(centerLat, centerLng).catch(e => ({ value: null, error: e.message }));
  const [sat0, sat1, sat2, sat3, arctic] = await Promise.all([...promises, arcticPromise]);
  const satResults = [sat0, sat1, sat2, sat3];

  // Render
  const rows = layers.map((l, i) => renderResultRow(l, satResults[i]));
  const arcticRow = renderArcticRow(arctic);
  resultsEl.innerHTML = `
    <table class="px-table">
      <thead><tr><th>Variabel</th><th>Værdi</th><th>Min / Max</th><th>Std</th><th>n px</th><th>Scene</th></tr></thead>
      <tbody>${arcticRow}${rows.join('')}</tbody>
    </table>
    <div class="px-tip">Tip: <b>klik</b> på kortet for ét pixel (60×60 m) eller <b>træk-rektangel</b> for større område.</div>
  `;
  // Gem til kopiering
  modalEl._lastResult = { centerLat, centerLng, widthM, heightM, fromIso, toIso, arctic, layers, satResults };
}

function renderResultRow(layerInfo, stats) {
  if (!stats || stats.value == null) {
    const err = stats?.error ? `<span class="px-err" title="${escapeHtml(stats.error)}">${escapeHtml(stats.error)}</span>` : '<span class="px-empty">ingen data</span>';
    return `<tr><th>${layerInfo.label}</th><td>${err}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
  }
  const v = stats.value.toFixed(layerInfo.decimals);
  const mn = stats.min != null ? stats.min.toFixed(layerInfo.decimals) : '—';
  const mx = stats.max != null ? stats.max.toFixed(layerInfo.decimals) : '—';
  const sd = stats.stDev != null ? stats.stDev.toFixed(layerInfo.decimals) : '—';
  const sceneDate = stats.sceneDate ? new Date(stats.sceneDate).toISOString().slice(0, 10) : '—';
  return `<tr>
    <th>${layerInfo.label}</th>
    <td><b>${v}${layerInfo.unit}</b></td>
    <td>${mn} / ${mx}</td>
    <td>${sd}</td>
    <td>${stats.count}</td>
    <td>${sceneDate}</td>
  </tr>`;
}

function renderArcticRow(arctic) {
  if (!arctic || arctic.value == null) {
    return `<tr><th>ArcticDEM elevation</th><td><span class="px-empty">${arctic?.error || 'ingen data'}</span></td><td>—</td><td>—</td><td>—</td><td>2 m DEM</td></tr>`;
  }
  return `<tr>
    <th>ArcticDEM elevation</th>
    <td><b>${arctic.value.toFixed(1)} m.o.h.</b></td>
    <td>—</td>
    <td>—</td>
    <td>1</td>
    <td>2 m DEM</td>
  </tr>`;
}

function copyAsText() {
  const r = modalEl._lastResult;
  if (!r) return;
  const lines = [
    `Pixel-info — ${r.centerLat.toFixed(5)}°N · ${Math.abs(r.centerLng).toFixed(5)}°W`,
    `Område: ${r.widthM} × ${r.heightM} m   Periode: ${r.fromIso} → ${r.toIso}`,
    '',
    'Variabel\tVærdi\tMin\tMax\tStd\tn\tScene',
  ];
  if (r.arctic?.value != null) lines.push(`ArcticDEM elevation\t${r.arctic.value.toFixed(1)} m.o.h.\t\t\t\t1\t2 m DEM`);
  r.layers.forEach((l, i) => {
    const s = r.satResults[i];
    if (s?.value != null) {
      lines.push(`${l.label}\t${s.value.toFixed(l.decimals)}${l.unit}\t${s.min?.toFixed(l.decimals) || ''}\t${s.max?.toFixed(l.decimals) || ''}\t${s.stDev?.toFixed(l.decimals) || ''}\t${s.count}\t${s.sceneDate?.slice(0,10) || ''}`);
    }
  });
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = modalEl.querySelector('#px-copy');
    const orig = btn.textContent;
    btn.textContent = '✓ Kopieret';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── ArcticDEM elevation via Esri ImageServer Identify ───────────────────────
async function fetchArcticDEMElevation(lat, lng) {
  // Esri ImageServer Identify-endpoint: returnerer pixel-værdi for et punkt
  const url = `${ARCTICDEM_URL}/identify?geometry=${lng},${lat}&geometryType=esriGeometryPoint&sr=4326&returnGeometry=false&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Esri Identify HTTP ${res.status}`);
  const data = await res.json();
  // Pixel-værdi i 'value' eller 'pixelValue' afhængigt af endpoint
  const v = data?.value ?? data?.pixelValue ?? data?.properties?.value;
  if (v == null || v === 'NoData') return { value: null, error: 'Uden for ArcticDEM-dækning' };
  const num = parseFloat(v);
  if (!Number.isFinite(num)) return { value: null, error: 'Ugyldig værdi' };
  return { value: num };
}
