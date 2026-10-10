"""Tree positions and heights from the LiDAR canopy (pure numpy; tested in test_heights.py).

Mapped trees (OSM/Overture) are sparse around Little Italy, but the 2017 scan sees every canopy.
Method: 1 m canopy height model (CHM) from medium/high-vegetation points (classes 4, 5) -> local maxima
(a treetop is the highest cell within a radius that grows with tree height) -> one tree per top.
Mapped trees keep their position and take the height of the nearest detected top.
"""
import numpy as np

VEG_CLASSES = (4, 5)  # medium + high vegetation (this scan bands vegetation by height)
MAX_TREE_H = 26.0     # taller "trees" are misclassified facade points
MIN_TREE_H = 4.0


def canopy_height_model(x, y, z_above_ground, cell=1.0):
    """Max height per cell. Returns (chm 2-D array [ix, iy], x0, y0)."""
    x0, y0 = float(np.floor(x.min())), float(np.floor(y.min()))
    ix = ((x - x0) / cell).astype(np.int64); iy = ((y - y0) / cell).astype(np.int64)
    chm = np.zeros((ix.max() + 1, iy.max() + 1), np.float32)
    np.maximum.at(chm, (ix, iy), z_above_ground.astype(np.float32))
    return chm, x0, y0


def _shift_max(a, r):
    """Max filter over a (2r+1)^2 square window (zero padded)."""
    out = a.copy()
    p = np.pad(a, r)
    n0, n1 = a.shape
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if dx == 0 and dy == 0:
                continue
            np.maximum(out, p[r + dx:r + dx + n0, r + dy:r + dy + n1], out=out)
    return out


def smooth3(a):
    p = np.pad(a, 1, mode="edge")
    n0, n1 = a.shape
    return sum(p[1 + dx:1 + dx + n0, 1 + dy:1 + dy + n1] for dx in (-1, 0, 1) for dy in (-1, 0, 1)) / 9.0


def tree_tops(chm, x0, y0, cell=1.0, min_h=MIN_TREE_H):
    """Local maxima of the smoothed CHM. Small trees use a 2 m window, big ones 3–4 m."""
    s = smooth3(chm)
    m2, m3, m4 = _shift_max(s, 2), _shift_max(s, 3), _shift_max(s, 4)
    win = np.where(s < 9, m2, np.where(s < 15, m3, m4))
    top = (s >= win - 1e-6) & (s >= min_h)
    ix, iy = np.nonzero(top)
    h = chm[ix, iy]  # unsmoothed peak height
    return (x0 + (ix + 0.5) * cell), (y0 + (iy + 0.5) * cell), h


def dedupe(x, y, h, min_dist=3.0):
    """Greedy: keep tallest, drop others within min_dist."""
    order = np.argsort(-h)
    keep = []
    grid = {}
    for i in order:
        cx, cy = int(x[i] // min_dist), int(y[i] // min_dist)
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2 < min_dist ** 2:
                        ok = False
                        break
                if not ok: break
            if not ok: break
        if ok:
            keep.append(i)
            grid.setdefault((cx, cy), []).append(i)
    keep = np.array(keep, dtype=np.int64)
    return x[keep], y[keep], h[keep]


def chm_max_near(chm, x0, y0, x, y, r=3, cell=1.0):
    i, j = int((x - x0) / cell), int((y - y0) / cell)
    if i < 0 or j < 0 or i >= chm.shape[0] or j >= chm.shape[1]:
        return 0.0
    return float(chm[max(0, i - r):i + r + 1, max(0, j - r):j + r + 1].max())


def merge_mapped(mapped, tx, ty, th, radius=4.0, default_h=7.0, chm=None):
    """mapped: [(x, y)]. Returns list of (x, y, h, source) with mapped trees first.
    chm=(array, x0, y0): unmatched mapped trees take the local canopy max (>= 4 m) instead of default_h."""
    used = np.zeros(len(tx), bool)
    out = []
    for (mx, my) in mapped:
        d2 = (tx - mx) ** 2 + (ty - my) ** 2
        j = int(np.argmin(d2)) if len(d2) else -1
        if j >= 0 and d2[j] <= radius ** 2:
            used[j] = True
            out.append((mx, my, float(th[j]), "mapped+lidar"))
        else:
            h = chm_max_near(chm[0], chm[1], chm[2], mx, my) if chm is not None else 0.0
            out.append((mx, my, h if MIN_TREE_H <= h <= MAX_TREE_H else default_h, "mapped"))
    for j in np.nonzero(~used)[0]:
        out.append((float(tx[j]), float(ty[j]), float(th[j]), "lidar"))
    return out
