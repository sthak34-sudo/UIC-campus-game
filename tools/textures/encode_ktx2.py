#!/usr/bin/env python3
"""Compress the outdoor hero textures to KTX2 and delete their JPEG sources.

    albedo, orm  → ETC1S, sRGB for color and linear for orm
    normal       → UASTC (three.js reads a regular XYZ normal, not a two-channel one)

Needs the KTX-Software `toktx` binary. Point TOKTX at it, or put it on PATH.
JPEG inputs are the files already written by fetch_cc0.py (albedo.jpg, normal.jpg, orm.jpg).
After a successful encode those JPEGs are removed so they are not committed.

    python3 tools/textures/encode_ktx2.py
    TOKTX=/path/to/toktx python3 tools/textures/encode_ktx2.py ph_asphalt_02
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / 'client' / 'public' / 'textures'

# Keep in sync with KTX_TEXTURE_DIRS in client/src/render/materials.ts.
DIRS = [
    'ph_concrete_layers_02',
    'ph_red_brick_03',
    'ph_brick_wall_001',
    'ph_asphalt_02',
    'acg_Grass004',
    'ph_concrete_floor_worn_001',
    'ph_white_sandstone_blocks_02',
]


def toktx() -> str:
    env = os.environ.get('TOKTX')
    if env:
        return env
    found = shutil.which('toktx')
    if found:
        return found
    sys.exit('toktx not found. Install KTX-Software and set TOKTX=/path/to/toktx')


def run(cmd: list[str]) -> None:
    print(' ', ' '.join(cmd))
    subprocess.run(cmd, check=True)


def encode_dir(folder: Path, bin: str) -> None:
    albedo = folder / 'albedo.jpg'
    normal = folder / 'normal.jpg'
    orm = folder / 'orm.jpg'
    if not albedo.is_file() or not normal.is_file() or not orm.is_file():
        missing = [p.name for p in (albedo, normal, orm) if not p.is_file()]
        print(f'skip {folder.name}: missing {", ".join(missing)} (already KTX2?)')
        return
    run([bin, '--encode', 'etc1s', '--qlevel', '160', '--assign_oetf', 'srgb', '--genmipmap',
         str(folder / 'albedo.ktx2'), str(albedo)])
    run([bin, '--encode', 'uastc', '--uastc_quality', '2', '--assign_oetf', 'linear', '--genmipmap', '--zcmp', '--',
         str(folder / 'normal.ktx2'), str(normal)])
    run([bin, '--encode', 'etc1s', '--qlevel', '175', '--assign_oetf', 'linear', '--genmipmap',
         str(folder / 'orm.ktx2'), str(orm)])
    albedo.unlink()
    normal.unlink()
    orm.unlink()
    print(f'encoded {folder.name}')


def main() -> None:
    bin = toktx()
    wanted = sys.argv[1:] or DIRS
    for name in wanted:
        encode_dir(TEX / name, bin)


if __name__ == '__main__':
    main()
