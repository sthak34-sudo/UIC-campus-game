#!/usr/bin/env python3
"""Downloads the game's photo-scanned PBR surface textures (all CC0) from Poly Haven and ambientCG,
then resizes/recompresses them into client/public/textures/<folder>/:

    albedo.jpg  sRGB base color
    normal.jpg  tangent-space normal map, OpenGL convention (+Y up)
    orm.jpg     R = ambient occlusion, G = roughness, B = metalness (three.js layout)

    python3 tools/textures/fetch_cc0.py               # everything in ASSETS
    python3 tools/textures/fetch_cc0.py --only brick  # selected folders
    python3 tools/textures/fetch_cc0.py --preview sheet.jpg

Real-world size of each texture tile is read from the source API (Poly Haven: millimetres,
ambientCG: centimetres) and written to client/public/textures/tiles.json, which the material library
(client/src/render/materials.ts, TILE) must match: UVs are in meters, so repeat = 1 / tile size.
Every asset is CC0 1.0 (public domain); the list is also written to client/public/textures/credits.json
and recorded in CREDITS.md.

Needs only Python 3 + Pillow + numpy. Downloads are cached in ~/.cache/uic-campus-textures.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import time
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 24
Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client' / 'public' / 'textures'
CACHE = Path(os.environ.get('UIC_TEXTURE_CACHE', Path.home() / '.cache' / 'uic-campus-textures'))
UA = {'User-Agent': 'UIC-campus-game texture fetch (open-source fan project; CC0 assets)'}

# folder -> source asset. size: px of the output square (1024 unless noted). rotate: degrees CCW
# applied to every map (normal maps get their X/Y channels rotated to match). size_m: only when the
# API has no dimensions. why: what the material is used for.
ASSETS: dict[str, dict] = {
    # ---- exterior concrete (UIC East Campus, 1960s Brutalist)
    'ph_concrete_layers_02': dict(src='polyhaven', id='concrete_layers_02', why='concrete: board-formed cast-in-place, horizontal board/lift marks'),
    'ph_concrete_wall_007': dict(src='polyhaven', id='concrete_wall_007', why='concreteWarm: warm grey weathered wall with pour lines'),
    'ph_concrete_wall_006': dict(src='polyhaven', id='concrete_wall_006', why='concreteDark: dark, stained, tie holes'),
    'acg_Concrete046': dict(src='ambientcg', id='Concrete046', why='concreteSmooth: smooth light precast'),
    'ph_gravel_embedded_concrete': dict(src='polyhaven', id='gravel_embedded_concrete', nsize=512, why='concreteExposedAggregate: exposed-aggregate precast'),
    # ---- brick
    'ph_red_brick_03': dict(src='polyhaven', id='red_brick_03', why='brick: red-brown face brick'),
    'ph_brick_wall_10': dict(src='polyhaven', id='brick_wall_10', why='brickDark: dark brown/purple face brick'),
    'ph_brick_wall_001': dict(src='polyhaven', id='brick_wall_001', why='brickUIC, brickDouble (2x scale), brickCommon: mixed-color brick (tinted to the Netsch palette for brickUIC)'),
    # ---- ground
    'ph_asphalt_02': dict(src='polyhaven', id='asphalt_02', nsize=512, why='asphalt: grey street asphalt with cracks'),
    'ph_concrete_floor_worn_001': dict(src='polyhaven', id='concrete_floor_worn_001', why='sidewalk: worn cast-concrete pavement'),
    'ph_white_sandstone_blocks_02': dict(src='polyhaven', id='white_sandstone_blocks_02', why='limestone and plaza: pale cut stone (Poly Haven has no asset named limestone)'),
    'acg_PavingStones128': dict(src='ambientcg', id='PavingStones128', why='kept on disk; plazas now use ph_white_sandstone_blocks_02'),
    'acg_Grass004': dict(src='ambientcg', id='Grass004', nsize=512, why='grass: mown lawn'),
    'ph_yellow_flower_mulch': dict(src='polyhaven', id='yellow_flower_mulch', size=512, why='soil: planting-bed mulch'),
    'ph_bicolour_gravel': dict(src='polyhaven', id='bicolour_gravel', nsize=512, why='roof: gravel ballast'),
    # ---- interiors
    'acg_Carpet012': dict(src='ambientcg', id='Carpet012', size=512, size_m=(1.0, 1.0), why='interiorFloor: dark blue-grey loop carpet (API has no size; ~1 m judged from pile)'),
    'acg_OfficeCeiling001': dict(src='ambientcg', id='OfficeCeiling001', why='interiorCeiling: 2x2 ft mineral-fiber tiles in T-bar grid'),
    'ph_terrazzo_tiles': dict(src='polyhaven', id='terrazzo_tiles', why='interiorFloorHard: terrazzo tiles'),
    'ph_painted_plaster_wall': dict(src='polyhaven', id='painted_plaster_wall', why='interiorWall: painted plaster'),
    'ph_oak_veneer_01': dict(src='polyhaven', id='oak_veneer_01', why='wood: oak veneer furniture'),
    'ph_dark_wood': dict(src='polyhaven', id='dark_wood', why='bookshelf: dark stained wood'),
    # ---- metal
    'ph_blue_metal_plate': dict(src='polyhaven', id='blue_metal_plate', grayscale=True, why='metalPanel: painted metal cladding panels (desaturated; tinted silver-grey in the material)'),
    # ---- trees
    'ph_bark_brown_02': dict(src='polyhaven', id='bark_brown_02', size=512, why='bark: tree trunks'),
}


def get(url: str) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / (url.replace('://', '_').replace('/', '_').replace('?', '_').replace('&', '_').replace('=', '_'))[-180:]
    if key.exists():
        return key.read_bytes()
    for attempt in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
            key.write_bytes(data)
            time.sleep(0.3)  # be polite
            return data
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f'  retry {url}: {e}')
            time.sleep(2 + attempt * 3)
    raise RuntimeError('unreachable')


def get_json(url: str) -> dict:
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())


def img(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def fetch_polyhaven(aid: str, res: str):
    info = get_json(f'https://api.polyhaven.com/info/{aid}')
    files = get_json(f'https://api.polyhaven.com/files/{aid}')
    lic = 'CC0 1.0'
    dims = info.get('dimensions') or [0, 0]
    pick = lambda k: files[k][res]['jpg']['url']  # noqa: E731
    albedo = img(get(pick('Diffuse'))).convert('RGB')
    normal = img(get(pick('nor_gl'))).convert('RGB')
    if 'arm' in files:
        arm = img(get(pick('arm'))).convert('RGB')
        a = np.asarray(arm)
        orm = np.stack([a[..., 0], a[..., 1], np.zeros_like(a[..., 0])], -1)
    else:
        rough = np.asarray(img(get(pick('Rough'))).convert('L'))
        ao = np.asarray(img(get(pick('AO'))).convert('L')) if 'AO' in files else np.full_like(rough, 255)
        orm = np.stack([ao, rough, np.zeros_like(rough)], -1)
    return {
        'albedo': albedo, 'normal': normal, 'orm': Image.fromarray(orm.astype(np.uint8)),
        'size_m': (dims[0] / 1000, dims[1] / 1000), 'name': info.get('name', aid),
        'url': f'https://polyhaven.com/a/{aid}', 'license': lic, 'source': 'Poly Haven',
        'authors': ', '.join((info.get('authors') or {}).keys()),
    }


def fetch_ambientcg(aid: str, res: str):
    q = get_json(f'https://ambientcg.com/api/v2/full_json?id={aid}&include=downloadData,dimensionsData')
    a = q['foundAssets'][0]
    dl = a['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads']
    want = {'1k': '1K-JPG', '2k': '2K-JPG'}[res]
    link = next(x['downloadLink'] for x in dl if x['attribute'] == want)
    z = zipfile.ZipFile(io.BytesIO(get(link)))
    names = z.namelist()

    def member(suffix: str):
        for n in names:
            if n.lower().endswith(suffix.lower()):
                return img(z.read(n))
        return None

    albedo = member('_Color.jpg').convert('RGB')
    normal = member('_NormalGL.jpg').convert('RGB')
    rough_i = member('_Roughness.jpg')
    ao_i = member('_AmbientOcclusion.jpg')
    rough = np.asarray(rough_i.convert('L').resize(albedo.size)) if rough_i else np.full(albedo.size[::-1], 220, np.uint8)
    ao = np.asarray(ao_i.convert('L').resize(albedo.size)) if ao_i else np.full_like(rough, 255)
    orm = np.stack([ao, rough, np.zeros_like(rough)], -1)
    dx, dy = a.get('dimensionX') or 0, a.get('dimensionY') or 0  # centimetres
    return {
        'albedo': albedo, 'normal': normal, 'orm': Image.fromarray(orm.astype(np.uint8)),
        'size_m': (dx / 100, dy / 100), 'name': a.get('displayName', aid),
        'url': f'https://ambientcg.com/view?id={aid}', 'license': 'CC0 1.0', 'source': 'ambientCG',
        'authors': 'ambientCG (Lennart Demes)',
    }


def rotate_normal(n: Image.Image, deg: int) -> Image.Image:
    """Rotate a tangent-space normal map image and its vectors together."""
    if deg % 360 == 0:
        return n
    r = n.rotate(deg, expand=True)
    a = np.asarray(r).astype(np.float32) / 127.5 - 1
    x, y = a[..., 0].copy(), a[..., 1].copy()
    k = (deg // 90) % 4
    for _ in range(k):  # 90° CCW: (x, y) -> (-y, x)
        x, y = -y, x
    a[..., 0], a[..., 1] = x, y
    return Image.fromarray(np.clip((a + 1) * 127.5, 0, 255).astype(np.uint8))


def process(folder: str, spec: dict) -> dict:
    size = spec.get('size', 1024)
    res = '2k' if size > 1024 else '1k'
    print(f'{folder}: {spec["src"]} {spec["id"]} @ {res}', flush=True)
    m = fetch_polyhaven(spec['id'], res) if spec['src'] == 'polyhaven' else fetch_ambientcg(spec['id'], res)
    sx, sy = spec.get('size_m') or m['size_m']
    if not sx or not sy:
        raise SystemExit(f'{folder}: source has no dimensions, set size_m')
    rot = spec.get('rotate', 0)
    maps = {'albedo': m['albedo'], 'normal': m['normal'], 'orm': m['orm']}
    if rot:
        maps = {k: (rotate_normal(v, rot) if k == 'normal' else v.rotate(rot, expand=True)) for k, v in maps.items()}
        if rot % 180:
            sx, sy = sy, sx
    if spec.get('grayscale'):
        maps['albedo'] = maps['albedo'].convert('L').convert('RGB')
    nsize = spec.get('nsize', size)
    d = OUT / folder
    d.mkdir(parents=True, exist_ok=True)
    for k, im in maps.items():
        px = size if k == 'albedo' else nsize
        im = im.resize((px, px), Image.LANCZOS) if im.size != (px, px) else im
        q = 90 if k == 'normal' else 85
        sub = 0 if k != 'albedo' else 2
        im.save(d / f'{k}.jpg', quality=q, subsampling=sub, optimize=True)
    alb = np.asarray(maps['albedo'].resize((64, 64))).astype(np.float32) / 255
    lin = np.where(alb <= 0.04045, alb / 12.92, ((alb + 0.055) / 1.055) ** 2.4).mean(axis=(0, 1))
    return {
        'folder': folder, 'id': spec['id'], 'source': m['source'], 'name': m['name'], 'url': m['url'],
        'license': m['license'], 'authors': m['authors'], 'tile_m': [round(sx, 4), round(sy, 4)],
        'px': size, 'use': spec.get('why', ''), 'meanLinearAlbedo': [round(float(v), 3) for v in lin],
    }


def merge_json(path: Path, update: dict) -> None:
    cur = json.loads(path.read_text()) if path.exists() else {}
    cur.update(update)
    path.write_text(json.dumps(dict(sorted(cur.items())), indent=1) + '\n')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--preview', default='')
    args = ap.parse_args()
    names = [n for n in args.only.split(',') if n] or list(ASSETS)
    credits, tiles = {}, {}
    for n in names:
        info = process(n, ASSETS[n])
        credits[n] = info
        tiles[n] = [info['tile_m'][0], info['tile_m'][1], info['px'], info['px']]
        print(f'   tile {info["tile_m"]} m, mean linear albedo {info["meanLinearAlbedo"]}')
    merge_json(OUT / 'tiles.json', tiles)
    merge_json(OUT / 'credits.json', credits)
    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'total texture size: {total / 1e6:.2f} MB')
    if args.preview:
        cells = []
        for n in names:
            a = Image.open(OUT / n / 'albedo.jpg').convert('RGB').resize((256, 256))
            t = Image.new('RGB', (512, 512))
            for i in range(2):
                for j in range(2):
                    t.paste(a, (i * 256, j * 256))
            cells.append(t)
        cols = 4
        rows = (len(cells) + cols - 1) // cols
        s = Image.new('RGB', (cols * 512, rows * 512), 'white')
        for k, c in enumerate(cells):
            s.paste(c, ((k % cols) * 512, (k // cols) * 512))
        s.save(args.preview, quality=85)


if __name__ == '__main__':
    main()
