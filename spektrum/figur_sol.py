import csv, pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

rows = list(csv.reader(open(str(pathlib.Path(__file__).resolve().parent.parent / 'solspektrum.csv'))))
d = np.array([[float(x) for x in r] for r in rows[1:]])
wl, sol = d[:, 0], d[:, 1]
IDX = lambda w: int(w - 380)

def wl2rgb(w):
    if w < 380 or w > 750: return (0.42, 0.42, 0.46)
    if w < 440:   r, g, b = -(w - 440) / 60, 0.0, 1.0
    elif w < 490: r, g, b = 0.0, (w - 440) / 50, 1.0
    elif w < 510: r, g, b = 0.0, 1.0, -(w - 510) / 20
    elif w < 580: r, g, b = (w - 510) / 70, 1.0, 0.0
    elif w < 645: r, g, b = 1.0, -(w - 645) / 65, 0.0
    else:         r, g, b = 1.0, 0.0, 0.0
    if w < 420:   f = 0.35 + 0.65 * (w - 380) / 40
    elif w > 700: f = 0.35 + 0.65 * (750 - w) / 50
    else:         f = 1.0
    return tuple(np.clip(np.array([r, g, b]) * f, 0, 1) ** 0.85)

BLUE, RED = "#10243f", "#8c1c1c"
# (lambda, label, label-y i panel A, farve)
MARKS = [(393, "Ca II K", 0.30, BLUE), (397, "Ca II H", 0.42, BLUE),
         (410, "Hδ", 0.24, BLUE), (430, "G-bånd (CH)", 0.36, BLUE),
         (438, "Fe I", 0.48, BLUE), (486, "Hβ", 0.60, BLUE),
         (517, "Mg b", 0.90, BLUE), (527, "Fe I", 0.97, BLUE),
         (589, "Na D", 0.68, BLUE), (656, "Hα", 0.50, BLUE),
         (687, "O₂ B", 0.36, RED), (720, "H₂O", 0.26, RED),
         (761, "O₂ A", 0.17, RED), (823, "H₂O", 0.13, RED), (936, "H₂O", 0.09, RED)]

fig = plt.figure(figsize=(15, 12))
gs = fig.add_gridspec(3, 2, height_ratios=[1.5, 1, 1], hspace=0.44, wspace=0.17,
                      left=0.062, right=0.985, top=0.915, bottom=0.055)

# ================= PANEL A =================
axA = fig.add_subplot(gs[0, :])
for i in range(len(wl) - 1):
    axA.fill_between(wl[i:i + 2], 0, sol[i:i + 2], color=wl2rgb(wl[i]), lw=0, alpha=0.72)
axA.plot(wl, sol, color="0.15", lw=0.9)
for w, lab, ly, col in MARKS:
    y = sol[IDX(w)]
    axA.annotate(lab, (w, y + 0.012), xytext=(w, ly), ha="center", va="bottom", fontsize=9,
                 color=col, fontweight="bold",
                 arrowprops=dict(arrowstyle="-", lw=0.8, color=col, alpha=0.6,
                                 shrinkA=2, shrinkB=1))
axA.set_xlim(380, 950); axA.set_ylim(0, 1.12)
axA.set_ylabel("Relativ intensitet (rå detektorsignal)")
axA.set_title("Direkte sollys, Sisimiut — Red Tide-spektrometer  ·  380–950 nm, 1 nm sampling",
              fontsize=13.5, fontweight="bold", pad=32, loc="left")
axA.text(0, 1.045, "Blå = Fraunhofer-linjer (absorption i Solens egen atmosfære)      "
         "Rød = telluriske bånd (absorption i Jordens atmosfære)",
         transform=axA.transAxes, fontsize=10, color="0.32")
axA.axvspan(750, 950, color="0.5", alpha=0.06)
axA.text(870, 0.72, "nær-infrarødt (usynligt)", ha="center", fontsize=9, color="0.5")
axA.grid(alpha=0.15, lw=0.6); axA.set_axisbelow(True)
for s in ("top", "right"): axA.spines[s].set_visible(False)

# ================= PANEL B =================
axB = fig.add_subplot(gs[1, 0])
m = np.where((wl >= 380) & (wl <= 560))[0]
for i in m[:-1]:
    axB.fill_between(wl[i:i + 2], 0, sol[i:i + 2], color=wl2rgb(wl[i]), lw=0, alpha=0.45)
axB.plot(wl[m], sol[m], color="0.1", lw=1.3, marker="o", ms=2.3, mfc="white", mew=0.5)
for w, lab, ly in [(393, "Ca II K", 0.26), (397, "Ca II H", 0.40), (410, "Hδ", 0.20),
                   (430, "G-bånd", 0.34), (438, "Fe I", 0.48), (486, "Hβ", 0.30),
                   (517, "Mg b", 0.44), (527, "Fe I", 0.58)]:
    y = sol[IDX(w)]
    va, dy = ("bottom", 0.012) if ly > y else ("top", -0.012)
    axB.annotate(lab, (w, y + dy), xytext=(w, ly), ha="center", va=va, fontsize=8.5,
                 color=BLUE, fontweight="bold",
                 arrowprops=dict(arrowstyle="-", lw=0.8, color=BLUE, alpha=0.6, shrinkB=1))
