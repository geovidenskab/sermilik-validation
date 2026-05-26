// PROMICE viewer — vis og plot daglige værdier fra PROMICE-stationer i browser.
//
// Data hostes lokalt som JSON i data/promice/{STATION}_daily.json (PROMICE rå)
// og data/promice/{STATION}_vt2024.json (Van Tiggelen et al. 2024 SEB-data,
// hvor tilgængeligt — i.e. TAS_L/U/A). Genereret offline med:
//   scripts/promice-to-daily-json.py
//   scripts/vantiggelen-to-daily-json.py
//
// VIGTIGT om datakilder:
//   - PROMICE rå (dsr/usr/dlr/ulr): pyranometeret tilter med boom-røret,
//     hvilket giver en systematisk SW-bias på op til ~25 W/m² for tilted
//     stationer. Egnet til "instant" øjebliksvurdering, IKKE til energibudget.
//   - Van Tiggelen 2024 (vt_*): tilt-korrigeret stråling på flad overflade
//     + modellerede turbulente flukse (Qh, Qe) + subsurface flux (G) +
//     residual smelteenergi (melt_E). Anbefalet til SEB-analyse.
//
// Variabler i merged record:
//   PROMICE rå:    t_u, t_surf, dsr/usr/dlr/ulr, wspd_u, z_stake, albedo_calc
//   Van Tiggelen:  vt_t_air, vt_SWD/SWU/LWD/LWU, vt_Qh, vt_Qe, vt_G,
//                  vt_melt_E, vt_dz_boom/dz_stakes, vt_subl_day, vt_t_surf_max

const PROMICE_BASE = './data/promice/';
const cache = new Map();

// Hvilke stationer har Van Tiggelen-data? Liste matchet i scripts/vantiggelen-to-daily-json.py
const VT_STATIONS = new Set(['TAS_L', 'TAS_U', 'TAS_A']);

