"""Build client/public/data/campus.json from Overture Maps (which includes OpenStreetMap data).

Usage:  python3 tools/map-pipeline/build_campus.py [--refresh] [--offline] [--no-lidar]
  Downloads (once, cached in tools/map-pipeline/cache/) the Overture layers for the campus area,
  converts them to plan coordinates (meters, x=east, y=north; see client/src/core/geo.ts) and writes
  the format described in client/src/core/campusData.ts.

Building heights: USGS 3DEP LiDAR (2017 scan, see lidar.py / heights.py) measures every footprint's
roof height above local street level; tiered roofs are split into separate volumes. Buildings that
did not exist in 2017 keep their Overture height / floor count; overrides.json fixes known cases.
A validation table of named buildings is printed at the end. Tests: python3 -m pytest tools/map-pipeline
"""
import argparse, json, math, os, sys, datetime
import numpy as np
import pyarrow.parquet as pq
from shapely import wkb, make_valid
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.affinity import affine_transform
from shapely.ops import unary_union
from shapely.geometry.polygon import orient

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(ROOT, "client", "public", "data", "campus.json")

OVERTURE_RELEASE = "2026-09-23.1"
ORIGIN = (41.8722, -87.6505)  # must match client/src/core/geo.ts
# Download box (wider, for future expansion) and play box (v1 East Campus core + margin).
FETCH_BBOX = (41.8600, -87.6820, 41.8810, -87.6400)  # S, W, N, E
PLAY_BBOX = (41.8673, -87.6612, 41.8784, -87.6443)
LAYERS = [("buildings", "building"), ("buildings", "building_part"), ("transportation", "segment"),
          ("base", "land_use"), ("base", "land"), ("base", "infrastructure"), ("base", "water")]

# Buildings replaced by hand-made landmarks (client/src/world/landmarks). Matched on Overture primary name.
LANDMARKS = {"University Hall": "university-hall", "Richard J. Daley Library": "daley-library"}

KX = 111320 * math.cos(math.radians(ORIGIN[0])); KY = 110574
def to_plan(g): return affine_transform(g, [KX, 0, 0, KY, -ORIGIN[1] * KX, -ORIGIN[0] * KY])

def fetch(refresh):
    import pyarrow.dataset as ds, pyarrow.fs as pafs, pyarrow.compute as pc
    os.makedirs(CACHE, exist_ok=True)
    s3 = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    S, W, N, E = FETCH_BBOX
    flt = (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) & (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S)
    for theme, typ in LAYERS:
        path = os.path.join(CACHE, f"{typ}.parquet")
        if os.path.exists(path) and not refresh: continue
        print(f"downloading {theme}/{typ} …", flush=True)
        d = ds.dataset(f"overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme={theme}/type={typ}/", filesystem=s3, format="parquet")
        pq.write_table(d.to_table(filter=flt), path)

def rows(typ):
    S, W, N, E = PLAY_BBOX
    out = []
    for r in pq.read_table(os.path.join(CACHE, f"{typ}.parquet")).to_pylist():
        b = r["bbox"]
        if b["xmin"] < E and b["xmax"] > W and b["ymin"] < N and b["ymax"] > S: out.append(r)
    return out

def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]

def ring(coords): return [[round(x, 2), round(y, 2)] for x, y in list(coords)[:-1]]
def poly_json(p):
    p = orient(p, 1.0)
    return {"outer": ring(p.exterior.coords), "holes": [ring(i.coords) for i in p.interiors]}

OVERRIDES = os.path.join(HERE, "overrides.json")
PITCHED = {"gabled", "hipped", "pyramidal", "skillion", "gambrel", "mansard", "half-hipped", "saltbox", "round", "dome", "onion"}
ATTRS = [("roof_shape", "roofShape"), ("roof_height", "roofHeight"), ("facade_material", "facadeMaterial"),
         ("facade_color", "facadeColor"), ("roof_material", "roofMaterial"), ("roof_color", "roofColor")]
# Sanity expectations for the validation table: name -> (min, max) tallest volume, meters.
EXPECT = {"University Hall": (100, 107), "Science & Engineering Offices": (45, 52), "Behavioral Sciences Building": (14, 21),
          "Richard J. Daley Library": (17, 21), "Student Center East": (15, 20), "Credit Union 1 Arena": (12.5, 16),
          "Academic and Residential Complex": (32, 37), "Computer Design Research and Learning Center": (20, 28)}


