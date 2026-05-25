// Validation-punkter — felt-målinger med foto, EXIF og ground-data.
//
// Datamodel (gemt som JSON i localStorage under VALIDATION_LS_KEY):
//   {
//     id, name, lat, lng, elevation_m,
//     timestamp_ground,           // ISO 8601
//     photos: [
//       { id, dataUrl, filename, exif: { DateTimeOriginal, GPSLatitude, ... } }
//     ],
//     ground: {
//       albedo_measured,           // 0-1
//       temp_surface_C,
//       temp_air_C,
//       veg_cover_pct,             // 0-100
//       veg_type,
//       notes
//     },
//     satellite: {},               // Sprint 3
//     created, modified            // ISO 8601
//   }
//
// Eksterne afhængigheder:
//   - L (Leaflet, global)
//   - exifr (global via UMD CDN)
//   - map fra ./map.js

import { map } from './map.js';
import { VALIDATION_LS_KEY } from './config.js';
import { openPhotoAlbedo } from './photo-albedo.js';
import { fetchAllStatsForPoint, STATS_LAYER_INFO } from './sentinel-stats.js';

const PHOTO_MAX_DIM = 1200;    // max bredde/højde for resized foto
const PHOTO_JPEG_QUALITY = 0.78;

// ─── State ────────────────────────────────────────────────────────────────────
const validationPoints = [];        // array af punkt-objekter
const markerById = new Map();       // id → L.marker
const layerGroup = L.layerGroup().addTo(map);
let activeMode = false;             // når true, klik på kort = afsæt punkt
let toolButton = null;              // toolbar-knappen (for active-styling)

// ─── Persistens ───────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(VALIDATION_LS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      arr.forEach(p => { validationPoints.push(p); addMarker(p); });
    }
  } catch (e) {
    console.warn('Kunne ikke indlæse validation-punkter:', e);
  }
}

function save() {
  try {
    localStorage.setItem(VALIDATION_LS_KEY, JSON.stringify(validationPoints));
  } catch (e) {
    console.warn('Kunne ikke gemme validation-punkter:', e);
    alert('Kunne ikke gemme — localStorage er fyldt. Slet nogle punkter eller eksportér som GeoJSON.');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid(prefix = 'v') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso() { return new Date().toISOString(); }

function findPoint(id) { return validationPoints.find(p => p.id === id); }

// Resize foto til max-dim og returnér base64 dataURL (jpeg)
async function fileToResizedDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > PHOTO_MAX_DIM || height > PHOTO_MAX_DIM) {
    const scale = Math.min(PHOTO_MAX_DIM / width, PHOTO_MAX_DIM / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
}

// Parse EXIF og udtræk relevante felter
async function readExif(file) {
  if (typeof exifr === 'undefined') return null;
  try {
    const e = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'Make', 'Model', 'ExposureTime', 'ISO', 'FNumber']);
    return e || null;
  } catch {
    return null;
  }
}

