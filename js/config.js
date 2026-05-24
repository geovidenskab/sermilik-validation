// Centrale konstanter, URL'er og evalscripts.
// Alle moduler importerer fra denne fil — ingen hardcodede strenge andre steder.

export const MAP_CENTER = [65.68, -37.95];
export const MAP_INITIAL_ZOOM = 11;

// ─── Sentinel Hub ──────────────────────────────────────────────────────────────
export const SH_DEFAULT_INSTANCE_ID = 'b05a8d55-6ba8-42c1-a811-dcb5fbadb1ab';
export const SH_LS_KEY = 'sermilik_sh_instance_id';
export const SH_DATE_LS_KEY = 'sermilik_sh_dates';
export const SH_WMS_BASE = 'https://sh.dataspace.copernicus.eu/ogc/wms';

// Sentinel Hub OAuth (Sprint 3+) — kun Client ID embeddes, secret kommer via proxy/manuel
export const SH_OAUTH_CLIENT_ID = 'sh-b878c677-cb71-4a35-8aa3-eab9ee1c50e8';
export const SH_TOKEN_ENDPOINT = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
export const SH_STATISTICAL_API = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

export const SH_DEFAULT_DATES = {
  mode: 'range',
  from: '2024-06-01',
  to: '2024-09-30',
  target: '2024-07-15',
  tolerance: 3,
  maxcc: 30,
};

// ─── ArcticDEM ─────────────────────────────────────────────────────────────────
// VIGTIGT (2026-05-24): Esri har nedlagt 'elevation2.arcgis.com'-subdomænet.
// Det nuværende endpoint hostet via PGC's egen ArcGIS-instans hos AWS:
//   https://di-pgc.img.arcgis.com/arcgis/rest/services/arcticdem_latest/ImageServer
// Alternativ direkte fra PGC (lidt ældre):
//   https://overlord.pgc.umn.edu/arcgis/rest/services/elevation/pgc_arcticdem_mosaics_latest/ImageServer
// Tjek med: curl '<URL>/?f=json' | python3 -m json.tool
export const ARCTICDEM_URL = 'https://di-pgc.img.arcgis.com/arcgis/rest/services/arcticdem_latest/ImageServer';
export const ARCTICDEM_ATTRIB = 'ArcticDEM 2 m © PGC / Maxar (CC BY 4.0)';

// ─── EOX Sentinel-2 cloudless ──────────────────────────────────────────────────
export const eoxAttribution = (year) =>
  `Sentinel-2 cloudless ${year} — <a href="https://s2maps.eu" target="_blank">s2maps.eu</a> by <a href="https://eox.at" target="_blank">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data ${year})`;

// ─── Localstorage-keys ─────────────────────────────────────────────────────────
export const DRAWN_LS_KEY = 'sermilik_drawings';
export const VALIDATION_LS_KEY = 'sermilik_validation_points';  // Sprint 2+

// ─── Evalscripts ───────────────────────────────────────────────────────────────
// Hver evalscript følger Sentinel-2 L2A-konventionen (reflektans 0-1).
// Holdes kompakt for at holde URL-længden under WMS-grænsen (~2 KB).

export const NDSI_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B03","B11","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  var n=(s.B03-s.B11)/(s.B03+s.B11);var c;
  if(n<-0.1)c=[0.45,0.25,0.12];
  else if(n<0.0)c=[0.65,0.4,0.18];
  else if(n<0.2)c=[0.9,0.6,0.25];
  else if(n<0.4)c=[0.95,0.85,0.4];
  else if(n<0.6)c=[0.7,0.9,0.95];
  else if(n<0.8)c=[0.88,0.95,1.0];
  else c=[1,1,1];
  return[c[0],c[1],c[2],s.dataMask];
}`;

// Liang (2001) narrow-to-broadband shortwave albedo for Sentinel-2 L2A
export const ALBEDO_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B02","B04","B08","B11","B12","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  var a=0.356*s.B02+0.130*s.B04+0.373*s.B08+0.085*s.B11+0.072*s.B12-0.0018;
  var c;
  if(a<0.15)c=[0.1,0.02,0.2];
  else if(a<0.25)c=[0.3,0.08,0.35];
  else if(a<0.35)c=[0.55,0.18,0.45];
  else if(a<0.45)c=[0.8,0.35,0.3];
  else if(a<0.55)c=[0.95,0.6,0.3];
  else if(a<0.65)c=[0.95,0.85,0.45];
  else if(a<0.75)c=[0.9,0.95,0.85];
  else if(a<0.85)c=[0.85,0.95,0.98];
  else c=[1,1,1];
  return[c[0],c[1],c[2],s.dataMask];
}`;

// NDWI (McFeeters) til smeltesø-detektion
export const NDWI_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B03","B08","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  var n=(s.B03-s.B08)/(s.B03+s.B08);
  if(n>0.3)return[0.05,0.4,0.85,s.dataMask];
  if(n>0.15)return[0.25,0.6,0.95,s.dataMask*0.9];
  if(n>0.0)return[0.55,0.8,1.0,s.dataMask*0.55];
  return[0,0,0,0];
}`;

// Landsat LST — bred farveramme (−30 → +20 °C)
export const LANDSAT_LST_FULL_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B10","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  if(!s.dataMask)return[0,0,0,0];
  var t=s.B10-273.15;var c;
  if(t<-30)c=[0.05,0.0,0.3];
  else if(t<-20)c=[0.1,0.2,0.6];
  else if(t<-10)c=[0.2,0.4,0.85];
  else if(t<-5)c=[0.4,0.65,0.95];
  else if(t<0)c=[0.7,0.85,1.0];
  else if(t<5)c=[1.0,0.95,0.5];
  else if(t<10)c=[1.0,0.65,0.2];
  else if(t<15)c=[0.95,0.35,0.1];
  else if(t<20)c=[0.85,0.1,0.05];
  else c=[0.5,0.0,0.0];
  return[c[0],c[1],c[2],s.dataMask];
}`;

// Landsat LST — smal sommerfokus (−5 → +16 °C)
export const LANDSAT_LST_SUMMER_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B10","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  if(!s.dataMask)return[0,0,0,0];
  var t=s.B10-273.15;var c;
  if(t<-5)c=[0.2,0.4,0.85];
  else if(t<-2)c=[0.45,0.65,0.95];
  else if(t<0)c=[0.7,0.85,1.0];
  else if(t<2)c=[1.0,0.98,0.7];
  else if(t<5)c=[1.0,0.85,0.4];
  else if(t<8)c=[1.0,0.6,0.2];
  else if(t<12)c=[0.95,0.35,0.1];
  else if(t<16)c=[0.8,0.15,0.05];
  else c=[0.5,0.0,0.0];
  return[c[0],c[1],c[2],s.dataMask];
}`;

// VIGTIGT: Layer-navnet skal matche hvad Sentinel Hub-instance faktisk har konfigureret.
// Tjek med: curl '<WMS_URL>?service=WMS&request=GetCapabilities&version=1.1.1' | grep '<Name>'
// I instance b05a8d55... hedder Landsat-laget 'LANDSAT-TIRS' (ikke 'TIRSL1').
export const LANDSAT_TIRS_LAYER = 'LANDSAT-TIRS';
