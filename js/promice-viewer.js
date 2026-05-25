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

const VARIABLES = {
  albedo_calc: { label: 'Albedo (beregnet usr/dsr)', unit: '', color: '#f0c020', yMin: 0, yMax: 1 },
  albedo:      { label: 'Albedo (instrument)',        unit: '', color: '#b88800', yMin: 0, yMax: 1 },
  t_u:         { label: 'Luft-temperatur',            unit: '°C', color: '#cc3a3a' },
  t_surf:      { label: 'Overflade-temperatur',       unit: '°C', color: '#7a2a2a' },
  dsr:         { label: 'Indgående kort-bølge',       unit: 'W/m²', color: '#e69646' },
  usr:         { label: 'Udgående kort-bølge',        unit: 'W/m²', color: '#a05050' },
  dlr:         { label: 'Indgående lang-bølge',       unit: 'W/m²', color: '#8c4a8c' },
  ulr:         { label: 'Udgående lang-bølge',        unit: 'W/m²', color: '#3a3a8c' },
  wspd_u:      { label: 'Vindhastighed',              unit: 'm/s', color: '#5a9a9a' },
  z_stake:     { label: 'Sne/is-stake-højde',         unit: 'm', color: '#8a5a3a' },
};

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
          <div class="pv-info" id="pv-info"></div>
        </div>
        <div class="pv-chart-wrap">
          <canvas id="pv-chart"></canvas>
        </div>
        <div class="pv-stats" id="pv-stats"></div>
        <div class="pv-meta" id="pv-meta"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#pv-close').addEventListener('click', close);
  modalEl.querySelector('.pv-modal-backdrop').addEventListener('click', close);
  modalEl.querySelector('#pv-variable').addEventListener('change', refresh);
  modalEl.querySelector('#pv-period').addEventListener('change', refresh);

  // Populér variabel-vælger
  const sel = modalEl.querySelector('#pv-variable');
  Object.entries(VARIABLES).forEach(([key, info]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${info.label}${info.unit ? ' (' + info.unit + ')' : ''}`;
    sel.appendChild(opt);
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
  const filtered = filterPeriod(currentStation.data, period).filter(d => d[varKey] != null);

  // Stats
  const values = filtered.map(d => d[varKey]);
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
        data: filtered.map(d => ({ x: d.date, y: d[varKey] })),
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
        legend: { display: true, position: 'top' },
        tooltip: { callbacks: { label: c => `${info.label}: ${c.parsed.y.toFixed(3)} ${info.unit}` } },
      },
    },
  });
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