// ─── Marker + popup ──────────────────────────────────────────────────────────
const validationIcon = L.divIcon({
  className: 'validation-marker',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function addMarker(point) {
  const m = L.marker([point.lat, point.lng], { icon: validationIcon, title: point.name });
  m.bindPopup(() => renderPopup(point), { maxWidth: 360, minWidth: 280 });
  layerGroup.addLayer(m);
  markerById.set(point.id, m);
  return m;
}

function removeMarker(id) {
  const m = markerById.get(id);
  if (m) { layerGroup.removeLayer(m); markerById.delete(id); }
}

function renderPopup(p) {
  const ground = p.ground || {};
  const photoCount = p.photos?.length || 0;
  const firstPhoto = p.photos?.[0];
  const photoThumbs = (p.photos || []).map(ph =>
    `<img src="${ph.dataUrl}" class="vp-thumb" alt="${ph.filename}" title="${ph.filename}" data-vp-photo="${p.id}">`
  ).join('');

  const fmt = (v, suffix = '') => (v === null || v === undefined || v === '') ? '<span class="vp-empty">—</span>' : `${v}${suffix}`;
  const exif = firstPhoto?.exif;
  const exifLine = exif?.DateTimeOriginal
    ? `<div class="vp-exif">Foto taget: ${new Date(exif.DateTimeOriginal).toLocaleString('da-DK')}${exif.Model ? ' · ' + exif.Model : ''}</div>`
    : '';

  const sat = p.satellite || {};
  const satRows = renderSatelliteRows(sat, ground);
  const satFetched = sat._fetchedAt
    ? `<div class="vp-sat-fetched">Hentet: ${new Date(sat._fetchedAt).toLocaleString('da-DK')}</div>`
    : '';

  return `
    <div class="vp-popup">
      <h3>${p.name}</h3>
      <div class="vp-coord">${p.lat.toFixed(5)}°N · ${Math.abs(p.lng).toFixed(5)}°W${p.elevation_m != null ? ' · ' + p.elevation_m + ' m.o.h.' : ''}</div>
      <div class="vp-time">Måling: ${p.timestamp_ground ? new Date(p.timestamp_ground).toLocaleString('da-DK') : '—'}</div>
      ${photoCount > 0 ? `<div class="vp-photos">${photoThumbs}</div>${exifLine}
        <div class="vp-photo-actions">
          ${(p.photos || []).map((_, i) => `<button onclick="window.__vpPhotoAlbedo('${p.id}', ${i})" class="vp-photo-btn">Beregn albedo fra foto ${i + 1}</button>`).join('')}
        </div>` : '<div class="vp-empty">Ingen foto</div>'}
      <div class="vp-ground">
        <table>
          <tr><th>Albedo (målt)</th><td>${fmt(ground.albedo_measured)}</td></tr>
          <tr><th>Overflade-temp</th><td>${fmt(ground.temp_surface_C, ' °C')}</td></tr>
          <tr><th>Luft-temp (2m)</th><td>${fmt(ground.temp_air_C, ' °C')}</td></tr>
          <tr><th>Vegetation-dækning</th><td>${fmt(ground.veg_cover_pct, ' %')}</td></tr>
          <tr><th>Vegetations-type</th><td>${fmt(ground.veg_type)}</td></tr>
        </table>
        ${ground.notes ? `<div class="vp-notes">${escapeHtml(ground.notes)}</div>` : ''}
      </div>
      <div class="vp-sat">
        <div class="vp-sat-header">
          <strong>Satellit-måling</strong>
          <button onclick="window.__vpFetchSat('${p.id}')" class="vp-sat-fetch-btn">${sat._fetchedAt ? 'Genhent' : 'Hent satellit-data'}</button>
        </div>
        ${satRows}
        ${satFetched}
      </div>
      <div class="vp-actions">
        <button onclick="window.__vpEdit('${p.id}')">Redigér</button>
        <button onclick="window.__vpDelete('${p.id}')">Slet</button>
      </div>
    </div>
  `;
}

function renderSatelliteRows(sat, ground) {
  const rows = [];
  const pairs = [
    { key: 'S2_ALBEDO',    label: 'Sentinel-2 albedo',     unit: '',     decimals: 3, groundKey: 'albedo_measured' },
    { key: 'S2_NDVI',      label: 'Sentinel-2 NDVI',       unit: '',     decimals: 3, groundKey: null },
    { key: 'S2_NDSI',      label: 'Sentinel-2 NDSI',       unit: '',     decimals: 3, groundKey: null },
    { key: 'LANDSAT_LST',  label: 'Landsat overflade-temp', unit: ' °C', decimals: 1, groundKey: 'temp_surface_C' },
  ];
  for (const p of pairs) {
    const s = sat[p.key];
    if (!s) {
      rows.push(`<tr><th>${p.label}</th><td class="vp-sat-empty">—</td></tr>`);
      continue;
    }
    if (s.error || s.value == null) {
      rows.push(`<tr><th>${p.label}</th><td class="vp-sat-err" title="${escapeHtml(s.error || '')}">ingen data</td></tr>`);
      continue;
    }
    const val = s.value.toFixed(p.decimals);
    let diff = '';
    if (p.groundKey && ground?.[p.groundKey] != null) {
      const d = s.value - ground[p.groundKey];
      const sign = d >= 0 ? '+' : '';
      const cls = Math.abs(d) > 0.1 ? 'vp-diff-large' : 'vp-diff-small';
      diff = ` <span class="vp-diff ${cls}">(${sign}${d.toFixed(p.decimals)} vs. ground)</span>`;
    }
    rows.push(`<tr><th>${p.label}</th><td><b>${val}${p.unit}</b>${diff}</td></tr>`);
  }
  return `<table>${rows.join('')}</table>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Modal (form til oprettelse + redigering) ────────────────────────────────
let modalEl = null;

function buildModal() {
  modalEl = document.createElement('div');
  modalEl.id = 'vp-modal';
  modalEl.innerHTML = `
    <div class="vp-modal-backdrop"></div>
    <div class="vp-modal-card">
      <div class="vp-modal-header">
        <h2 id="vp-modal-title">Nyt validation-punkt</h2>
        <button type="button" id="vp-modal-close" aria-label="Luk">×</button>
      </div>
      <form id="vp-form" class="vp-modal-body">
        <input type="hidden" name="id">
        <input type="hidden" name="lat">
        <input type="hidden" name="lng">

        <label>Navn
          <input type="text" name="name" required placeholder="fx 'Mittivakkat foran annex'">
        </label>

        <label>Måletidspunkt (lokal tid)
          <input type="datetime-local" name="timestamp_ground">
        </label>

        <fieldset>
          <legend>Foto</legend>
          <input type="file" name="photos" accept="image/*" multiple capture="environment">
          <div id="vp-photo-list" class="vp-photo-list"></div>
        </fieldset>

        <fieldset>
          <legend>Ground-måling</legend>
          <label>Albedo (0-1) — målt med pyranometer eller estimeret fra foto
            <input type="number" name="albedo_measured" min="0" max="1" step="0.01">
          </label>
          <label>Overfladetemperatur (°C) — IR-termometer
            <input type="number" name="temp_surface_C" step="0.1">
          </label>
          <label>Lufttemperatur (°C) — 2 m højde
            <input type="number" name="temp_air_C" step="0.1">
          </label>
          <label>Vegetations-dækning (%) — visuel i 1×1 m kvadrat
            <input type="number" name="veg_cover_pct" min="0" max="100" step="1">
          </label>
          <label>Vegetations-type
            <input type="text" name="veg_type" placeholder="fx græs, mos, dværgbusk, bart">
          </label>
          <label>Notater
            <textarea name="notes" rows="3" placeholder="Vejr, observationer, kontekst..."></textarea>
          </label>
        </fieldset>

        <div class="vp-modal-actions">
          <button type="button" id="vp-cancel">Annullér</button>
          <button type="submit" id="vp-save">Gem punkt</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#vp-modal-close').addEventListener('click', closeModal);
  modalEl.querySelector('#vp-cancel').addEventListener('click', closeModal);
  modalEl.querySelector('.vp-modal-backdrop').addEventListener('click', closeModal);
  modalEl.querySelector('#vp-form').addEventListener('submit', onSubmitForm);
  modalEl.querySelector('input[name="photos"]').addEventListener('change', onPhotoSelected);

  // Lokal state for fotos der bliver tilføjet i den aktuelle modal-session
  modalEl._pendingPhotos = [];
}

function openModal(prefill) {
  if (!modalEl) buildModal();
  const form = modalEl.querySelector('#vp-form');
  form.reset();
  modalEl._pendingPhotos = [];
  modalEl.querySelector('#vp-photo-list').innerHTML = '';
  modalEl.querySelector('#vp-modal-title').textContent = prefill.id ? 'Redigér punkt' : 'Nyt validation-punkt';

  form.id.value = prefill.id || '';
  form.lat.value = prefill.lat;
  form.lng.value = prefill.lng;
  form.name.value = prefill.name || `Punkt ${validationPoints.length + 1}`;
  const ts = prefill.timestamp_ground || new Date().toISOString();
  form.timestamp_ground.value = ts.slice(0, 16);  // YYYY-MM-DDTHH:MM
  const g = prefill.ground || {};
  form.albedo_measured.value = g.albedo_measured ?? '';
  form.temp_surface_C.value = g.temp_surface_C ?? '';
  form.temp_air_C.value = g.temp_air_C ?? '';
  form.veg_cover_pct.value = g.veg_cover_pct ?? '';
  form.veg_type.value = g.veg_type ?? '';
  form.notes.value = g.notes ?? '';

  // Vis allerede gemte fotos (i edit-mode)
  if (prefill.photos) {
    modalEl._pendingPhotos = [...prefill.photos];
    refreshPhotoListUI();
  }

  modalEl.classList.add('open');
  modalEl.querySelector('input[name="name"]').focus();
}

function closeModal() {
  if (modalEl) modalEl.classList.remove('open');
}

async function onPhotoSelected(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    try {
      const [dataUrl, exif] = await Promise.all([
        fileToResizedDataUrl(file),
        readExif(file),
      ]);
      modalEl._pendingPhotos.push({
        id: uid('p'),
        dataUrl,
        filename: file.name,
        exif: exif || null,
      });
    } catch (err) {
      console.warn('Kunne ikke behandle foto:', file.name, err);
      alert(`Kunne ikke læse ${file.name}: ${err.message}`);
    }
  }
  e.target.value = '';  // reset input
  refreshPhotoListUI();
}

function refreshPhotoListUI() {
  const list = modalEl.querySelector('#vp-photo-list');
  if (modalEl._pendingPhotos.length === 0) {
    list.innerHTML = '<p class="vp-empty">Ingen foto tilføjet endnu.</p>';
    return;
  }
  list.innerHTML = modalEl._pendingPhotos.map((p, i) => {
    const exifInfo = p.exif?.DateTimeOriginal
      ? `${new Date(p.exif.DateTimeOriginal).toLocaleString('da-DK')}${p.exif.GPSLatitude ? ' · GPS' : ''}`
      : 'ingen EXIF';
    return `
      <div class="vp-photo-row">
        <img src="${p.dataUrl}" class="vp-photo-thumb">
        <div class="vp-photo-info">
          <div class="vp-photo-name">${escapeHtml(p.filename)}</div>
          <div class="vp-photo-exif">${exifInfo}</div>
        </div>
        <button type="button" class="vp-photo-remove" data-idx="${i}" title="Fjern">×</button>
      </div>
    `;
  }).join('');
  list.querySelectorAll('.vp-photo-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      modalEl._pendingPhotos.splice(i, 1);
      refreshPhotoListUI();
    });
  });
}

