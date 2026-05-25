// PROMICE viewer — vis og plot daglige værdier fra PROMICE-stationer i browser.
//
// Data hostes lokalt som JSON i data/promice/{STATION}_daily.json (4 MB total).
// Genereret offline med scripts/promice-to-daily-json.py fra hourly CSV.
//
// Variabler tilgængelige per station og dag (daglig middel):
//   t_u          — luft-temperatur (°C)
//   t_surf       — overflade-temperatur (°C, fra LWU)
//   dsr / usr    — kort-bølge ind / ud (W/m²)
//   dlr / ulr    — lang-bølge ind / ud (W/m²)
//   albedo       — broadband albedo fra instrument
//   albedo_calc  — usr/dsr (kun når dsr > 50 W/m²)
//   wspd_u       — vindhastighed (m/s)
//   z_stake      — sne/is-stake højde (m)

const PROMICE_BASE = './data/promice/';
const cache = new Map();

// Variabler kan være "rene" (direkte i data) eller "afledte" (compute-funktion).
// Afledte beregner per-dag fra de rå variabler — bruges til strålingsbalance.
const VARIABLES = {
  // ─── STRÅLINGSBALANCE — afledte ──────────────────────────────────────────
  sw_net:      { label: 'Netto kort-bølge (SW↓ − SW↑)',       unit: 'W/m²', color: '#e69646', group: 'Strålingsbalance',
                 compute: d => (d.dsr != null && d.usr != null) ? d.dsr - d.usr : null },
  lw_net:      { label: 'Netto lang-bølge (LW↓ − LW↑)',       unit: 'W/m²', color: '#8c4a8c', group: 'Strålingsbalance',
                 compute: d => (d.dlr != null && d.ulr != null) ? d.dlr - d.ulr : null },
  rad_net:     { label: 'Netto al-bølge stråling',            unit: 'W/m²', color: '#0A0F3C', group: 'Strålingsbalance',
                 compute: d => {
                   const sw = (d.dsr != null && d.usr != null) ? d.dsr - d.usr : null;
                   const lw = (d.dlr != null && d.ulr != null) ? d.dlr - d.ulr : null;
                   return (sw != null && lw != null) ? sw + lw : null;
                 } },

  // ─── RÅ STRÅLINGSKOMPONENTER ────────────────────────────────────────────
  dsr:         { label: 'Indgående kort-bølge (SW↓)',         unit: 'W/m²', color: '#f0a838', group: 'Stråling rå' },
  usr:         { label: 'Udgående kort-bølge (SW↑)',          unit: 'W/m²', color: '#a05050', group: 'Stråling rå' },
  dlr:         { label: 'Indgående lang-bølge (LW↓)',         unit: 'W/m²', color: '#7c3a8c', group: 'Stråling rå' },
  ulr:         { label: 'Udgående lang-bølge (LW↑)',          unit: 'W/m²', color: '#3a3a8c', group: 'Stråling rå' },

  // ─── ALBEDO ─────────────────────────────────────────────────────────────
  albedo_calc: { label: 'Albedo (beregnet usr/dsr)',          unit: '',     color: '#f0c020', yMin: 0, yMax: 1, group: 'Albedo' },
  albedo:      { label: 'Albedo (instrument)',                unit: '',     color: '#b88800', yMin: 0, yMax: 1, group: 'Albedo' },

  // ─── TEMPERATURER & METEOROLOGI ──────────────────────────────────────────
  t_u:         { label: 'Luft-temperatur (2 m)',              unit: '°C',   color: '#cc3a3a', group: 'Meteorologi' },
  t_surf:      { label: 'Overflade-temperatur (fra LWU)',     unit: '°C',   color: '#7a2a2a', group: 'Meteorologi' },
  wspd_u:      { label: 'Vindhastighed',                      unit: 'm/s',  color: '#5a9a9a', group: 'Meteorologi' },
  z_stake:     { label: 'Sne/is-stake-højde',                 unit: 'm',    color: '#8a5a3a', group: 'Meteorologi' },
};

