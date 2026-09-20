# Sollys ved Sermilik — spektralanalyse

Fem måleserier med et Ocean Optics Red Tide USB-650 ved **Sermilik feltstation**,
Ammassalik Ø, Østgrønland (65°41′N, 37°55′V), 4. og 7. august 2026.
380–950 nm i 1 nm-skridt.

Solhøjde ved lokal middag 4. august: **41,5°**, luftmasse **1,51**.

Siden præsenterer resultaterne, koblingen til Sentinel-2 og hvad det kan bruges til
i undervisningen. Måleserierne herunder er kilderne; selve siden fortæller ikke om
processen bag dem.

Målingerne er **testmålinger ved selve stationen** — ikke validering endnu. De fastlægger
metodegrundlaget for on-ground-validation til Sermilik Validation-GIS
(`../index.html`): otte af Sentinel-2's ti optiske bånd ligger inden for 380–950 nm og
kan derfor efterprøves fra jorden. B11/B12 (SWIR) og Landsat B10 (termisk) kan ikke —
det udelukker NDSI-validering og to af de fem led i albedo-formlen.

Feltforsøget (afsnit 07) måler albedo med trykt referencekort + appen på
https://geo.sg.dk/albedo, og smeltning med ablationspinde. To felter giver uafhængigt
samme indstråling inden for 5 % (273 og 260 W/m²), hvilket viser at smeltningen dér er
styret af absorberet solstråling alene.

Klimaforløbet på siden deler indlandsisens massetab i to omtrent lige store halvdele:
overfladesmeltning (styret af albedo — det snemålingerne dækker) og dynamik
(hurtigere flydning + afsmeltning i havet, som Helheim Gletsjer i Sermilik Fjord er
et hovedeksempel på). Spektrometeret kan kun sige noget om den første halvdel.

**Jord mod satellit — valideringen holder** (afsnit 08). Sentinel-2 fra 7. august 2026
(0,11 % skydække, optaget 14:14 UTC ≈ lokal middag) mod feltmåling med referencekort:

| Sted | Albedo (Liang) |
|---|---|
| Nær isranden | 0,077 |
| Midt på gletsjeren | 0,163 |
| Højere oppe — hvor der blev målt | **0,231** |
| Målt på jorden | **0,265** |

15 % afvigelse. Forklares fuldt af appens reference (70 % mod kortets 65 %, ~7 %) plus
3–5° hældning væk fra solen (6–11 %), da Sentinel-2 L2A antager vandret flade.

Den første sammenligning blev lavet nær isranden og gav faktor tre — fordi albedoen
tredobles over under to kilometer dér. Lektionen er valg af måleflade, ikke instrumentfejl:
mål midt på en ensartet flade på mindst 40 × 40 m.

**GIS'ens pixel-info rapporterede forkerte tal — rettet.** For feltpunktet gav værktøjet
albedo 0,616 / NDSI 0,106 / NDVI 0,003, hvor Copernicus direkte gav 0,132 / +0,851 / −0,260.
Årsag: alle scener i søgevinduet blev midlet i ét bucket uden skymaske, og "scenedatoen"
(23. juli) var vinduets startdato. Rettet til dags-buckets + SCL-skymaske + nærmeste skyfri
dag. Kaldene går nu gennem proxyen `GEO_site/Sermilik_api` (OAuth-klienten i den offentlige
kode udløb 2026-09-03). Efterprøvet 2026-09-20: gletsjerpunkt 7. august giver 0,266 /
+0,947 / −0,135. Satellittallene på siden er hentet via WMS GetFeatureInfo på instansen.

**10,7 % er mørk is med meget sediment, ikke en smeltevandskanal** (rettet 2026-09-20,
bekræftet af Philip; fladen omkring kortet i `IMG_5584` giver 10–13 % med den gamle metode).
Originalfotos ligger i `figurer/felt-originaler/` (uden for git og deploy).

Afviste hypoteser undervejs, dokumenteret så de ikke skal genopfindes:
* **Gamma/sRGB-linearisering i appen** — målt på referencekortet i felten giver appens
  enkeltpunkts-metode 0,253 og en to-punkts-kalibrering 0,266–0,271. Metoden flytter
  ~7 %, ikke faktor tre.
* **Fejl i Sentinel-2-produktet** — over 12 × 12 km rapporterer det p99 = 0,725 og
  maksimum 1,00, og Liang-formlen giver 0,817 på bibliotekets snespektrum. Produktet
  og formlen er i orden.

For at gå fra test til rigtig validering mangler: GPS-punkt pr. måling på en flade der
er ensartet over mindst 10 × 10 m, et hvidt referencepanel, og en skyfri
Sentinel-2-passage tæt på måledagen.

## Måleserierne

| Serie | Fil | Integration | Midling | Indhold |
|---|---|---|---|---|
| 1 | `spektra-tobleronehytte.cmbl` → `../solspektrum.csv` | 32 ms | 10 | Sol, blå himmel, 2 planter, klippe |
| 2 | `Untitled.cmbl` → `Untitled.csv` | 3 ms | 20 | Sol direkte, blå himmel, træplanke |
| 3 | `ny_maaling_bred_blaa_himmel_med_sloer.cmbl` | 30 ms | 20 | Blå himmel med skyslør |
| 4 | `rødlig jord.cmbl` | 100 ms | 10 | Bar rødlig jord + mørkemåling |
| 5 | `solspektrum-gletsjer2.cmbl` | ukendt* | ukendt* | Gletsjer 7. aug: indstråling, ren sne, beskidt sne, jord/beskidt sne |
| 6 | feltforsøg 3.–9. aug (fotos + albedo-app) | — | — | Ablationspinde i felter med forskellig albedo |

