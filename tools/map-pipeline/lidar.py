"""USGS 3DEP LiDAR access for the map pipeline.

Source: USGS_LPC_IL_4County_Cook_2017_LAS_2019 (public domain), served as an Entwine Point Tile (EPT)
octree from the public AWS bucket `usgs-lidar-public` over anonymous HTTPS. Coordinates are EPSG:3857,
Z is meters.

`load_points(bbox)` returns the points of the play area converted to PLAN coordinates (meters,
x = east, y = north; same origin as client/src/core/geo.ts). Everything is cached under
tools/map-pipeline/cache/lidar/ (raw .laz octree nodes + one compact .npz), so after the first run the
pipeline works offline.

ASPRS classes used: 1 unclassified, 2 ground, 3-5 vegetation, 6 building, 7 noise, 9 water,
17 bridge deck, 18 high noise.
"""
import io, json, math, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

EPT_BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_IL_4County_Cook_2017_LAS_2019/"
DATASET = "USGS_LPC_IL_4County_Cook_2017_LAS_2019"
R_MERC = 6378137.0

CLS_GROUND, CLS_BUILDING, CLS_NOISE, CLS_HIGH_NOISE = 2, 6, 7, 18
CLS_VEGETATION = (3, 4, 5)


def _get(url, tries=4):
    last = None
    for _ in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=120).read()
        except Exception as e:  # network hiccup: retry
            last = e
    raise last


def _merc(lat, lon):
    return math.radians(lon) * R_MERC, R_MERC * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def _cached(path, url):
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    data = _get(url)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return data


def _node_keys(cache_dir, bbox_merc, maxdepth):
    """Walk the EPT hierarchy; return node keys whose cube intersects the bbox, down to maxdepth."""
    ept = json.loads(_cached(os.path.join(cache_dir, "ept.json"), EPT_BASE + "ept.json"))
    B = ept["bounds"]
    hier = {}

    def load(key):
        hier.update(json.loads(_cached(os.path.join(cache_dir, "hierarchy", f"{key}.json"),
                                       EPT_BASE + f"ept-hierarchy/{key}.json")))

    load("0-0-0-0")
    x0, y0, x1, y1 = bbox_merc
    keys = []

    def walk(d, x, y, z):
        k = f"{d}-{x}-{y}-{z}"
        if k not in hier:
            return
        if hier[k] == -1:
            load(k)
        s = (B[3] - B[0]) / 2 ** d
        ax, ay = B[0] + x * s, B[1] + y * s
        if ax + s < x0 or ax > x1 or ay + s < y0 or ay > y1:
            return
        keys.append(k)
        if d >= maxdepth:
            return
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    walk(d + 1, 2 * x + dx, 2 * y + dy, 2 * z + dz)

    walk(0, 0, 0, 0)
    return keys


def load_points(cache_dir, bbox_latlon, origin, maxdepth=10, offline=False):
    """Return dict(x, y, z: float32 plan meters / elevation m, cls: uint8) for bbox (S, W, N, E)."""
    S, W, N, E = bbox_latlon
    tag = f"pts_d{maxdepth}_{S:.4f}_{W:.4f}_{N:.4f}_{E:.4f}.npz"
    npz = os.path.join(cache_dir, tag)
    if os.path.exists(npz):
        d = np.load(npz)
        return {k: d[k] for k in ("x", "y", "z", "cls")}
    if offline:
        raise FileNotFoundError(f"LiDAR cache {npz} missing and --offline given")
    import laspy  # only needed when (re)building the cache

    x0, y0 = _merc(S, W)
    x1, y1 = _merc(N, E)
    keys = _node_keys(cache_dir, (x0, y0, x1, y1), maxdepth)
    print(f"LiDAR: {len(keys)} EPT nodes (depth <= {maxdepth}) for the play area …", flush=True)

    def one(k):
        data = _cached(os.path.join(cache_dir, "ept-data", f"{k}.laz"), EPT_BASE + f"ept-data/{k}.laz")
        las = laspy.read(io.BytesIO(data))
        X, Y = np.asarray(las.x), np.asarray(las.y)
        m = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
        return np.c_[X[m], Y[m], np.asarray(las.z)[m], np.asarray(las.classification)[m]]

    with ThreadPoolExecutor(8) as ex:
        P = np.vstack(list(ex.map(one, keys)))
    # EPSG:3857 -> lat/lon -> plan (same linear approximation as geo.ts)
    lon = np.degrees(P[:, 0] / R_MERC)
    lat = np.degrees(2 * np.arctan(np.exp(P[:, 1] / R_MERC)) - np.pi / 2)
    kx = 111320 * math.cos(math.radians(origin[0]))
    ky = 110574
    out = {"x": ((lon - origin[1]) * kx).astype(np.float32), "y": ((lat - origin[0]) * ky).astype(np.float32),
           "z": P[:, 2].astype(np.float32), "cls": P[:, 3].astype(np.uint8)}
    np.savez(npz, **out)
    print(f"LiDAR: cached {len(P):,} points -> {npz}", flush=True)
    return out


class PointIndex:
    """Bucket grid over plan points for fast polygon queries (no per-point shapely objects)."""

    def __init__(self, pts, cell=10.0):
        self.cell = cell
        x, y = pts["x"], pts["y"]
        self.x0, self.y0 = float(x.min()), float(y.min())
        self.nx = int((x.max() - self.x0) // cell) + 1
        self.ny = int((y.max() - self.y0) // cell) + 1
        cid = ((x - self.x0) // cell).astype(np.int64) * self.ny + ((y - self.y0) // cell).astype(np.int64)
        order = np.argsort(cid, kind="stable")
        self.x, self.y, self.z, self.cls = x[order], y[order], pts["z"][order], pts["cls"][order]
        cid = cid[order]
        self.start = np.searchsorted(cid, np.arange(self.nx * self.ny + 1))

    def bbox_idx(self, minx, miny, maxx, maxy):
        i0 = max(0, int((minx - self.x0) // self.cell)); i1 = min(self.nx - 1, int((maxx - self.x0) // self.cell))
        j0 = max(0, int((miny - self.y0) // self.cell)); j1 = min(self.ny - 1, int((maxy - self.y0) // self.cell))
        if i1 < i0 or j1 < j0:
            return np.zeros(0, np.int64)
        parts = [np.arange(self.start[i * self.ny + j0], self.start[i * self.ny + j1 + 1]) for i in range(i0, i1 + 1)]
        return np.concatenate(parts) if parts else np.zeros(0, np.int64)

    def in_polygon(self, poly):
        """Indices of points inside a shapely (Multi)Polygon."""
        import shapely
        if poly.is_empty:
            return np.zeros(0, np.int64)
        idx = self.bbox_idx(*poly.bounds)
        if len(idx) == 0:
            return idx
        m = shapely.contains_xy(poly, self.x[idx], self.y[idx])
        return idx[m]


if __name__ == "__main__":
    # Manual use: python3 tools/map-pipeline/lidar.py  -> fills the cache for the default play box.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_campus as bc
    p = load_points(os.path.join(bc.CACHE, "lidar"), bc.PLAY_BBOX, bc.ORIGIN)
    print(len(p["x"]), "points")