// Hjælper: udtræk værdi for variabel — rå eller beregnet
function valueFor(record, varKey) {
  const info = VARIABLES[varKey];
  if (!info) return null;
  if (info.compute) return info.compute(record);
  return record[varKey] ?? null;
}

// ─── Public: load station data (cached) ───────────────────────────────────────
export async function loadStation(stationKey) {
  if (cache.has(stationKey)) return cache.get(stationKey);
  const p = (async () => {
    const res = await fetch(PROMICE_BASE + stationKey + '_daily.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${stationKey}`);
    return await res.json();
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
          <strong>Download udvalgte data:</strong>
          <span class="pv-download-hint">(zoom på grafen for at vælge periode først)</span>
          <button type="button" id="pv-dl-csv">CSV</button>
          <button type="button" id="pv-dl-xlsx">Excel</button>
          <label class="pv-dl-allvars">
            <input type="checkbox" id="pv-dl-allvars-cb">
            Inkludér alle variabler
          </label>
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
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: `${info.label} ${info.unit ? '(' + info.unit + ')' : ''}`,
        data: filtered.map(d => ({ x: d.date, y: d._v })),
        borderColor: info.color,
        backgroundColor: info.color + '20',
        pointRadius: 0,
        borderWidth: 1,
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
  modalEl.querySelector('#pv-title').textContent = `${stationName} — PROMICE data`;
  modalEl.querySelector('#pv-info').textContent = 'Henter…';
  modalEl.classList.add('open');
  loadStation(stationKey).then(meta => {
    currentStation = meta;
    modalEl.querySelector('#pv-info').textContent =
      `${meta._n_days.toLocaleString('da-DK')} dage (${meta._first_date} → ${meta._last_date})`;
    modalEl.querySelector('#pv-meta').innerHTML = `
      <p>Kilde: ${escapeHtml(meta._source || '')}<br>
      ${meta._url ? `<a href="${meta._url}" target="_blank">Original CSV (PROMICE THREDDS) →</a>` : ''}</p>
    `;
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
    // Sum × 86400 s/dag → J/m². Konvertér til MJ/m².
    const totalJoules = values.reduce((a, b) => a + b, 0) * 86400;
    const totalMJ = totalJoules / 1e6;
    const sign = totalMJ >= 0 ? '' : '';
    const colorClass = totalMJ >= 0 ? 'pv-int-pos' : 'pv-int-neg';
    integralEl.innerHTML = `
      <div class="pv-int-card ${colorClass}">
        <div class="pv-int-label">Tilført energi i perioden (∫ ${info.label.split('(')[0].trim()} · dt)</div>
        <div class="pv-int-value">${sign}${totalMJ.toFixed(1)} <span class="pv-int-unit">MJ/m²</span></div>
        <div class="pv-int-detail">
          ${visible.length} dage × 86400 s × middel ${mean.toFixed(2)} W/m² = ${totalMJ.toFixed(1)} MJ/m²<br>
          ${totalMJ >= 0
            ? `Positiv → overfladen MODTAGER netto-energi (smelt-/opvarmnings-potentiale: ${(totalMJ * 1e6 / 334000).toFixed(0)} kg/m² sne-smelte v. 0°C)`
            : 'Negativ → overfladen MISTER netto-energi (afkøling)'}
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
  const includeAll = modalEl.querySelector('#pv-dl-allvars-cb').checked;
  const varKey = modalEl.querySelector('#pv-variable').value;
  const visible = getVisibleData();
  const range = getVisibleRange();
  if (visible.length === 0) {
    alert('Ingen data i synligt interval — zoom ud eller vælg en anden periode.');
    return;
  }

  // Vælg kolonner: enten kun den aktuelle variabel, eller alle rå + afledte
  let cols;
  if (includeAll) {
    cols = ['date', 't_u', 't_surf', 'dsr', 'usr', 'dlr', 'ulr', 'sw_net', 'lw_net', 'rad_net', 'albedo', 'albedo_calc', 'wspd_u', 'z_stake'];
  } else {
    cols = ['date', varKey];
  }

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
  const filename = `${currentStation._station}_${minDate}_${maxDate}${includeAll ? '_all' : '_' + varKey}`;

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
