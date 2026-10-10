"""Building height logic for the map pipeline (pure functions; unit-tested in test_heights.py).

Terms
- "face": one non-overlapping piece of a building footprint with a single height (a "volume" in
  campus.json). Overture building parts often overlap (podium part under a tower part, upper floors
  stacked on a base with min_height, skywalks), so parts are first flattened into faces.
- Heights are meters above LOCAL ground (the game world is flat).

LiDAR rules (USGS 2017 scan)
- Ground level = median of ground-class (2) points in a ring 1.5–12 m around the building.
- Roof samples = unclassified/building points (classes 1, 6) inside the face (inset 0.75 m) that are
  >= 1.5 m above ground. Vegetation, noise, ground and bridge classes are ignored.
- The building "existed in 2017" when there are enough roof samples (density and coverage).
- Roof height = 90th percentile of roof samples: robust against antennas/birds (top 10 %) and
  against wall-edge returns, and close to the parapet/ridge that Overture's `height` means.
- Large faces whose roof has several clearly separate levels (e.g. a 2-story wing next to a
  5-story block) are split into tiers using a 2 m height grid + 1-D clustering.
"""
import math

import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union, polygonize

ROOF_CLASSES = (1, 6)
MIN_ELEVATED = 1.5        # m above ground to count as roof
ROOF_PCT = 90
CELL = 2.0                # tier-split grid (m)
MIN_DENSITY = 1.5         # roof samples per m² (scan has ~11 pts/m² at our depth)
MIN_COVERAGE = 0.4        # fraction of 2 m cells with roof samples
MIN_POINTS = 12
TIER_MIN_AREA = 300.0     # only try to split faces at least this big (m²)
TIER_MIN_GAP = 3.5        # levels must differ by at least this much (m)
TIER_MIN_PIECE = 50.0     # smallest tier polygon kept (m²)


def polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon) and not p.is_empty]


# ---------------------------------------------------------------- flatten overlapping Overture parts

def flatten_parts(parts, min_area=2.0):
    """parts: list of dicts {poly, height, minHeight, ...}. Returns non-overlapping faces.

    Each face gets height = max(height of covering parts) and minHeight = min(minHeight of covering
    parts) and the other attributes of the TALLEST covering part (whose `src` index is kept)."""
    if len(parts) == 1:
        return [dict(parts[0], poly=parts[0]["poly"])]
    lines = unary_union([p["poly"].boundary for p in parts])
    out = []
    for face in polygonize(lines):
        if face.area < min_area:
            continue
        rp = face.representative_point()
        cover = [p for p in parts if p["poly"].contains(rp)]
        if not cover:
            continue  # a hole between parts
        top = max(cover, key=lambda p: p["height"])
        out.append(dict(top, poly=face, height=top["height"], minHeight=min(p["minHeight"] for p in cover)))
    return merge_faces(out)


def merge_faces(faces, tol=0.01, keys=("height", "minHeight", "src")):
    """Union adjacent faces whose `keys` match (heights within tol)."""
    groups = []
    for f in faces:
        for g in groups:
            h = g[0]
            if all((abs(f[k] - h[k]) <= tol) if isinstance(f.get(k), (int, float)) else f.get(k) == h.get(k) for k in keys):
                g.append(f)
                break
        else:
            groups.append([f])
    out = []
    for g in groups:
        u = unary_union([f["poly"] for f in g]).buffer(0)
        for p in polys(u):
            if p.area >= 1.0:
                out.append(dict(max(g, key=lambda f: f["poly"].area), poly=p))
    return out


# ---------------------------------------------------------------- LiDAR measurements

class StreetLevel:
    """Regional street level: 85th percentile of 25 m ground-cell medians within `radius`.

    The game world is flat at street level, but some footprints touch the I-290 expressway trench
    (~6 m lower). Their local ground median would make them look 6 m too tall, so local ground is
    never allowed to sit more than `drop` meters below the regional street level."""

    def __init__(self, idx, cell=25.0, radius=150.0, drop=1.5):
        m = idx.cls == 2
        x, y, z = idx.x[m], idx.y[m], idx.z[m]
        self.cell, self.radius, self.drop = cell, radius, drop
        i = np.floor(x / cell).astype(np.int64); j = np.floor(y / cell).astype(np.int64)
        key = i * 1_000_003 + j
        order = np.lexsort((z, key))
        key, z, i, j = key[order], z[order], i[order], j[order]
        _, start, cnt = np.unique(key, return_index=True, return_counts=True)
        ok = cnt >= 10
        mid = start + cnt // 2
        self.ci, self.cj, self.cz = i[mid][ok], j[mid][ok], z[mid][ok]

    def at(self, x, y):
        cx, cy = (self.ci + 0.5) * self.cell, (self.cj + 0.5) * self.cell
        m = (cx - x) ** 2 + (cy - y) ** 2 <= self.radius ** 2
        return float(np.percentile(self.cz[m], 85)) if m.sum() >= 5 else None

    def clamp(self, local, x, y):
        s = self.at(x, y)
        if s is None:
            return local
        return max(local, s - self.drop) if local is not None else s


