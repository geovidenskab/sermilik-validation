// Søgefelt på Danmarkskortet: "find jeres skole".
//
// Slår op i Dataforsyningens GSearch — først stednavne (skoler, gymnasier, byer),
// så adresser. Går gennem sitets cachende proxy på geo.sg.dk (DF_BASE).

import { map } from './map.js';
import { DF_BASE, DF_TOKEN } from './config.js';

const GSEARCH = `${DF_BASE}/rest/gsearch/v2.0`;
let timer = null;
let seneste = 0;

async function hent(ressource, q) {
  const url = `${GSEARCH}/${ressource}?q=${encodeURIComponent(q)}&limit=5&srid=4326&token=${DF_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Midtpunkt og udstrækning af et GSearch-resultat (bbox er et polygon i lon/lat)
function graenser(r) {
  const ring = r?.bbox?.coordinates?.[0];
  if (Array.isArray(ring) && ring.length) {
    const lons = ring.map(c => c[0]), lats = ring.map(c => c[1]);
    return L.latLngBounds([Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]);
  }
  let c = r?.geometri?.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) ? L.latLngBounds([c[1], c[0]], [c[1], c[0]]) : null;
}

export function initSoeg() {
  const felt = document.getElementById('soeg-felt');
  const liste = document.getElementById('soeg-resultater');
  if (!felt || !liste) return;

  const luk = () => { liste.hidden = true; liste.innerHTML = ''; };

  const vis = (resultater) => {
    liste.innerHTML = '';
    if (!resultater.length) {
      liste.innerHTML = '<li class="tom">Ingen fund — prøv skolens fulde navn eller en adresse</li>';
      liste.hidden = false;
      return;
    }
    resultater.forEach(r => {
      const li = document.createElement('li');
      const knap = document.createElement('button');
      knap.type = 'button';
      knap.textContent = r.visningstekst || r.skrivemaade || 'Uden navn';
      knap.addEventListener('click', () => {
        const b = graenser(r);
        if (b) {
          // Zoom ind, så skolegården fylder skærmen — men aldrig tættere end luftfotoet kan bære
          map.fitBounds(b.pad(1.5), { maxZoom: 17 });
        }
        felt.value = knap.textContent;
        luk();
      });
      li.appendChild(knap);
      liste.appendChild(li);
    });
    liste.hidden = false;
  };

  felt.addEventListener('input', () => {
    clearTimeout(timer);
    const q = felt.value.trim();
    if (q.length < 3) { luk(); return; }
    timer = setTimeout(async () => {
      const nr = ++seneste;
      try {
        const [steder, adresser] = await Promise.all([hent('stednavn', q), hent('adresse', q)]);
        if (nr !== seneste) return;   // et nyere opslag er på vej
        vis([...steder, ...adresser].slice(0, 7));
      } catch {
        if (nr === seneste) vis([]);
      }
    }, 300);
  });
  felt.addEventListener('keydown', e => {
    if (e.key === 'Escape') luk();
    if (e.key === 'Enter') { const foerste = liste.querySelector('button'); if (foerste) foerste.click(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#soeg')) luk(); });
}
