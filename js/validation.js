// VALIDATION-PUNKTER — Sprint 2 stub.
//
// Hvert validation-punkt repræsenterer ét sted hvor der er taget ground-måling
// til sammenligning med satellit-data. Skema (planlagt):
//
//   {
//     id, name, lat, lng,
//     timestamp_ground,
//     photos: [{ blob, exif, albedo_measured }],
//     measurements: {
//       albedo_ground, veg_cover_pct, temp_ground_C, notes
//     },
//     satellite: {
//       albedo_S2_Liang, ndvi_S2, lst_landsat_C,
//       scene_date, cloud_pct, stat_api_response
//     }
//   }
//
// Implementeres i Sprint 2. For nu eksporteres tom no-op init.

export function initValidation() {
  // Tom — udfyldes i Sprint 2.
}