axB.set_xlim(380, 560); axB.set_ylim(0, 0.95)
axB.set_title("Fraunhofer-linjer — Solens fingeraftryk", fontsize=11.5, fontweight="bold", loc="left")
axB.set_ylabel("Relativ intensitet"); axB.set_xlabel("Bølgelængde (nm)")
axB.grid(alpha=0.15, lw=0.6); axB.set_axisbelow(True)
for s in ("top", "right"): axB.spines[s].set_visible(False)

# ================= PANEL C =================
axC = fig.add_subplot(gs[1, 1])
m = np.where((wl >= 640) & (wl <= 800))[0]
for i in m[:-1]:
    axC.fill_between(wl[i:i + 2], 0, sol[i:i + 2], color=wl2rgb(wl[i]), lw=0, alpha=0.45)
axC.plot(wl[m], sol[m], color="0.1", lw=1.3, marker="o", ms=2.3, mfc="white", mew=0.5)
for w, lab, ly, col in [(656, "Hα\n(Solen)", 0.44, BLUE), (687, "O₂ B", 0.35, RED),
                        (720, "H₂O", 0.27, RED), (761, "O₂ A", 0.19, RED)]:
    y = sol[IDX(w)]
    axC.annotate(lab, (w, y + 0.008), xytext=(w, ly), ha="center", va="bottom", fontsize=9,
                 color=col, fontweight="bold", linespacing=0.95,
                 arrowprops=dict(arrowstyle="-", lw=0.8, color=col, alpha=0.6, shrinkB=1))
axC.set_xlim(640, 800); axC.set_ylim(0, 0.56)
axC.set_title("Jordens atmosfære skriver med: O₂ og H₂O", fontsize=11.5,
              fontweight="bold", loc="left")
axC.set_xlabel("Bølgelængde (nm)")
axC.grid(alpha=0.15, lw=0.6); axC.set_axisbelow(True)
for s in ("top", "right"): axC.spines[s].set_visible(False)

# ================= PANEL D: log-skala vs Planck =================
axD = fig.add_subplot(gs[2, :])
h, c, k = 6.626e-34, 2.998e8, 1.381e-23
planck = lambda l, T: 2 * h * c ** 2 / (l * 1e-9) ** 5 / (np.exp(h * c / ((l * 1e-9) * k * T)) - 1)
p = planck(wl, 5772)
scale = sol[IDX(530)] / p[IDX(530)]          # normeret i kontinuum-toppen
pn = scale * p
axD.fill_between(wl, sol, pn, where=(pn > sol), color="#c8102e", alpha=0.10, lw=0)
axD.plot(wl, pn, color="#c8102e", lw=2, label="Sort legeme 5772 K (Solens overflade), skaleret ved 530 nm")
axD.plot(wl, sol, color="0.12", lw=1.3, label="Målt spektrum, Sisimiut")
axD.set_yscale("log"); axD.set_ylim(3e-3, 6)
axD.set_xlim(380, 950)
axD.annotate("blå ende dæmpet\nRayleigh-spredning ∝ λ⁻⁴ + ozon",
             (405, sol[IDX(405)]), xytext=(482, 0.014), fontsize=9.5, color="#1c3f6e",
             ha="center", fontweight="bold", linespacing=1.15,
             arrowprops=dict(arrowstyle="->", color="#1c3f6e", lw=1.2))
axD.annotate("NIR mangler: telluriske bånd\n+ CCD'ens følsomhed falder mod 950 nm",
             (890, sol[IDX(890)]), xytext=(795, 0.62), fontsize=9.5, color=RED,
             ha="center", fontweight="bold", linespacing=1.15,
             arrowprops=dict(arrowstyle="->", color=RED, lw=1.2))
axD.set_xlabel("Bølgelængde (nm)"); axD.set_ylabel("Relativ intensitet (log)")
axD.set_title("Målt spektrum vs. sort legeme — logaritmisk skala viser hvad atmosfæren "
              "og detektoren fjerner", fontsize=11.5, fontweight="bold", loc="left")
axD.legend(frameon=False, fontsize=9.5, loc="upper left", bbox_to_anchor=(0.0, 1.0))
axD.grid(alpha=0.15, lw=0.6, which="both"); axD.set_axisbelow(True)
for s in ("top", "right"): axD.spines[s].set_visible(False)

fig.savefig(str(pathlib.Path(__file__).resolve().parent / 'figurer' / 'solspektrum_analyse.png'),
            dpi=190, facecolor="white")
print("gemt")
