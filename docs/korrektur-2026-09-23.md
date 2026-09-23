# Korrektur af undervisningssiden — beslutninger (2026-09-23)

Korrekturen dækkede de fem sider i `undervisning/`: forløbssiden (`index.html`), elevarket
(øvelsesvejledningen + PDF), udvidelsen, referencekortet og lærervejledningen. Tekstens henvisninger til appen og kortene er tjekket mod koden
(`Albedo/src/components/SimpleAlbedo.jsx`, `kort/js/pixel-info.js`, `kort/dk.html`), og alle
regnestykker er regnet efter (opgave 3, udvidelse 1, 2 og 5, gamma-tallene i lærervejledningen).
Regnestykkerne passer.

**Rene sprog-, konsistens- og faktarettelser er lagt ind lokalt** (se afsnit 4). Her står det, der
kræver Philips beslutning.

## 1. Gråtoneskalaen begår den fejl, som lærervejledningen advarer imod

Skalaen i «Hvad er albedo?» (forløbssiden) og «Albedo på 30 sekunder» (elevarket) sætter
grå ≈ albedo × 255, altså `pixelværdi / 255`. Det er præcis den fejl, som det gamle referencekort
blev bygget på (lærervejledningen, «Kameraet gemmer ikke lys lineært»). En skærm viser gamma-kodet:

| Albedo | Nu | Det viser skærmen | Korrekt sRGB |
|---|---|---|---|
| 0,10 | `#1a1a1a` | 0,010 | `#595959` |
| 0,20 | `#3d3d3d` | 0,047 | `#7c7c7c` |
| 0,35 | `#6b6b6b` | 0,147 | `#a0a0a0` |
| 0,50 | `#9c9c9c` | 0,332 | `#bcbcbc` |
| 0,65 | `#cfcfcf` | 0,624 | `#d3d3d3` |
| 0,85 | `#f2f2f2` | 0,888 | `#ededed` |

Asfaltfeltet (0,10) er altså ti gange for mørkt. Elevarket beder eleverne gætte asfalt og græs
ud fra skalaen («Gæt først»). Asfalt ligner i virkeligheden 0,35-feltet, så gættet trækkes op.

**Forslag:** brug de korrekte sRGB-værdier på begge sider (hvid tekst på 0,10 og 0,20, mørk tekst
fra 0,35). Skalaen bliver mere grå i den mørke ende, men den passer med det, eleverne ser. Den kan
også bruges i A-niveau-diskussionen om gamma.

## 2. Appen advarer ikke om overeksponering, men lærervejledningen siger, at den gør

Lærervejledningen skriver det to steder: «Appen advarer om overeksponering — det hvide felt er
brændt ud» (Når det går galt) og «så advarer appen, og tallene bliver for høje» (facit til
udvidelse 4). Appen beregner `saturatedFraction` (andelen af pixels ≥ 250) for hvert felt
(`SimpleAlbedo.jsx:264-288`), men bruger den ingen steder. Sådan har det været siden
baseline-commit `0d0a4448`. Live-bundlen (`index-DqSOau_p.js`) indeholder ingen advarselstekst.

**Forslag A (anbefalet):** byg advarslen. Er mere end 2 % af det hvide referencefelts pixels
mættede, vises en gul linje over resultatet: «Det hvide felt er overeksponeret. Tallene bliver for
høje. Tag billedet igen i skygge, eller skru ned for lysstyrken.» Det kræver et build og et deploy
af Albedo. Et overeksponeret hvidt felt var netop problemet med feltfotoene fra Grønland.
**Forslag B:** ret teksten i stedet til «Er det hvide felt helt hvidt uden struktur i fotoet, er
det brændt ud, og tallene bliver for høje».

## 3. Lærervejledningen: «Atmosfærekorrektionen antager en vandret flade»

L2A-produktet terrænkorrigeres med en højdemodel, så sætningen er næppe rigtig. Den antagelse, der
faktisk betyder noget her, er, at fladen spreder lyset lige meget i alle retninger (lambertsk
flade), mens satellitten kun ser den fra én vinkel. Det hænger direkte sammen med punkt 3 lige
over («Lav sol og ru flader»).

