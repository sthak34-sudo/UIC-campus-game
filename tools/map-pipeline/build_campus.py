"""Build client/public/data/campus.json from Overture Maps (which includes OpenStreetMap data).

Usage:  python3 tools/map-pipeline/build_campus.py [--refresh]
  Downloads (once, cached in tools/map-pipeline/cache/) the Overture layers for the campus area,
  converts them to plan coordinates (meters, x=east, y=north; see client/src/core/geo.ts) and writes
  the format described in client/src/core/campusData.ts.
"""
import argparse, json, math, os, sys, datetime
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.affinity import affine_transform
from shapely.ops import unary_union
from shapely.geometry.polygon import orient

HERE = os.path.dirname(os.path.abspath(__file__))
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

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--refresh", action="store_true"); a = ap.parse_args()
    fetch(a.refresh)
    S, W, N, E = PLAY_BBOX
    clip = to_plan(box(W, S, E, N))
    out = {"version": 1, "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "origin": {"lat": ORIGIN[0], "lon": ORIGIN[1]},
           "bounds": dict(zip(["minX", "minY", "maxX", "maxY"], [round(v, 1) for v in clip.bounds])),
           "buildings": [], "surfaces": {k: [] for k in ["road", "sidewalk", "plaza", "grass", "pitch", "water", "parking"]},
           "roadLines": [], "trees": [], "props": {k: [] for k in ["bench", "streetLamp", "wasteBasket", "bicycleParking", "busStop"]},
           "attribution": ["© OpenStreetMap contributors (ODbL)", f"Overture Maps Foundation, release {OVERTURE_RELEASE}"]}

    # --- buildings (use building parts when a building has them) ---
    parts_by = {}
    for p in rows("building_part"): parts_by.setdefault(p["building_id"], []).append(p)
    stats = {}
    for r in rows("building"):
        if r.get("is_underground"): continue
        name = (r.get("names") or {}).get("primary")
        landmark = LANDMARKS.get(name)
        items = parts_by.get(r["id"]) if r.get("has_parts") else None
        for idx, it in enumerate(items or [r]):
            if it.get("height"): h, src = it["height"], "overture"
            elif it.get("num_floors"): h, src = it["num_floors"] * 3.6, "floors"
            elif it is not r and r.get("height"): h, src = r["height"], "overture"
            else: h, src = 6.0, "default"
            mh = it.get("min_height") or 0.0
            if h - mh < 0.5: continue
            g = to_plan(wkb.loads(it["geometry"])).intersection(clip)
            for k, p in enumerate(polys(g)):
                if p.area < 4: continue
                stats[src] = stats.get(src, 0) + 1
                b = {"id": r["id"] + (f"#{idx}" if items else "") + (f".{k}" if k else ""), "name": name, "kind": r.get("class"),
                     "height": round(h, 2), "minHeight": round(mh, 2), "floors": it.get("num_floors") or r.get("num_floors"),
                     "heightSource": src, "footprint": poly_json(p)}
                if landmark: b["landmark"] = landmark
                out["buildings"].append(b)

    # --- roads / sidewalks ---
    WIDTH = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 11, "tertiary": 9, "residential": 7, "unclassified": 6,
             "service": 4.5, "unknown": 4, "living_street": 6, "footway": 2.4, "pedestrian": 4, "cycleway": 2, "path": 1.8, "steps": 2.4}
    WALK = {"footway", "pedestrian", "cycleway", "path", "steps"}
    acc = {"road": [], "sidewalk": []}
    for r in rows("segment"):
        if r["subtype"] != "road": continue
        c = r["class"] or "unknown"; w = WIDTH.get(c, 4)
        g = to_plan(wkb.loads(r["geometry"])).intersection(clip)
        if g.is_empty: continue
        kind = "sidewalk" if c in WALK else "road"
        acc[kind].append(g.buffer(w / 2, cap_style=2 if kind == "road" else 1, join_style=1))
        for line in getattr(g, "geoms", [g]):
            if line.geom_type == "LineString":
                out["roadLines"].append({"kind": c, "width": w, "points": [[round(x, 2), round(y, 2)] for x, y in line.coords]})
    road_u = unary_union(acc["road"]).simplify(0.15)
    walk_u = unary_union(acc["sidewalk"]).difference(road_u).simplify(0.15)
    out["surfaces"]["road"] = [poly_json(p) for p in polys(road_u)]
    out["surfaces"]["sidewalk"] = [poly_json(p) for p in polys(walk_u)]

    # --- land use / water ---
    GREEN = {"grass", "park", "garden", "recreation_ground", "grassland", "meadow", "village_green"}
    for r in rows("land_use"):
        c = r["class"]
        kind = "grass" if c in GREEN else "pitch" if c == "pitch" else "plaza" if c in ("plaza", "pedestrian") else "parking" if c == "parking" else None
        if not kind: continue
        out["surfaces"][kind] += [poly_json(p) for p in polys(to_plan(wkb.loads(r["geometry"])).intersection(clip)) if p.area > 2]
    for r in rows("water"):
        out["surfaces"]["water"] += [poly_json(p) for p in polys(to_plan(wkb.loads(r["geometry"])).intersection(clip)) if p.area > 2]

    # --- trees & props ---
    for r in rows("land"):
        if r["subtype"] == "tree":
            g = to_plan(wkb.loads(r["geometry"]))
            if isinstance(g, Point) and clip.contains(g):
                out["trees"].append({"p": [round(g.x, 2), round(g.y, 2)], "height": 9.0})
    PROP = {"bench": "bench", "street_lamp": "streetLamp", "waste_basket": "wasteBasket", "bicycle_parking": "bicycleParking", "bus_stop": "busStop"}
    for r in rows("infrastructure"):
        k = PROP.get(r["class"])
        if not k: continue
        g = to_plan(wkb.loads(r["geometry"]))
        g = g if isinstance(g, Point) else g.centroid
        if clip.contains(g): out["props"][k].append([round(g.x, 2), round(g.y, 2)])

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
