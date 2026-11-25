"""
Measure the pictures from scripts/reach-check.ts: one fixed view of the ground, the car put
down nearer to it each time. Prints how much of the picture differs from the first (the car
furthest away) and from the one before, and writes a `reach-sheet-<at>.jpg` for each watched
point with every picture and, under each, white where it differs from the first.

Usage: python3 scripts/reach-diff.py <dir>   (needs Pillow and numpy)
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

THRESHOLD = 22  # of 255, on the strongest colour channel: a change the eye picks up


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


def main(folder):
    with open(os.path.join(folder, "reach.json")) as f:
        shots = json.load(f)["shots"]
    rows = []
    for at in sorted({s.get("at", 0) for s in shots}):
        group = [s for s in shots if s.get("at", 0) == at]
        pictures = [load(os.path.join(folder, s["file"])) for s in group]
        first = pictures[0]
        tiles = []
        for i, (shot, picture) in enumerate(zip(group, pictures)):
            from_first = np.abs(picture - first).max(axis=2) > THRESHOLD
            from_last = np.abs(picture - pictures[max(0, i - 1)]).max(axis=2) > THRESHOLD
            rows.append({"at": at, "distance": shot["distance"], "fromFirst": round(float(from_first.mean()), 4), "fromLast": round(float(from_last.mean()), 4)})
            print(f'{at:>5} m along, car {shot["distance"]:>3} m away: {from_first.mean() * 100:5.1f}% differs from the first picture, {from_last.mean() * 100:5.1f}% from the one before')
            heat = np.zeros_like(picture, dtype=np.uint8)
            heat[from_first] = (255, 255, 255)
            tile = Image.fromarray(np.concatenate([picture.astype(np.uint8), heat], axis=0)).resize((480, 540))
            ImageDraw.Draw(tile).text((6, 4), f'car {shot["distance"]} m away', fill="white")
            tiles.append(tile)
        columns = 4
        sheet = Image.new("RGB", (480 * columns, 540 * ((len(tiles) + columns - 1) // columns)))
        for i, tile in enumerate(tiles):
            sheet.paste(tile, ((i % columns) * 480, (i // columns) * 540))
        sheet.save(os.path.join(folder, f"reach-sheet-{at:04d}.jpg"), quality=86)
    with open(os.path.join(folder, "reach-diff.json"), "w") as f:
        json.dump(rows, f, indent=2)


if __name__ == "__main__":
    main(sys.argv[1])
