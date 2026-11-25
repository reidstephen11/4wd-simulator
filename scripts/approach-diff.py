"""
Measure the pictures from scripts/approach-check.ts and lay each set side by side.

For each sample: `changed` is the share of the picture that differs between the game's own
view (a2) and the same view with the ground at full detail (b), leaving out whatever also
differs between two frames of the game's own view (a1, a2: wind, water, dust). A strip
`<name>-compare.jpg` shows a2, b and the difference (white where the ground will redraw).

Usage: python3 scripts/approach-diff.py <dir>   (needs Pillow and numpy)
"""

import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

THRESHOLD = 22  # of 255, on the strongest colour channel: a change the eye picks up


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


def changed(a, b):
    return np.abs(a - b).max(axis=2) > THRESHOLD


def main(folder):
    rows = []
    for a2_path in sorted(glob.glob(os.path.join(folder, "*-a2.png"))):
        name = os.path.basename(a2_path)[: -len("-a2.png")]
        a1 = load(os.path.join(folder, f"{name}-a1.png"))
        a2 = load(a2_path)
        b = load(os.path.join(folder, f"{name}-b.png"))
        noise = Image.fromarray(changed(a1, a2).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))
        noise = np.asarray(noise) > 0
        mask = changed(a2, b) & ~noise
        h = mask.shape[0]
        share = float(mask.mean())
        # The road ahead is the lower middle of the picture.
        road = mask[h // 2 :, mask.shape[1] // 4 : 3 * mask.shape[1] // 4]
        rows.append({"name": name, "changed": round(share, 4), "road": round(float(road.mean()), 4), "noise": round(float(noise.mean()), 4)})
        heat = np.zeros_like(a2, dtype=np.uint8)
        heat[mask] = (255, 255, 255)
        heat[noise & ~mask] = (60, 60, 90)
        strip = np.concatenate([a2.astype(np.uint8), b.astype(np.uint8), heat], axis=1)
        Image.fromarray(strip).save(os.path.join(folder, f"{name}-compare.jpg"), quality=82)
    rows.sort(key=lambda r: -r["changed"])
    for r in rows:
        print(f'{r["name"]}: {r["changed"] * 100:.1f}% of the picture redraws ({r["road"] * 100:.1f}% of the road ahead), moving parts {r["noise"] * 100:.1f}%')
    with open(os.path.join(folder, "approach-diff.json"), "w") as f:
        json.dump(rows, f, indent=2)


if __name__ == "__main__":
    main(sys.argv[1])