**Forslag:** «Atmosfærekorrektionen antager, at fladen spreder lyset lige meget i alle retninger,
og satellitten ser den kun fra én vinkel. Det er et godt tal — men ikke et facit.»

## 4. Rettet lokalt (ikke deployet)

- **Forløbssiden:** manglende kommaer (ni steder). «på skolegården» → «i skolegården».
  «Copernicus /ESA» → «Copernicus/ESA». `Q · (1 − albedo)` → `sollys · (1 − albedo)` (Q var ikke
  defineret på siden). «For satellitten er den flere gange så lys» sagde ikke, hvad den blev
  sammenlignet med → «lysere end asfalten — og flere gange så lys, som telefonen ser den».
  «ingen forskel … lige så mørke» → «kun lille forskel … omtrent lige så mørke» (samme ord som i
  udvidelsen og lærervejledningen). B/A-folden: «de infrarøde 20 × 20» passede ikke, fordi B08
  (nær-infrarød) har 10 m → «Tre af de fem … de to kortbølge-infrarøde 20 × 20». Mørkezonen
  ligger «på indlandsisen langs Grønlands vestkyst» (før stod der kun «langs vestkysten»).
  «snealger» → «sne- og isalger» (på bar is er det isalger). «rammer systematisk for lavt» →
  «rammer afsmeltningen systematisk for lavt». «Helheim Gletsjer» → «Helheim-gletsjeren» (som
  Mittivakkat- og Apusiaajik-gletsjeren). «Smeltningen forstærker sig selv» stod der tre gange
  på få linjer → omskrevet. Opgaven med smeltevandsgryden siger nu, at man skal klikke på «foto
  uden referencekort» under «Andet billede» *før* man lægger billedet ind, for sådan virker appen.
- **Elevark:** «en parkeringsplads og en boldbane» → «fx …». Et komma. **PDF'en er lavet igen:**
  den gamle linkede til `http://localhost:5173/kort/dk.html`. Nu linker den til
  `https://geo.sg.dk/sermilik/kort/dk.html`. Stadig 2 sider, og den eneste tekstændring er «fx».
- **Udvidelse:** 5b sagde «energi, som modellen mangler», men med 308 W/m² smelter der for
  *meget* → «et energitab, som modellen ikke regner med». 5c: «Himlen sender 276 W/m² tilbage»
  → «ned mod isen». «NDVI er høj» → «NDVI-værdien er høj». Et komma og en bedre ordstilling.
- **Referencekort:** «I/jeres» blandet med «du» → «du» hele vejen. Anførselstegn “” → «».
  «albedo-værdier» → «albedoværdier». Tre kommaer. «mørke overflader smelter is hurtigere» →
  «mørk is smelter hurtigere end lys is».
- **Lærervejledning:** niveaudelingen passede ikke til udvidelsen: B = «udvidelse 1–3» og
  A = «udvidelse 4», men energibalancen er udvidelse 5 → nu B = 1–4, A = 5. To kommaer.
- **Teknik:** videoen med de små mennesker har nu `src=` i selve `<video>`-tagget (samme opførsel;
  sprogvagten stoppede på filnavnet).

## 5. Bevidst ikke rørt

- «Sollys på isen … ca. 266 W/m²» i elevarket er en effektiv værdi, og det afsløres med vilje
  i udvidelse 5.
- Faktor tre-historien står stadig i elevarkets fold, i udvidelse 3's sidste spørgsmål og i
  facit, selv om den er fjernet fra forløbssiden (cefa6cb). Den kan forstås uden forløbssiden.
- «10 × 10 meter» i hovedteksten er en forenkling, og B/A-folden er nu præcis. DK-kortets egen
  tekst «Hvert farvet felt er 10 × 10 meter» ligger uden for denne korrektur.
- `/favicon.ico` giver 404 (på hele geo.sg.dk). Det er harmløst.
