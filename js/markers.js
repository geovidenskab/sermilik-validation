// Faste markører: forskningsstation, gletsjere, AWS-vejrstationer, byer.
// Genererer tre Leaflet layer-groups som UI-laget bruger.

import { map } from './map.js';

function makeIcon(cls, size = 18) {
  return L.divIcon({
    className: cls,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const stationLocations = {
  sermilik: {
    coords: [65.680864, -37.916071],
    title: 'Sermilik Forskningsstation',
    html: `<h3>Sermilik Forskningsstation</h3>
      <p><b>65°40.85′N · 37°54.96′W</b> · KU/IGN-feltstation siden 1970</p>
      <p>Hovedhus 60 m² (3 forskerværelser, opholdsrum), arbejdsbygning 50 m²,
         annex på nunatak 515 m.o.h. nær Mittivakkats ligevægtslinje.
         Plads til 6–10 forskere.</p>
      <p><a href="https://ign.ku.dk/english/field-stations/sermilik-station/" target="_blank">Stationsside →</a></p>`,
    icon: 'marker-station',
    size: 22,
  },
  mittivakkat: {
    coords: [65.69, -37.85],
    title: 'Mittivakkat Gletsjer',
    html: `<h3>Mittivakkat Gletsjer</h3>
      <p>Lille lokal iskappe — ~15.8 km², elevation 160–880 m.o.h. Fokuspunkt for
         forskning siden 1933 (Knud Rasmussens ekspedition). Massebalancemålinger
         siden midten af 1980'erne — en af de længste serier i Arktis.</p>
      <p>Markant tilbagetrækning siden Den Lille Istid. Ligevægtslinje ca. 515 m.o.h.</p>`,
    icon: 'marker-glacier',
    size: 16,
  },
  ser_b: {
    coords: [65.66, -38.155],
    title: 'PROMICE AWS — SER_B',
    html: `<h3>SER_B — Sermilik bedrock</h3>
      <p>Vejrstation på klippe ved Sermilik-fjordens kyst. Den måler det klima
         der rammer fjorden — temperatur, vind, stråling — som reference for
         hvad der sker længere oppe på gletsjeren.</p>
      <p style="display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button onclick="window.__openStationInfo('SER_B')" class="vp-photo-btn">Foto + info →</button>
        <button onclick="window.__openPromiceViewer('SER_B','SER_B Sermilik bedrock')" class="vp-photo-btn">Vis og plot data →</button>
      </p>`,
    icon: 'marker-aws',
    size: 14,
  },
  mit: {
    coords: [65.69, -37.83],
    title: 'PROMICE AWS — MIT (på gletsjer)',
    html: `<h3>MIT — Mittivakkat-gletsjeren</h3>
      <p>Stationen står direkte på Mittivakkat-gletsjeren i ablations-zonen
         (515 m.o.h.) — det område der MISTER masse om sommeren. Et af verdens
         længst-løbende glaciale energi-budget-eksperimenter (siden 2009).</p>
      <p style="display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button onclick="window.__openStationInfo('MIT')" class="vp-photo-btn">Foto + info →</button>
        <button onclick="window.__openPromiceViewer('MIT','MIT Mittivakkat')" class="vp-photo-btn">Vis og plot data →</button>
      </p>`,
    icon: 'marker-aws',
    size: 14,
  },
  // ─── Tasiilaq-transekten (PANGAEA Van Tiggelen 2024, daglig SEB) ───────────
  tas_l: {
    coords: [65.6402, -38.8987],
    title: 'AWS — TAS_L (Tasiilaq kyst, 250 m)',
    html: `<h3>TAS_L — Tasiilaq Lower (250 m)</h3>
      <p>Lavest af tre stationer på en transekt op mod indlandsisens kant.
         Kører siden 2007 (17 års data). På 250 m er der typisk smelte hele sommeren.</p>
      <p style="display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button onclick="window.__openStationInfo('TAS_L')" class="vp-photo-btn">Foto + info →</button>
        <button onclick="window.__openPromiceViewer('TAS_L','TAS_L Tasiilaq Lower')" class="vp-photo-btn">Vis og plot data →</button>
      </p>`,
    icon: 'marker-aws',
    size: 14,
    pangaea: 'GRL_TAS_L_AWS.tab',
  },
  tas_u: {
    coords: [65.6978, -38.8668],
    title: 'AWS — TAS_U (Tasiilaq mellem, 570 m)',
    html: `<h3>TAS_U — Tasiilaq Upper (570 m)</h3>
      <p>Midt-station omtrent i højde med ligevægtslinjen — den højde hvor
         smelte om sommeren netop balancerer akkumulation om vinteren.</p>
      <p style="display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button onclick="window.__openStationInfo('TAS_U')" class="vp-photo-btn">Foto + info →</button>
        <button onclick="window.__openPromiceViewer('TAS_U','TAS_U Tasiilaq Upper')" class="vp-photo-btn">Vis og plot data →</button>
      </p>`,
    icon: 'marker-aws',
    size: 14,
    pangaea: 'GRL_TAS_U_AWS.tab',
  },
  tas_a: {
    coords: [65.7790, -38.8995],
    title: 'AWS — TAS_A (Tasiilaq top, 890 m)',
    html: `<h3>TAS_A — Tasiilaq Apex (890 m)</h3>
      <p>Højest af de tre stationer — tæt på indlandsisens kant. Normalt for
         koldt til smelte hele sommeren, men under varme år kan der ske kraftig
         smelte. Viser hvor klimaforandringer presser smelte-zonen op ad bjerget.</p>
      <p style="display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button onclick="window.__openStationInfo('TAS_A')" class="vp-photo-btn">Foto + info →</button>
        <button onclick="window.__openPromiceViewer('TAS_A','TAS_A Tasiilaq Apex')" class="vp-photo-btn">Vis og plot data →</button>
      </p>`,
    icon: 'marker-aws',
    size: 14,
    pangaea: 'GRL_TAS_A_AWS.tab',
  },
  tasiilaq: {
    coords: [65.6145, -37.6368],
    title: 'Tasiilaq',
    html: `<h3>Tasiilaq (Ammassalik)</h3>
      <p>Østgrønlands største by, ca. 1700 indbyggere. ~15 km sydøst for Sermilik feltstation.</p>
      <p>Vandkraftværk (1,2 MW siden 2004).</p>`,
    icon: 'marker-town',
    size: 18,
  },
  kulusuk: {
    coords: [65.5733, -37.1236],
    title: 'Kulusuk Lufthavn',
    html: `<h3>Kulusuk</h3>
      <p>Ankomst- og afrejselufthavn fra Island. Lille bygd; oprindelig amerikansk DEW-line radarstation.</p>`,
    icon: 'marker-town',
    size: 16,
  },
  helheim: {
    coords: [66.35, -38.20],
    title: 'Helheim Gletsjer',
    html: `<h3>Helheim Gletsjer</h3>
      <p>Stor udløbsgletsjer fra Indlandsisen — leverer kalvende isbjerge til Sermilik Fjord.
         Et af Grønlands mest aktive og velmonitorerede gletsjersystemer.</p>
      <p>Synlig fra fjorden under sejlads.</p>`,
    icon: 'marker-glacier',
    size: 18,
  },
};

export const stationsLayer = L.layerGroup();
export const awsLayer = L.layerGroup();
export const townsLayer = L.layerGroup();

Object.entries(stationLocations).forEach(([key, s]) => {
  const m = L.marker(s.coords, { icon: makeIcon(s.icon, s.size), title: s.title })
    .bindPopup(s.html);
  if (key === 'ser_b' || key === 'mit' || key === 'tas_l' || key === 'tas_u' || key === 'tas_a') awsLayer.addLayer(m);
  else if (key === 'tasiilaq' || key === 'kulusuk') townsLayer.addLayer(m);
  else stationsLayer.addLayer(m);
});

stationsLayer.addTo(map);
awsLayer.addTo(map);
townsLayer.addTo(map);

// Brugt af tools.js til at lave divIcon for tegnede pins
export { makeIcon };
