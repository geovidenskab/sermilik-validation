#!/usr/bin/env python3
"""
Konvertér PROMICE hourly CSV til kompakt daglig JSON med kerne-variabler.

Input:  data/promice/{STATION}_hour.csv  (4-50 MB hver)
Output: data/promice/{STATION}_daily.json (~50-300 KB hver — gz-komprimerbar)

Variabler beholdt:
  date, t_u (air temp), dsr (incoming SW), usr (outgoing SW),
  albedo, dlr (incoming LW), ulr (outgoing LW), t_surf,
  precip (snow), wspd_u, z_stake

Beregnede:
  albedo_calc = usr/dsr (når dsr > 50 W/m²)
  net_radiation = (dsr - usr) + (dlr - ulr)

Aggregering: daglig middelværdi, med count af valide samples per dag.
"""
import csv, json, os, sys, gzip
from collections import defaultdict
from pathlib import Path

KEEP_COLS = ['t_u', 'dsr', 'usr', 'albedo', 'dlr', 'ulr', 't_surf', 'wspd_u', 'z_stake']

def parse_float(s):
    if s is None or s == '' or s == 'NA':
        return None
    try:
        v = float(s)
        return v if -1e10 < v < 1e10 else None
    except ValueError:
        return None

def aggregate_csv(path):
    daily = defaultdict(lambda: defaultdict(list))
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            t = row.get('time', '')
            if len(t) < 10:
                continue
            date = t[:10]  # YYYY-MM-DD
            for col in KEEP_COLS:
                v = parse_float(row.get(col))
                if v is not None:
                    daily[date][col].append(v)
    out = []
    for date in sorted(daily.keys()):
        rec = {'date': date}
        for col in KEEP_COLS:
            vals = daily[date][col]
            if vals:
                rec[col] = round(sum(vals) / len(vals), 3)
                rec[f'{col}_n'] = len(vals)
        # Beregnede afledte
        dsr_vals = daily[date]['dsr']
        usr_vals = daily[date]['usr']
        if dsr_vals and usr_vals and len(dsr_vals) == len(usr_vals):
            albedo_estimates = []
            for d, u in zip(dsr_vals, usr_vals):
                if d > 50 and u >= 0 and u/d <= 1.1:
                    albedo_estimates.append(u/d)
            if albedo_estimates:
                rec['albedo_calc'] = round(sum(albedo_estimates) / len(albedo_estimates), 3)
        out.append(rec)
    return out

def main():
    src_dir = Path(__file__).parent.parent / 'data' / 'promice'
    if not src_dir.exists():
        sys.exit(f'No source dir: {src_dir}')

    for csv_file in sorted(src_dir.glob('*_hour.csv')):
        station = csv_file.stem.replace('_hour', '')
        print(f'Processing {station}...')
        records = aggregate_csv(csv_file)
        if not records:
            print(f'  ⚠ no records')
            continue

        out_path = src_dir / f'{station}_daily.json'
        meta = {
            '_station': station,
            '_source': 'PROMICE via GEUS THREDDS (level 2, hourly aggregated to daily)',
            '_url': f'https://thredds.geus.dk/thredds/fileServer/aws/l2stations/csv/hour/{station}_hour.csv',
            '_columns': {
                'date': 'YYYY-MM-DD',
                't_u': 'air temperature °C (unfilled)',
                'dsr': 'downwelling shortwave W/m²',
                'usr': 'upwelling shortwave W/m²',
                'albedo': 'broadband albedo from instrument',
                'albedo_calc': 'recomputed albedo = usr/dsr (dsr > 50 W/m²)',
                'dlr': 'downwelling longwave W/m²',
                'ulr': 'upwelling longwave W/m²',
                't_surf': 'surface temperature °C (from LWU)',
                'wspd_u': 'wind speed m/s',
                'z_stake': 'snow/ice stake height (m)',
                '*_n': 'number of valid hourly samples that day',
            },
            '_first_date': records[0]['date'],
            '_last_date': records[-1]['date'],
            '_n_days': len(records),
            'data': records,
        }
        out_path.write_text(json.dumps(meta))
        size_kb = out_path.stat().st_size / 1024
        print(f'  ✓ {len(records)} days → {out_path.name} ({size_kb:.0f} KB)')

if __name__ == '__main__':
    main()
