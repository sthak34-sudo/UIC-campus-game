"""Tests for the LiDAR height logic. Run:  python3 -m pytest tools/map-pipeline  (or python3 this_file)."""
import os, sys

import numpy as np
from shapely.geometry import box

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heights as H  # noqa: E402
from lidar import PointIndex  # noqa: E402

RNG = np.random.default_rng(7)


def grid_points(poly, z, density=10.0, cls=6, noise=0.1):
    x0, y0, x1, y1 = poly.bounds
    n = int(poly.area * density)
    x = RNG.uniform(x0, x1, n); y = RNG.uniform(y0, y1, n)
    import shapely
    m = shapely.contains_xy(poly, x, y)
    zz = (z(x, y) if callable(z) else np.full(n, z)) + RNG.normal(0, noise, n)
    return x[m], y[m], zz[m], np.full(m.sum(), cls, np.uint8)


def make_index(*chunks):
    x, y, z, c = (np.concatenate(a) for a in zip(*chunks))
    return PointIndex({"x": x.astype(np.float32), "y": y.astype(np.float32), "z": z.astype(np.float32), "cls": c})


def part(poly, h, mh=0.0, src=0):
    return {"poly": poly, "height": h, "minHeight": mh, "src": src, "attrs": {}}


def test_flatten_podium_and_tower():
    podium = box(0, 0, 40, 40); tower = box(10, 10, 20, 20)
    faces = H.flatten_parts([part(podium, 10, src=0), part(tower, 30, src=1)])
    assert len(faces) == 2
    assert abs(sum(f["poly"].area for f in faces) - 1600) < 1e-6
    by_h = {f["height"]: f["poly"].area for f in faces}
    assert by_h == {10: 1500.0, 30: 100.0}
    # non-overlapping
    assert faces[0]["poly"].intersection(faces[1]["poly"]).area < 1e-6


def test_flatten_stacked_and_floating():
    base = box(0, 0, 30, 10); upper = box(0, 0, 30, 10); bridge = box(30, 2, 40, 6)
    faces = H.flatten_parts([part(base, 9, 0, 0), part(upper, 12, 9, 1), part(bridge.union(box(0, 0, 30, 10)), 13, 12, 2)])
    ground = [f for f in faces if f["minHeight"] == 0]
    floating = [f for f in faces if f["minHeight"] > 0]
    assert len(ground) == 1 and ground[0]["height"] == 13 and abs(ground[0]["poly"].area - 300) < 1e-6
    assert len(floating) == 1 and floating[0]["minHeight"] == 12 and abs(floating[0]["poly"].area - 40) < 1e-6


def test_lidar_height_ground_and_existence():
    foot = box(0, 0, 30, 20)
    ground = box(-20, -20, 50, 40).difference(foot)
    idx = make_index(grid_points(ground, 180.0, cls=2), grid_points(foot, 180.0 + 12.0))
    g0 = H.ground_level(idx, foot)
    assert abs(g0 - 180.0) < 0.05
    x, y, z = H.roof_samples(idx, foot, g0)
    assert H.existed_in_scan(x, y, z, foot)
    assert abs(H.roof_height(z) - 12.0) < 0.3
    # an empty lot (only ground points) did not exist in the scan
    idx2 = make_index(grid_points(box(-20, -20, 50, 40), 180.0, cls=2))
    x, y, z = H.roof_samples(idx2, foot, 180.0)
    assert not H.existed_in_scan(x, y, z, foot)


def test_street_level_clamps_trench_ground():
    foot = box(0, 0, 10, 10)
    street = box(-200, -200, 200, 200).difference(box(-30, -200, 30, 200))  # 60 m wide trench
    trench = box(-30, -200, 30, 200)
    idx = make_index(grid_points(street, 181.0, density=0.5, cls=2), grid_points(trench, 175.0, density=2, cls=2))
    sl = H.StreetLevel(idx)
    g = H.ground_level(idx, foot, sl)
    assert g >= 181.0 - 1.5 - 0.05


def test_split_tiers_two_levels():
    face = box(0, 0, 40, 30)
    x, y, z, _ = grid_points(face, lambda x, y: np.where(x < 20, 8.0, 20.0))
    tiers = H.split_tiers(face, x, y, z)
    assert tiers is not None and len(tiers) == 2
    tiers.sort(key=lambda t: t[1])
    (lo, hlo), (hi, hhi) = tiers
    assert abs(hlo - 8.0) < 0.5 and abs(hhi - 20.0) < 0.5
    assert abs(lo.area - 600) < 40 and abs(hi.area - 600) < 40
    assert lo.intersection(hi).area < 1.0


def test_split_tiers_ignores_small_penthouse():
    face = box(0, 0, 40, 30)
    x, y, z, _ = grid_points(face, lambda x, y: np.where((x > 18) & (x < 24) & (y > 12) & (y < 18), 22.0, 18.0))
    assert H.split_tiers(face, x, y, z) is None
    assert abs(H.roof_height(z) - 18.0) < 0.5  # p90 ignores the 3 % penthouse


def test_choose_height():
    assert H.choose_height(7.0, "overture", 13.6, True) == (13.6, "lidar")          # arena: LiDAR fixes Overture
    assert H.choose_height(36.0, "floors", None, False) == (36.0, "floors")         # built after 2017
    assert H.choose_height(68.8, "floors", 12.2, True, 19) == (68.8, "floors")      # rebuilt taller since 2017
    assert H.choose_height(24.7, "overture", 11.6, True, 8) == (24.7, "overture")   # plausible 8-floor rebuild
    assert H.choose_height(21.1, "overture", 13.8, True, 2) == (13.8, "lidar")      # wrong Overture height
    assert H.choose_height(6.0, "default", 2.0, True) == (H.MIN_HEIGHT, "lidar")


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
