#!/usr/bin/env python3
"""
Konverter Van Tiggelen et al. 2024 PANGAEA .tab-filer til daglig JSON.

Output-formatet matcher PROMICE _daily.json så viewer'en kan merge dem.
Vi gemmer kun de variabler vi vil eksponere i UI'en:
  - SW↓/SW↑/LW↓/LW↑ TILT-KORRIGEREDE (flat-surface)
  - Qh (sensible heat flux, positiv ned = energi til overflade)
  - Qe (latent heat flux, positiv ned)
  - G (subsurface conductive flux, positiv op = energi VÆK fra overflade)
  - melt_E (modelleret smelteenergi, W/m²)
  - t_air (2 m, tilt/height-corrected)
  - q_spec (specifik fugt, g/kg)
  - wspd (vind 10 m, korrigeret)
  - t_surf_obs (fra LWU)
  - dz_boom (daglig højdeændring fra sonic ranger)
  - dz_stakes (daglig højdeændring fra separat stake)
  - subl_day (sublimation, m højdeækvivalent)

Brug:
    python3 scripts/vantiggelen-to-daily-json.py
"""

import json
from datetime import datetime
from pathlib import Path

# Sermilik-relevante stationer (TAS-transekten)
STATIONS = ['TAS_L', 'TAS_U', 'TAS_A']

# Column-indices i .tab efter at have inspiceret headerstrukturen
# (matcher Van Tiggelen 2024 PANGAEA schema — alle .tab-filer har samme rækkefølge)
COL = {
    'date':       2,
    't_air':      4,    # corrected at 2m height
    'q_spec':     6,    # corrected at 2m height
    'rh':         8,    # corrected at 2m height
    'wspd':      10,    # corrected at 10m height
    'p_atm':     11,
    'SWD':       12,    # tilt-korrigeret pyranometer
    'SWU':       13,
    'LWD':       14,
    'LWU':       15,
    'Qh':        16,    # sensible heat flux, positiv ned (SHFdown)
    'Qe':        17,    # latent heat flux, positiv ned (LHFdown)
    'G':         18,    # subsurface conductive flux, positiv op (GHFup)
    't_surf':    20,    # fra LWU
    'melt_E':    31,    # melt_day_SEB — modelleret smelteenergi via fuld SEB
    'dz_boom':   35,
    'dz_stakes': 36,
    'subl_day':  33,    # daglig sublimation (m)
    't_surf_max':34,    # max daglig overflade-temp (vigtigt for at vide om der OVERHOVEDET kan smelte)
}


def fnum(s):
    s = s.strip()
    if s == '' or s.lower() == 'nan':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_tab(path):
    """Læs PANGAEA .tab-fil og returner liste af daily records."""
    with open(path) as f:
        lines = f.readlines()

    # Find data-start (linjen efter '*/')
    for i, l in enumerate(lines):
        if l.strip() == '*/':
            data_start = i + 2  # spring header-rækken over
            break
    else:
        raise ValueError(f"Ingen '*/' marker fundet i {path}")

    records = []
    for line in lines[data_start:]:
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 40:
            continue
        try:
            d = datetime.fromisoformat(parts[COL['date']]).strftime('%Y-%m-%d')
        except (ValueError, IndexError):
            continue
        rec = {'date': d}
        for key, idx in COL.items():
            if key == 'date':
                continue
            v = fnum(parts[idx])
            if v is not None:
                rec[key] = round(v, 3) if abs(v) < 1000 else round(v, 1)
        records.append(rec)
    return records


def main():
    repo = Path(__file__).resolve().parent.parent
    src_dir = repo / 'data' / 'pangaea'
    out_dir = repo / 'data' / 'promice'  # samme mappe så viewer kan loade både

    for st in STATIONS:
        src = src_dir / f'GRL_{st}_AWS.tab'
        out = out_dir / f'{st}_vt2024.json'
        if not src.exists():
            print(f'⚠ Mangler {src}')
            continue
        records = parse_tab(src)
        if not records:
            print(f'⚠ Ingen data i {src}')
            continue
        obj = {
            '_station': st,
            '_source': 'Van Tiggelen et al. 2024 — PANGAEA SEB dataset',
            '_doi': 'https://doi.org/10.1594/PANGAEA.970127',
            '_note': 'Tilt-korrigeret stråling (flad overflade) + modellerede turbulente flukse Qh, Qe, G og smelteenergi melt_E. Anbefalet kilde til energibudget-analyse.',
            '_first_date': records[0]['date'],
            '_last_date':  records[-1]['date'],
            '_columns': sorted({k for r in records for k in r if k != 'date'}),
            'data': records,
        }
        out.write_text(json.dumps(obj, separators=(',', ':')))
        print(f'✓ {st}: {len(records)} dage → {out.name} ({out.stat().st_size//1024} KB)')


if __name__ == '__main__':
    main()
