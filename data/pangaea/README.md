# PANGAEA Van Tiggelen 2024 — Daglig SEB

**Citation**: Van Tiggelen, M; Smeets, PCJP; Reijmer, CH; van As, D; Box, JE; Fausto, RS;
Khan, SA; Rignot, E; van den Broeke, MR (2024): *Daily surface energy balance (SEB)
and quality-controlled meteorological quantities measured at 19 stations on the
Greenland ice sheet (2003-2023)*. PANGAEA, https://doi.org/10.1594/PANGAEA.970127

**Licens**: CC-BY-4.0 — citér ovenstående DOI hvis I bruger data i artikler/projekter.

## Stationer i Sermilik-området (Tasiilaq-transekten)

| Station | Lat | Lon | Højde | Periode | Linjer |
|---|---|---|---|---|---|
| TAS_L | 65.6402°N | 38.8987°W | 250 m | 2007-08-23 → 2024-01-03 | ~6.000 |
| TAS_U | 65.6978°N | 38.8668°W | 570 m | 2008-03-11 → 2015-08-13 | ~2.700 |
| TAS_A | 65.7790°N | 38.8995°W | 890 m | 2013-08-28 → 2023-10-09 | ~3.600 |

Tre stationer = perfekt højdetransekt fra kyst (250 m) til top (890 m) af gletsjeren.

## Filformat

PANGAEA `.tab` = TAB-separated. Headeren (kommentarer indkapslet i `/* ... */`)
fylder typisk 50-58 linjer. Datalinje starter efter `*/`.

## Vigtige kolonner

Tællingen er 0-indexed fra venstre i en datalinje:

| # | Kolonne | Enhed | Brug |
|---|---|---|---|
| 2 | Date/Time | YYYY-MM-DD | nøgle for matching mod satellit-data |
| 3 | TTT day m | °C | luft-temperatur (ukorrigeret) |
| 4 | TTT day m corrected | °C | luft-temperatur ved 2 m |
| 12 | SWD day m | W/m² | shortwave downwelling (incoming) |
| 13 | SWU day m | W/m² | shortwave upwelling (reflected) |
| 14 | LWD day m | W/m² | longwave downwelling |
| 15 | LWU day m | W/m² | longwave upwelling |
| 20 | Surf temp (from LWU) | °C | → sammenlign med Landsat LST |
| 21 | Surf temp (modelled) | °C | SEB-model output |
| 22 | Melt E (modelled) | W/m² | daglig smelteenergi |
| 31 | Melt E (SEB) | W/m² | alternativ smelte-estimat |
| 34 | Surf temp (max daily) | °C | maks. temp på dagen |
| 38 | Samples SEB | # | hvor mange valide timer indgår |
| 39 | Samples AWS | # | hvor mange valide AWS-timer |

## Beregnede afledte størrelser

- **Albedo** = SWU / SWD (kun gyldigt når SWD > 50 W/m² for at undgå støj ved lav solindstråling)
- **Net shortwave** = SWD − SWU
- **Net longwave** = LWD − LWU
- **Net all-wave radiation** = (SWD − SWU) + (LWD − LWU)

## Brug i undervisning

- **Albedo som funktion af højde**: plot dagligt albedo for TAS_L (250 m), TAS_U (570 m), TAS_A (890 m) for en sommer. Eleverne ser kystens lave albedo (bare jord), abrupt skifte op gennem gletsjer, høj albedo i akkumulationszonen.
- **0°C-isothermens vandring**: find første dag i året hvor Surf temp passerer 0 °C på TAS_L vs. TAS_A. Hvor mange dage tager det at "klatre" 640 m højde? Sammenlign mellem år.
- **Smelte-intensitet vs. tilbagetrækning**: kobl årlig sum af Melt E på TAS_L til Mittivakkats massebalance (fra Knud Rasmussen-serien).
