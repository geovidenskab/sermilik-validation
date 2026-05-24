#!/usr/bin/env python3
"""
Forfetch daglig SICE Sentinel-3 albedo for kendte AWS-stationer og gem som JSON.

Hvorfor: GEUS THREDDS understøtter ikke CORS, så browseren kan ikke fetche
direkte. Vi pre-downloader for de stationer vi har behov for (TAS-transekten +
PROMICE) og hoster JSON-filer statisk i data/sice/.

For hver station, for hver dag i 2017-04 → i dag (april-oktober kun):
  1) Hent .dds for at se om filen findes
  2) Hent .ascii?albedo_bb_planar_sw[y][x] for nærmeste pixel
  3) Append til {station_key}.json

Output-format: [{ "date": "YYYY-MM-DD", "albedo_bb": 0.842 }, ...]

Kør:
  python3 fetch-sice-stations.py             # alle stationer, alle datoer
  python3 fetch-sice-stations.py --station tas_l --year 2023
  python3 fetch-sice-stations.py --update    # kun nye datoer siden sidst
"""
import argparse
import json
import math
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import date, timedelta
from pathlib import Path

THREDDS_BASE = 'https://thredds.geus.dk/thredds/dodsC/SICE_500m/Greenland'
OUT_DIR = Path(__file__).parent.parent / 'data' / 'sice'

# Station coords — match med js/markers.js
STATIONS = {
    'tas_l':       (65.6402, -38.8987,  250, 'TAS_L Tasiilaq Lower'),
    'tas_u':       (65.6978, -38.8668,  570, 'TAS_U Tasiilaq Upper'),
    'tas_a':       (65.7790, -38.8995,  890, 'TAS_A Tasiilaq Accumulation'),
    'mit':         (65.69,   -37.83,    440, 'MIT Mittivakkat (på gletsjer)'),
    'mit_b':       (65.674,  -37.838,   None, 'MIT_B Mittivakkat bedrock'),
    'ser_b':       (65.66,   -38.155,   None, 'SER_B Sermilik bedrock'),
    'sermilik':    (65.680864, -37.916071, None, 'Sermilik Forskningsstation'),
    'mittivakkat': (65.69,   -37.85,    None, 'Mittivakkat Gletsjer (ablation)'),
}

# EPSG:3413 projektion (NSIDC polar stereographic North, true scale 70°N, central -45°E)
POLE_LAT = 70.0
CENTRAL_LON = -45.0
EARTH_R = 6378137.0


def lat_lon_to_epsg3413(lat, lon):
    """Snyder (1987) polar stereographic, sphæroidisk approx."""
    phi = math.radians(lat)
    lam = math.radians(lon)
    phi0 = math.radians(POLE_LAT)
    lam0 = math.radians(CENTRAL_LON)
    k = (1 + math.sin(phi0)) / (1 + math.sin(phi))
    r = 2 * EARTH_R * math.tan(math.pi / 4 - phi / 2) * k
    x = r * math.sin(lam - lam0)
    y = -r * math.cos(lam - lam0)
    return x, y


def http_get(url, timeout=30):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception as e:
        print(f'  ! fetch error {url}: {e}', file=sys.stderr)
        return None


def extract_numbers(text):
    """Træk decimaltal ud fra DATA-delen af OPeNDAP-svaret (efter '----'-separator)."""
    # OPeNDAP-ascii format:
    #   Dataset { Float64 x[x = 4]; } ...;
    #   ----------- separator ------------
    #   x[4]
    #   -638059.625, -637559.625, ...
    parts = text.split('---', 1)
    data_part = parts[1] if len(parts) > 1 else text
    # Drop første linje (variabel-header "x[4]")
    lines = data_part.strip().split('\n')
    data_lines = '\n'.join(line for line in lines if not re.match(r'^[a-zA-Z_]', line.strip()))
    return [float(m) for m in re.findall(r'[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?', data_lines)]


def load_grid_indices(date_iso, station_lat, station_lon, cache={}):
    """Find (i, j) grid-index for et lat/lon. Cache grid-array på tværs af kald."""
    if 'x' not in cache:
        url = f'{THREDDS_BASE}/SICEv3.0_Greenland_500m_{date_iso}.nc.ascii?x'
        txt = http_get(url)
        if not txt:
            return None
        nums = extract_numbers(txt)
        # OPeNDAP putter typisk dimensions-info først (heltal), så vi skipper
        # tal < 100 hvis efterfølgende værdier er meget større
        cache['x'] = nums

        url_y = f'{THREDDS_BASE}/SICEv3.0_Greenland_500m_{date_iso}.nc.ascii?y'
        txt_y = http_get(url_y)
        if not txt_y:
            return None
        cache['y'] = extract_numbers(txt_y)

    x_proj, y_proj = lat_lon_to_epsg3413(station_lat, station_lon)
    xs = cache['x']
    ys = cache['y']
    xi = min(range(len(xs)), key=lambda i: abs(xs[i] - x_proj))
    yi = min(range(len(ys)), key=lambda i: abs(ys[i] - y_proj))
    return xi, yi