// Variabler kan være "rene" (direkte i data) eller "afledte" (compute-funktion).
// Afledte beregner per-dag fra de rå variabler — bruges til strålingsbalance.
//
// Grupperingsstrategi: Van Tiggelen-variabler vises ØVERST (anbefalet kilde),
// dernæst PROMICE rå-data (med tilt-bias-advarsel i label).
const VARIABLES = {
  // ─── FULD SEB (Van Tiggelen 2024 — anbefalet) ────────────────────────────
  vt_rad_net:  { label: 'Netto al-bølge stråling Rn',           unit: 'W/m²', color: '#0A0F3C', group: 'SEB (Van Tiggelen)',
                 compute: d => (d.vt_SWD != null && d.vt_SWU != null && d.vt_LWD != null && d.vt_LWU != null)
                   ? (d.vt_SWD - d.vt_SWU) + (d.vt_LWD - d.vt_LWU) : null,
                 desc: 'Tilt-korrigeret SW + LW, flad overflade' },
  vt_Qh:       { label: 'Qh — sensibel varmeflux',             unit: 'W/m²', color: '#cc6633', group: 'SEB (Van Tiggelen)',
                 vtKey: 'Qh', desc: 'Positiv = varm luft varmer overfladen (vigtig over Tasiilaq pga. føhn)' },
  vt_Qe:       { label: 'Qe — latent varmeflux',               unit: 'W/m²', color: '#33aaaa', group: 'SEB (Van Tiggelen)',
                 vtKey: 'Qe', desc: 'Negativ = sublimation/fordampning tager energi væk' },
  vt_G:        { label: 'G — subsurface flux (positiv op)',    unit: 'W/m²', color: '#8a5a3a', group: 'SEB (Van Tiggelen)',
                 vtKey: 'G',  desc: 'Positiv op = sneens "kold-content" optager energi' },
  seb_total:   { label: 'SEB total = Rn + Qh + Qe − G',        unit: 'W/m²', color: '#a02060', group: 'SEB (Van Tiggelen)',
                 compute: d => {
                   if (d.vt_SWD == null || d.vt_SWU == null || d.vt_LWD == null || d.vt_LWU == null) return null;
                   if (d.vt_Qh == null || d.vt_Qe == null || d.vt_G == null) return null;
                   return (d.vt_SWD - d.vt_SWU) + (d.vt_LWD - d.vt_LWU) + d.vt_Qh + d.vt_Qe - d.vt_G;
                 },
                 desc: 'Hele overflade-energi-budgettet. Residualen ER smelte-energi (når T_surf=0°C)' },
  vt_melt_E:   { label: 'Smelte-energi (SEB-model)',           unit: 'W/m²', color: '#d44400', group: 'SEB (Van Tiggelen)',
                 vtKey: 'melt_E', desc: 'Modelleret smelteenergi via fuld SEB. ∫dt giver kg vand smeltet.' },
  vt_sw_net:   { label: 'SW_net tilt-korrigeret',              unit: 'W/m²', color: '#e69646', group: 'SEB (Van Tiggelen)',
                 compute: d => (d.vt_SWD != null && d.vt_SWU != null) ? d.vt_SWD - d.vt_SWU : null },
  vt_lw_net:   { label: 'LW_net tilt-korrigeret',              unit: 'W/m²', color: '#8c4a8c', group: 'SEB (Van Tiggelen)',
                 compute: d => (d.vt_LWD != null && d.vt_LWU != null) ? d.vt_LWD - d.vt_LWU : null },

  // ─── PROMICE RÅ STRÅLINGSBALANCE — TILT-BIAS-ADVARSEL ────────────────────
  // Disse værdier kommer direkte fra pyranometer-bommen og er IKKE tilt-korrigerede.
  // Bommen tipper sig over tid → systematisk overestimering af SW på 10-30 W/m².
  // Egnet til hurtig "hvad ser instrumentet" — men IKKE til energibudget!
  sw_net:      { label: 'SW_net rå (⚠ tilt-bias)',             unit: 'W/m²', color: '#e69646', group: 'PROMICE rå (tilt-uncorr)',
                 compute: d => (d.dsr != null && d.usr != null) ? d.dsr - d.usr : null },
  lw_net:      { label: 'LW_net rå',                           unit: 'W/m²', color: '#8c4a8c', group: 'PROMICE rå (tilt-uncorr)',
                 compute: d => (d.dlr != null && d.ulr != null) ? d.dlr - d.ulr : null },
  rad_net:     { label: 'Rn rå (⚠ tilt-bias — IKKE smelte-proxy)', unit: 'W/m²', color: '#5a6a8a', group: 'PROMICE rå (tilt-uncorr)',
                 compute: d => {
                   const sw = (d.dsr != null && d.usr != null) ? d.dsr - d.usr : null;
                   const lw = (d.dlr != null && d.ulr != null) ? d.dlr - d.ulr : null;
                   return (sw != null && lw != null) ? sw + lw : null;
                 } },

  // ─── RÅ STRÅLINGSKOMPONENTER ────────────────────────────────────────────
  dsr:         { label: 'Indgående kort-bølge SW↓ (rå)',      unit: 'W/m²', color: '#f0a838', group: 'PROMICE rå (tilt-uncorr)' },
  usr:         { label: 'Udgående kort-bølge SW↑ (rå)',       unit: 'W/m²', color: '#a05050', group: 'PROMICE rå (tilt-uncorr)' },
  dlr:         { label: 'Indgående lang-bølge LW↓',           unit: 'W/m²', color: '#7c3a8c', group: 'PROMICE rå (tilt-uncorr)' },
  ulr:         { label: 'Udgående lang-bølge LW↑',            unit: 'W/m²', color: '#3a3a8c', group: 'PROMICE rå (tilt-uncorr)' },

  // ─── ALBEDO ─────────────────────────────────────────────────────────────
  albedo_calc: { label: 'Albedo (beregnet usr/dsr)',          unit: '',     color: '#f0c020', yMin: 0, yMax: 1, group: 'Albedo' },

  // ─── TEMPERATURER & METEOROLOGI ──────────────────────────────────────────
  t_u:         { label: 'Luft-temperatur (2 m)',              unit: '°C',   color: '#cc3a3a', group: 'Meteorologi' },
  t_surf:      { label: 'Overflade-temperatur (fra LWU)',     unit: '°C',   color: '#7a2a2a', group: 'Meteorologi' },
  vt_t_surf_max: { label: 'Max daglig overflade-temp (Van T.)', unit: '°C', color: '#aa3030', group: 'Meteorologi',
                 vtKey: 't_surf_max', desc: 'Vigtigt for at vide om smeltning OVERHOVEDET er mulig den dag (skal ≥ 0°C)' },
  wspd_u:      { label: 'Vindhastighed',                      unit: 'm/s',  color: '#5a9a9a', group: 'Meteorologi' },
  z_stake:     { label: 'Sne/is-stake-højde (PROMICE)',       unit: 'm',    color: '#8a5a3a', group: 'Meteorologi' },
  vt_dz_boom:  { label: 'Daglig højdeændring (sonic boom)',   unit: 'm',    color: '#6a4a2a', group: 'Meteorologi',
                 vtKey: 'dz_boom', desc: 'Daglig dz fra ultrasonic ranger. Negativ = afsmeltning + kompaktion + sublimation' },
  vt_subl_day: { label: 'Daglig sublimation',                 unit: 'm',    color: '#3a8aaa', group: 'Meteorologi',
                 vtKey: 'subl_day', desc: 'Højdeækvivalent — tab fra overflade som vanddamp (ikke flydende)' },
};

