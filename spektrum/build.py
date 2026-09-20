#!/usr/bin/env python3
"""
Bygger spektrum/index.html ud fra template.html + alle måleserier.

    python3 spektrum/build.py

Data hentes fra CSV-eksporten af den første serie og direkte ud af Logger Pro's
.cmbl-filer for de senere serier. Alt indlejres i HTML'en, så den færdige side
er én selvstændig fil uden eksterne afhængigheder.
"""
import csv, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TPL = HERE / "template.html"
OUT = HERE / "index.html"

GRID = list(range(380, 951))          # fælles bølgelængdeakse for alle serier

# ---- serie 1: den oprindelige CSV-eksport (32 ms, 10 midlinger) ----
S1_CSV = ROOT / "solspektrum.csv"
S1_COLS = {"sol": 1, "himmel": 3, "plante": 5, "plante2": 7, "klippe": 9}

# ---- senere serier: læses ud af .cmbl ----
CMBL = {
    "moerke32":  ("mørkemaalinger.cmbl", ["Run 1", "Run 2", "Run 3", "Run 4"]),
    "sol3":      ("Untitled.cmbl", ["Sol direkte"]),
    "himmel3":   ("Untitled.cmbl", ["Blaa himmel"]),
    "planke3":   ("Untitled.cmbl", ["Traeplanke"]),
    "sloer30":   ("ny_maaling_bred_blaa_himmel_med_sloer.cmbl", ["Latest"]),
    "jord100":   ("rødlig jord.cmbl", ["bar jord (rødig jord)"]),
    "moerke100": ("rødlig jord.cmbl", ["mørkemåling"]),
    # Gletsjerserien, 7. aug kl. 19:28-19:58 UTC. Datasættene er navngivet
    # generisk i filen; tilordningen herunder er bekræftet af Philip og af
    # blå/rød-forholdet (indstrålingen er klart blåest).
    "ink":         ("solspektrum-gletsjer2.cmbl", ["Run 1"]),
    "sne_ren":     ("solspektrum-gletsjer2.cmbl", ["Run 2"]),
    "sne_beskidt": ("solspektrum-gletsjer2.cmbl", ["Run 1 2"]),
    "sne_jord":    ("solspektrum-gletsjer2.cmbl", ["Run 3"]),
}


def cmbl_datasets(path: Path) -> dict:
    """Træk {navn: (bølgelængder, intensiteter)} ud af en Logger Pro-fil."""
    s = path.read_text(encoding="utf-8", errors="replace")
    out = {}
    for m in re.finditer(r"<DataSetName>([^<]*)</DataSetName>", s):
        name, seg = m.group(1), s[m.end():]
        nxt = seg.find("<DataSetName>")
        if nxt > 0:
            seg = seg[:nxt]
        cells = re.findall(r"<ColumnCells>(.*?)</ColumnCells>", seg, re.S)
        if len(cells) >= 2:
            try:                       # nogle datasæt har tomme tekst-kolonner
                wl = [float(x) for x in cells[0].split()]
                iv = [float(x) for x in cells[1].split()]
            except ValueError:
                continue
            if len(wl) == len(iv) > 100:
                out[name] = (wl, iv)
    return out


def regrid(wl, y):
    """Lineær interpolation til den fælles 380-950 nm-akse."""
    out, j = [], 1
    for t in GRID:
        while j < len(wl) - 1 and wl[j] < t:
            j += 1
        f = (t - wl[j - 1]) / (wl[j] - wl[j - 1])
        out.append(y[j - 1] + f * (y[j] - y[j - 1]))
    return out


def main() -> int:
    if not S1_CSV.exists():
        print(f"fejl: finder ikke {S1_CSV}", file=sys.stderr)
        return 1

    data = {"wl": GRID}

    rows = list(csv.reader(S1_CSV.open(encoding="utf-8")))
    body = [[float(x) for x in r] for r in rows[1:]]
    if [int(r[0]) for r in body] != GRID:
        print("fejl: serie 1 har afvigende bølgelængdeakse", file=sys.stderr)
        return 1
    for name, i in S1_COLS.items():
        data[name] = [round(r[i], 7) for r in body]

    cache = {}
    for key, (fname, runs) in CMBL.items():
        p = HERE / fname
        if not p.exists():
            print(f"advarsel: springer '{key}' over — {fname} mangler", file=sys.stderr)
            continue
        if fname not in cache:
            cache[fname] = cmbl_datasets(p)
        sets = cache[fname]
        missing = [r for r in runs if r not in sets]
        if missing:
            print(f"advarsel: '{key}' mangler {missing} i {fname}", file=sys.stderr)
            continue
        cols = [regrid(*sets[r]) for r in runs]
        avg = [sum(c) / len(c) for c in zip(*cols)]     # midl. hvis flere runs
        data[key] = [round(v, 9) for v in avg]

    payload = json.dumps(data, separators=(",", ":"))
    html = TPL.read_text(encoding="utf-8")
    if "__DATA__" not in html:
        print("fejl: template mangler pladsholderen __DATA__", file=sys.stderr)
        return 1

    OUT.write_text(html.replace("__DATA__", payload), encoding="utf-8")
    series = [k for k in data if k != "wl"]
    print(f"skrev {OUT.relative_to(ROOT)}  ({OUT.stat().st_size/1024:.0f} kB, "
          f"{len(GRID)} punkter x {len(series)} spektre)")
    print("  serier:", ", ".join(series))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
