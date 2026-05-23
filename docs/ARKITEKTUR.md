# Arkitektur

## Designprincipper

1. **Ingen build-step.** ES2022 native modules, alle eksterne libraries via CDN.
2. **Ingen backend.** Alt klient-side. State i localStorage, eksport via GeoJSON/Excel.
3. **Single page**, men logisk opdelt i moduler.
4. **Vanilla JS** — ikke React. Holder app'en let, robust, og forenelig med Philips
   andre statiske projekter på geo.sg.dk.
5. **Hver modul ~50-300 linjer.** Hvis et modul vokser over 400 linjer er det
   sandsynligvis tid til at splitte.

## Modulgraf

```
index.html
  └─ js/main.js              ← entry; importerer alle moduler i rigtig rækkefølge
       ├─ config.js          ← konstanter (URL'er, default-værdier, evalscripts)
       ├─ map.js             ← Leaflet map + baggrundskort
       ├─ markers.js         ← stationer, AWS, byer
       ├─ sentinel-hub.js    ← S2 + Landsat WMS-lag, dato-vælger, custom evalscripts
       ├─ geus.js            ← GEUS Greenmin WMS-lag
       ├─ arcticdem.js       ← ArcticDEM via esri-leaflet
       ├─ layer-control.js   ← panel-UI til lag-toggle
       ├─ tools.js           ← mål/pin/polygon/polyline + GeoJSON-eksport
       ├─ ui.js              ← legend, badges, scalebar, mobile toggle
       └─ validation.js      ← STUB (Sprint 2): felt-punkter med foto + ground-data
```

## Globalt state (refactor-mål)

Modulerne deler kort-instans (`map`) via import fra `map.js`. Resten af state er
modul-lokalt og persisteres til localStorage hvor relevant.

| Modul | localStorage key | Indhold |
|---|---|---|
| sentinel-hub.js | `sermilik_sh_instance_id` | WMS instance ID (override) |
| sentinel-hub.js | `sermilik_sh_dates` | tidsperiode, mode, maxcc |
| tools.js | `sermilik_drawings` | tegnede polygoner/linjer (GeoJSON FC) |
| validation.js | `sermilik_validation_points` | Sprint 2+ |
| validation.js | `sermilik_sh_oauth_token` | Sprint 3+, sessionStorage |

## Datakilder & autentificering

Se `README.md` for oversigt. To centrale auth-modeller:

1. **WMS** (kortlag i panelet) — bruger Sentinel Hub *instance ID* indlejret i URL.
   Public, ingen tokens. Token-issue: brugerens egen instance kan ramme PU-loft.
2. **Statistical API** (Sprint 3+) — bruger OAuth2 Client Credentials med
   web-origin-restriction. Client ID embeddes i koden, secret må ikke.

## Test-strategi

Ren manuel browser-test til Sprint 1. Hver feature i v11 skal stadig fungere:

- [ ] Alle 8 baggrundskort kan vælges
- [ ] Markers vises og popups åbner
- [ ] Alle spektrale lag fra Sentinel Hub fungerer
- [ ] Glaciologiske indekser (NDSI, albedo, NDWI) fungerer
- [ ] Termiske lag (Landsat LST) fungerer
- [ ] GEUS geologi-lag fungerer
- [ ] ArcticDEM-lag fungerer
- [ ] Mål-afstand-værktøj
- [ ] Pin-værktøj med popup + Kopiér-knap
- [ ] Tegn polygon + areal-beregning
- [ ] Tegn polyline + længde-beregning
- [ ] GeoJSON-eksport
- [ ] Datovælger (range/single + presets + skytærskel)
- [ ] localStorage persistens efter reload

Fra Sprint 2 indfører vi vitest til de nye moduler.
