// Områdeprofiler — én kodebase, flere kort.
//
// Profilen vælges af indgangssiden via data-profil på <html>:
//     <html lang="da" data-profil="dk">
// Ingen attribut = 'sermilik', så det oprindelige kort er uændret.
//
// En profil samler alt det, der adskiller ét område fra et andet: hvor kortet
// åbner, hvor langt man må bevæge sig, hvilket baggrundskort der er standard,
// om der er faste markører, og hvilken albedo-farveskala der passer til
// overfladerne. Alt andet er fælles kode.

const DK_BOUNDS = [[54.40, 7.70], [57.90, 15.40]];   // hele landet inkl. Bornholm

// Standardperiode for det danske kort: de seneste tre måneder, så der næsten
// altid er noget at se ved første besøg. Scene-kalenderen er stedet, hvor
// eleverne vælger en bestemt dag.
function seneste(dage) {
  const til = new Date();
  const fra = new Date(til.getTime() - dage * 864e5);
  return [fra.toISOString().slice(0, 10), til.toISOString().slice(0, 10)];
}

function dkDatoer() {
  const [fra, til] = seneste(90);
  return { mode: 'range', from: fra, to: til, target: til, tolerance: 5, maxcc: 30 };
}

const PROFILER = {
  sermilik: {
    id: 'sermilik',
    center: [65.68, -37.95],
    zoom: 11,
    minZoom: null,
    maxBounds: null,
    defaultBasemap: 'esri',
    visMarkoerer: true,
    albedoSkala: 'is',
    visSatellitpixels: false,
    datoer: null,           // null = brug SH_DEFAULT_DATES fra config.js
    // Sentinel Hub-instansen er geografisk afgrænset i Copernicus-dashboardet
    // til 39,9°V–34,6°V / 65,1°N–66,7°N. Det er dér, budgetsikringen ligger —
    // ikke i koden. Uden for kassen returnerer WMS'en tomme fliser.
    instansId: 'b05a8d55-6ba8-42c1-a811-dcb5fbadb1ab',
  },

  dk: {
    id: 'dk',
    // Silkeborg Gymnasium som åbningsudsnit — ikke en markør, bare et sted at
    // starte. Eleverne panorerer selv derhen, hvor de har målt.
    center: [56.1825, 9.6008],
    zoom: 15,
    minZoom: 6,
    maxBounds: DK_BOUNDS,
    defaultBasemap: 'ortofoto',
    visMarkoerer: false,
    albedoSkala: 'dk',
    // Hent satellitfliserne i deres EGEN opløsning (~10 m) og lad browseren
    // forstørre dem med skarpe kanter. Ellers opskalerer Sentinel Hub selv og
    // udglatter, så billedet ligner et fotografi — og eleverne kan ikke se, at
    // hver værdi dækker 10×10 meter. Det er hele pointen i den blandede pixel.
    // Bonus: færre og grovere flise-kald, altså også mindre API-forbrug.
    visSatellitpixels: true,
    datoer: dkDatoer(),
    // Egen instans afgrænset til 7,19°Ø–15,45°Ø / 54,48°N–57,87°N — altså
    // Danmark. Samme budgetsikring som den grønlandske: uden for kassen
    // svarer WMS'en med tomme fliser, uanset hvad klienten spørger om.
    instansId: '31ffe6df-4e4b-4193-b4e6-b0fd31313d7d',
  },
};

const valgt = document.documentElement.dataset.profil || 'sermilik';

export const profil = PROFILER[valgt] || PROFILER.sermilik;
export const erDK = profil.id === 'dk';

// De to kort deler origin og dermed browserens lager. Uden et præfiks ville
// elevernes danske målepunkter, tegninger og datovalg dukke op på Grønlands-
// kortet. Sermilik beholder de oprindelige nøgler, så eksisterende data
// overlever; nye profiler får deres eget rum.
export const lagerPraefiks = profil.id === 'sermilik' ? '' : profil.id + '_';
export const lagerNoegle = (basis) => lagerPraefiks + basis;