def ground_level(idx, footprint, street=None):
    """Median ground elevation around a footprint (None if no ground points anywhere near)."""
    g = None
    for r in (12.0, 30.0, 60.0):
        ring = footprint.buffer(r).difference(footprint.buffer(1.5))
        ii = idx.in_polygon(ring)
        ii = ii[idx.cls[ii] == 2]
        if len(ii) >= 20:
            g = float(np.median(idx.z[ii]))
            break
    if street is not None:
        c = footprint.centroid
        g = street.clamp(g, c.x, c.y)
    return g


def roof_samples(idx, poly, g0, inset=0.75):
    """(x, y, z_above_ground) of roof points inside poly."""
    p = poly.buffer(-inset)
    if p.is_empty or p.area < 0.3 * poly.area:
        p = poly
    ii = idx.in_polygon(p)
    z = idx.z[ii] - g0
    m = np.isin(idx.cls[ii], ROOF_CLASSES) & (z >= MIN_ELEVATED)
    return idx.x[ii][m], idx.y[ii][m], z[m]


def coverage(x, y, poly, cell=CELL):
    """Fraction of grid cells of poly that contain at least one sample."""
    if len(x) == 0:
        return 0.0
    n_cells = max(1.0, poly.area / (cell * cell))
    occ = len(set(zip((np.asarray(x) // cell).astype(int).tolist(), (np.asarray(y) // cell).astype(int).tolist())))
    return min(1.0, occ / n_cells)


def existed_in_scan(x, y, z, poly):
    """True when the LiDAR clearly shows a structure on this footprint."""
    a = max(poly.area, 1.0)
    return len(z) >= MIN_POINTS and len(z) / a >= MIN_DENSITY and coverage(x, y, poly) >= MIN_COVERAGE


def roof_height(z, pct=ROOF_PCT):
    return float(np.percentile(z, pct)) if len(z) else None


# ---------------------------------------------------------------- tier splitting

def _kmeans1d(v, k, iters=30):
    c = np.quantile(v, np.linspace(0.12, 0.88, k))
    for _ in range(iters):
        lab = np.argmin(np.abs(v[:, None] - c[None, :]), axis=1)
        nc = np.array([v[lab == i].mean() if np.any(lab == i) else c[i] for i in range(k)])
        if np.allclose(nc, c):
            break
        c = nc
    order = np.argsort(c)
    c = c[order]
    lab = np.argmin(np.abs(v[:, None] - c[None, :]), axis=1)
    sse = float(sum(((v[lab == i] - c[i]) ** 2).sum() for i in range(k)))
    return c, lab, sse


def cell_heights(x, y, z, cell=CELL, q=0.85, min_pts=3):
    """Per grid cell: (i, j, height = q-quantile of samples). Cells with < min_pts samples dropped."""
    i = np.floor(np.asarray(x) / cell).astype(np.int64)
    j = np.floor(np.asarray(y) / cell).astype(np.int64)
    key = i * 1_000_003 + j
    order = np.lexsort((z, key))
    key, zs, i, j = key[order], np.asarray(z)[order], i[order], j[order]
    uk, start, cnt = np.unique(key, return_index=True, return_counts=True)
    ok = cnt >= min_pts
    pick = start + np.floor(q * (cnt - 1)).astype(np.int64)
    return i[pick][ok], j[pick][ok], zs[pick][ok]


def choose_levels(h, min_gap=TIER_MIN_GAP, min_frac=0.10, min_cells=TIER_MIN_PIECE / (CELL * CELL)):
    """1-D clustering of cell heights into 1–3 roof levels. Returns (centers, labels)."""
    h = np.asarray(h, float)
    best = (np.array([h.mean()]), np.zeros(len(h), int))
    sse1 = float(((h - h.mean()) ** 2).sum())
    if len(h) < 2 * min_cells or sse1 <= 0:
        return best
    prev_sse = sse1
    for k in (2, 3):
        c, lab, sse = _kmeans1d(h, k)
        counts = np.bincount(lab, minlength=k)
        if np.min(np.diff(c)) < min_gap or counts.min() < max(min_cells, min_frac * len(h)):
            break
        if sse > (0.25 if k == 2 else 0.5) * prev_sse:
            break
        best, prev_sse = (c, lab), sse
    return best


def _cells_poly(ii, jj, cell):
    return unary_union(shapely.box(ii * cell, jj * cell, (ii + 1) * cell, (jj + 1) * cell))


def _clean(g, r=CELL):
    m = dict(join_style=2)  # mitre keeps square corners
    g = g.buffer(r / 2, **m).buffer(-r, **m).buffer(r / 2, **m)   # opening: drop spurs/noise
    g = g.buffer(r, **m).buffer(-r, **m)                          # closing: fill pinholes
    return g


def absorb_slivers(pieces, half_width=1.5, min_area=TIER_MIN_PIECE):
    """pieces: [(level, polygon)]. Parts of a piece narrower than 2*half_width (and whole pieces
    smaller than min_area) are handed to the neighbor sharing the longest boundary with them."""
    m = dict(join_style=2)
    cores, frags = [], []
    for L, p in pieces:
        core = p.buffer(-half_width, **m).buffer(half_width, **m).intersection(p)
        core = unary_union([q for q in polys(core) if q.area >= min_area]) if not core.is_empty else core
        cores.append([L, core])
        frags += [q for q in polys(p.difference(core)) if q.area > 0.05]
    owners = [i for i, (L, c) in enumerate(cores) if not c.is_empty]
    if not owners:  # nothing substantial: keep as is
        return pieces
    for fr in frags:
        grown = fr.buffer(0.25)
        best = max(owners, key=lambda i: grown.intersection(cores[i][1]).area)
        cores[best][1] = cores[best][1].union(fr)
    out = []
    for L, c in cores:
        for q in polys(c.buffer(0)):
            if q.area >= 1.0:
                out.append((L, q.simplify(0.3)))
    return out


def split_tiers(face, x, y, z, cell=CELL):
    """Split a face into roof tiers. Returns list of (polygon, height) or None when single-level."""
    if face.area < TIER_MIN_AREA or len(z) < 50:
        return None
    ci, cj, ch = cell_heights(x, y, z, cell)
    if len(ch) < 2 * TIER_MIN_PIECE / (cell * cell):
        return None
    centers, lab = choose_levels(ch)
    if len(centers) < 2:
        return None
    k = len(centers)
    taken = None
    pieces = []
    for L in range(k - 1, 0, -1):
        m = lab >= L
        reg = _clean(_cells_poly(ci[m], cj[m], cell)).intersection(face)
        if taken is not None:
            reg = reg.difference(taken)
        keep = [p.simplify(0.5) for p in polys(reg) if p.area >= TIER_MIN_PIECE]
        keep = [p for p in keep if p.is_valid and not p.is_empty]
        if keep:
            pieces.append((L, keep))
            u = unary_union(keep)
            taken = u if taken is None else taken.union(u)
    if taken is None:
        return None
    base = face.difference(taken)
    pieces.append((0, [p for p in polys(base) if p.area >= 1.0]))
    flat = absorb_slivers([(L, p) for L, ps in pieces for p in ps])
    out = []
    xa, ya, za = np.asarray(x), np.asarray(y), np.asarray(z)
    for L, p in flat:
        inner = p.buffer(-0.75)
        if inner.is_empty or inner.area < 0.3 * p.area:
            inner = p
        m = shapely.contains_xy(inner, xa, ya)
        h = roof_height(za[m]) if m.sum() >= 5 else float(centers[L])
        out.append((p, h))
    if len(out) < 2:
        return None
    return out


# ---------------------------------------------------------------- final choice

MIN_HEIGHT = 3.0


def rebuilt_after_scan(overture_h, overture_src, floors, lidar_h):
    """Overture says MUCH taller than the 2017 scan, with a believable floor count: a new building
    on the site of an older, lower one (e.g. a 2021 tower over a 2017 parking lot/low-rise)."""
    if lidar_h is None or overture_src not in ("overture", "floors"):
        return False
    if overture_h > 1.5 * lidar_h + 10:
        return True
    plausible_floors = bool(floors) and 2.8 <= overture_h / floors <= 4.5 and floors >= 4
    return plausible_floors and overture_h > 1.4 * lidar_h + 6


def choose_height(overture_h, overture_src, lidar_h, existed, floors=None):
    """Pick (height, heightSource) for a face. LiDAR wins when the building existed in the 2017
    scan, unless the building was evidently rebuilt taller since."""
    if lidar_h is not None and existed and not rebuilt_after_scan(overture_h, overture_src, floors, lidar_h):
        return max(lidar_h, MIN_HEIGHT), "lidar"
    return overture_h, overture_src
