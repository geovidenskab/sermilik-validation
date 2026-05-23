// GEUS Greenmin WMS-lag: bjerggrund, litologi, mineraler, skråfoto-dækning.
// Verificerede layer-navne fra greenmin_caps_3857.xml.

import { GEUS_WMS } from './config.js';

export const geusBedrock500k = L.tileLayer.wms(GEUS_WMS, {
  layers: 'grl_geus_m4eu_500k_geology_map',
  format: 'image/png',
  transparent: true,
  opacity: 0.65,
  version: '1.1.1',
  attribution: 'Bjerggrund 1:500.000 — GEUS / M4EU',
});

export const geusLithologies = L.tileLayer.wms(GEUS_WMS, {
  layers: 'lithologies',
  format: 'image/png',
  transparent: true,
  opacity: 0.6,
  version: '1.1.1',
  attribution: 'Litologi — GEUS Greenland Portal',
});

export const geusMinerals = L.tileLayer.wms(GEUS_WMS, {
  layers: 'mineral_occurrences_newsy',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  attribution: 'Mineralforekomster — GEUS',
});

export const geusOblique = L.tileLayer.wms(GEUS_WMS, {
  layers: 'gg_oblique_scenes',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  attribution: 'Skråfoto-dækning — GEUS',
});