def lidar_dataset():
    import lidar
    return lidar.DATASET


def load_overrides():
    with open(OVERRIDES) as f:
        return json.load(f)["buildings"]


def overture_height(it, parent):
    if it.get("height"): return float(it["height"]), "overture"
    if it.get("num_floors"): return it["num_floors"] * 3.6, "floors"
    if it is not parent and parent.get("height"): return float(parent["height"]), "overture"
    if parent.get("num_floors"): return parent["num_floors"] * 3.6, "floors"
    return 6.0, "default"


def build_buildings(clip, idx):
    """Return (volumes, stats, report). One building may become several non-overlapping volumes."""
    import heights as H
    overrides = load_overrides()
    street = H.StreetLevel(idx) if idx is not None else None
    parts_by = {}
    for p in rows("building_part"): parts_by.setdefault(p["building_id"], []).append(p)
    vols, stats, report = [], {}, []
    for r in rows("building"):
        if r.get("is_underground"): continue
        name = (r.get("names") or {}).get("primary")
        landmark = LANDMARKS.get(name)
        ov = next((o for o in overrides if o.get("id") == r["id"] or (name and o.get("name") == name)), None)
        foot = to_plan(wkb.loads(r["geometry"])).intersection(clip)
        if foot.is_empty or foot.area < 4: continue
        # 1. parts (or the building itself) with Overture heights, attributes, overrides
        items = parts_by.get(r["id"]) if r.get("has_parts") else None
        parts = []
        for k, it in enumerate(items or [r]):
            h, src = overture_height(it, r)
            mh = float(it.get("min_height") or 0.0)
            floors = it.get("num_floors") or (None if items else r.get("num_floors"))
            if ov:
                o = ov.get("byFloors", {}).get(str(floors)) or ({"height": ov["height"], "floors": ov.get("floors")} if "height" in ov else None)
                if o: h, src, floors = o["height"], "override", o.get("floors", floors)
            if h - mh < 0.5: continue
            g = to_plan(wkb.loads(it["geometry"])).intersection(clip)
            attrs = {}
            for ok_, jk in ATTRS:
                v = it.get(ok_) if it.get(ok_) is not None else r.get(ok_)
                if v is not None: attrs[jk] = v
            for p in polys(g):
                if p.area >= 2: parts.append({"poly": p, "height": h, "minHeight": mh, "floors": floors, "srcName": src, "src": k, "attrs": attrs, "ovH": h})
        if items:  # footprint area not covered by any part keeps the building's own height
            rest = foot.difference(unary_union([p["poly"] for p in parts])) if parts else foot
            h, src = (float(r["height"]), "overture") if r.get("height") else (max([p["height"] for p in parts] or [6.0]), "overture")
            for p in polys(rest):
                if p.area >= 20 and p.area > 0.03 * foot.area:
                    parts.append({"poly": p, "height": h, "minHeight": 0.0, "floors": r.get("num_floors"), "srcName": src, "src": -1, "attrs": {}, "ovH": h})
        if not parts: continue
        faces = H.flatten_parts(parts)
        # 2. LiDAR per face
        g0 = H.ground_level(idx, unary_union([f["poly"] for f in faces]), street) if idx is not None else None
        use_lidar = g0 is not None and not (ov and ov.get("notInLidar"))
        final = []
        rep = {"name": name, "id": r["id"], "overture": max(p["ovH"] for p in parts), "lidar": None, "existed": None}
        for f in faces:
            poly, h, src = f["poly"], f["height"], f["srcName"]
            pitched = f["attrs"].get("roofShape") in PITCHED
            if not use_lidar:
                final.append(dict(f, height=h, heightSource=src)); continue
            x, y, z = H.roof_samples(idx, poly, g0)
            existed = H.existed_in_scan(x, y, z, poly)
            lh = H.roof_height(z, 97 if pitched else H.ROOF_PCT) if existed else None
            if existed: rep["lidar"] = max(rep["lidar"] or 0, lh)
            rep["existed"] = bool(rep["existed"]) or existed
            if existed and H.rebuilt_after_scan(h, src, f.get("floors"), lh):
                existed, lh = False, None
                rep["rebuilt"] = True
            tiers = None
            if existed and not landmark and f["minHeight"] < 0.5 and not pitched:
                tiers = H.split_tiers(poly, x, y, z)
            if tiers:
                for tp, th in tiers:
                    final.append(dict(f, poly=tp, height=max(th, H.MIN_HEIGHT), heightSource="lidar", tier=True))
                continue
            ch, csrc = H.choose_height(h, src, lh, existed, f.get("floors"))
            if f["minHeight"] > 0.5 and ch < f["minHeight"] + 1.0: ch, csrc = h, src  # floating part: keep Overture
            if pitched and existed and "roofHeight" not in f["attrs"]:
                f = dict(f, attrs=dict(f["attrs"], roofHeight=round(float(np.clip(np.percentile(z, 97) - np.percentile(z, 10), 1.0, 0.5 * ch)), 1)))
            final.append(dict(f, height=ch, heightSource=csrc))
        # 3. merge neighbors that ended up at (almost) the same height
        merged = H.merge_faces([dict(f, src=f["heightSource"]) for f in final], tol=0.8, keys=("height", "minHeight", "src"))
        many = len(merged) > 1
        for k, f in enumerate(sorted(merged, key=lambda f: -f["poly"].area)):
            h = f["height"]; fl = f.get("floors")
            if fl and not (2.6 <= (h - f["minHeight"]) / fl <= 6.5): fl = None
            b = {"id": r["id"] + (f"#{k}" if many else ""), "buildingId": r["id"], "name": name, "kind": r.get("class"),
                 "height": round(h, 2), "minHeight": round(f["minHeight"], 2), "floors": fl,
                 "heightSource": f["heightSource"], "footprint": poly_json(f["poly"])}
            b.update(f["attrs"])
            if landmark: b["landmark"] = landmark
            vols.append(b)
            stats[f["heightSource"]] = stats.get(f["heightSource"], 0) + 1
        rep["chosen"] = max(f["height"] for f in merged)
        rep["sources"] = sorted({f["heightSource"] for f in merged})
        rep["volumes"] = len(merged)
        report.append(rep)
    return vols, stats, report


