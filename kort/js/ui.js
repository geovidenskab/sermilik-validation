// UI-controls oven på kortet: basemap-badge, legend, scalebar, koordinat-readout,
// mobile panel-toggle, signaturforklaringer (legends).

import { map, state as mapState } from './map.js';
import { activeSpectralIds, activeGlacialIds, activeThermalIds, getShDates, getShTimeRange } from './sentinel-hub.js';
import { renderLegend } from './legends.js';
import { profil } from './profiles.js';

// Sæt af lag-ID'er der har en signaturforklaring vist på kortet. Eksporteres
// så layer-control.js kan tilføje/fjerne ID'er når brugeren toggle'r lag.
export const activeLegendLayers = new Set();
let legendBoxEl = null;

const basemapInfo = {
  esri: { label: 'Baggrund: Esri satellit', value: 'Variable datoer', note: 'Maxar/Earthstar-mosaik — varieret opløsning over Grønland.' },
  gebco: { label: 'Baggrund: GEBCO', value: 'Bathymetri', note: 'Havdybde og topografi under indlandsisen.' },
  none: { label: 'Baggrund', value: 'Ingen', note: 'Kun overlay-lag vises.' },
  esri_hybrid: { label: 'Baggrund: Esri Hybrid', value: 'Variable datoer', note: 'Mosaik fra forskellige år (Maxar) + stednavne.' },
  s2_2024: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2024', note: 'Sammensat af skyfri pixels.' },
  s2_2023: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2023', note: 'Sammensat af skyfri pixels.' },
  s2_2022: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2022', note: 'Sammensat af skyfri pixels.' },
  s2_2020: { label: 'Baggrund: Sentinel-2 mosaik', value: 'Hele 2020', note: 'Sammensat af skyfri pixels.' },
  topo: { label: 'Baggrund: OpenTopoMap', value: 'Topografisk', note: 'Højdekurver, ikke et satellitbillede.' },
  osm: { label: 'Baggrund: OpenStreetMap', value: 'Vektorkort', note: 'Standardkort, ikke satellit.' },
  ortofoto: { label: 'Baggrund: Ortofoto', value: '12,5 cm', note: 'Dataforsyningens forårsflyvning — 80× skarpere end en Sentinel-2 pixel.' },
  skaermkort: { label: 'Baggrund: Skærmkort', value: 'Dataforsyningen', note: 'Veje, bygninger og stednavne.' },
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
  // Kun relevant hvor der faktisk er faste markører. Det danske kort har ingen
  // — eleverne sætter selv deres punkt.
  if (!profil.visMarkoerer) return;
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

// ─── Signaturforklaring (legends) — vises når satellit-lag er aktive ─────────
export function addSpectralLegendBox() {
  const ctrl = L.control({ position: 'bottomright' });
  ctrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend-box');
    div.id = 'legend-box';
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    legendBoxEl = div;
    return div;
  };
  ctrl.addTo(map);
  updateLegendBox();
}

export function updateLegendBox() {
  if (!legendBoxEl) return;
  if (activeLegendLayers.size === 0) {
    legendBoxEl.style.display = 'none';
    return;
  }
  const items = Array.from(activeLegendLayers).map(id => renderLegend(id)).filter(Boolean);
  if (items.length === 0) {
    legendBoxEl.style.display = 'none';
    return;
  }
  legendBoxEl.style.display = 'block';
  legendBoxEl.innerHTML = `
    <div class="legend-box-header">
      <span>Signaturforklaring</span>
      <button type="button" class="legend-box-collapse" title="Skjul/vis">−</button>
    </div>
    <div class="legend-box-body">${items.join('')}</div>
  `;
  // Bind collapse-toggle
  const btn = legendBoxEl.querySelector('.legend-box-collapse');
  const body = legendBoxEl.querySelector('.legend-box-body');
  btn.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    btn.textContent = hidden ? '−' : '+';
  });
}

export function addScaleBar() {
  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
}

export function addCoordReadout() {
  const coordReadout = L.control({ position: 'bottomleft' });
  coordReadout.onAdd = function () {
    const div = L.DomUtil.create('div', 'coord-readout');
    div.id = 'coord-readout';
    div.textContent = (window.matchMedia('(pointer: coarse)').matches ? 'Tryk på kortet' : 'Bevæg musen over kortet');
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
    document.getElementById('coord-readout').textContent = (window.matchMedia('(pointer: coarse)').matches ? 'Tryk på kortet' : 'Bevæg musen over kortet');
  });
}

export function addMobileToggle() {
  document.getElementById('toggle-panel').addEventListener('click', () => {
    document.getElementById('panel').classList.toggle('open');
  });
}

// ─── Foldelig panel-sektioner ─────────────────────────────────────────────────
// Hver <h2> bliver klikbar — toggle CSS-klasse "collapsed" på h2 og næste sektion-content
// indtil næste h2. State persisteres i localStorage.
const COLLAPSE_LS_KEY = 'sermilik_panel_collapsed';

// Første besøg: baggrundskort og terræn er foldet sammen, så det er de
// levende Sentinel-2-lag der fylder i panelet. Brugerens egne valg gemmes.
const DEFAULT_COLLAPSED = ['Baggrundskort', 'Terræn & relief'];

function loadCollapsedState() {
  try {
    const raw = localStorage.getItem(COLLAPSE_LS_KEY);
    if (raw === null) return new Set(DEFAULT_COLLAPSED);
    return new Set(JSON.parse(raw));
  }
  catch { return new Set(); }
}

function saveCollapsedState(set) {
  try { localStorage.setItem(COLLAPSE_LS_KEY, JSON.stringify([...set])); } catch {}
}

export function addPanelCollapseToggles() {
  const collapsed = loadCollapsedState();
  const panel = document.getElementById('panel');
  if (!panel) return;
  const sections = panel.querySelectorAll('h2');
  sections.forEach(h2 => {
    const text = h2.textContent.trim();
    h2.classList.add('collapsible');
    h2.setAttribute('role', 'button');
    h2.setAttribute('tabindex', '0');

    // Pak alt mellem denne h2 og næste h2 i en <div class="collapse-content">
    const wrapper = document.createElement('div');
    wrapper.className = 'collapse-content';
    let next = h2.nextElementSibling;
    while (next && next.tagName !== 'H2') {
      const cur = next;
      next = next.nextElementSibling;
      wrapper.appendChild(cur);
    }
    h2.after(wrapper);

    // Initial state
    if (collapsed.has(text)) {
      h2.classList.add('collapsed');
      wrapper.style.display = 'none';
    }

    const toggle = () => {
      const isCollapsed = h2.classList.toggle('collapsed');
      wrapper.style.display = isCollapsed ? 'none' : '';
      if (isCollapsed) collapsed.add(text); else collapsed.delete(text);
      saveCollapsedState(collapsed);
    };
    h2.addEventListener('click', toggle);
    h2.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}
