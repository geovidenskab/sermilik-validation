# Sermilik feltstation — On-ground validation

Interaktivt GIS-kort til feltarbejde og satellit-ground-validation omkring
Mittivakkat-gletsjeren og Sermilik feltstation, Østgrønland.

**Live**: https://geo.sg.dk/sermilik

## Formål

Eleverne arbejder med at validere satellitternes måling af:

- **Albedo** — fra foto + Sentinel-2 Liang (2001) bredbåndsalbedo
- **Overfladetemperatur** — fra IR-termometer/PROMICE AWS + Landsat 8/9 TIRS LST
- **Vegetation** (kommende) — fra visuel dækningsgrad + Sentinel-2 NDVI

Inspireret af [NASA GLOBE Observer](https://observer.globe.gov/) og forankret i
[CEOS Land Product Validation](https://lpvs.gsfc.nasa.gov/) protokollerne.

## Køre lokalt

```bash
# Variant 1: Python
python3 -m http.server 5173

# Variant 2: Node
npx serve -p 5173 .
```

Derefter: http://localhost:5173

Vigtigt: porten skal være **5173** for at OAuth-clienten accepterer det
(allowed origin er sat til `http://localhost:5173`).

## Arkitektur

Ren statisk app — ingen build-step. ES-moduler indlæses direkte via
`<script type="module">`. Se [docs/ARKITEKTUR.md](docs/ARKITEKTUR.md).

## Sentinel Hub OAuth

Client ID og web-origin-restriction er sat op gennem Copernicus Data Space
Ecosystem dashboard. Client ID kan embeddes i koden (origin-låst til
`https://geo.sg.dk` og `http://localhost:5173`), men Client Secret må ALDRIG
committes.

Lokal credentials-fil: `~/.config/sans-science/sermilik-credentials.json` (chmod 600).

## Status

- ✅ **Sprint 1**: Projektstruktur + refaktorering af v11
- 🔲 Sprint 2: Validation-punkter med foto/EXIF
- 🔲 Sprint 3: Sentinel Hub Statistical API
- 🔲 Sprint 4: Foto-albedo modul
- 🔲 Sprint 5: Sammenlignings-view
- 🔲 Sprint 6: Overpass-kalender + PROMICE-integration
- 🔲 Sprint 7: Ekspedition-rapport eksport

## Datakilder

| Lag | Kilde | API |
|---|---|---|
| Esri World Imagery | Esri/Maxar | XYZ tiles |
| Sentinel-2 cloudless mosaikker | EOX | WMTS |
| Sentinel-2 L2A spektral | Copernicus Data Space | WMS + custom evalscript |
| Landsat 8/9 TIRS | Copernicus Data Space | WMS + custom evalscript |
| ArcticDEM 2 m | PGC/Maxar | Esri ImageServer |
| GEUS geologi/mineraler | GEUS Greenmin | WMS |
| PROMICE AWS data | GEUS THREDDS | CSV |

## Licens

Kode: MIT. Indhold (tekster, didaktiske ressourcer): CC BY-SA 4.0.
