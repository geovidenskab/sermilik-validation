import csv, pathlib
import numpy as np

rows = list(csv.reader(open(str(pathlib.Path(__file__).resolve().parent.parent / 'solspektrum.csv'))))
d = np.array([[float(x) for x in r] for r in rows[1:]])
wl, sol, sky = d[:, 0], d[:, 1], d[:, 3]
I = lambda w: sol[int(w - 380)]

def local_cont(w0, half=4, gap=2):
    """Ret linje gennem de lokale maksima paa hver side af w0."""
    n, i0 = len(wl), int(w0 - 380)
    la, lb = max(0, i0 - half - gap), max(1, i0 - gap + 1)
    ra, rb = min(n - 1, i0 + gap), min(n, i0 + gap + half + 1)
    lw, lv = wl[la:lb], sol[la:lb]
    rw, rv = wl[ra:rb], sol[ra:rb]
    a = (lw[lv.argmax()], lv.max())
    b = (rw[rv.argmax()], rv.max())
    slope = (b[1] - a[1]) / (b[0] - a[0])
    return lambda w: a[1] + slope * (w - a[0])

CAND = [
    (383.0, "Fe I 382.0 + Mg I 383.2/383.8 (blend)", "sol"),
    (388.5, "CN-båndhoved 388.3 + H-zeta 388.9", "sol"),
    (393.4, "Ca II K", "sol"),
    (396.8, "Ca II H", "sol"),
    (410.2, "H-delta", "sol"),
    (422.7, "Ca I", "sol"),
    (430.5, "G-bånd (CH) + Fe I 430.8", "sol"),
    (434.0, "H-gamma", "sol"),
    (438.4, "Fe I", "sol"),
    (486.1, "H-beta", "sol"),
    (517.5, "Mg I b-triplet 516.7/517.3/518.4", "sol"),
    (527.0, "Fe I", "sol"),
    (589.3, "Na I D1+D2  589.0/589.6", "sol"),
    (656.3, "H-alfa", "sol"),
    (686.7, "O2 B-bånd", "atm"),
    (719.0, "H2O", "atm"),
    (760.5, "O2 A-bånd", "atm"),
    (822.0, "H2O", "atm"),
    (936.0, "H2O (940-bånd)", "atm"),
]

print(f"{'lambda':>8} {'I(line)':>9} {'I(kont)':>9} {'dybde':>7} {'FWHM-pkt':>9}  identifikation")
print("-" * 88)
res = []
for w0, name, kind in CAND:
    # find dybeste punkt inden for +-2 nm
    i0 = int(w0 - 380)
    j = i0 - 2 + int(np.argmin(sol[i0 - 2:i0 + 3]))
    half = 10 if kind == "atm" else 4
    gap = 6 if kind == "atm" else 2
    cf = local_cont(wl[j], half=half, gap=gap)
    c = cf(wl[j])
    dep = 1 - sol[j] / c
    # bredde: antal punkter under halv dybde
    npts = sum(1 for k in range(max(0, j - 15), min(len(wl), j + 16))
               if (1 - sol[k] / cf(wl[k])) > dep / 2)
    res.append((wl[j], sol[j], c, dep, npts, name, kind))
    print(f"{wl[j]:8.0f} {sol[j]:9.4f} {c:9.4f} {dep*100:6.1f}% {npts:9d}  {name}")

print("\n=== ækvivalentbredder, lokalt kontinuum ===")
for lo, hi, nm, h, g in [(388, 400, "Ca II H+K", 6, 6), (427, 434, "G-baand", 5, 4),
                         (483, 489, "H-beta", 5, 4), (514, 521, "Mg b", 5, 4),
                         (586, 592, "Na D", 5, 3), (653, 660, "H-alfa", 5, 3),
                         (682, 695, "O2 B", 12, 8), (710, 740, "H2O 720", 14, 12),
                         (752, 775, "O2 A", 14, 14), (805, 840, "H2O 820", 16, 14),
                         (920, 950, "H2O 940", 16, 14)]:
    mid = (lo + hi) / 2
    cf = local_cont(mid, half=h, gap=g)
    m = (wl >= lo) & (wl <= hi)
    ew = np.trapezoid(np.clip(1 - sol[m] / cf(wl[m]), 0, 1), wl[m])
    print(f"  {nm:12s} {lo}-{hi} nm   EW = {ew:6.2f} nm")

# --- Rayleigh: himmel/sol ---
print("\n=== Rayleigh-eksponent fra Blå himmel / Sol ===")
r = sky / sol
m = (wl >= 420) & (wl <= 680)
# udelad telluriske/Fraunhofer-omraader ikke noedvendigt: forholdet ophaever dem
p = np.polyfit(np.log(wl[m]), np.log(r[m]), 1)
print(f"  fit 420-680 nm:  ratio ∝ lambda^{p[0]:.2f}   (ren Rayleigh = -4)")
for lo, hi in [(400, 550), (450, 650), (500, 700)]:
    m2 = (wl >= lo) & (wl <= hi)
    pp = np.polyfit(np.log(wl[m2]), np.log(r[m2]), 1)
    print(f"  fit {lo}-{hi} nm:  lambda^{pp[0]:.2f}")

# --- geometri Sisimiut ---
print("\n=== solhøjde Sisimiut (66.94N, 53.67W) ===")
lat = np.radians(66.939)
for mm, dd, decl in [(8, 5, 16.9), (7, 15, 21.5), (6, 21, 23.44), (9, 1, 8.2)]:
    dec = np.radians(decl)
    alt = np.degrees(np.arcsin(np.sin(lat) * np.sin(dec) + np.cos(lat) * np.cos(dec)))
    am = 1 / np.sin(np.radians(alt))
    print(f"  {dd:02d}/{mm:02d} lokal middag: h = {alt:.1f}°, luftmasse m = {am:.2f}")
for h in [10, 15, 20, 25, 30, 35, 40]:
    print(f"    h={h}° -> m={1/np.sin(np.radians(h)):.2f}")