def print_validation(report):
    named = sorted([r for r in report if r["name"]], key=lambda r: -r["chosen"])
    print(f"\n{'building':44s} {'overture':>8s} {'lidar':>7s} {'chosen':>7s} vols  source        check")
    bad = []
    for r in named:
        lo_hi = EXPECT.get(r["name"])
        chk = "" if not lo_hi else ("OK" if lo_hi[0] <= r["chosen"] <= lo_hi[1] else "CHECK!")
        if chk == "CHECK!": bad.append(r["name"])
        li = f"{r['lidar']:7.1f}" if r["lidar"] is not None else ("  (new)" if r["existed"] is False else "      -")
        print(f"{r['name'][:44]:44s} {r['overture']:8.1f} {li} {r['chosen']:7.1f} {r['volumes']:4d}  {','.join(r['sources']):13s} {chk}")
    print()
    missing = [n for n in EXPECT if n not in {r["name"] for r in named}]
    if missing: print("WARNING: expected buildings not found:", missing)
    if bad: print("WARNING: heights outside expected range:", bad)


WIDTH = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 11, "tertiary": 9, "residential": 7, "unclassified": 6,
         "service": 4.5, "unknown": 4, "living_street": 6, "footway": 2.4, "pedestrian": 4, "cycleway": 2, "path": 1.8, "steps": 2.4}
WALK = {"footway", "pedestrian", "cycleway", "path", "steps"}
STREET = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
GREEN = {"grass", "park", "garden", "recreation_ground", "grassland", "meadow", "village_green"}


