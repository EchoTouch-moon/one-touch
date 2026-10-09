"""
Pixel-level design review.

audit.mjs measures the DOM; this measures what actually reached the screen.
Neither replaces a pair of eyes, but together they make "does this look
considered?" falsifiable:

  * palette     — how many colours really appear, and how much of the frame is
                  the ground colour (a whitespace/restraint proxy)
  * balance     — ink mass per horizontal band, to see whether a page is
                  top-heavy, bottom-heavy or evenly weighted
  * alignment   — column projection peaks, i.e. how many distinct left edges the
                  eye has to track
  * rhythm      — run-lengths of blank rows, which is the vertical spacing the
                  user actually perceives
"""
import sys, json, pathlib
import numpy as np
from PIL import Image

def analyse(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # 1. palette: quantise to 4 bits/channel and count
    q = (a // 16).astype(np.uint8)
    flat = q.reshape(-1, 3)
    uniq, counts = np.unique(flat, axis=0, return_counts=True)
    order = np.argsort(-counts)
    top = [(tuple(int(v) * 16 + 8 for v in uniq[i]), int(counts[i])) for i in order[:8]]
    dominant_share = counts[order[0]] / flat.shape[0]

    # 2. contrast range of the frame
    lum = (0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]) / 255.0
    mean_lum = float(lum.mean())
    # share of near-white pixels = perceived breathing room
    light_share = float((lum > 0.90).mean())
    dark_share = float((lum < 0.25).mean())

    # 3. ink mass per band (8 bands) -> vertical balance
    bands = np.array_split(lum, 8, axis=0)
    ink = [float((b < 0.82).mean()) for b in bands]

    # 4. alignment: column projection of "ink" (non-ground) pixels
    ground = np.median(lum)
    ink_mask = (np.abs(lum - ground) > 0.06)
    col = ink_mask.sum(axis=0)
    thr = col.max() * 0.35 if col.max() else 0
    peaks = []
    x = 0
    while x < w:
        if col[x] > thr:
            start = x
            while x < w and col[x] > thr:
                x += 1
            peaks.append(((start + x) // 2, int(col[start:x].max())))
        else:
            x += 1

    # 5. vertical rhythm: blank-row run lengths
    row_ink = ink_mask.sum(axis=1) > w * 0.01
    runs, cur = [], 0
    for v in row_ink:
        if not v:
            cur += 1
        elif cur:
            runs.append(cur); cur = 0
    if cur:
        runs.append(cur)
    significant = sorted(r for r in runs if r >= 6)

    return {
        "file": pathlib.Path(path).name,
        "size": [w, h],
        "top_palette": [f"#{r:02x}{g:02x}{b:02x} ({n*100//(w*h)}%)" for (r, g, b), n in top],
        "dominant_share": round(dominant_share, 3),
        "mean_lum": round(mean_lum, 3),
        "light_share": round(light_share, 3),
        "dark_share": round(dark_share, 4),
        "band_ink": [round(i, 3) for i in ink],
        "balance_spread": round(max(ink) - min(ink), 3),
        "alignment_edges": len(peaks),
        "edge_x": [p[0] for p in peaks][:14],
        "whitespace_runs": significant[:14],
    }

if __name__ == "__main__":
    out = {}
    for p in sys.argv[1:]:
        try:
            out[pathlib.Path(p).stem] = analyse(p)
        except Exception as exc:  # noqa: BLE001
            out[pathlib.Path(p).stem] = {"error": str(exc)}
    print(json.dumps(out, indent=1, ensure_ascii=False))