def fetch_albedo_for_date(date_iso, station_lat, station_lon, grid_cache):
    """Returner albedo (float) eller None."""
    base_url = f'{THREDDS_BASE}/SICEv3.0_Greenland_500m_{date_iso}.nc'

    # Tjek at filen eksisterer via .dds
    dds = http_get(f'{base_url}.dds')
    if dds is None:
        return None  # ingen scene den dag

    # Find grid-index (lazy, cached på første succes)
    idx = load_grid_indices(date_iso, station_lat, station_lon, grid_cache)
    if idx is None:
        return None
    xi, yi = idx

    # Vi henter en lille bbox (HALF_BOX×2+1 pixels) omkring punktet og tager
    # middelværdien af valide pixels. SICE har mange NaN-huller i kystnære
    # områder fordi algoritmen er designet til snedækkede flader. En 5×5 bbox
    # (2.5 km) giver typisk få valide pixels selv hvor centerpixel er NaN.
    HALF_BOX = 4  # giver 9×9 pixels = ~4.5×4.5 km
    y0, y1 = max(0, yi - HALF_BOX), yi + HALF_BOX
    x0, x1 = max(0, xi - HALF_BOX), xi + HALF_BOX

    # Prøv kandidat-variabler. BBA_combination først fordi den er den udfyldte
    # daglige composite (mindre NaN-huller).
    for var in ('BBA_combination', 'albedo_bb_planar_sw', 'albedo_bb_spherical_sw'):
        url = f'{base_url}.ascii?{var}[{y0}:{y1}][{x0}:{x1}]'
        txt = http_get(url)
        if txt is None:
            continue
        # Træk alle pixel-værdier ud — data-delen starter efter ---separator---
        parts = txt.split('---', 1)
        data_part = parts[1] if len(parts) > 1 else txt
        # Linjer der starter med "[N]," indeholder pixel-data
        values = []
        for line in data_part.split('\n'):
            line = line.strip()
            if not line.startswith('['):
                continue
            # Format: "[i], v0, v1, v2, ..."
            # Eller: "[i] v0" for 1D
            comma_split = line.split(',')
            for token in comma_split[1:]:  # skip "[i]"
                token = token.strip()
                if token in ('NaN', 'nan', '', '-999', '-999.0'):
                    continue
                try:
                    v = float(token)
                    if 0 <= v <= 1.1:
                        values.append(v)
                except ValueError:
                    continue
        if not values:
            continue
        mean = sum(values) / len(values)
        return {
            'albedo_bb': round(mean, 3),
            'variable': var,
            'n_valid_px': len(values),
            'n_total_px': (y1 - y0 + 1) * (x1 - x0 + 1),
        }
    return None


def enumerate_dates(start_iso, end_iso, months=None):
    """Returner liste af YYYY-MM-DD; filtrér valgfrit på måneder."""
    s = date.fromisoformat(start_iso)
    e = date.fromisoformat(end_iso)
    out = []
    d = s
    while d <= e:
        if months is None or d.month in months:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--station', help='kun denne station (key)')
    ap.add_argument('--year', type=int, help='kun dette år')
    ap.add_argument('--start', default='2017-04-01')
    ap.add_argument('--end', default=date.today().isoformat())
    ap.add_argument('--update', action='store_true',
                    help='kun datoer der ikke allerede er i JSON-filen')
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.year:
        args.start = f'{args.year}-04-01'
        args.end = f'{args.year}-10-31'

    stations = {k: v for k, v in STATIONS.items() if not args.station or k == args.station}
    dates = enumerate_dates(args.start, args.end, months={4, 5, 6, 7, 8, 9, 10})

    print(f'Henter SICE for {len(stations)} stationer × {len(dates)} dage')

    for key, (lat, lon, elev, name) in stations.items():
        out_path = OUT_DIR / f'{key}.json'
        existing = {}
        if args.update and out_path.exists():
            existing = {d['date']: d for d in json.loads(out_path.read_text())}

        grid_cache = {}
        results = list(existing.values())
        new_count = 0
        for i, d in enumerate(dates):
            if d in existing:
                continue
            result = fetch_albedo_for_date(d, lat, lon, grid_cache)
            if result is not None:
                results.append({
                    'date': d,
                    'albedo_bb': result['albedo_bb'],
                    'n_valid_px': result['n_valid_px'],
                    'n_total_px': result['n_total_px'],
                })
                new_count += 1
            if (i + 1) % 50 == 0:
                print(f'  {key}: {i+1}/{len(dates)} ({new_count} nye fundet)')

        results.sort(key=lambda r: r['date'])
        out_path.write_text(json.dumps({
            '_station': name,
            '_lat': lat,
            '_lon': lon,
            '_elevation_m': elev,
            '_source': 'GEUS SICE Sentinel-3 v3.0 Greenland 500m',
            '_variable': 'albedo_bb_planar_sw',
            '_doi': 'https://doi.org/10.22008/FK2/OBUF5E',
            '_license': 'CC-BY-4.0',
            'data': results,
        }, indent=2))
        print(f'  ✓ {key}: {len(results)} dage gemt → {out_path.name}')


if __name__ == '__main__':
    main()