def build_trees(mapped, idx, clip, built, road):
    """Mapped trees + treetops found in the LiDAR canopy. Trees inside today's buildings or roads are dropped."""
    import shapely
    if idx is None:
        return [{"p": [round(x, 2), round(y, 2)], "height": 9.0} for x, y in mapped]
    import heights as H, trees as T
    street = H.StreetLevel(idx)
    m = np.isin(idx.cls, T.VEG_CLASSES)
    x, y, z = idx.x[m], idx.y[m], idx.z[m]
    # ground per point from the 25 m street-level cell grid (nearest cell median)
    cell = street.cell
    gmap = {(int(i), int(j)): float(v) for i, j, v in zip(street.ci, street.cj, street.cz)}
    gi = np.floor(x / cell).astype(np.int64); gj = np.floor(y / cell).astype(np.int64)
    base = np.median(street.cz)
    g = np.array([gmap.get((a, b), base) for a, b in zip(gi.tolist(), gj.tolist())], np.float32)
    chm, x0, y0 = T.canopy_height_model(x, y, np.clip(z - g, 0, 60))
    tx, ty, th = T.tree_tops(chm, x0, y0)
    tx, ty, th = T.dedupe(tx, ty, th, 3.0)
    ok = (shapely.contains_xy(clip, tx, ty) & ~shapely.contains_xy(built.buffer(2.0), tx, ty)
          & ~shapely.contains_xy(road.buffer(-0.5), tx, ty) & (th <= T.MAX_TREE_H))
    tx, ty, th = tx[ok], ty[ok], th[ok]
    mapped = [p for p in mapped if not built.contains(Point(p))]
    res = T.merge_mapped(mapped, tx, ty, th, chm=(chm, x0, y0))
    n = {}
    for *_, src in res: n[src] = n.get(src, 0) + 1
    print(f"trees: {len(res)} ({n})")
    return [{"p": [round(a, 2), round(b, 2)], "height": round(h, 1)} for a, b, h, _ in res]


