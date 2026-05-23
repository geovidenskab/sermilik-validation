// UI-controls oven på kortet: basemap-badge, legend, scalebar, koordinat-readout,
// mobile panel-toggle.

import { map, state as mapState } from './map.js';
import { activeSpectralIds, activeGlacialIds, activeThermalIds, getShDates, getShTimeRange } from './sentinel-hub.js';

const basemapInfo = {
  esri: { label: 'Baggrund: Esri Imagery', value: 'Variable datoer', note: 'Mosaik fra forskellige år (Maxar). Brug Sentinel-2 hvis dato er kritisk.' },
  esri_hybrid: { label: 'Baggrund: Esri Hybrid', value: 'Variable datoer', note: 'Mosaik fra forskellige år (Maxar) + stednavne.' },
  s2_2024: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2024', note: 'Sammensat af skyfri pixels.' },
  s2_2023: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2023', note: 'Sammensat af skyfri pixels.' },
  s2_2022: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2022', note: 'Sammensat af skyfri pixels.' },
  s2_2020: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2020', note: 'Sammensat af skyfri pixels.' },
  topo: { label: 'Baggrund: OpenTopoMap', value: 'Topografisk', note: 'Højdekurver, ikke et satellitbillede.' },
  osm: { label: 'Baggrund: OpenStreetMap', value: 'Vektorkort', note: 'Standardkort, ikke satellit.' },
};

export function addBasemapBadge() {
  const badge = L.control({ position: 'topright' });
  badge.onAdd = function () {
    const div = L.DomUtil.create('div', 'basemap-info');
    div.id = 'basemap-badge';
    return div;
  };
  badge.addTo(map);
  updateBasemapBadge();
}

export function updateBasemapBadge() {
  const div = document.getElementById('basemap-badge');
  if (!div) return;
  const bg = basemapInfo[mapState.activeBasemap] || { label: 'Baggrund', value: 'Ukendt', note: '' };
  let html = `
    <div class="label">${bg.label}</div>
    <div class="value">${bg.value}</div>
    <div class="note">${bg.note}</div>
  `;
  const totalSentinel = activeSpectralIds.size + activeGlacialIds.size + activeThermalIds.size;
  if (totalSentinel > 0) {
    const range = getShTimeRange();
    const shDates = getShDates();
    const modeLabel = shDates.mode === 'single'
      ? `${shDates.target} ±${shDates.tolerance} dage`
      : `${shDates.from} → ${shDates.to}`;
    const parts = [];
    if (activeSpectralIds.size > 0) parts.push(`${activeSpectralIds.size} S2-spektral`);
    if (activeGlacialIds.size > 0) parts.push(`${activeGlacialIds.size} indeks`);
    if (activeThermalIds.size > 0) parts.push(`${activeThermalIds.size} thermal`);
    html += `
      <div class="date-badge-spectral">
        <div class="label">Satellit-lag aktive — ${parts.join(', ')}</div>
        <div class="value">${modeLabel}</div>
        <div class="note">Henter scener: ${range.from} → ${range.to} · maks ${shDates.maxcc}% skydække</div>
      </div>
    `;
  }
  div.innerHTML = html;
}

export function addLegend() {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <div class="item"><span class="swatch marker-station"></span> Forskningsstation</div>
      <div class="item"><span class="swatch marker-aws"></span> AWS-vejrstation</div>
      <div class="item"><span class="swatch marker-town"></span> By / lufthavn</div>
      <div class="item"><span class="swatch marker-glacier"></span> Gletsjer</div>
    `;
    return div;
  };
  legend.addTo(map);
}

export function addScaleBar() {
  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
}

export function addCoordReadout() {
  const coordReadout = L.control({ position: 'bottomleft' });
  coordReadout.onAdd = function () {
    const div = L.DomUtil.create('div', 'coord-readout');
    div.id = 'coord-readout';
    div.textContent = 'Bevæg musen over kortet';
    return div;
  };
  coordReadout.addTo(map);

  map.on('mousemove', e => {
    const { lat, lng } = e.latlng;
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    document.getElementById('coord-readout').textContent =
      `${Math.abs(lat).toFixed(5)}°${ns}, ${Math.abs(lng).toFixed(5)}°${ew}`;
  });
  map.on('mouseout', () => {
    document.getElementById('coord-readout').textContent = 'Bevæg musen over kortet';
  });
}

export function addMobileToggle() {
  document.getElementById('toggle-panel').addEventListener('click', () => {
    document.getElementById('panel').classList.toggle('open');
  });
}