// Hjælper: hent værdi fra record for variabel med vtKey-mapping
function readVtField(record, vtKey) {
  return record['vt_' + vtKey] ?? null;
}

// Hjælper: udtræk værdi for variabel — rå, beregnet eller Van Tiggelen-felt
function valueFor(record, varKey) {
  const info = VARIABLES[varKey];
  if (!info) return null;
  if (info.compute) return info.compute(record);
  if (info.vtKey) return readVtField(record, info.vtKey);
  return record[varKey] ?? null;
}

// ─── Public: load station data (cached) ───────────────────────────────────────
//
// Merger PROMICE rå-data med Van Tiggelen 2024 SEB-data på dato. VT-felter får
// præfix 'vt_' så de ikke kolliderer med PROMICE-felter. Hvis VT-data ikke
// findes for stationen, returneres bare PROMICE-data alene.
export async function loadStation(stationKey) {
  if (cache.has(stationKey)) return cache.get(stationKey);
  const p = (async () => {
    // Hent PROMICE rå-data (obligatorisk)
    const promiseRes = await fetch(PROMICE_BASE + stationKey + '_daily.json');
    if (!promiseRes.ok) throw new Error(`HTTP ${promiseRes.status} for ${stationKey}`);
    const promice = await promiseRes.json();

    // Hent Van Tiggelen-data hvis tilgængeligt
    let vt = null;
    if (VT_STATIONS.has(stationKey)) {
      try {
        const r = await fetch(PROMICE_BASE + stationKey + '_vt2024.json');
        if (r.ok) vt = await r.json();
      } catch (e) { console.warn('VT-data fetch failed:', e); }
    }

    if (!vt) {
      // Marker tydeligt at vi KUN har PROMICE rå (tilt-bias)
      promice._has_vt = false;
      promice._n_days = promice.data.length;
      return promice;
    }

    // Byg date → vt-record map
    const vtMap = new Map(vt.data.map(r => [r.date, r]));

    // Merge: for hvert PROMICE-record, indsæt vt_-præfix-felter
    const mergedRows = [];
    const promiseDates = new Set();
    for (const p of promice.data) {
      promiseDates.add(p.date);
      const vRec = vtMap.get(p.date);
      const merged = { ...p };
      if (vRec) {
        for (const [k, v] of Object.entries(vRec)) {
          if (k !== 'date') merged['vt_' + k] = v;
        }
      }
      mergedRows.push(merged);
    }
    // Tilføj VT-records som er ÆLDRE end PROMICE-serien (TAS_L går tilbage til 2007)
    for (const v of vt.data) {
      if (!promiseDates.has(v.date)) {
        const merged = { date: v.date };
        for (const [k, value] of Object.entries(v)) {
          if (k !== 'date') merged['vt_' + k] = value;
        }
        mergedRows.push(merged);
      }
    }
    mergedRows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

    return {
      ...promice,
      data: mergedRows,
      _has_vt: true,
      _vt_source: vt._source,
      _vt_doi: vt._doi,
      _vt_first_date: vt._first_date,
      _vt_last_date: vt._last_date,
      _first_date: mergedRows[0].date,
      _last_date: mergedRows[mergedRows.length - 1].date,
      _n_days: mergedRows.length,
    };
  })();
  cache.set(stationKey, p);
  return p;
}

