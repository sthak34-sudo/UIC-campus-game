"""Low-detail surroundings beyond the play area (so aerial views don't look like an island).

Writes client/public/data/context.json:
  buildings: [[cx, cy, ux, uy, len, wid, height, style], ...]  plan meters; (ux, uy) = long-axis unit
             vector; style 0 = brick low-rise, 1 = concrete/commercial, 2 = glass high-rise
  ground:    {road: [Polygon2D], block: [Polygon2D]}              non-overlapping ground (no z-fighting far away)
  trees:     [[x, y, height], ...]                                 parkway trees along residential streets
  bounds:    {minX, minY, maxX, maxY}                              extent of the context area

Everything inside the play box is left out (the detailed campus covers it). Source: Overture Maps
(buildings + transportation segments), cached in tools/map-pipeline/cache/context_*.parquet.
"""
import json, math, os

import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import wkb
from shapely.geometry import box, LineString, Point

# ~4.6 x 4.7 km around campus: Near West Side, Greektown/West Loop, the Loop skyline, Pilsen edge
CONTEXT_BBOX = (41.8520, -87.6900, 41.8940, -87.6270)  # S, W, N, E
ROAD_W = {"motorway": 22, "trunk": 16, "primary": 14, "secondary": 12, "tertiary": 10, "residential": 8, "unclassified": 7, "living_street": 6}
TREE_STREETS = {"residential", "tertiary", "unclassified", "living_street"}


def fetch(cache, release, refresh=False):
    import pyarrow.dataset as ds, pyarrow.fs as pafs, pyarrow.compute as pc
    s3 = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    S, W, N, E = CONTEXT_BBOX
    flt = (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) & (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S)
    for theme, typ in [("buildings", "building"), ("transportation", "segment")]:
        path = os.path.join(cache, f"context_{typ}.parquet")
        if os.path.exists(path) and not refresh:
            continue
        print(f"downloading context {theme}/{typ} …", flush=True)
        d = ds.dataset(f"overturemaps-us-west-2/release/{release}/theme={theme}/type={typ}/", filesystem=s3, format="parquet")
        cols = ["id", "geometry", "bbox", "height", "num_floors", "class", "is_underground"] if typ == "building" else ["id", "geometry", "bbox", "class", "subtype"]
        pq.write_table(d.to_table(filter=flt, columns=cols), path)


def build(cache, to_plan, play_clip, out_path):
    S, W, N, E = CONTEXT_BBOX
    area = to_plan(box(W, S, E, N))
    # --- buildings as oriented rectangles ---
    bl = []
    polys = []
    for r in pq.read_table(os.path.join(cache, "context_building.parquet")).to_pylist():
        if r.get("is_underground"):
            continue
        g = to_plan(wkb.loads(r["geometry"]))
        if g.is_empty or g.area < 60:
            continue
        c = g.centroid
        if play_clip.contains(c) or not area.contains(c):
            continue
        rect = g.minimum_rotated_rectangle
        if rect.geom_type != "Polygon":
            continue
        pts = list(rect.exterior.coords)[:4]
        e1 = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); e2 = (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        if l1 < l2:
            e1, e2, l1, l2 = e2, e1, l2, l1
        # shrink the rectangle to the real footprint area so L-shapes don't bloat
        k = math.sqrt(min(1.0, g.area / max(rect.area, 1e-6)))
        h = r.get("height") or ((r.get("num_floors") or 0) * 3.6) or (9.0 if g.area < 400 else 12.0)
        cls = r.get("class") or ""
        style = 2 if h > 45 else 1 if (cls in ("commercial", "office", "retail", "industrial", "warehouse", "parking", "hospital", "university", "school") or g.area > 2500) else 0
        bl.append([round(c.x, 1), round(c.y, 1), round(e1[0] / l1, 4), round(e1[1] / l1, 4), round(l1 * k, 1), round(l2 * k, 1), round(float(h), 1), style])
        polys.append(g)
    built = shapely.STRtree(polys) if polys else None

    # --- roads (street center lines outside the play area) ---
    road_polys, tree_lines = [], []
    for r in pq.read_table(os.path.join(cache, "context_segment.parquet")).to_pylist():
        if r["subtype"] != "road" or r["class"] not in ROAD_W:
            continue
        g = to_plan(wkb.loads(r["geometry"])).intersection(area).difference(play_clip)
        for line in getattr(g, "geoms", [g]):
            if line.geom_type != "LineString" or line.length < 2:
                continue
            line = line.simplify(0.5)
            road_polys.append(line.buffer(ROAD_W[r["class"]] / 2, cap_style=2, join_style=2, mitre_limit=2))
            if r["class"] in TREE_STREETS:
                tree_lines.append((line, ROAD_W[r["class"]]))

    # --- parkway trees: every ~15 m on both sides of residential streets, not in buildings ---
    rng = np.random.default_rng(1871)
    trees = []
    for line, w in tree_lines:
        for d in np.arange(rng.uniform(3, 12), line.length - 3, 15.0):
            a = line.interpolate(d); b = line.interpolate(min(d + 1, line.length))
            dx, dy = b.x - a.x, b.y - a.y; L = math.hypot(dx, dy) or 1
            for side in (-1, 1):
                if rng.random() < 0.45:
                    continue
                off = w / 2 + 2.2
                p = Point(a.x - side * dy / L * off, a.y + side * dx / L * off)
                if play_clip.contains(p):
                    continue
                if built is not None and len(built.query(p.buffer(2.0), predicate="intersects")):
                    continue
                trees.append([round(p.x, 1), round(p.y, 1), round(float(rng.uniform(8, 15)), 1)])

    # --- non-overlapping ground: roads, and the blocks between them ---
    ring = area.difference(play_clip)
    road_u = shapely.set_precision(shapely.union_all(road_polys).intersection(ring).simplify(0.4), 0.1)
    block_u = shapely.set_precision(ring.difference(road_u).simplify(0.4), 0.1)
    def pj(g):
        out = []
        for p in getattr(g, "geoms", [g]):
            if p.geom_type != "Polygon" or p.area < 4:
                continue
            p = shapely.geometry.polygon.orient(p, 1.0)
            ringj = lambda c: [[round(x, 1), round(y, 1)] for x, y in list(c)[:-1]]
            out.append({"outer": ringj(p.exterior.coords), "holes": [ringj(h.coords) for h in p.interiors]})
        return out
    b = area.bounds
    out = {"bounds": dict(zip(["minX", "minY", "maxX", "maxY"], [round(v, 1) for v in b])),
           "buildings": bl, "ground": {"road": pj(road_u), "block": pj(block_u)}, "trees": trees,
           "attribution": ["© OpenStreetMap contributors (ODbL)", "Overture Maps Foundation"]}
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {out_path}: {len(bl)} context buildings, {len(out['ground']['road'])} road / {len(out['ground']['block'])} block polygons, {len(trees)} trees, {os.path.getsize(out_path) // 1024} KB")