def street_lamps(road_lines, existing, built, road, clip, spacing=34.0):
    """Chicago streets have a lamp pole every ~30-40 m, alternating sides, just behind the curb."""
    from shapely.geometry import LineString
    have = [Point(p) for p in existing]
    out = []
    for rl in road_lines:
        if rl["kind"] not in STREET or len(rl["points"]) < 2: continue
        line = LineString(rl["points"])
        if line.length < 20: continue
        off = rl["width"] / 2 + 0.7
        for k, d in enumerate(np.arange(spacing / 2, line.length - 8, spacing)):
            side = 1 if k % 2 == 0 else -1
            a = line.interpolate(d); b = line.interpolate(min(d + 1, line.length))
            dx, dy = b.x - a.x, b.y - a.y; L = math.hypot(dx, dy) or 1
            p = Point(a.x - side * dy / L * off, a.y + side * dx / L * off)
            if not clip.contains(p) or built.buffer(1.0).contains(p) or road.contains(p): continue
            if any(p.distance(q) < 12 for q in have): continue
            have.append(p); out.append([round(p.x, 2), round(p.y, 2)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download the Overture layers")
    ap.add_argument("--offline", action="store_true", help="fail instead of downloading anything missing")
    ap.add_argument("--no-lidar", action="store_true", help="skip LiDAR heights (Overture/floors only)")
    a = ap.parse_args()
    if not a.offline: fetch(a.refresh)
    S, W, N, E = PLAY_BBOX
    clip = to_plan(box(W, S, E, N))
    out = {"version": 1, "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "origin": {"lat": ORIGIN[0], "lon": ORIGIN[1]},
           "bounds": dict(zip(["minX", "minY", "maxX", "maxY"], [round(v, 1) for v in clip.bounds])),
           "buildings": [], "surfaces": {k: [] for k in ["road", "sidewalk", "plaza", "grass", "pitch", "water", "parking"]},
           "roadLines": [], "trees": [], "props": {k: [] for k in ["bench", "streetLamp", "wasteBasket", "bicycleParking", "busStop"]},
           "attribution": ["© OpenStreetMap contributors (ODbL)", f"Overture Maps Foundation, release {OVERTURE_RELEASE}"]}

    # --- buildings (Overture footprints/parts + LiDAR heights + overrides) ---
    idx = None
    if not a.no_lidar:
        import lidar
        idx = lidar.PointIndex(lidar.load_points(os.path.join(CACHE, "lidar"), PLAY_BBOX, ORIGIN, offline=a.offline))
    out["buildings"], stats, report = build_buildings(clip, idx)
    out["attribution"].append(f"USGS 3DEP LiDAR {lidar_dataset()} (public domain) for building heights")
    print_validation(report)

    # --- roads / sidewalks ---
    acc = {"road": [], "sidewalk": []}
    for r in rows("segment"):
        if r["subtype"] != "road": continue
        c = r["class"] or "unknown"; w = WIDTH.get(c, 4)
        g = to_plan(wkb.loads(r["geometry"])).intersection(clip)
        if g.is_empty: continue
        kind = "sidewalk" if c in WALK else "road"
        acc[kind].append(g.buffer(w / 2, cap_style=2 if kind == "road" else 1, join_style=1))
        name = (r.get("names") or {}).get("primary")
        for line in getattr(g, "geoms", [g]):
            if line.geom_type == "LineString":
                rl = {"kind": c, "width": w, "points": [[round(x, 2), round(y, 2)] for x, y in line.coords]}
                if name: rl["name"] = name
                out["roadLines"].append(rl)
    raw = {"road": unary_union(acc["road"]), "sidewalk": unary_union(acc["sidewalk"])}

    # --- land use / water ---
    land = {k: [] for k in ["plaza", "parking", "pitch", "water", "grass"]}
    for r in rows("land_use"):
        c = r["class"]
        kind = "grass" if c in GREEN else "pitch" if c == "pitch" else "plaza" if c in ("plaza", "pedestrian") else "parking" if c == "parking" else None
        if kind: land[kind].append(make_valid(to_plan(wkb.loads(r["geometry"]))).intersection(clip))
    for r in rows("infrastructure"):  # parking lots are in the infrastructure layer
        if r["class"] == "parking":
            land["parking"].append(make_valid(to_plan(wkb.loads(r["geometry"]))).intersection(clip))
    for r in rows("water"):
        land["water"].append(make_valid(to_plan(wkb.loads(r["geometry"]))).intersection(clip))
    for k, v in land.items(): raw[k] = unary_union([unary_union(polys(g)) for g in v]) if v else Polygon()

    # --- make surfaces mutually exclusive (no overlaps -> no z-fighting) and fill the rest with grass ---
    built = unary_union([make_valid(Polygon(b["footprint"]["outer"])) for b in out["buildings"] if b["minHeight"] < 0.5]).buffer(0)
    taken = Polygon()
    for kind in ["road", "sidewalk", "plaza", "parking", "pitch", "water", "grass"]:
        g = raw[kind].intersection(clip).difference(taken)
        if kind != "road": g = g.difference(built)
        taken = taken.union(raw[kind].intersection(clip))
        if kind == "grass":  # yards, parkways, unmapped open space
            g = g.union(clip.difference(taken.union(built)))
        g = g.buffer(0).simplify(0.15)
        out["surfaces"][kind] = [poly_json(p) for p in polys(g) if p.area > 1.0]

    # --- trees: mapped trees + LiDAR canopy tops ---
    mapped = []
    for r in rows("land"):
        if r["subtype"] == "tree":
            g = to_plan(wkb.loads(r["geometry"]))
            if isinstance(g, Point) and clip.contains(g): mapped.append((g.x, g.y))
    out["trees"] = build_trees(mapped, idx, clip, built, raw["road"])

    # --- props ---
    PROP = {"bench": "bench", "street_lamp": "streetLamp", "waste_basket": "wasteBasket", "bicycle_parking": "bicycleParking", "bus_stop": "busStop"}
    for r in rows("infrastructure"):
        k = PROP.get(r["class"])
        if not k: continue
        g = to_plan(wkb.loads(r["geometry"]))
        g = g if isinstance(g, Point) else g.centroid
        if clip.contains(g): out["props"][k].append([round(g.x, 2), round(g.y, 2)])
    extra = street_lamps(out["roadLines"], out["props"]["streetLamp"], built, raw["road"], clip)
    out["props"]["streetLamp"] += extra
    print(f"added {len(extra)} street lamps along streets (Chicago spacing)")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(out, f, separators=(",", ":"))
    found = sorted({b["landmark"] for b in out["buildings"] if b.get("landmark")})
    print(f"wrote {OUT}: {len(out['buildings'])} building volumes (height sources {stats}), "
          f"{len(out['surfaces']['road'])} road / {len(out['surfaces']['sidewalk'])} sidewalk polys, "
          f"{len(out['trees'])} trees, props { {k: len(v) for k, v in out['props'].items()} }, landmarks {found}, "
          f"{os.path.getsize(OUT)//1024} KB")
    missing = set(LANDMARKS.values()) - set(found)
    if missing: sys.exit(f"ERROR: landmark footprints not found: {missing}")

if __name__ == "__main__": main()