// ─── Modal til at vise station-data ───────────────────────────────────────────
let modalEl = null;
let chartInstance = null;
let currentStation = null;

function buildModal() {
  modalEl = document.createElement('div');
  modalEl.id = 'pv-modal';
  modalEl.innerHTML = `
    <div class="pv-modal-backdrop"></div>
    <div class="pv-modal-card">
      <div class="pv-modal-header">
        <h2 id="pv-title">PROMICE data</h2>
        <button type="button" id="pv-close">×</button>
      </div>
      <div class="pv-modal-body">
        <div class="pv-toolbar">
          <div class="pv-var-select">
            <label>Variabel:</label>
            <select id="pv-variable"></select>
          </div>
          <div class="pv-period-select">
            <label>Periode:</label>
            <select id="pv-period">
              <option value="all">Hele serien</option>
              <option value="5y">Sidste 5 år</option>
              <option value="3y" selected>Sidste 3 år</option>
              <option value="1y">Sidste 1 år</option>
              <option value="summer">Kun sommer (jun-sep)</option>
            </select>
          </div>
          <button type="button" id="pv-reset-zoom" title="Nulstil zoom (Ctrl+scroll for zoom · træk for at zoom på interval · Shift+drag for at panne)">Reset zoom</button>
          <div class="pv-info" id="pv-info"></div>
        </div>
        <div class="pv-chart-wrap">
          <canvas id="pv-chart"></canvas>
        </div>
        <div class="pv-stats" id="pv-stats"></div>
        <div class="pv-integral" id="pv-integral"></div>
        <div class="pv-download">
          <div class="pv-download-header">
            <strong>Download udvalgte data:</strong>
            <span class="pv-download-hint">zoom på grafen for at vælge periode først</span>
            <div class="pv-dl-buttons">
              <button type="button" id="pv-dl-csv">Download CSV</button>
              <button type="button" id="pv-dl-xlsx">Download Excel</button>
            </div>
          </div>
          <div class="pv-dl-vars-wrap">
            <div class="pv-dl-vars-header">
              <span>Variabler at inkludere:</span>
              <button type="button" id="pv-dl-vars-all" class="pv-dl-mini">vælg alle</button>
              <button type="button" id="pv-dl-vars-none" class="pv-dl-mini">ryd</button>
              <button type="button" id="pv-dl-vars-current" class="pv-dl-mini">kun nuværende</button>
            </div>
            <div id="pv-dl-vars" class="pv-dl-vars"></div>
          </div>
        </div>
        <div class="pv-meta" id="pv-meta"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#pv-close').addEventListener('click', close);
  modalEl.querySelector('.pv-modal-backdrop').addEventListener('click', close);
  modalEl.querySelector('#pv-variable').addEventListener('change', refresh);
  modalEl.querySelector('#pv-period').addEventListener('change', refresh);
  modalEl.querySelector('#pv-reset-zoom').addEventListener('click', () => {
    if (chartInstance) {
      chartInstance.resetZoom();
      // updateIntegral kaldes af zoom-plugin's onZoom-callback
    }
  });
  modalEl.querySelector('#pv-dl-csv').addEventListener('click', () => downloadData('csv'));
  modalEl.querySelector('#pv-dl-xlsx').addEventListener('click', () => downloadData('xlsx'));

  // Populér variabel-vælger med optgroups
  const sel = modalEl.querySelector('#pv-variable');
  const groups = {};
  Object.entries(VARIABLES).forEach(([key, info]) => {
    const g = info.group || 'Andet';
    if (!groups[g]) groups[g] = [];
    groups[g].push([key, info]);
  });
  Object.entries(groups).forEach(([groupName, entries]) => {
    const og = document.createElement('optgroup');
    og.label = groupName;
    entries.forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.label;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });

  // Populér download-variabel-checkboxes (grupperet, samme rækkefølge)
  const dlVars = modalEl.querySelector('#pv-dl-vars');
  Object.entries(groups).forEach(([groupName, entries]) => {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'pv-dl-vars-group-label';
    groupHeader.textContent = groupName;
    dlVars.appendChild(groupHeader);
    const groupRow = document.createElement('div');
    groupRow.className = 'pv-dl-vars-group';
    entries.forEach(([key, info]) => {
      const label = document.createElement('label');
      label.className = 'pv-dl-var-chk';
      label.title = info.label;
      label.innerHTML = `<input type="checkbox" value="${key}"><span>${info.label.split('(')[0].trim()}</span>`;
      groupRow.appendChild(label);
    });
    dlVars.appendChild(groupRow);
  });

  // "Vælg alle"-handlers
  modalEl.querySelector('#pv-dl-vars-all').addEventListener('click', () => {
    modalEl.querySelectorAll('#pv-dl-vars input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  modalEl.querySelector('#pv-dl-vars-none').addEventListener('click', () => {
    modalEl.querySelectorAll('#pv-dl-vars input[type="checkbox"]').forEach(cb => cb.checked = false);
  });
  modalEl.querySelector('#pv-dl-vars-current').addEventListener('click', () => {
    const current = modalEl.querySelector('#pv-variable').value;
    modalEl.querySelectorAll('#pv-dl-vars input[type="checkbox"]').forEach(cb => cb.checked = (cb.value === current));
  });
}

function filterPeriod(data, period) {
  if (period === 'all') return data;
  if (period === 'summer') {
    return data.filter(d => {
      const m = parseInt(d.date.slice(5, 7), 10);
      return m >= 6 && m <= 9;
    });
  }
  const yearsBack = { '5y': 5, '3y': 3, '1y': 1 }[period];
  if (!yearsBack) return data;
  const lastDate = new Date(data[data.length - 1].date);
  const cutoff = new Date(lastDate);
  cutoff.setFullYear(cutoff.getFullYear() - yearsBack);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return data.filter(d => d.date >= cutoffIso);
}

function refresh() {
  if (!currentStation || !modalEl) return;
  const varKey = modalEl.querySelector('#pv-variable').value;
  const period = modalEl.querySelector('#pv-period').value;
  const info = VARIABLES[varKey];
  // Brug valueFor() så afledte variabler (sw_net, lw_net, rad_net) virker
  const filtered = filterPeriod(currentStation.data, period)
    .map(d => ({ ...d, _v: valueFor(d, varKey) }))
    .filter(d => d._v != null);

  // Stats
  const values = filtered.map(d => d._v);
  const statsEl = modalEl.querySelector('#pv-stats');
  if (values.length === 0) {
    statsEl.innerHTML = '<p class="pv-empty">Ingen data for valgt periode + variabel.</p>';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  statsEl.innerHTML = `
    <span><b>${values.length}</b> dage</span>
    <span>middel: <b>${mean.toFixed(2)} ${info.unit}</b></span>
    <span>min: <b>${min.toFixed(2)}</b></span>
    <span>max: <b>${max.toFixed(2)}</b></span>
  `;

  // Chart
  if (chartInstance) chartInstance.destroy();
  const ctx = modalEl.querySelector('#pv-chart').getContext('2d');
  // For W/m²-variabler: fyld areal under kurven (visualiserer integralet)
  const isPower = info.unit === 'W/m²';
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: `${info.label} ${info.unit ? '(' + info.unit + ')' : ''}`,
        data: filtered.map(d => ({ x: d.date, y: d._v })),
        borderColor: info.color,
        backgroundColor: isPower ? info.color + '40' : info.color + '20',
        fill: isPower ? { target: 'origin', above: info.color + '40', below: '#5680c060' } : false,
        pointRadius: 0,
        borderWidth: 1.2,
        tension: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', tooltipFormat: 'dd MMM yyyy', displayFormats: { month: 'MMM yy', year: 'yyyy' } },
          ticks: { maxRotation: 0, autoSkipPadding: 30 },
        },
        y: {
          title: { display: true, text: info.unit || '' },
          min: info.yMin,
          max: info.yMax,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${info.label}: ${c.parsed.y.toFixed(3)} ${info.unit}` } },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: 'shift',
            onPanComplete: () => updateIntegralAndStats(),
          },
          zoom: {
            wheel: { enabled: true, modifierKey: 'ctrl' },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: 'rgba(10, 15, 60, 0.1)' },
            mode: 'x',
            onZoomComplete: () => updateIntegralAndStats(),
          },
        },
      },
    },
  });
  // Initial integral-visning for hele perioden
  requestAnimationFrame(() => updateIntegralAndStats());
}

