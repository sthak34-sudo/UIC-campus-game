#!/usr/bin/env python3
"""Generates the game's tileable PBR surface textures (self-made, CC0).

    python3 tools/textures/generate.py [--only concrete,brick] [--preview out.jpg]

Writes into client/public/textures/<material>/ (only the sets in IN_USE by default):
    albedo.jpg  sRGB base color
    normal.jpg  tangent-space normal map (OpenGL convention, +Y = up the texture / +V)
    orm.jpg     R = ambient occlusion, G = roughness, B = metalness (three.js channel layout)

Every texture is seamlessly tileable: all noise is synthesised in the frequency domain
(periodic by construction) and every stamped / drawn feature wraps around the edges.
The physical tile size of each texture (meters) is recorded in TILE_METERS below and must
match TILE in client/src/render/materials.ts (UVs are in meters, so repeat = 1 / tile size).

Only numpy + Pillow are needed. Deterministic (fixed seeds).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFile, ImageFilter

ImageFile.MAXBLOCK = 1 << 24  # avoids "Suspension not allowed here" with optimize=True

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client' / 'public' / 'textures'

# name -> (width m, height m, width px, height px)
TILE_METERS: dict[str, tuple[float, float, int, int]] = {
    'concrete': (2.4, 2.4, 1024, 1024),
    'concreteSmooth': (2.0, 2.0, 1024, 1024),
    'brick': (1.76, 1.20, 1024, 704),
    'asphalt': (4.0, 4.0, 1024, 1024),
    'sidewalk': (3.0, 3.0, 1024, 1024),
    'plaza': (2.4, 2.4, 1024, 1024),
    'grass': (2.0, 2.0, 1024, 1024),
    'soil': (1.5, 1.5, 512, 512),
    'roof': (2.0, 2.0, 512, 512),
    'interiorWall': (2.0, 2.0, 512, 512),
    'interiorFloor': (2.0, 2.0, 512, 512),
    'interiorCeiling': (1.22, 1.22, 512, 512),
    'wood': (1.0, 1.0, 512, 512),
    'fabric': (0.2, 0.2, 256, 256),
    'metal': (1.0, 1.0, 256, 256),
    'water': (4.0, 4.0, 512, 512),
    'foliage': (1.5, 1.5, 512, 512),
    'bark': (1.0, 2.0, 256, 512),
    'macro': (1.0, 1.0, 512, 512),  # unitless; sampled in world space by the shader
}

# ----------------------------------------------------------------------------------------
# noise / image helpers (all periodic)


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def _freqs(h: int, w: int):
    fy = np.fft.fftfreq(h)[:, None] * h  # cycles per tile
    fx = np.fft.fftfreq(w)[None, :] * w
    return fx, fy


def noise(h, w, beta=2.0, seed=0, fmin=0.0, fmax=None, ax=1.0, ay=1.0):
    """Periodic 1/f^beta noise, zero mean, unit std. ax/ay > 1 squash frequencies along that axis
    (ax big -> features elongated along x). fmin/fmax in cycles per tile."""
    r = rng(seed)
    white = r.standard_normal((h, w))
    fx, fy = _freqs(h, w)
    f = np.sqrt((fx * ax) ** 2 + (fy * ay) ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    if fmin:
        amp *= 1.0 / (1.0 + (fmin / f) ** 4)
    if fmax:
        amp *= 1.0 / (1.0 + (f / fmax) ** 4)
    amp[0, 0] = 0.0
    n = np.real(np.fft.ifft2(np.fft.fft2(white) * amp))
    return (n - n.mean()) / (n.std() + 1e-9)


def blur(img, sigma_px):
    """Periodic gaussian blur via FFT. Works on HxW or HxWxC."""
    if sigma_px <= 0:
        return img
    h, w = img.shape[:2]
    fx, fy = _freqs(h, w)
    g = np.exp(-2 * (math.pi ** 2) * sigma_px ** 2 * ((fx / w) ** 2 + (fy / h) ** 2))
    if img.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(img) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(img[..., c]) * g)) for c in range(img.shape[2])], -1)


def unit(n):
    lo, hi = np.percentile(n, 0.5), np.percentile(n, 99.5)
    return np.clip((n - lo) / (hi - lo + 1e-9), 0, 1)


def worley(h, w, gx, gy, seed=0, jitter=0.9):
    """Periodic jittered-grid Worley noise. Returns F1, F2 (in px) and the cell id of F1."""
    r = rng(seed)
    cw, ch = w / gx, h / gy
    jit = 0.5 + (r.random((gy, gx, 2)) - 0.5) * jitter
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = np.floor(xs / cw).astype(int)
    cy = np.floor(ys / ch).astype(int)
    f1 = np.full((h, w), 1e9, np.float32)
    f2 = np.full((h, w), 1e9, np.float32)
    cid = np.zeros((h, w), np.int64)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx, ny = cx + dx, cy + dy
            jx = jit[ny % gy, nx % gx, 0]
            jy = jit[ny % gy, nx % gx, 1]
            px = (nx + jx) * cw
            py = (ny + jy) * ch
            d = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)
            ids = (ny % gy) * gx + (nx % gx)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, ids, cid)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid


def stamp(field, cx, cy, radius, fn, mode='min'):
    """Stamp a radial profile fn(d/radius) (d<radius) into field with wrap-around."""
    h, w = field.shape
    R = int(math.ceil(radius)) + 1
    ys, xs = np.mgrid[-R:R + 1, -R:R + 1]
    xi = (int(round(cx)) + xs) % w
    yi = (int(round(cy)) + ys) % h
    d = np.sqrt((xs + round(cx) - cx) ** 2 + (ys + round(cy) - cy) ** 2) / max(radius, 1e-6)
    m = d < 1
    vals = fn(np.clip(d, 0, 1))
    cur = field[yi[m], xi[m]]
    if mode == 'min':
        field[yi[m], xi[m]] = np.minimum(cur, vals[m])
    elif mode == 'max':
        field[yi[m], xi[m]] = np.maximum(cur, vals[m])
    elif mode == 'add':
        np.add.at(field, (yi[m], xi[m]), vals[m])


def wrapped_draw(size, draw_fn, mode='L', fill=0):
    """Draw with PIL on a canvas; anything crossing an edge is repeated at the opposite edge."""
    w, h = size
    img = Image.new(mode, (w, h), fill)
    d = ImageDraw.Draw(img)
    for oy in (-h, 0, h):
        for ox in (-w, 0, w):
            draw_fn(d, ox, oy)
    return img


def normal_from_height(hm, px_m, strength=1.0):
    """hm in meters, px_m = pixel size in meters. OpenGL convention (+Y = +V = up the image)."""
    dx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / (2 * px_m)
    dy = (np.roll(hm, 1, 0) - np.roll(hm, -1, 0)) / (2 * px_m)
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(hm)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def ao_from_height(hm, px_m, radius_m, strength):
    """Cheap cavity AO: how far a point sits below its blurred neighbourhood."""
    sig = max(radius_m / px_m, 1.0)
    cav = blur(hm, sig) - hm
    cav2 = blur(hm, sig * 3) - hm
    ao = 1.0 - np.clip(cav / radius_m * strength + cav2 / (radius_m * 3) * strength * 0.5, 0, 1)
    return np.clip(ao, 0, 1)


def srgb(c):
    return np.asarray(c, np.float32) / 255.0


def to_lin(s):
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def save(name, albedo=None, normal=None, ao=None, rough=None, metal=None, *, q=88):
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    info = {}
    if albedo is not None:
        a = np.clip(albedo, 0, 1)
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGB').save(d / 'albedo.jpg', quality=q, subsampling=2, optimize=True)
        info['meanLinearAlbedo'] = float(to_lin(a).mean())
    if normal is not None:
        n = (normal * 0.5 + 0.5)
        Image.fromarray((np.clip(n, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(d / 'normal.jpg', quality=90, subsampling=0, optimize=True)
    if rough is not None:
        h, w = rough.shape
        o = np.ones((h, w)) if ao is None else ao
        m = np.zeros((h, w)) if metal is None else metal
        orm = np.stack([o, rough, m], -1)
        Image.fromarray((np.clip(orm, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(d / 'orm.jpg', quality=q, subsampling=0, optimize=True)
        info['meanRoughness'] = float(rough.mean())
    return info


def colorize(base_rgb255, tone):
    """base color (sRGB 0-255) multiplied by a tone field (1 = unchanged)."""
    return srgb(base_rgb255)[None, None, :] * tone[..., None]


# ----------------------------------------------------------------------------------------
# materials


def gen_concrete():
    """Weathered board-formed cast-in-place concrete (UIC East Campus, 1960s Brutalist).
    Boards 15 cm tall run horizontally (along U); form-tie plugs on a 60 cm grid; bugholes."""
    W_M, H_M, W, H = TILE_METERS['concrete']
    px = W_M / W
    bh = H // 16  # 15 cm boards
    r = rng(11)
    ys, xs = np.mgrid[0:H, 0:W]
    board = ys // bh
    yin = ys % bh
    tone_b = r.normal(0, 0.022, 16)[board]
    depth_b = r.normal(0, 0.0006, 16)[board]
    hm = depth_b.copy()
    # wood grain imprint: strongly elongated along x, different per board via seed mixing
    grain = noise(H, W, beta=1.3, seed=12, ax=14, ay=1)
    grain2 = noise(H, W, beta=2.0, seed=13, ax=6, ay=1)
    hm += grain * 0.00018 + grain2 * 0.00025
    tone = 1 + tone_b + grain2 * 0.02 + grain * 0.01
    # board joints: thin fin of cement paste that leaked between boards
    fin_amp = np.clip(0.6 + 0.6 * noise(1, W, beta=1.5, seed=14)[0], 0, 1.4)[None, :]
    fin = np.exp(-((yin - 0.0) ** 2) / 2.0) + np.exp(-((yin - bh) ** 2) / 2.0)
    hm += fin * fin_amp * 0.0006
    tone -= fin * fin_amp * 0.012
    # butt joints (board ends) at random x per board
    for b in range(16):
        bx = r.integers(0, W)
        dx = np.minimum(np.abs(xs[b * bh:(b + 1) * bh] - bx), W - np.abs(xs[b * bh:(b + 1) * bh] - bx))
        j = np.exp(-(dx ** 2) / 2.5)
        hm[b * bh:(b + 1) * bh] += j * 0.0002
        tone[b * bh:(b + 1) * bh] -= j * 0.005
    # mottling and hydration discoloration
    mott = noise(H, W, beta=2.6, seed=15, fmin=3)
    mott2 = noise(H, W, beta=1.8, seed=16, fmin=6)
    sand = noise(H, W, beta=0.3, seed=20)
    tone += mott * 0.03 + mott2 * 0.015 + sand * 0.025
    hm += sand * 0.00008
    # bugholes (air voids): many small, few larger
    pits = np.zeros((H, W))
    n_small = int(W_M * H_M * 260)
    for _ in range(n_small):
        rad = r.uniform(0.0007, 0.0022) / px
        stamp(pits, r.uniform(0, W), r.uniform(0, H), rad, lambda d: -(1 - d ** 2) ** 2 * 0.0012, 'min')
    for _ in range(int(W_M * H_M * 4)):
        rad = r.uniform(0.0025, 0.005) / px
        stamp(pits, r.uniform(0, W), r.uniform(0, H), rad, lambda d: -(1 - d ** 2) ** 2 * 0.0025, 'min')
    hm += pits
    tone += pits / 0.0025 * 0.18  # dirt + shadow inside voids
    # form-tie holes on a 60 cm grid (plugged with slightly different grout, recessed)
    ties = np.zeros((H, W))
    tone_tie = np.zeros((H, W))
    step = int(round(0.6 / px))
    for ty in range(4):
        for tx in range(4):
            cx = tx * step + step / 2
            cy = ty * step + bh * 2 + bh / 2
            rad = 0.0125 / px
            stamp(ties, cx, cy, rad, lambda d: -0.006 * (1 - d ** 4), 'min')
            stamp(tone_tie, cx, cy, rad * 1.35, lambda d: (1 - d) * 0.1, 'max')
    hm += ties
    tone += ties / 0.006 * 0.08 - tone_tie * 0.6 + (ties < -0.001) * 0.05
    base = np.array([171, 166, 157], np.float32)
    alb = colorize(base, np.clip(tone, 0.6, 1.3))
    # slight warm/cool variation
    hue = noise(H, W, beta=2.8, seed=18, fmin=2)
    alb[..., 0] *= 1 + hue * 0.012
    alb[..., 2] *= 1 - hue * 0.016
    nrm = normal_from_height(hm, px, 1.2)
    ao = ao_from_height(hm, px, 0.002, 1.0)
    rough = np.clip(0.86 + noise(H, W, beta=1.5, seed=19) * 0.03 - fin * 0.05 + (pits < -0.0005) * 0.06, 0.6, 1)
    return save('concrete', alb, nrm, ao, rough)


def gen_concrete_smooth():
    """Precast concrete panel: smooth, light, with lightly exposed fine aggregate (University Hall)."""
    W_M, H_M, W, H = TILE_METERS['concreteSmooth']
    px = W_M / W
    r = rng(21)
    f1, f2, cid = worley(H, W, 260, 260, seed=22)
    cell_px = W / 260
    stone = np.clip(1 - f1 / (cell_px * 0.42), 0, 1)
    exposed = (r.random(260 * 260)[cid] < 0.45) * stone
    pal = srgb([[205, 200, 190], [150, 142, 132], [120, 116, 112], [190, 175, 155], [90, 88, 86]])
    pick = r.integers(0, len(pal), 260 * 260)[cid]
    matrix = srgb([188, 184, 176])[None, None, :] * (1 + noise(H, W, beta=2.5, seed=23)[..., None] * 0.04
                                                     + noise(H, W, beta=1.6, seed=24, fmin=10)[..., None] * 0.015)
    e = np.clip(exposed * 1.6, 0, 1)[..., None]
    alb = matrix * (1 - e * 0.85) + pal[pick] * e * 0.85
    hm = exposed * 0.0004 + noise(H, W, beta=2.2, seed=25) * 0.0002
    pits = np.zeros((H, W))
    for _ in range(int(W_M * H_M * 120)):
        stamp(pits, r.uniform(0, W), r.uniform(0, H), r.uniform(0.0006, 0.0018) / px, lambda d: -(1 - d ** 2) * 0.0012, 'min')
    hm += pits
    alb *= (1 + pits[..., None] / 0.0012 * 0.25)
    streak = noise(H, W, beta=1.6, seed=26, ax=1, ay=18)
    alb *= (1 - np.clip(streak - 0.7, 0, None)[..., None] * 0.04)
    nrm = normal_from_height(hm, px, 1.4)
    ao = ao_from_height(hm, px, 0.0015, 1.0)
    rough = np.clip(0.78 + noise(H, W, beta=1.5, seed=27) * 0.04 - e[..., 0] * 0.08, 0.5, 1)
    return save('concreteSmooth', alb, nrm, ao, rough)


def gen_brick():
    """Chicago face brick, running bond. 8 bricks x 16 courses per tile (22 cm x 7.5 cm modules),
    1 cm recessed light-gray mortar joints, per-brick color and texture variation."""
    W_M, H_M, W, H = TILE_METERS['brick']
    px = W_M / W
    r = rng(31)
    course_px = H // 16  # 44
    brick_px = W // 8  # 128
    mort = 6
    ys, xs = np.mgrid[0:H, 0:W]
    course = ys // course_px
    yin = ys % course_px
    xb = (xs + (course % 2) * (brick_px // 2)) % W
    bidx = xb // brick_px
    xin = xb % brick_px
    bid = course * 8 + bidx
    nb = 16 * 8
    # distance (px) from the brick's edges (negative inside mortar)
    ex = np.minimum(xin - mort, brick_px - 1 - xin)
    ey = np.minimum(yin - mort, course_px - 1 - yin)
    edge = np.minimum(ex, ey).astype(np.float32)
    rough_edge = noise(H, W, beta=1.4, seed=32) * 1.3
    inside = (edge + rough_edge) > 0
    # per-brick palette
    pal = srgb([[124, 62, 46], [108, 54, 42], [134, 72, 52], [94, 50, 44], [142, 86, 62], [82, 46, 40], [118, 66, 54], [68, 40, 36]])
    weights = np.array([0.22, 0.2, 0.14, 0.12, 0.08, 0.1, 0.1, 0.04])
    pick = r.choice(len(pal), nb, p=weights / weights.sum())
    bcol = pal[pick][bid]
    btone = (1 + r.normal(0, 0.05, nb))[bid]
    # within-brick texture: sand-struck speckle + mottling + darker flashed ends
    speck = noise(H, W, beta=0.6, seed=33)
    mot = noise(H, W, beta=2.2, seed=34, fmin=8)
    flash = np.clip(1 - np.minimum(xin, brick_px - xin) / 30.0, 0, 1) * (r.random(nb) < 0.35)[bid]
    t = btone * (1 + speck * 0.05 + mot * 0.06 - flash * 0.18)
    dark_specks = (noise(H, W, beta=0.2, seed=35) > 2.6) * 0.35
    brick_alb = bcol * (t * (1 - dark_specks))[..., None]
    mortar_alb = srgb([152, 147, 138])[None, None, :] * (1 + noise(H, W, beta=0.8, seed=36)[..., None] * 0.06
                                                          + noise(H, W, beta=2.4, seed=37)[..., None] * 0.05)
    # soot / weathering on mortar varies slowly
    mortar_alb *= (1 - np.clip(noise(H, W, beta=2.6, seed=38), 0, None)[..., None] * 0.12)
    m = inside[..., None]
    alb = np.where(m, brick_alb, mortar_alb)
    # height: bricks proud, bevelled edges, mortar recessed 5 mm with grit
    bev = np.clip((edge + rough_edge) / 3.0, 0, 1)
    tilt = (r.normal(0, 0.0004, nb))[bid]
    hm = np.where(inside, 0.0 + bev * 0.0015 + tilt + noise(H, W, beta=1.2, seed=39) * 0.00025, -0.005 + noise(H, W, beta=0.8, seed=40) * 0.0003)
    hm = blur(hm, 0.6)
    nrm = normal_from_height(hm, px, 1.3)
    ao = ao_from_height(hm, px, 0.004, 1.0)
    ao = np.where(inside, ao, ao * 0.82)
    rough = np.where(inside, 0.82 + speck * 0.03, 0.95)
    return save('brick', alb, nrm, ao, np.clip(rough, 0, 1))


def gen_asphalt():
    """Worn Chicago street asphalt: exposed aggregate, hairline cracks, tar-sealed cracks."""
    W_M, H_M, W, H = TILE_METERS['asphalt']
    px = W_M / W
    r = rng(41)
    fine = noise(H, W, beta=0.3, seed=42)
    agg = noise(H, W, beta=0.9, seed=43)
    wear = unit(noise(H, W, beta=2.4, seed=44, fmin=2))
    tone = 0.92 + fine * 0.1 + np.clip(agg, 0, None) * 0.12 * (0.5 + wear)
    stones = (noise(H, W, beta=0.4, seed=45) > 1.6)
    tone += stones * 0.25 * (0.4 + wear)
    tone *= 0.93 + 0.14 * wear
    alb = colorize([88, 87, 85], tone)
    # stones slightly tan/varied
    alb[stones] *= srgb([[255, 246, 230]])[0]
    hm = agg * 0.0006 + fine * 0.0003 + stones * 0.0008
    rough = 0.9 + fine * 0.02
    # cracks: random walks that wrap around the tile
    crack = np.zeros((H, W), np.float32)
    seal = np.zeros((H, W), np.float32)

    def walk(x, y, ang, n, seed):
        rr = rng(seed)
        pts = [(x, y)]
        for _ in range(n):
            ang += rr.normal(0, 0.35)
            step = rr.uniform(6, 14)
            x += math.cos(ang) * step
            y += math.sin(ang) * step
            pts.append((x, y))
        return pts

    cracks = []
    for i in range(4):
        cracks.append((walk(r.uniform(0, W), r.uniform(0, H), r.uniform(0, 2 * math.pi), int(r.integers(25, 70)), 400 + i), r.random() < 0.45))
    for pts, sealed in cracks:
        def dc(d, ox, oy, pts=pts):
            d.line([(p[0] + ox, p[1] + oy) for p in pts], fill=255, width=1)
        crack = np.maximum(crack, np.asarray(wrapped_draw((W, H), dc), np.float32) / 255)
        if sealed:
            def ds(d, ox, oy, pts=pts):
                d.line([(p[0] + ox, p[1] + oy) for p in pts], fill=255, width=7, joint='curve')
            seal = np.maximum(seal, np.asarray(wrapped_draw((W, H), ds).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255)
    alb = alb * (1 - crack[..., None] * 0.35)
    tar = srgb([34, 34, 35])[None, None, :]
    alb = alb * (1 - seal[..., None] * 0.9) + tar * seal[..., None] * 0.9
    hm += -crack * 0.004 + seal * 0.0008
    rough = rough - seal * 0.38
    nrm = normal_from_height(blur(hm, 0.5), px, 1.2)
    ao = ao_from_height(hm, px, 0.004, 1.0)
    return save('asphalt', alb, nrm, ao, np.clip(rough, 0, 1))


def gen_sidewalk():
    """Chicago concrete sidewalk: 1.5 m slabs (2 x 2 per tile), tooled joints, broom finish,
    per-slab tone, chewing-gum spots, one crack."""
    W_M, H_M, W, H = TILE_METERS['sidewalk']
    px = W_M / W
    r = rng(51)
    slab = W // 2
    ys, xs = np.mgrid[0:H, 0:W]
    sx, sy = xs % slab, ys % slab
    sid = (ys // slab) * 2 + (xs // slab)
    dj = np.minimum(np.minimum(sx, slab - 1 - sx), np.minimum(sy, slab - 1 - sy)).astype(np.float32)
    joint = np.clip(1 - dj / 1.6, 0, 1)
    tooled = (dj < 12) & (dj >= 2)
    stone = 1 + r.normal(0, 0.025, 4)[sid]
    broom = noise(H, W, beta=1.0, seed=52, ax=1, ay=12)  # lines along y (across walking direction x)
    mott = noise(H, W, beta=2.5, seed=53, fmin=3)
    fine = noise(H, W, beta=0.5, seed=54)
    tone = stone * (1 + mott * 0.05 + fine * 0.035 + broom * 0.02 * (~tooled))
    tone += tooled * 0.03
    # dirt collects near joints
    tone -= np.exp(-dj / 10.0) * 0.08
    tone -= joint * 0.5
    alb = colorize([176, 173, 166], tone)
    # gum spots (very Chicago)
    gum = np.zeros((H, W))
    for _ in range(int(r.integers(30, 45))):
        stamp(gum, r.uniform(0, W), r.uniform(0, H), r.uniform(0.006, 0.014) / px, lambda d: 1 - d ** 3, 'max')
    gum_col = srgb([84, 82, 80])[None, None, :]
    alb = alb * (1 - gum[..., None] * 0.85) + gum_col * gum[..., None] * 0.85
    # crack across one slab
    pts = []
    x, y, a = 40, 700, -0.25
    for _ in range(40):
        a += r.normal(0, 0.3)
        x += math.cos(a) * 12
        y += math.sin(a) * 12
        pts.append((x, y))
    crack = np.asarray(wrapped_draw((W, H), lambda d, ox, oy: d.line([(p[0] + ox, p[1] + oy) for p in pts], fill=255, width=2)), np.float32) / 255
    alb *= (1 - crack[..., None] * 0.5)
    hm = -joint * 0.006 + broom * 0.00012 * (~tooled) + fine * 0.00008 + mott * 0.0003 - crack * 0.002 + gum * 0.0004
    nrm = normal_from_height(hm, px, 1.5)
    ao = ao_from_height(hm, px, 0.003, 1.0)
    rough = 0.82 + fine * 0.02 - tooled * 0.06 - gum * 0.2
    return save('sidewalk', alb, nrm, ao, np.clip(rough, 0, 1))


def gen_plaza():
    """Thermal-finish gray granite pavers 60 x 30 cm, running bond, sand joints."""
    W_M, H_M, W, H = TILE_METERS['plaza']
    px = W_M / W
    r = rng(61)
    pw, ph = W // 4, H // 8  # 256 x 128 px
    ys, xs = np.mgrid[0:H, 0:W]
    row = ys // ph
    xr = (xs + (row % 2) * (pw // 2)) % W
    pid = row * 4 + xr // pw
    xin, yin = xr % pw, ys % ph
    edge = np.minimum(np.minimum(xin, pw - 1 - xin), np.minimum(yin, ph - 1 - yin)).astype(np.float32)
    joint = np.clip(1 - (edge - 0.5) / 1.5, 0, 1)
    # granite crystals: per-pixel speckle after a slight blur, three mineral classes
    g1 = blur(noise(H, W, beta=0.0, seed=62), 0.8)
    g2 = blur(noise(H, W, beta=0.0, seed=63), 1.1)
    base = srgb([150, 147, 143])[None, None, :] * (1 + noise(H, W, beta=1.0, seed=64)[..., None] * 0.04)
    black = (g1 > 1.0)[..., None]
    white = (g2 > 1.1)[..., None]
    pink = ((g2 < -1.3) & (g1 < 0))[..., None]
    alb = np.where(black, srgb([62, 60, 60]), base)
    alb = np.where(white, srgb([200, 198, 194]), alb)
    alb = np.where(pink, srgb([168, 140, 130]), alb)
    ptone = (1 + r.normal(0, 0.025, 32))[pid]
    phue = r.normal(0, 0.008, 32)[pid]
    alb = alb * ptone[..., None]
    alb[..., 0] *= 1 + phue
    alb[..., 2] *= 1 - phue
    # wear + dirt
    alb *= (1 + noise(H, W, beta=2.6, seed=65, fmin=3)[..., None] * 0.05)
    alb *= (1 - np.exp(-edge / 6)[..., None] * 0.1)
    sand = srgb([96, 90, 82])[None, None, :] * (1 + noise(H, W, beta=0.5, seed=66)[..., None] * 0.1)
    alb = alb * (1 - joint[..., None]) + sand * joint[..., None]
    tilt = r.normal(0, 0.0008, 32)[pid]
    bevel = np.clip(edge / 3.0, 0, 1)
    hm = np.where(joint > 0.5, -0.004, tilt + bevel * 0.0015) + noise(H, W, beta=0.6, seed=67) * 0.00015
    nrm = normal_from_height(blur(hm, 0.6), px, 1.3)
    ao = ao_from_height(hm, px, 0.003, 1.0)
    rough = np.where(joint > 0.5, 0.95, 0.72 + noise(H, W, beta=0.8, seed=68) * 0.04)
    return save('plaza', alb, nrm, ao, np.clip(rough, 0, 1))


def gen_grass():
    """Mown lawn seen from above: tens of thousands of blades over dark thatch, color patches,
    and a few fallen autumn leaves (mid-October)."""
    W_M, H_M, W, H = TILE_METERS['grass']
    px = W_M / W
    r = rng(71)
    img = Image.new('RGB', (W, H), (50, 54, 32))
    hgt = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hgt)
    patch = unit(noise(H, W, beta=2.6, seed=72, fmin=2))
    dry = unit(noise(H, W, beta=2.2, seed=73, fmin=2))
    n = 70000
    xs = r.uniform(0, W, n)
    ysb = r.uniform(0, H, n)
    order = np.arange(n) / n
    for i in range(n):
        x, y = xs[i], ysb[i]
        ang = r.uniform(0, 2 * math.pi)
        ln = r.uniform(0.012, 0.045) / px
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        lev = order[i]
        pv = patch[int(y) % H, int(x) % W]
        dv = dry[int(y) % H, int(x) % W]
        g = 62 + lev * 55 + r.normal(0, 9)
        rr_ = 48 + lev * 38 + dv * 50 + r.normal(0, 8)
        b = 26 + lev * 22 + r.normal(0, 5)
        g *= 0.85 + 0.3 * pv
        col = (int(np.clip(rr_, 0, 255)), int(np.clip(g, 0, 255)), int(np.clip(b, 0, 255)))
        wdt = 2 if r.random() < 0.6 else 3
        hv = int(60 + lev * 195)
        for oy in (-H, 0, H):
            for ox in (-W, 0, W):
                if ox == 0 and oy == 0 or (min(x, x2) + ox < W + 4 and max(x, x2) + ox > -4 and min(y, y2) + oy < H + 4 and max(y, y2) + oy > -4):
                    d.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=col, width=wdt)
                    dh.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=hv, width=wdt)
    # fallen leaves
    leaf_cols = [(176, 92, 34), (196, 146, 46), (128, 66, 32), (100, 58, 34), (160, 52, 30)]
    for _ in range(14):
        cx, cy = r.uniform(0, W), r.uniform(0, H)
        ang = r.uniform(0, math.pi)
        a, b = r.uniform(0.025, 0.045) / px, r.uniform(0.014, 0.025) / px
        col = leaf_cols[r.integers(0, len(leaf_cols))]
        pts = [(cx + math.cos(t) * a * math.cos(ang) - math.sin(t) * b * math.sin(ang),
                cy + math.cos(t) * a * math.sin(ang) + math.sin(t) * b * math.cos(ang)) for t in np.linspace(0, 2 * math.pi, 18)]
        for oy in (-H, 0, H):
            for ox in (-W, 0, W):
                d.polygon([(p[0] + ox, p[1] + oy) for p in pts], fill=col)
                dh.polygon([(p[0] + ox, p[1] + oy) for p in pts], fill=255)
    alb = np.asarray(img, np.float32) / 255
    hm = np.asarray(hgt, np.float32) / 255
    alb *= (0.9 + 0.2 * unit(noise(H, W, beta=2.0, seed=74, fmin=3)))[..., None]
    leaf = (np.abs(alb[..., 0] - alb[..., 1]) > 0.12) & (alb[..., 0] > alb[..., 1])
    hmm = hm * 0.012
    nrm = normal_from_height(blur(hmm, 0.7), px, 0.6)
    ao = np.clip(0.45 + hm * 0.6, 0, 1)
    rough = np.where(leaf, 0.7, 0.88 - hm * 0.08)
    return save('grass', alb, nrm, ao, np.clip(rough, 0, 1))


def gen_soil():
    """Shredded-hardwood mulch over soil (campus planting beds)."""
    W_M, H_M, W, H = TILE_METERS['soil']
    px = W_M / W
    r = rng(81)
    img = Image.new('RGB', (W, H), (48, 34, 24))
    hgt = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hgt)
    n = 9000
    for i in range(n):
        x, y = r.uniform(0, W), r.uniform(0, H)
        ang = r.uniform(0, math.pi * 2)
        ln = r.uniform(0.01, 0.05) / px
        lev = i / n
        base = r.uniform(0.6, 1.1) * (0.7 + lev * 0.5)
        col = tuple(int(np.clip(c * base, 0, 255)) for c in (110, 76, 50))
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        for oy in (-H, 0, H):
            for ox in (-W, 0, W):
                d.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=col, width=int(r.integers(2, 5)))
                dh.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=int(40 + lev * 215), width=3)
    alb = np.asarray(img, np.float32) / 255
    alb *= (0.85 + 0.3 * unit(noise(H, W, beta=2.2, seed=82)))[..., None]
    hm = np.asarray(hgt, np.float32) / 255 * 0.008
    nrm = normal_from_height(blur(hm, 0.6), px, 0.8)
    ao = np.clip(0.4 + hm / 0.008 * 0.6, 0, 1)
    rough = np.full((H, W), 0.92)
    return save('soil', alb, nrm, ao, rough)


def gen_roof():
    """Ballasted flat roof: river-gravel over membrane."""
    W_M, H_M, W, H = TILE_METERS['roof']
    px = W_M / W
    r = rng(91)
    g = 110
    f1, f2, cid = worley(H, W, g, g, seed=92)
    cell = W / g
    peb = np.clip(1 - (f1 / (f2 + 1e-6)) ** 1.6, 0, 1)  # rounded pebble domes
    pal = srgb([[150, 146, 138], [120, 116, 110], [175, 165, 150], [95, 92, 90], [160, 140, 120], [135, 128, 118]])
    pick = r.integers(0, len(pal), g * g)[cid]
    tone = (0.75 + 0.35 * peb) * (1 + r.normal(0, 0.07, g * g)[cid])
    alb = pal[pick] * tone[..., None]
    alb *= (0.85 + 0.3 * unit(noise(H, W, beta=2.4, seed=93)))[..., None]
    hm = peb * 0.012 * (0.6 + 0.4 * r.random(g * g)[cid])
    nrm = normal_from_height(blur(hm, 0.5), px, 0.7)
    ao = np.clip(0.35 + peb * 0.75, 0, 1)
    rough = np.clip(0.85 + noise(H, W, beta=0.5, seed=94) * 0.03, 0, 1)
    _ = cell
    return save('roof', alb, nrm, ao, rough)


def gen_interior_wall():
    """Painted wall (eggshell latex over block/plaster): almost flat, faint roller stipple."""
    W_M, H_M, W, H = TILE_METERS['interiorWall']
    px = W_M / W
    st = noise(H, W, beta=0.9, seed=101)
    low = noise(H, W, beta=2.6, seed=102)
    alb = colorize([226, 223, 214], 1 + low * 0.012 + st * 0.006)
    hm = st * 0.00008 + noise(H, W, beta=1.8, seed=103) * 0.0001
    nrm = normal_from_height(hm, px, 1.0)
    rough = np.clip(0.72 + st * 0.03, 0, 1)
    return save('interiorWall', alb, nrm, None, rough)


def gen_interior_floor():
    """Commercial carpet tile 50 cm, quarter-turned (pile direction alternates), charcoal-blue."""
    W_M, H_M, W, H = TILE_METERS['interiorFloor']
    px = W_M / W
    t = W // 4
    ys, xs = np.mgrid[0:H, 0:W]
    tid = (ys // t + xs // t) % 2
    loopx = noise(H, W, beta=0.4, seed=111, ax=3, ay=1)
    loopy = noise(H, W, beta=0.4, seed=112, ax=1, ay=3)
    pile = np.where(tid == 0, loopx, loopy)
    fleck = noise(H, W, beta=0.0, seed=113)
    tone = 1 + pile * 0.06 + (tid * 0.035) + noise(H, W, beta=2.4, seed=114) * 0.03
    alb = colorize([78, 82, 92], tone)
    alb = np.where((fleck > 2.3)[..., None], srgb([130, 128, 120]), alb)
    alb = np.where((fleck < -2.4)[..., None], srgb([40, 46, 62]), alb)
    seam = np.minimum(np.minimum(xs % t, t - 1 - xs % t), np.minimum(ys % t, t - 1 - ys % t)) < 1
    alb *= (1 - seam * 0.12)[..., None]
    hm = pile * 0.0004 - seam * 0.001
    nrm = normal_from_height(hm, px, 1.0)
    ao = np.clip(0.85 + pile * 0.06 - seam * 0.2, 0, 1)
    rough = np.full((H, W), 0.97)
    return save('interiorFloor', alb, nrm, ao, rough)


def gen_interior_ceiling():
    """2' x 2' fissured mineral-fiber acoustic tiles in a white exposed T-bar grid."""
    W_M, H_M, W, H = TILE_METERS['interiorCeiling']
    px = W_M / W
    r = rng(121)
    t = W // 2
    ys, xs = np.mgrid[0:H, 0:W]
    dg = np.minimum(np.minimum(xs % t, t - 1 - xs % t), np.minimum(ys % t, t - 1 - ys % t)).astype(np.float32)
    bar_half = 0.012 / px  # 24 mm T-bar
    bar = dg < bar_half
    tile_alb = colorize([224, 222, 214], 1 + noise(H, W, beta=1.0, seed=122) * 0.02)
    fis = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(fis)
    for _ in range(1400):
        x, y = r.uniform(0, W), r.uniform(0, H)
        pts = [(x, y)]
        a = r.uniform(0, 6.28)
        for _ in range(int(r.integers(2, 5))):
            a += r.normal(0, 0.8)
            x += math.cos(a) * r.uniform(1.5, 3.5)
            y += math.sin(a) * r.uniform(1.5, 3.5)
            pts.append((x, y))
        d.line(pts, fill=255, width=1)
    fis_a = np.asarray(fis, np.float32) / 255
    pin = (noise(H, W, beta=0.0, seed=123) > 2.4)
    holes = np.clip(fis_a + pin, 0, 1)
    tile_alb = tile_alb * (1 - holes[..., None] * 0.35)
    bar_alb = colorize([238, 237, 232], np.ones((H, W)))
    alb = np.where(bar[..., None], bar_alb, tile_alb)
    shadow = np.clip(1 - (dg - bar_half) / 3, 0, 1) * (~bar)
    alb *= (1 - shadow * 0.15)[..., None]
    hm = np.where(bar, 0.0, -0.006) - holes * 0.0008
    nrm = normal_from_height(blur(hm, 0.5), px, 1.0)
    ao = np.clip(1 - shadow * 0.3 - holes * 0.2, 0, 1)
    rough = np.where(bar, 0.45, 0.95)
    return save('interiorCeiling', alb, nrm, ao, rough)


def gen_wood():
    """Flat-sawn oak veneer (desks, doors). Grain runs along U."""
    W_M, H_M, W, H = TILE_METERS['wood']
    px = W_M / W
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    warp = noise(H, W, beta=2.6, seed=131, ax=4, ay=1) * 6
    fine = noise(H, W, beta=0.8, seed=132, ax=20, ay=1)
    rings = np.sin((ys / H * 2 * math.pi * 14) + warp)
    figure = np.clip(rings, -1, 1) * 0.5 + 0.5
    tone = 0.8 + figure * 0.3 + fine * 0.08
    pores = (noise(H, W, beta=0.2, seed=133, ax=8, ay=1) > 1.6).astype(np.float32)
    tone -= pores * 0.12
    alb = colorize([170, 124, 80], tone)
    hm = -pores * 0.0002 + fine * 0.00005
    nrm = normal_from_height(hm, px, 1.0)
    rough = np.clip(0.48 + fine * 0.04 + pores * 0.15, 0, 1)
    return save('wood', alb, nrm, None, rough)


def gen_fabric():
    """Plain-weave upholstery, neutral light gray (tinted by the material color)."""
    W_M, H_M, W, H = TILE_METERS['fabric']
    px = W_M / W
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    k = 2 * math.pi * 64 / W  # 64 threads per tile each way (~3 mm)
    warp = np.sin(xs * k) * 0.5 + 0.5
    weft = np.sin(ys * k) * 0.5 + 0.5
    over = (np.floor(xs * 64 / W) + np.floor(ys * 64 / H)) % 2
    hm = np.where(over > 0, warp * 0.6 + 0.4 * weft, weft * 0.6 + 0.4 * warp) * 0.0003
    slub = noise(H, W, beta=1.0, seed=141, ax=1, ay=6) * 0.05
    alb = colorize([205, 205, 205], 0.85 + hm / 0.0003 * 0.15 + slub)
    nrm = normal_from_height(hm, px, 1.0)
    ao = np.clip(0.75 + hm / 0.0003 * 0.25, 0, 1)
    rough = np.full((H, W), 0.95)
    return save('fabric', alb, nrm, ao, rough)


def gen_metal():
    """Brushed / weathered metal roughness variation (no color map)."""
    W_M, H_M, W, H = TILE_METERS['metal']
    brush = noise(H, W, beta=0.8, seed=151, ax=30, ay=1)
    smudge = noise(H, W, beta=2.6, seed=152)
    rough = np.clip(0.38 + brush * 0.04 + smudge * 0.06, 0, 1)
    return save('metal', None, None, np.ones((H, W)), rough, np.ones((H, W)))


def gen_water():
    """Small-pond wind ripples (normal map only)."""
    W_M, H_M, W, H = TILE_METERS['water']
    px = W_M / W
    hm = noise(H, W, beta=3.2, seed=161, fmin=3) * 0.004 + noise(H, W, beta=2.0, seed=162, fmin=20) * 0.0008
    nrm = normal_from_height(hm, px, 1.0)
    return save('water', None, nrm)


def gen_macro():
    """World-space variation texture used by the shader to break up tiling and add weathering.
    R: large blotches, G: medium blotches, B: fine noise (stretched by the shader into rain streaks)."""
    _, _, W, H = TILE_METERS['macro']
    R = unit(noise(H, W, beta=2.8, seed=171))
    G = unit(noise(H, W, beta=2.0, seed=172, fmin=4))
    B = unit(noise(H, W, beta=1.2, seed=173, fmin=8))
    img = np.stack([R, G, B], -1)
    d = OUT / 'macro'
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(d / 'macro.png', optimize=True)
    return {}


def gen_foliage():
    """Leaf mass for tree canopies: overlapping leaves with alpha (cut-out), mid-October tints."""
    W_M, H_M, W, H = TILE_METERS['foliage']
    px = W_M / W
    r = rng(181)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hgt = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hgt)
    greens = [(70, 92, 38), (88, 108, 44), (60, 80, 34), (104, 116, 50), (120, 112, 46)]
    autumn = [(170, 120, 40), (180, 90, 30), (150, 130, 50)]
    n = 700
    for i in range(n):
        cx, cy = r.uniform(0, W), r.uniform(0, H)
        ang = r.uniform(0, math.pi * 2)
        a, b = r.uniform(0.035, 0.06) / px, r.uniform(0.018, 0.03) / px
        base = autumn[r.integers(0, 3)] if r.random() < 0.08 else greens[r.integers(0, len(greens))]
        lev = i / n
        k = 0.7 + 0.5 * lev + r.normal(0, 0.06)
        col = tuple(int(np.clip(c * k, 0, 255)) for c in base) + (255,)
        pts = [(cx + math.cos(t) * a * math.cos(ang) - math.sin(t) * b * abs(math.sin(t)) ** 0.3 * math.sin(ang),
                cy + math.cos(t) * a * math.sin(ang) + math.sin(t) * b * abs(math.sin(t)) ** 0.3 * math.cos(ang)) for t in np.linspace(0, 2 * math.pi, 14)]
        for oy in (-H, 0, H):
            for ox in (-W, 0, W):
                q = [(p[0] + ox, p[1] + oy) for p in pts]
                d.polygon(q, fill=col)
                dh.polygon(q, fill=int(40 + lev * 215))
    rgba = np.asarray(img, np.float32) / 255
    alb = rgba[..., :3]
    alpha = rgba[..., 3]
    hm = np.asarray(hgt, np.float32) / 255 * 0.01
    nrm = normal_from_height(blur(hm, 0.8), px, 0.5)
    d_ = OUT / 'foliage'
    d_.mkdir(parents=True, exist_ok=True)
    out = np.concatenate([np.clip(alb, 0, 1), alpha[..., None]], -1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(d_ / 'albedo.png', optimize=True)
    ao = np.clip(0.5 + hm / 0.01 * 0.5, 0, 1)
    rough = np.full((H, W), 0.75)
    info = save('foliage', None, nrm, ao, rough)
    info['coverage'] = float(alpha.mean())
    return info


def gen_bark():
    """Furrowed bark (honey locust / maple-like), furrows run along V (up the trunk)."""
    W_M, H_M, W, H = TILE_METERS['bark']
    px = W_M / W
    ridges = noise(H, W, beta=2.2, seed=191, ax=1, ay=7)
    plates = noise(H, W, beta=1.4, seed=192, ax=1, ay=2.5)
    hm = np.clip(ridges, -1.5, 1.5) * 0.006 + plates * 0.0015
    tone = 0.75 + 0.25 * unit(hm) + noise(H, W, beta=1.0, seed=193) * 0.05
    alb = colorize([126, 112, 98], tone)
    lichen = unit(noise(H, W, beta=2.4, seed=194)) > 0.82
    alb = np.where(lichen[..., None], alb * srgb([[230, 240, 200]])[0] * 1.1, alb)
    nrm = normal_from_height(hm, px, 0.9)
    ao = ao_from_height(hm, px, 0.01, 1.0)
    rough = np.full((H, W), 0.93)
    return save('bark', alb, nrm, ao, rough)


# Since round 3 most surfaces use photo-scanned CC0 textures (tools/textures/fetch_cc0.py). These are the
# generated sets still in use; the other generators remain for reference (run them with --only).
IN_USE = ['sidewalk', 'fabric', 'metal', 'water', 'foliage', 'macro']

GENERATORS = {
    'concrete': gen_concrete,
    'concreteSmooth': gen_concrete_smooth,
    'brick': gen_brick,
    'asphalt': gen_asphalt,
    'sidewalk': gen_sidewalk,
    'plaza': gen_plaza,
    'grass': gen_grass,
    'soil': gen_soil,
    'roof': gen_roof,
    'interiorWall': gen_interior_wall,
    'interiorFloor': gen_interior_floor,
    'interiorCeiling': gen_interior_ceiling,
    'wood': gen_wood,
    'fabric': gen_fabric,
    'metal': gen_metal,
    'water': gen_water,
    'foliage': gen_foliage,
    'bark': gen_bark,
    'macro': gen_macro,
}


def preview(path: Path, names):
    """Contact sheet: each albedo tiled 2x2 (to check seams) next to a lit normal-map preview."""
    cells = []
    for n in names:
        a = OUT / n / 'albedo.jpg'
        nm = OUT / n / 'normal.jpg'
        if not a.exists():
            continue
        im = Image.open(a).convert('RGB')
        im = im.resize((256, int(256 * im.height / im.width)))
        tile = Image.new('RGB', (512, im.height * 2))
        for i in range(2):
            for j in range(2):
                tile.paste(im, (i * 256, j * im.height))
        if nm.exists():
            nn = np.asarray(Image.open(nm).convert('RGB').resize((256, im.height)), np.float32) / 127.5 - 1
            light = np.array([-0.5, 0.5, 0.7])
            light /= np.linalg.norm(light)
            shade = np.clip((nn * light).sum(-1), 0, 1)
            sh = Image.fromarray((shade * 255).astype(np.uint8)).convert('RGB')
            t2 = Image.new('RGB', (512, im.height * 2))
            for i in range(2):
                for j in range(2):
                    t2.paste(sh, (i * 256, j * im.height))
            both = Image.new('RGB', (1024, im.height * 2))
            both.paste(tile, (0, 0))
            both.paste(t2, (512, 0))
            tile = both
        cells.append(tile)
    hgt = sum(c.height for c in cells)
    sheet = Image.new('RGB', (1024, hgt), (255, 255, 255))
    y = 0
    for c in cells:
        sheet.paste(c, (0, y))
        y += c.height
    sheet.save(path, quality=85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--preview', default='')
    args = ap.parse_args()
    names = [n for n in args.only.split(',') if n] or IN_USE
    stats = {}
    for n in names:
        print('generating', n, flush=True)
        stats[n] = GENERATORS[n]()
    for n, s in stats.items():
        if s:
            print(f'  {n}: ' + ', '.join(f'{k}={v:.3f}' for k, v in s.items()))
    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'total texture size: {total / 1e6:.2f} MB')
    tiles_path = OUT / 'tiles.json'
    tiles = json.loads(tiles_path.read_text()) if tiles_path.exists() else {}
    tiles.update({k: list(TILE_METERS[k]) for k in names})
    tiles_path.write_text(json.dumps(dict(sorted(tiles.items())), indent=1) + '\n')
    if args.preview:
        preview(Path(args.preview), names)


if __name__ == '__main__':
    main()
