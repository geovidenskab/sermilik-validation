// Station-info modal: foto, instrumenter, og plain-Danish forklaringer af
// måleparametre. Vises når brugeren klikker "📷 Foto + info" i marker-popup.
//
// FOTO-STRATEGI:
//   - Default: vi har ét generelt foto af Sermilik Station (_sermilik_station_overview.jpg)
//     fra INTERACT (CC-BY-NC, Lea Hansen 2017) som bruges for SER_B.
//   - For TAS_L/U/A og MIT: hvis data/promice/photos/{station}.jpg findes
//     (uploaded fra felt), bruges den. Ellers viser vi et info-card med
//     eksternt link til den officielle PROMICE-station-side.
//   - Når Philip kommer hjem fra Sermilik kan han lægge sine egne fotos i
//     data/promice/photos/{station}.jpg så vises de automatisk.

const STATION_INFO = {
  MIT: {
    name: 'MIT — Mittivakkat-gletsjeren',
    elevation: '515 m.o.h.',
    coords: '65.6929°N, 37.8242°W',
    sittedOn: 'Aktiv gletsjer-overflade i ablations-zonen',
    operator: 'Københavns Universitet + GEUS (PROMICE)',
    runningSince: '2009',
    photo: null,  // ingen lokal foto endnu — Philip kan tage på feltturen
    externalLink: 'https://ign.ku.dk/english/field-stations/sermilik-station/',
    externalLabel: 'KU\'s Sermilik feltstation-side',
    instruments: [
      { name: 'Kortbølge pyranometer ↑/↓', what: 'Måler sollys der rammer og bliver reflekteret af overfladen. Forskellen mellem dem fortæller hvor meget energi gletsjeren optager.' },
      { name: 'Langbølge pyrgeometer ↑/↓', what: 'Måler den infrarøde varmestråling som overfladen og atmosfæren udsender. Bestemmer overflade-temperaturen.' },
      { name: 'Lufttemperatur (2 m)', what: 'Termometer i ventileret skærm. Den temperatur du ville opleve at gå i 2 meters højde.' },
      { name: 'Vindhastighed (10 m)', what: 'Anemometer øverst på masten. Vigtig for de turbulente varmeflukse.' },
      { name: 'Sonic ranger (afstand til overflade)', what: 'Ultralyd-sensor der måler højdeforskel mellem masten og snefladen. Bruges til at se akkumulation om vinteren og afsmeltning om sommeren.' },
      { name: 'Ablations-stake', what: 'Pind hamret ned i isen — målt manuelt eller med trådmåler. Vidner direkte om hvor mange meter is der er smeltet.' },
    ],
    purpose: 'MIT-stationen står midt på Mittivakkat-gletsjeren i ablations-zonen — det område der MISTER masse om sommeren. Den måler hvor meget energi der går ind i overfladen og hvor meget is der smelter. Stationen er et af verdens længst-løbende glaciale energi-budget-eksperimenter.',
  },

  SER_B: {
    name: 'SER_B — Sermilik bedrock',
    elevation: '~20 m.o.h.',
    coords: '65.6967°N, 38.2017°W',
    sittedOn: 'Klippe ved Sermilik-fjordens kyst',
    operator: 'GEUS (PROMICE)',
    runningSince: '2017',
    photo: '_sermilik_station_overview.jpg',
    photoCaption: 'Sermilik Station om sommeren. Foto: Lea Hansen, INTERACT (CC-BY-NC).',
    externalLink: 'https://promice.dk/aws.html',
    externalLabel: 'PROMICE AWS-oversigt',
    instruments: [
      { name: 'Kortbølge pyranometer ↑/↓', what: 'Måler sollys der rammer og bliver reflekteret. Her står sensoren på fast klippe så tilten er stabil.' },
      { name: 'Langbølge pyrgeometer ↑/↓', what: 'Måler infrarød varmestråling. Bruges til at bestemme overflade-temperatur.' },
      { name: 'Lufttemperatur (2 m)', what: 'Termometer i ventileret skærm.' },
      { name: 'Vindhastighed (10 m)', what: 'Anemometer øverst på masten.' },
      { name: 'Relativ luftfugtighed', what: 'Hvor meget vand der er i luften. Bruges sammen med vind og temperatur til at beregne den latente varmeflux.' },
    ],
    purpose: 'SER_B er kyst-referencestationen: den måler det klima der rammer Sermilik-fjorden FØR luften har bevæget sig op over gletsjeren. Sammen med MIT-stationen kan man se hvordan luften ændrer sig fra fjordoverflade til gletsjer-flade.',
  },

  TAS_L: {
    name: 'TAS_L — Tasiilaq Lower',
    elevation: '250 m.o.h.',
    coords: '65.6420°N, 37.8980°W',
    sittedOn: 'Lav-elevations is/firn-overflade',
    operator: 'IMAU (Utrecht) + GEUS (PROMICE)',
    runningSince: '2007',
    photo: null,
    externalLink: 'https://doi.pangaea.de/10.1594/PANGAEA.970127',
    externalLabel: 'Van Tiggelen 2024 — datasæt med metadata',
    instruments: [
      { name: 'Kortbølge pyranometer ↑/↓ (tilt-korrigeret)', what: 'Måler sollys ind og ud. På denne station er rådata efterbehandlet så hældningen i sensoren er taget ud — derfor er værdierne meget pålidelige.' },
      { name: 'Langbølge pyrgeometer ↑/↓', what: 'Måler infrarød varmestråling fra atmosfære og overflade.' },
      { name: 'Lufttemperatur (2 m, højdekorrigeret)', what: 'Termometer. Korrigeret til standard-højde uanset hvor meget sne der ligger omkring stationen.' },
      { name: 'Specifik fugtighed', what: 'Hvor mange gram vanddamp der er i ét kg luft. Mere præcis end relativ luftfugtighed.' },
      { name: 'Vindhastighed (10 m)', what: 'Anemometer øverst på masten.' },
      { name: 'Sonic ranger + stake-måling', what: 'To uafhængige målinger af hvor højt sneen ligger. Den ene på selve stationen, den anden på en separat stang ude i feltet.' },
    ],
    purpose: 'TAS_L er den laveste af tre stationer på en transekt fra Tasiilaq op mod indlandsisen. Sammen med TAS_U (570 m) og TAS_A (890 m) viser den hvordan klima og energibalance ændrer sig med højden. På 250 m er der typisk smelte hele sommeren.',
  },

  TAS_U: {
    name: 'TAS_U — Tasiilaq Upper',
    elevation: '570 m.o.h.',
    coords: '65.7090°N, 38.8650°W',
    sittedOn: 'Mellem-elevation, sne/firn',
    operator: 'IMAU (Utrecht) + GEUS (PROMICE)',
    runningSince: '2016',
    photo: null,
    externalLink: 'https://doi.pangaea.de/10.1594/PANGAEA.970127',
    externalLabel: 'Van Tiggelen 2024 — datasæt med metadata',
    instruments: [
      { name: 'Kortbølge pyranometer ↑/↓ (tilt-korrigeret)', what: 'Måler sol-strålingen ind og ud.' },
      { name: 'Langbølge pyrgeometer ↑/↓', what: 'Måler den infrarøde varmestråling.' },
      { name: 'Lufttemperatur (2 m, højdekorrigeret)', what: 'Termometer i ventileret skærm.' },
      { name: 'Specifik fugtighed', what: 'Vanddamp-indhold i luften.' },
      { name: 'Vindhastighed (10 m)', what: 'Vindmåler.' },
      { name: 'Sonic ranger + stake', what: 'To uafhængige sne-/is-højde-målinger.' },
    ],
    purpose: 'TAS_U står omtrent i højde med ligevægtslinjen (515 m) hvor smelte om sommeren netto balancerer akkumulation om vinteren. En af de mest interessante stationer fordi den fanger overgangs-zonen.',
  },

  TAS_A: {
    name: 'TAS_A — Tasiilaq Apex',
    elevation: '890 m.o.h.',
    coords: '65.7790°N, 38.8995°W',
    sittedOn: 'Højtliggende firn (akkumulationszone)',
    operator: 'IMAU (Utrecht) + GEUS (PROMICE)',
    runningSince: '2013',
    photo: null,
    externalLink: 'https://doi.pangaea.de/10.1594/PANGAEA.970127',
    externalLabel: 'Van Tiggelen 2024 — datasæt med metadata',
    instruments: [
      { name: 'Kortbølge pyranometer ↑/↓ (tilt-korrigeret)', what: 'Måler sol-strålingen. Pyranometrene tilter ofte når stationen står på løs firn — det er korrigeret i data.' },
      { name: 'Langbølge pyrgeometer ↑/↓', what: 'Måler infrarød varmestråling.' },
      { name: 'Lufttemperatur (2 m, højdekorrigeret)', what: 'Termometer. Står på en mast der hver sommer skal hæves fordi den synker ned i firnen.' },
      { name: 'Specifik fugtighed', what: 'Vanddamp-indhold.' },
      { name: 'Vindhastighed (10 m)', what: 'Vindmåler. Vind er meget vigtig i den højde — den driver de turbulente varmeflukse der ofte leverer mere energi end solen i Sermilik-området.' },
      { name: 'Sonic ranger + stake + tryksensor', what: 'Tre uafhængige målinger af hvor meget sne der ligger.' },
    ],
    purpose: 'TAS_A er højdepunktet på Tasiilaq-transekten. Tæt på toppen af indlandsisens kant — her er det normalt for koldt til smelte hele sommeren, men under varme år kan der ske kraftig smelte. Stationen viser hvor klimaforandringer presser smelte-zonen op ad bjerget.',
  },
};