export function openPromiceViewer(stationKey, stationName) {
  if (!modalEl) buildModal();
  modalEl.querySelector('#pv-title').textContent = `${stationName} — PROMICE / Van Tiggelen data`;
  modalEl.querySelector('#pv-info').textContent = 'Henter…';
  modalEl.classList.add('open');
  // Default-variabel afhænger af om stationen har Van Tiggelen-data
  const defaultVar = VT_STATIONS.has(stationKey) ? 'vt_rad_net' : 'rad_net';
  modalEl.querySelector('#pv-variable').value = defaultVar;
  // Sync download-checkboxes til den valgte variabel
  modalEl.querySelectorAll('#pv-dl-vars input[type="checkbox"]').forEach(cb => cb.checked = (cb.value === defaultVar));
  loadStation(stationKey).then(meta => {
    currentStation = meta;
    modalEl.querySelector('#pv-info').textContent =
      `${meta._n_days.toLocaleString('da-DK')} dage (${meta._first_date} → ${meta._last_date})`;

    // Vis kilde-info — to forskellige paths afhængigt af om VT-data findes
    let metaHtml = `<p><b>PROMICE rå:</b> ${escapeHtml(meta._source || '')}`;
    if (meta._url) metaHtml += ` <a href="${meta._url}" target="_blank">[THREDDS CSV →]</a>`;
    metaHtml += `</p>`;
    if (meta._has_vt) {
      metaHtml += `<p><b>Van Tiggelen 2024 (anbefalet til SEB):</b> ${escapeHtml(meta._vt_source || '')}
        <a href="${meta._vt_doi}" target="_blank">[PANGAEA DOI →]</a><br>
        <span style="color:#5a4a1a;">⚠ <b>Vigtigt:</b> PROMICE rå-stråling har tilt-bias på op til ~25 W/m² fordi pyranometeret hælder med boom-røret.
        Brug variabler i gruppen "<b>SEB (Van Tiggelen)</b>" til energibudget — de er tilt-korrigerede og indeholder også turbulente flukse (Qh, Qe).</span></p>`;
    } else {
      metaHtml += `<p style="color:#aa4400;">⚠ Ingen Van Tiggelen SEB-data tilgængelig for denne station.
        PROMICE rå-stråling har tilt-bias og kan IKKE bruges direkte som smelte-energi-proxy.</p>`;
    }
    modalEl.querySelector('#pv-meta').innerHTML = metaHtml;

    refresh();
  }).catch(e => {
    modalEl.querySelector('#pv-info').textContent = 'Fejl: ' + e.message;
  });
}