function onSubmitForm(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value || uid('v');
  const existing = findPoint(id);
  const ts = form.timestamp_ground.value
    ? new Date(form.timestamp_ground.value).toISOString()
    : nowIso();

  // Hvis EXIF har GPS og brugeren ikke har ændret lat/lng, så foreslå EXIF-position?
  // For nu: vi behold den kort-klik-position der blev givet.

  const point = {
    id,
    name: form.name.value.trim(),
    lat: parseFloat(form.lat.value),
    lng: parseFloat(form.lng.value),
    elevation_m: existing?.elevation_m ?? null,
    timestamp_ground: ts,
    photos: modalEl._pendingPhotos.map(p => ({ ...p })),
    ground: {
      albedo_measured: numOrNull(form.albedo_measured.value),
      temp_surface_C: numOrNull(form.temp_surface_C.value),
      temp_air_C: numOrNull(form.temp_air_C.value),
      veg_cover_pct: numOrNull(form.veg_cover_pct.value),
      veg_type: form.veg_type.value.trim(),
      notes: form.notes.value.trim(),
    },
    satellite: existing?.satellite ?? {},
    created: existing?.created ?? nowIso(),
    modified: nowIso(),
  };

  // Brug GPS-altitude fra første foto's EXIF hvis ikke sat
  if (point.elevation_m == null && point.photos[0]?.exif?.GPSAltitude) {
    point.elevation_m = Math.round(point.photos[0].exif.GPSAltitude);
  }

  if (existing) {
    Object.assign(existing, point);
    removeMarker(id);
    addMarker(existing);
  } else {
    validationPoints.push(point);
    addMarker(point);
  }
  save();
  closeModal();
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Public window-handlers (kaldes fra popup-HTML) ──────────────────────────
window.__vpEdit = function (id) {
  const p = findPoint(id);
  if (!p) return;
  map.closePopup();
  openModal(p);
};

window.__vpDelete = function (id) {
  const p = findPoint(id);
  if (!p) return;
  if (!confirm(`Slet "${p.name}"?`)) return;
  const idx = validationPoints.indexOf(p);
  if (idx >= 0) validationPoints.splice(idx, 1);
  removeMarker(id);
  save();
  map.closePopup();
};

window.__vpFetchSat = async function (pointId) {
  const p = findPoint(pointId);
  if (!p) return;
  const dateIso = (p.timestamp_ground || nowIso()).slice(0, 10);

  // Vis loader
  const btn = document.querySelector(`button[onclick*="__vpFetchSat('${pointId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Henter…'; }

  try {
    const stats = await fetchAllStatsForPoint(p.lat, p.lng, dateIso, { toleranceDays: 7 });
    p.satellite = { ...stats, _fetchedAt: nowIso(), _dateUsed: dateIso };
    p.modified = nowIso();
    save();
    const m = markerById.get(pointId);
    if (m) m.openPopup();
  } catch (e) {
    alert('Kunne ikke hente satellit-data: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Hent satellit-data'; }
  }
};

window.__vpPhotoAlbedo = function (pointId, photoIdx) {
  const p = findPoint(pointId);
  if (!p || !p.photos?.[photoIdx]) return;
  const photo = p.photos[photoIdx];
  map.closePopup();
  openPhotoAlbedo(photo, (albedoValue) => {
    if (albedoValue == null) return;
    // Gem albedo både på fotoet og på punktets ground-måling
    p.photos[photoIdx].albedo_measured = albedoValue;
    p.ground = p.ground || {};
    p.ground.albedo_measured = albedoValue;
    p.modified = nowIso();
    save();
    // Genåben popup med opdaterede tal
    const m = markerById.get(pointId);
    if (m) m.openPopup();
  });
};

// ─── Toolbar-integration ──────────────────────────────────────────────────────
function activate() {
  activeMode = true;
  toolButton?.classList.add('active');
  document.getElementById('map').classList.add('tool-active');
}

function deactivate() {
  activeMode = false;
  toolButton?.classList.remove('active');
  document.getElementById('map').classList.remove('tool-active');
}

export function isValidationActive() { return activeMode; }

export function handleMapClick(latlng) {
  if (!activeMode) return false;
  openModal({ lat: latlng.lat, lng: latlng.lng });
  deactivate();
  return true;
}

export function exportValidationGeoJSON() {
  if (validationPoints.length === 0) {
    alert('Ingen validation-punkter at eksportere endnu.');
    return;
  }
  const fc = {
    type: 'FeatureCollection',
    name: 'sermilik_validation_points',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: validationPoints.map(p => ({
      type: 'Feature',
      properties: {
        ...p,
        // Drop dataUrl fra eksport for at holde filen håndterlig — kan gemmes separat
        photos: (p.photos || []).map(ph => ({
          id: ph.id,
          filename: ph.filename,
          exif: ph.exif,
          // dataUrl udelades — for tung
        })),
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sermilik-validation-${new Date().toISOString().slice(0, 10)}.geojson`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function initValidation() {
  load();

  // Tilføj toolbar-knap via mutation efter at tools.js har bygget toolbar
  setTimeout(() => {
    const toolBar = document.querySelector('.tool-bar');
    if (!toolBar) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.tool = 'validation';
    btn.title = 'Afsæt validation-punkt — klik på kortet for at tilføje foto + ground-måling';
    btn.textContent = '🎯';
    // Indsæt før eksport-knappen (data-tool="export")
    const exportBtn = toolBar.querySelector('[data-tool="export"]');
    if (exportBtn) toolBar.insertBefore(btn, exportBtn);
    else toolBar.appendChild(btn);
    toolButton = btn;
    btn.addEventListener('click', () => {
      if (activeMode) deactivate(); else activate();
    });
  }, 50);

  // Lyt til kort-klik (men kun hvis activeMode)
  map.on('click', e => {
    if (activeMode) {
      handleMapClick(e.latlng);
    }
  });

  // Esc annullerer
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeMode) deactivate();
  });
}