// ─── Modal ────────────────────────────────────────────────────────────────────
let modalEl = null;

function buildModal() {
  modalEl = document.createElement('div');
  modalEl.id = 'si-modal';
  modalEl.innerHTML = `
    <div class="si-modal-backdrop"></div>
    <div class="si-modal-card">
      <div class="si-modal-header">
        <h2 id="si-title">Station-info</h2>
        <button type="button" id="si-close">×</button>
      </div>
      <div class="si-modal-body" id="si-body"></div>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalEl.querySelector('#si-close').addEventListener('click', close);
  modalEl.querySelector('.si-modal-backdrop').addEventListener('click', close);
}

function close() {
  modalEl?.classList.remove('open');
}

export function openStationInfo(stationId) {
  if (!modalEl) buildModal();
  const info = STATION_INFO[stationId];
  if (!info) {
    alert('Ingen info for ' + stationId);
    return;
  }
  modalEl.querySelector('#si-title').textContent = info.name;

  // Foto-section: lokal billede hvis tilgængelig, ellers info-placeholder
  let photoBlock;
  if (info.photo) {
    photoBlock = `
      <div class="si-photo">
        <img src="./data/promice/photos/${info.photo}" alt="${info.name}">
        ${info.photoCaption ? `<div class="si-photo-caption">${info.photoCaption}</div>` : ''}
      </div>
    `;
  } else {
    photoBlock = `
      <div class="si-photo si-photo-placeholder">
        <div class="si-photo-pl-icon">📷</div>
        <div class="si-photo-pl-text">
          Ingen lokal foto endnu af denne station.<br>
          <a href="${info.externalLink}" target="_blank">${info.externalLabel} →</a>
        </div>
      </div>
    `;
  }

  const instrumentRows = info.instruments.map(i => `
    <li><b>${i.name}</b><br><span class="si-what">${i.what}</span></li>
  `).join('');

  modalEl.querySelector('#si-body').innerHTML = `
    ${photoBlock}
    <div class="si-meta">
      <div><span class="si-meta-label">Højde</span> <b>${info.elevation}</b></div>
      <div><span class="si-meta-label">Koordinat</span> <b>${info.coords}</b></div>
      <div><span class="si-meta-label">Står på</span> ${info.sittedOn}</div>
      <div><span class="si-meta-label">Driftsoperatør</span> ${info.operator}</div>
      <div><span class="si-meta-label">Kører siden</span> ${info.runningSince}</div>
    </div>
    <div class="si-section">
      <h3>Hvad bruges stationen til?</h3>
      <p>${info.purpose}</p>
    </div>
    <div class="si-section">
      <h3>Instrumenter på stationen</h3>
      <ul class="si-instruments">${instrumentRows}</ul>
    </div>
    <div class="si-section">
      <a href="${info.externalLink}" target="_blank" class="si-external">${info.externalLabel} ↗</a>
    </div>
  `;
  modalEl.classList.add('open');
}

// Global handler så marker-popups kan kalde
window.__openStationInfo = openStationInfo;