// ─── Integral over synligt interval ──────────────────────────────────────────
//
// For W/m²-variabler beregner vi tilført energi i den synlige periode:
//   E = ∫ Power dt ≈ Σ (W/m²_i × 86400 s) = Σ × 86400 J/m²
// Konverteret til MJ/m² for læsbarhed.
//
// For ikke-W/m² variabler (temp, albedo) viser vi bare middel/min/max.

function getVisibleRange() {
  if (!chartInstance) return null;
  const xScale = chartInstance.scales.x;
  return { min: new Date(xScale.min), max: new Date(xScale.max) };
}

function getVisibleData() {
  if (!chartInstance || !currentStation) return [];
  const range = getVisibleRange();
  if (!range) return [];
  const varKey = modalEl.querySelector('#pv-variable').value;
  const minTime = range.min.getTime();
  const maxTime = range.max.getTime();
  return currentStation.data
    .map(d => ({ ...d, _v: valueFor(d, varKey) }))
    .filter(d => {
      const t = new Date(d.date).getTime();
      return t >= minTime && t <= maxTime && d._v != null;
    });
}

function updateIntegralAndStats() {
  if (!modalEl || !chartInstance) return;
  const varKey = modalEl.querySelector('#pv-variable').value;
  const info = VARIABLES[varKey];
  const visible = getVisibleData();
  const range = getVisibleRange();

  // Opdater stats med synlig data
  const statsEl = modalEl.querySelector('#pv-stats');
  if (visible.length === 0) {
    statsEl.innerHTML = '<span class="pv-empty">Ingen data i synligt interval.</span>';
    modalEl.querySelector('#pv-integral').innerHTML = '';
    return;
  }
  const values = visible.map(d => d._v);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const fromIso = visible[0].date;
  const toIso = visible[visible.length - 1].date;

  statsEl.innerHTML = `
    <span><b>${visible.length}</b> dage</span>
    <span><b>${fromIso} → ${toIso}</b></span>
    <span>middel: <b>${mean.toFixed(2)} ${info.unit}</b></span>
    <span>min: <b>${min.toFixed(2)}</b></span>
    <span>max: <b>${max.toFixed(2)}</b></span>
  `;

  // Integral kun for W/m²-variabler
  const integralEl = modalEl.querySelector('#pv-integral');
  if (info.unit === 'W/m²') {
    // Ægte trapez-integral: ∫ P dt ≈ Σ ((y_i + y_{i+1}) / 2) × Δt_i
    // hvor Δt_i er FAKTISK sekunder mellem datapoint i og i+1.
    // Det her respekterer dato-huller (manglende dage) korrekt.
    let totalJoules = 0;
    let gapDays = 0;
    for (let i = 1; i < visible.length; i++) {
      const dtSec = (new Date(visible[i].date) - new Date(visible[i - 1].date)) / 1000;
      if (dtSec > 86400 * 2) gapDays += Math.round(dtSec / 86400) - 1;  // tæl hul over 1 dag
      const yAvg = (visible[i]._v + visible[i - 1]._v) / 2;
      totalJoules += yAvg * dtSec;
    }
    const totalMJ = totalJoules / 1e6;
    const sign = totalMJ >= 0 ? '' : '';
    const colorClass = totalMJ >= 0 ? 'pv-int-pos' : 'pv-int-neg';
    const spanDays = Math.round((new Date(visible[visible.length - 1].date) - new Date(visible[0].date)) / 86400000);
    const gapNote = gapDays > 0 ? ` (${gapDays} dage med data-huller — trapez-interpolation brugt)` : '';

    // Variabel-specifik fortolkning af integralet
    const meltKg = (totalMJ * 1e6 / 334000);  // sne-smelte ved 334 kJ/kg latent varme
    let interpretation;
    if (varKey === 'vt_melt_E') {
      // melt_E ER allerede smelte-energi fra fuld SEB-model (kun positiv når T_surf ≥ 0°C)
      interpretation = `<b>Faktisk smelte-energi</b> fra Van Tiggelens SEB-model (kun positiv når overflade nåede 0°C).<br>
        Svarer til <b>${meltKg.toFixed(0)} kg/m² vandækvivalent</b> = ${(meltKg/1000).toFixed(2)} m v.eq. = ${(meltKg/400).toFixed(2)} m firn ved firn-densitet 0.4.`;
    } else if (varKey === 'seb_total') {
      interpretation = `<b>Netto SEB-overskud</b> (Rn + Qh + Qe − G). Den del der overstiger T_surf=0°C-tærsklen går til smelte.<br>
        Hvis hele integralet gik til smelte: <b>${meltKg.toFixed(0)} kg/m² v.eq.</b> (overvurdering — noget bruges til opvarmning af sneen om foråret).`;
    } else if (varKey === 'vt_rad_net') {
      interpretation = `<b>Al-bølge stråling (tilt-korrigeret)</b>. Dette er IKKE smelte-energi — Qh, Qe og G bidrager også.<br>
        Smelte-øvre-grænse hvis alt gik til smelte: ${meltKg.toFixed(0)} kg/m² v.eq. (overvurdering).<br>
        For Sermilik-området leverer Qh (sensibel varme fra føhn) ofte mere energi end Rn — tjek seb_total eller vt_melt_E.`;
    } else if (varKey === 'rad_net' || varKey === 'sw_net') {
      interpretation = `<b>⚠ PROMICE rå-data — tilt-bias kan overestimere med 10–30 W/m²</b>.<br>
        Brug <b>vt_rad_net</b> eller <b>vt_melt_E</b> i SEB-gruppen for fysisk korrekt værdi.<br>
        Naivt smelte-estimat: ${meltKg.toFixed(0)} kg/m² v.eq. (sandsynligt overvurderet).`;
    } else if (varKey === 'vt_Qh' || varKey === 'vt_Qe' || varKey === 'vt_G' || varKey === 'lw_net' || varKey === 'vt_lw_net' || varKey === 'vt_sw_net') {
      const compName = info.label.split('—')[0].trim();
      interpretation = `<b>${compName}-bidrag</b> til SEB. Tæller med i seb_total.<br>
        ${totalMJ >= 0 ? 'Positiv = energi ind i overfladen.' : 'Negativ = energi ud af overfladen.'}`;
    } else {
      interpretation = totalMJ >= 0
        ? `Positiv → overfladen MODTAGER netto-energi.`
        : `Negativ → overfladen MISTER netto-energi.`;
    }

    integralEl.innerHTML = `
      <div class="pv-int-card ${colorClass}">
        <div class="pv-int-label">∫ ${info.label.split('(')[0].trim()} · dt</div>
        <div class="pv-int-value">${sign}${totalMJ.toFixed(1)} <span class="pv-int-unit">MJ/m²</span></div>
        <div class="pv-int-detail">
          Trapez-integral over ${visible.length} datapunkter (${spanDays} dages spændvidde${gapNote}).<br>
          ${interpretation}
        </div>
      </div>
    `;
  } else if (varKey === 'albedo' || varKey === 'albedo_calc') {
    integralEl.innerHTML = `
      <div class="pv-int-card">
        <div class="pv-int-label">Gennemsnitlig albedo</div>
        <div class="pv-int-value">${mean.toFixed(3)}</div>
        <div class="pv-int-detail">Over ${visible.length} dage. Værdier 0-1 (1 = perfekt reflekterende).</div>
      </div>
    `;
  } else {
    integralEl.innerHTML = '';
  }
}

