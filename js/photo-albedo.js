// Foto-albedo: beregn albedo fra et foto ved at tegne rektangler.
//
// Algoritme (samme som geo.sg.dk/albedo):
//   1. Tegn et "måle-rektangel" på området hvis albedo du vil estimere
//   2. (Valgfrit) Tegn et "reference-rektangel" på et område med kendt albedo
//   3. Mean pixel-værdi = gennemsnit af (R+G+B)/3 for alle pixels i rektanglet
//
//   Uden reference:  albedo ≈ mean / 256
//   Med reference:   albedo = (mean_måling / mean_reference) × reference_albedo
//
// Den simple "mean/256"-version antager at fotoet er nogenlunde korrekt eksponeret
// og at hvid = albedo 1.0. Reference-kalibrering retter for under/overeksponering.
//
// Eksporterer openPhotoAlbedo(photo, callback) — callback får (albedoValue | null).

let modalEl = null;
let state = null;  // { photo, callback, img, measRect, refRect, refAlbedo, mode }

const REFERENCE_PRESETS = [
  { label: 'Frisk sne', value: 0.85 },
  { label: 'Gammel sne / firn', value: 0.65 },
  { label: 'Lyst gråt papir A4', value: 0.55 },
  { label: 'Standard 18% gråt kort', value: 0.18 },
  { label: 'Sort papir', value: 0.05 },
];