\* Filen er gemt to dage efter målingen uden spektrometeret tilsluttet, så hele
`<MBLChannel>`/`<MBLCalibration>`-blokken mangler — 49 tags, heriblandt
`MBLOceanOpticsDSF`. Integrationstiden kan ikke rekonstrueres fra filen, men var
ifølge Philip **uændret gennem hele serien**, så de fire spektre deler radiometrisk
skala. Datasættene hedder generisk `Run 1`, `Run 1 2`, `Run 2`, `Run 3`; tilordningen
til overflader er gjort ud fra blå/rød-forholdet (indstrålingen er klart blåest) og
bekræftet.
| — | `mørkemaalinger.cmbl` | 32 ms | 30 | 4 mørkemålinger til serie 1 |

## Filer

| Fil | Hvad |
|---|---|
| `index.html` | **Den færdige side.** Spektraldata er indlejret; **mappen `foto/` skal med** (4 billeder, ~0,9 MB). |
| `foto/` | Feltbilleder (afsnit 07) og satellitfigurer (afsnit 08). 6 filer, ~1,3 MB. |
| `template.html` | Kilden. Al tekst, CSS og JavaScript. Rediger her, ikke i `index.html`. |
| `build.py` | Læser CSV + .cmbl, indsætter data i templaten, skriver `index.html`. |
| `analyse_linjer.py` | Linjeidentifikation, ækvivalentbredder, Rayleigh-fit, solhøjde. |
| `figur_sol.py` | Genererer `figurer/solspektrum_analyse.png` — statisk firepanels-figur. |
| `figurer/` | Kilde-PNG'er i fuld opløsning. Ikke nødvendige for siden. |
| `roedlig_jord.csv` | CSV-eksport af serie 4 (jord + mørke), udtrukket af .cmbl. |
| `moerke32ms.csv` | Middel af de fire mørkemålinger ved 32 ms + slør-himlen. |

## Byg siden

```bash
python3 spektrum/build.py
```

Kun standardbiblioteket. Kør igen når `template.html` eller en datafil ændres.
Scriptet advarer og springer over hvis en .cmbl mangler, så siden kan altid bygges.

`analyse_linjer.py` og `figur_sol.py` kræver numpy og matplotlib:

```bash
python3 -m venv venv && ./venv/bin/pip install numpy matplotlib
```

## Metode

Al databehandling i `index.html` er en JavaScript-port af Python-analysen og giver
samme tal (kontrolleret: reflektansværdier stemmer på tre decimaler, Rayleigh-
eksponenten inden for 0,01).

**Reflektans** = målespektrum / solspektrum. Divisionen ophæver instrumentets egen
følsomhed, gitterets effektivitet og selve solspektret. Telluriske bånd (686–697,
715–738, 752–775, 808–838, 890–950 nm) interpoleres væk, fordi de står i både tæller
og nævner. Derefter 9-punkts glidende middel og normering til NIR-plateauet 790–880 nm.

## Forbehold der står i data

1. **Serie 1 deler ikke radiometrisk skala.** Planterne overhaler Solen i NIR, hvilket
   er fysisk umuligt og skyldes forskellig integrationstid pr. måling. Absolut reflektans
   kan ikke aflæses; former, båndforhold, linjedybder og NDVI er upåvirkede.
2. **Serie 2's sol-måling er ramt af stråelys.** Fiberen pegede direkte mod en sol bag
   tyndt skyslør. Fraunhofer-linjerne er udvandet fra 50 % til 22 % i den blå ende.
   Brug ikke den måling til absolutte blå-værdier. Den bruges på siden kun til
   forholdet himmel/sol, hvor effekten er noteret som en nedre grænse.
3. **Mørkefratræk ændrer intet i serie 1** (NDVI +0,003, Rayleigh −4,22 → −4,20), men
   betyder 20 % ved 400 nm på planterne og ~100 % ved 950 nm.
4. **Datoen i serie 1's .cmbl er forkert** (påstår 20. januar). Data modsiger den:
   ved den solhøjde ville den blå ende være helt væk.
5. **Feltforsøget: appen og kortet er uenige.** Kortet angiver det hvide felt til 65 %
   (pixelværdi 166/255), men appen regner med 70 % (`Ge=70` i kildekoden). Alle målte
   albedoer bliver ~7,7 % for høje. Tallene på siden er som appen gav dem. **Anbefalet
   rettelse:** brug begge referencefelter til en to-punkts-kalibrering i stedet for kun
   det hvide — det absorberer eksponering og tonekurve uden at kræve en teori om dem.
6. **Serie 5 har ingen absolut albedo.** Ren sne / indstråling overstiger 1 omkring
   700 nm, fordi indstrålings-målingen opsamler hele himlens blå lys mens sneen er
   belyst mest af den direkte, lavtstående sol. De *relative* albedoer (beskidt mod ren
   sne) er solide; albedoen 0,80 for ren sne på siden er en antagelse, ikke en måling.