// ─── Download som CSV / Excel ─────────────────────────────────────────────────

function downloadData(format) {
  if (!currentStation) return;
  const visible = getVisibleData();
  if (visible.length === 0) {
    alert('Ingen data i synligt interval — zoom ud eller vælg en anden periode.');
    return;
  }

  // Læs valgte variabler fra checkbox-grid. Default: kun aktuel variabel hvis intet er valgt.
  const selectedVars = Array.from(modalEl.querySelectorAll('#pv-dl-vars input:checked')).map(cb => cb.value);
  if (selectedVars.length === 0) {
    alert('Vælg mindst én variabel at downloade.\nTip: klik "kun nuværende" eller markér flere checkboxes.');
    return;
  }
  const cols = ['date', ...selectedVars];

  // Byg rækker
  const rows = visible.map(d => {
    const r = {};
    cols.forEach(c => {
      if (c === 'date') r[c] = d.date;
      else r[c] = valueFor(d, c);
    });
    return r;
  });

  const minDate = visible[0].date;
  const maxDate = visible[visible.length - 1].date;
  const varSuffix = selectedVars.length === 1 ? '_' + selectedVars[0]
                  : selectedVars.length <= 3 ? '_' + selectedVars.join('-')
                  : '_' + selectedVars.length + 'vars';
  const filename = `${currentStation._station}_${minDate}_${maxDate}${varSuffix}`;

  if (format === 'csv') {
    const header = cols.join(',');
    const body = rows.map(r => cols.map(c => r[c] != null ? r[c] : '').join(',')).join('\n');
    const csv = '# PROMICE ' + currentStation._station + ' — udtræk fra https://geo.sg.dk/sermilik\n'
              + '# Periode: ' + minDate + ' til ' + maxDate + ' (' + rows.length + ' dage)\n'
              + '# Genereret: ' + new Date().toISOString() + '\n'
              + header + '\n' + body;
    triggerDownload(csv, filename + '.csv', 'text/csv;charset=utf-8');
  } else if (format === 'xlsx') {
    if (typeof XLSX === 'undefined') {
      alert('Excel-bibliotek (SheetJS) ikke loaded — prøv CSV i stedet.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header: cols });
    // Tilføj metadata-række
    XLSX.utils.sheet_add_aoa(ws, [
      [`PROMICE ${currentStation._station} — ${minDate} til ${maxDate} (${rows.length} dage)`],
      [`Kilde: ${currentStation._url || 'PROMICE'}`],
      [`Genereret: ${new Date().toISOString()}`],
      [],
    ], { origin: { r: rows.length + 2, c: 0 } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentStation._station);
    XLSX.writeFile(wb, filename + '.xlsx');
  }
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function close() {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (modalEl) modalEl.classList.remove('open');
  currentStation = null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Public window-handler så marker-popups kan kalde
window.__openPromiceViewer = openPromiceViewer;