function buildModal() {
  modalEl = document.createElement('div');
  modalEl.id = 'pa-modal';
  modalEl.innerHTML = `
    <div class="pa-modal-backdrop"></div>
    <div class="pa-modal-card">
      <div class="pa-modal-header">
        <h2>Beregn albedo fra foto</h2>
        <button type="button" id="pa-close" aria-label="Luk">×</button>
      </div>
      <div class="pa-modal-body">
        <div class="pa-toolbar">
          <button type="button" class="pa-tool active" data-tool="measure">1. Markér måleområde</button>
          <button type="button" class="pa-tool" data-tool="reference">2. Markér reference (valgfri)</button>
          <button type="button" class="pa-tool" data-tool="clear">Ryd</button>
        </div>
        <div class="pa-canvas-wrap">
          <canvas id="pa-canvas"></canvas>
          <div class="pa-hint" id="pa-hint">Klik og træk for at markere et område på fotoet.</div>
        </div>
        <div class="pa-results">
          <div class="pa-result">
            <label>Måleområde — mean grayscale</label>
            <span class="pa-val" id="pa-meas-mean">—</span>
          </div>
          <div class="pa-result">
            <label>Reference — mean grayscale</label>
            <span class="pa-val" id="pa-ref-mean">—</span>
          </div>
          <div class="pa-ref-row">
            <label>Reference albedo (kendt)
              <input type="number" id="pa-ref-albedo" min="0" max="1" step="0.01" value="0.18">
            </label>
            <select id="pa-ref-preset">
              <option value="">Vælg preset…</option>
              ${REFERENCE_PRESETS.map(p => `<option value="${p.value}">${p.label} (${p.value})</option>`).join('')}
            </select>
          </div>
          <div class="pa-result pa-result-primary">
            <label>Estimeret albedo</label>
            <span class="pa-val pa-val-primary" id="pa-final">—</span>
          </div>
          <div class="pa-formula" id="pa-formula">Vælg et måleområde for at se resultatet.</div>
        </div>
        <div class="pa-modal-actions">
          <button type="button" id="pa-cancel">Annullér</button>
          <button type="button" id="pa-save" disabled>Gem som ground-albedo</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#pa-close').addEventListener('click', close);
  modalEl.querySelector('#pa-cancel').addEventListener('click', close);
  modalEl.querySelector('.pa-modal-backdrop').addEventListener('click', close);
  modalEl.querySelector('#pa-save').addEventListener('click', onSave);
  modalEl.querySelectorAll('.pa-tool').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.tool;
      if (t === 'clear') { state.measRect = null; state.refRect = null; recompute(); return; }
      state.mode = t;
      modalEl.querySelectorAll('.pa-tool').forEach(x => x.classList.toggle('active', x === b));
    });
  });
  modalEl.querySelector('#pa-ref-albedo').addEventListener('input', recompute);
  modalEl.querySelector('#pa-ref-preset').addEventListener('change', e => {
    const v = e.target.value;
    if (v) {
      modalEl.querySelector('#pa-ref-albedo').value = v;
      recompute();
    }
  });

  // Canvas-interaktion
  const canvas = modalEl.querySelector('#pa-canvas');
  let drawing = null;
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    drawing = { x0: x, y0: y, x1: x, y1: y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    drawing.x1 = (e.clientX - rect.left) * (canvas.width / rect.width);
    drawing.y1 = (e.clientY - rect.top) * (canvas.height / rect.height);
    redrawTemp(drawing);
  });
  canvas.addEventListener('pointerup', e => {
    if (!drawing) return;
    const r = normRect(drawing);
    drawing = null;
    if (r.w < 5 || r.h < 5) { redraw(); return; }
    if (state.mode === 'measure') state.measRect = r;
    else state.refRect = r;
    recompute();
  });
}

function normRect(d) {
  return {
    x: Math.round(Math.min(d.x0, d.x1)),
    y: Math.round(Math.min(d.y0, d.y1)),
    w: Math.round(Math.abs(d.x1 - d.x0)),
    h: Math.round(Math.abs(d.y1 - d.y0)),
  };
}

function redraw() {
  const canvas = modalEl.querySelector('#pa-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.img, 0, 0, canvas.width, canvas.height);
  if (state.measRect) drawRect(ctx, state.measRect, '#f0c020', '#b88800', 'MÅLING');
  if (state.refRect) drawRect(ctx, state.refRect, '#63dad6', '#0a4a99', 'REFERENCE');
}

function redrawTemp(d) {
  redraw();
  const canvas = modalEl.querySelector('#pa-canvas');
  const ctx = canvas.getContext('2d');
  const r = normRect(d);
  drawRect(ctx, r, state.mode === 'measure' ? '#f0c020' : '#63dad6', '#000', '');
}

function drawRect(ctx, r, fillColor, strokeColor, label) {
  ctx.save();
  ctx.fillStyle = fillColor + '55';   // semi-transparent
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  if (label) {
    ctx.fillStyle = strokeColor;
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText(label, r.x + 4, r.y + 16);
  }
  ctx.restore();
}

function meanGrayscale(rect) {
  if (!rect) return null;
  const canvas = modalEl.querySelector('#pa-canvas');
  const ctx = canvas.getContext('2d');
  // Re-tegn rent foto til offscreen for at læse uberørte pixels
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  tmp.getContext('2d').drawImage(state.img, 0, 0, canvas.width, canvas.height);
  const data = tmp.getContext('2d').getImageData(rect.x, rect.y, rect.w, rect.h).data;
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    count++;
  }
  return count > 0 ? total / count : null;
}

function recompute() {
  redraw();
  const measMean = meanGrayscale(state.measRect);
  const refMean = meanGrayscale(state.refRect);
  const refAlbedo = parseFloat(modalEl.querySelector('#pa-ref-albedo').value);

  modalEl.querySelector('#pa-meas-mean').textContent = measMean !== null ? measMean.toFixed(1) : '—';
  modalEl.querySelector('#pa-ref-mean').textContent = refMean !== null ? refMean.toFixed(1) : '—';

  let albedo = null;
  let formula = '';
  if (measMean !== null && refMean !== null && Number.isFinite(refAlbedo) && refMean > 0) {
    albedo = (measMean / refMean) * refAlbedo;
    formula = `(${measMean.toFixed(1)} / ${refMean.toFixed(1)}) × ${refAlbedo} = ${albedo.toFixed(3)}`;
  } else if (measMean !== null) {
    albedo = measMean / 256;
    formula = `${measMean.toFixed(1)} / 256 = ${albedo.toFixed(3)} (uden reference — antager hvid = 1.0)`;
  } else {
    formula = 'Vælg et måleområde for at se resultatet.';
  }
  // Clamp 0..1
  if (albedo !== null) albedo = Math.max(0, Math.min(1.1, albedo));

  modalEl.querySelector('#pa-final').textContent = albedo !== null ? albedo.toFixed(3) : '—';
  modalEl.querySelector('#pa-formula').textContent = formula;
  modalEl.querySelector('#pa-save').disabled = albedo === null;
  state.computedAlbedo = albedo;

  // Update hint
  const hint = modalEl.querySelector('#pa-hint');
  if (state.measRect && state.refRect) hint.textContent = 'Begge områder markeret — kalibreret beregning aktiv.';
  else if (state.measRect) hint.textContent = 'Måleområde sat. Markér evt. et reference-felt med kendt albedo for kalibrering.';
  else hint.textContent = 'Klik og træk for at markere et område på fotoet.';
}

function onSave() {
  if (state.computedAlbedo == null) return;
  state.callback(+state.computedAlbedo.toFixed(3));
  close();
}

function close() {
  if (modalEl) modalEl.classList.remove('open');
  state = null;
}

/**
 * Åbn foto-albedo-modal for et givet foto.
 * @param {Object} photo - { dataUrl, filename, ... } fra validation-punkt
 * @param {Function} callback - kaldes med (albedoValue) eller (null) ved annullering
 */
export function openPhotoAlbedo(photo, callback) {
  if (!modalEl) buildModal();
  state = { photo, callback, img: new Image(), measRect: null, refRect: null, computedAlbedo: null, mode: 'measure' };
  state.img.onload = () => {
    const canvas = modalEl.querySelector('#pa-canvas');
    // Sæt canvas-størrelse til foto-aspekt, max 700×700 i CSS
    const maxDim = 800;
    const scale = Math.min(maxDim / state.img.width, maxDim / state.img.height, 1);
    canvas.width = Math.round(state.img.width * scale);
    canvas.height = Math.round(state.img.height * scale);
    redraw();
    recompute();
  };
  state.img.src = photo.dataUrl;
  // Reset UI
  modalEl.querySelectorAll('.pa-tool').forEach(x => x.classList.toggle('active', x.dataset.tool === 'measure'));
  modalEl.classList.add('open');
}
