// Pixel-info værktøj — tryk på kortet og se, hvad satellitten måler dér.
//
// Henter via proxyen /sermilik/api (sentinel-stats.js → sampleMulti): Sentinel-2
// albedo (Liang), NDVI og NDSI i ét kald. På Grønlandskortet også ArcticDEM-højde.
//
// UI-flow:
//   1. Tryk på ⓘ i værktøjslinjen → mode aktiveres
//   2. Tryk på kortet → punktet (20×20 m) OG omgivelserne (100×100 m) hentes,
//      så man kan se om fladen er ensartet eller blandet. Virker også på telefon.
//      ELLER træk en firkant (kun med mus) → middel, min og max for firkanten.
//   3. Modal i elevsprog: albedo som stort tal, plantedække, optagedato,
//      ensartet/blandet flade. Alle tal ligger under «Detaljer».
//   4. Perioden følger kortets datovalg (getShDates) — ikke en selvstændig standard.

import { map } from './map.js';
import { sampleMulti } from './sentinel-stats.js';
import { getShDates } from './sentinel-hub.js';
import { ARCTICDEM_URL } from './config.js';
import { erDK } from './profiles.js';
import { erElevvisning } from './elevvisning.js';

// Et klik henter 2×2 Sentinel-2-pixels (20×20 m). Det svarer til opløsningen i
// B11/B12, som indgår i albedoformlen, og er småt nok til at en ensartet flade
// på 40×40 m giver en ren værdi.
const KLIK_SIDE_M = 20;
// Længste halve søgevindue proxyen accepterer (se sentinel-stats.js)
const MAX_HALVT_VINDUE = 30;
// Ved et klik hentes også omgivelserne, så man kan se om fladen er ensartet
const OMGIVELSER_SIDE_M = 100;
// Spredning i albedo (standardafvigelse) under denne grænse = ensartet flade
const ENSARTET_STD = 0.02;

let active = false;
let toolButton = null;
let modalEl = null;
let hintEl = null;        // hjælpetekst, indtil første opslag er lavet
let placerHint = () => {};

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
  btn.title = 'Aflæs albedo — tryk her, og tryk så på det sted på kortet, I vil måle.';
  btn.textContent = 'ⓘ';
  const exportBtn = toolBar.querySelector('[data-tool="export"]');
  if (exportBtn) toolBar.insertBefore(btn, exportBtn);
  else toolBar.appendChild(btn);
  toolButton = btn;
  // Forhindre at klik propagerer til kortet (ellers ville mousedown/up fyre med det samme)
  L.DomEvent.disableClickPropagation(btn);
  btn.addEventListener('click', () => {
    if (active) deactivate(); else activate();
  });

  // ⓘ er det eneste værktøj, eleverne skal bruge — fremhæv det på begge kort.
  btn.classList.add('fremhaev');

  // Hjælpetekst, indtil første opslag er lavet:
  //   Danmarkskortet i elevvisning: et klik på kortet ER opslaget — ingen værktøjslinje.
  //   Ellers: teksten står ud for ⓘ-knappen.
  const kortEl = document.getElementById('map');
  hintEl = document.createElement('div');
  hintEl.className = 'px-hint';
  kortEl.appendChild(hintEl);
  const placer = () => {
    if (!hintEl) return;
    const klikOpslag = erDK && erElevvisning();
    hintEl.classList.toggle('midt', klikOpslag);
    if (klikOpslag) {
      hintEl.textContent = 'Klik på kortet, dér hvor I har målt';
      hintEl.style.left = ''; hintEl.style.top = '';
    } else {
      hintEl.textContent = active ? 'Tryk nu på det sted, I vil måle' : 'Tryk her — og så på det sted, I vil måle';
      const k = kortEl.getBoundingClientRect();
      const kn = btn.getBoundingClientRect();
      hintEl.style.left = `${kn.right - k.left + 10}px`;
      hintEl.style.top = `${kn.top - k.top + (kn.height - hintEl.offsetHeight) / 2}px`;
    }
  };
  placerHint = placer;
  requestAnimationFrame(placer);
  window.addEventListener('resize', () => requestAnimationFrame(placer));

  // Klik = opslag (kun Danmarkskortet i elevvisning, og kun når intet værktøj er aktivt).
  // Leaflet sender ikke 'click', når kortet er blevet trukket, så panorering er fri.
  map.on('click', (e) => {
    if (!erDK || !erElevvisning() || active) return;
    if (document.querySelector('.tool-btn.active')) return;
    if (hintEl) { hintEl.remove(); hintEl = null; }
    openInfoModal(makePointBbox(e.latlng, KLIK_SIDE_M), true);
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
  placerHint();
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
  // Hvis brugeren bare klikkede (mindre end 5 px) — brug fast bbox omkring punktet
  // Ellers brug det tegnede rektangel
  let bboxLatLng;
  const erKlik = distPx < 5;
  if (erKlik) {
    bboxLatLng = makePointBbox(e.latlng, KLIK_SIDE_M);
  } else {
    bboxLatLng = L.latLngBounds(drawing.startLatLng, e.latlng);
  }
  if (drawing.currentRect) { map.removeLayer(drawing.currentRect); }
  drawing = null;
  dragStartPos = null;
  if (hintEl) { hintEl.remove(); hintEl = null; }
  openInfoModal(bboxLatLng, erKlik);
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
        <h2>Det måler satellitten her</h2>
        <button type="button" id="px-close" aria-label="Luk">×</button>
      </div>
      <div class="px-modal-body">
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

// Søgevinduet følger det datovalg, kortlagene bruger lige nu (sentinel-hub.js):
//   Bestemt dag → skyfri scene nærmest dagen, mindst ±5 dage
//   Periode     → NYESTE skyfri scene i perioden, som i kortets mosaik
function soegevindue() {
  const d = getShDates();
  const iso = (dt) => dt.toISOString().slice(0, 10);
  if (d.mode === 'single') {
    const tol = Math.min(Math.max(d.tolerance ?? 5, 5), MAX_HALVT_VINDUE);
    const t = new Date(d.target);
    const fra = new Date(t); fra.setDate(t.getDate() - tol);
    const til = new Date(t); til.setDate(t.getDate() + tol);
    return { mode: 'single', fromIso: iso(fra), toIso: iso(til), wantedIso: d.target, prefer: 'nearest', maxcc: d.maxcc ?? 60 };
  }
  const til = new Date(d.to);
  const tidligst = new Date(til); tidligst.setDate(til.getDate() - 2 * MAX_HALVT_VINDUE);
  const fra = new Date(Math.max(new Date(d.from).getTime(), tidligst.getTime()));
  return { mode: 'range', fromIso: iso(fra), toIso: iso(til), wantedIso: null, prefer: 'latest', maxcc: d.maxcc ?? 60 };
}

async function openInfoModal(bboxLatLng, erKlik = true) {
  if (!modalEl) buildModal();
  modalEl.classList.add('open');

  const sw = bboxLatLng.getSouthWest();
  const ne = bboxLatLng.getNorthEast();
  const centerLat = (sw.lat + ne.lat) / 2;
  const centerLng = (sw.lng + ne.lng) / 2;
  const widthM = Math.round((ne.lng - sw.lng) * 111320 * Math.cos(centerLat * Math.PI / 180));
  const heightM = Math.round((ne.lat - sw.lat) * 111320);
  const sideM = Math.max(widthM, heightM, KLIK_SIDE_M);
  const vindue = soegevindue();

  const resultsEl = modalEl.querySelector('#px-results');
  resultsEl.innerHTML = '<div class="px-loading">Henter satellit-data…</div>';

  const opts = { maxcc: vindue.maxcc, prefer: vindue.prefer, wantedIso: vindue.wantedIso };
  const fejl = (e) => ({ sceneDate: null, layers: {}, error: e.message });
  const punktP = sampleMulti(centerLat, centerLng, vindue.fromIso, vindue.toIso, { ...opts, sideMeters: sideM }).catch(fejl);
  // Ved et klik hentes omgivelserne med i samme ombæring — så kan man se, om
  // fladen er ensartet, uden at skulle tegne en firkant (det kan man ikke på en telefon).
  const omgivP = erKlik
    ? sampleMulti(centerLat, centerLng, vindue.fromIso, vindue.toIso, { ...opts, sideMeters: OMGIVELSER_SIDE_M }).catch(fejl)
    : Promise.resolve(null);
  const arcticP = erDK
    ? Promise.resolve(null)
    : fetchArcticDEMElevation(centerLat, centerLng).catch(e => ({ value: null, error: e.message }));
  const [punkt, omgiv, arctic] = await Promise.all([punktP, omgivP, arcticP]);

  const r = { centerLat, centerLng, widthM: erKlik ? KLIK_SIDE_M : widthM, heightM: erKlik ? KLIK_SIDE_M : heightM, erKlik, vindue, punkt, omgiv, arctic };
  modalEl._lastResult = r;
  resultsEl.innerHTML = renderResultat(r);
}

// ─── Visning ─────────────────────────────────────────────────────────────────
const tal = (v, dec = 2) => (v == null || !Number.isFinite(v)) ? '—'
  : v.toLocaleString('da-DK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const datoTekst = (isoStr) => new Date(isoStr).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });

function ndviTekst(v) {
  if (v == null) return '';
  if (v < 0.2) return 'næsten ingen planter';
  if (v < 0.5) return 'lidt grønt';
  return 'tæt grønt';
}

// Vand har også højt NDSI (lyst i grønt, sort i kortbølge-infrarødt), så albedoen
// må afgøre, om det er vand eller sne/is.
function ndsiTekst(v, albedo) {
  if (v == null) return '';
  if (v > 0.4 && albedo != null && albedo < 0.06) return 'vand eller meget mørk is';
  if (v > 0.4) return 'sne eller is';
  if (v > 0) return 'blandet — lidt sne eller is';
  return 'ingen sne';
}

function sceneTekst(r) {
  const scene = r.punkt.sceneDate;
  if (!scene) return '';
  const sceneIso = new Date(scene).toISOString().slice(0, 10);
  if (r.vindue.mode === 'single') {
    const dage = Math.round((new Date(sceneIso) - new Date(r.vindue.wantedIso)) / 86400000);
    if (dage === 0) return `Optaget <b>${datoTekst(scene)}</b> — den dag I valgte.`;
    return `<span class="px-warn">Satellitten har ikke et skyfrit billede fra ${datoTekst(r.vindue.wantedIso)}.</span>
      Det nærmeste er fra <b>${datoTekst(scene)}</b> (${Math.abs(dage)} ${Math.abs(dage) === 1 ? 'dag' : 'dage'} ${dage < 0 ? 'før' : 'efter'}).`;
  }
  return `Optaget <b>${datoTekst(scene)}</b> — det nyeste skyfri billede i den periode, I har valgt.`;
}

function renderResultat(r) {
  const sted = `${r.centerLat.toFixed(5)}°N · ${formatLng(r.centerLng)}`;
  if (r.punkt.error || !r.punkt.layers?.S2_ALBEDO) {
    return `<div class="px-besked"><b>Ingen måling her.</b> ${escapeHtml(r.punkt.error || 'Ukendt fejl')}.
      Prøv en længere periode eller et højere «Max sky %» i panelet.</div>
      <div class="px-sted">${sted}</div>`;
  }
  const A = r.punkt.layers.S2_ALBEDO, V = r.punkt.layers.S2_NDVI, S = r.punkt.layers.S2_NDSI;
  const pct = Math.round(A.value * 100);
  const omraade = r.erKlik
    ? `et felt på ${KLIK_SIDE_M} × ${KLIK_SIDE_M} meter, dér hvor I klikkede — fire af satellittens felter`
    : `jeres firkant på ${r.widthM} × ${r.heightM} meter`;
  const indeks = erDK
    ? `<div class="px-indeks"><span>Plantedække (NDVI)</span><b>${tal(V?.value)}</b><i>${ndviTekst(V?.value)}</i></div>`
    : `<div class="px-indeks"><span>Sne og is (NDSI)</span><b>${tal(S?.value)}</b><i>${ndsiTekst(S?.value, A.value)}</i></div>
       <div class="px-indeks"><span>Plantedække (NDVI)</span><b>${tal(V?.value)}</b><i>${ndviTekst(V?.value)}</i></div>`;

  let omgivHtml = '';
  const O = r.erKlik ? r.omgiv?.layers?.S2_ALBEDO : A;
  if (O) {
    const ensartet = O.stDev != null && O.stDev <= ENSARTET_STD;
    omgivHtml = `
      <div class="px-omgiv ${ensartet ? 'ens' : 'blandet'}">
        <h3>${r.erKlik ? `Omgivelserne (${OMGIVELSER_SIDE_M} × ${OMGIVELSER_SIDE_M} meter)` : 'Inden for firkanten'}</h3>
        <p>Albedo fra <b>${tal(O.min)}</b> til <b>${tal(O.max)}</b>, i gennemsnit ${tal(O.value)}.</p>
        <p class="px-dom">${ensartet
          ? '<b>Ensartet flade.</b> Satellitten ser næsten det samme overalt — godt sted at sammenligne med jeres egen måling.'
          : '<b>Blandet flade.</b> Satellitten ser flere slags overflader her. Er I uenige med den, kan det være en blandet pixel.'}</p>
      </div>`;
  }

  const raekke = (navn, l, dec = 3) => l
    ? `<tr><th>${navn}</th><td><b>${tal(l.value, dec)}</b></td><td>${tal(l.min, dec)} / ${tal(l.max, dec)}</td><td>${tal(l.stDev, dec)}</td><td>${l.count}</td></tr>`
    : '';
  const og = r.erKlik ? r.omgiv?.layers : null;
  const hoejde = (!erDK && r.arctic) ? `<p>Højde (ArcticDEM): ${r.arctic.value != null ? tal(r.arctic.value, 1) + ' m.o.h.' : escapeHtml(r.arctic.error || 'ingen data')}</p>` : '';
  const detaljer = `
    <details class="px-detaljer"><summary>Detaljer og tal til rapporten</summary>
      <p>${sted} · søgt ${r.vindue.fromIso} → ${r.vindue.toIso} · maks ${r.vindue.maxcc} % skydække · ${r.punkt.antalSkyfri} skyfri ${r.punkt.antalSkyfri === 1 ? 'dag' : 'dage'} fundet</p>
      ${hoejde}
      <table class="px-table">
        <thead><tr><th>Variabel</th><th>Middel</th><th>Min / max</th><th>Spredning</th><th>Pixels</th></tr></thead>
        <tbody>
          ${raekke('Albedo (Liang 2001)', A)}${raekke('NDVI', V)}${raekke('NDSI', S)}
          ${og ? raekke(`Albedo, ${OMGIVELSER_SIDE_M} m`, og.S2_ALBEDO) + raekke(`NDVI, ${OMGIVELSER_SIDE_M} m`, og.S2_NDVI) : ''}
        </tbody>
      </table>
    </details>`;

  return `
    <div class="px-hoved">
      <div class="px-stortal"><span>Albedo</span><b>${tal(A.value)}</b></div>
      <p>Overfladen kaster <b>${pct} %</b> af sollyset tilbage og beholder ${100 - pct} %.
         Tallet gælder ${omraade}.</p>
    </div>
    ${indeks}
    <p class="px-scene">${sceneTekst(r)}</p>
    ${omgivHtml}
    ${detaljer}`;
}

function copyAsText() {
  const r = modalEl._lastResult;
  if (!r || !r.punkt?.layers?.S2_ALBEDO) return;
  const L = r.punkt.layers;
  const lines = [
    `Satellitmåling — ${r.centerLat.toFixed(5)}°N · ${formatLng(r.centerLng)}`,
    `Område: ${r.widthM} × ${r.heightM} m   Optaget: ${new Date(r.punkt.sceneDate).toISOString().slice(0, 10)}`,
    '',
    'Variabel\tMiddel\tMin\tMax\tSpredning\tPixels',
  ];
  const linje = (navn, l) => { if (l) lines.push(`${navn}\t${tal(l.value, 3)}\t${tal(l.min, 3)}\t${tal(l.max, 3)}\t${tal(l.stDev, 3)}\t${l.count}`); };
  linje('Albedo', L.S2_ALBEDO); linje('NDVI', L.S2_NDVI); linje('NDSI', L.S2_NDSI);
  if (r.erKlik && r.omgiv?.layers) {
    linje(`Albedo, omgivelser ${OMGIVELSER_SIDE_M} m`, r.omgiv.layers.S2_ALBEDO);
    linje(`NDVI, omgivelser ${OMGIVELSER_SIDE_M} m`, r.omgiv.layers.S2_NDVI);
  }
  if (r.arctic?.value != null) lines.push(`Højde (ArcticDEM)\t${tal(r.arctic.value, 1)} m.o.h.`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = modalEl.querySelector('#px-copy');
    const orig = btn.textContent;
    btn.textContent = '✓ Kopieret';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

function formatLng(lng) {
  return `${Math.abs(lng).toFixed(5)}°${lng < 0 ? 'V' : 'Ø'}`;
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
