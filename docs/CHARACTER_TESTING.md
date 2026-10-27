# Character testing (private Mixamo file)

The public repo ships the CC0 body at `client/public/models/characters/player_base.glb`.
Mixamo clips are **not** redistributable and must never be committed.

## Sooriya: getting the private file

1. Ask Atlas (or check `/workspace/atlas/assets/client/public/models/private/anims.glb`) for the baked Mixamo pack.
2. Copy it locally only:
   ```bash
   mkdir -p client/public/models/private
   cp /path/to/anims.glb client/public/models/private/anims.glb
   ```
3. Confirm it is ignored:
   ```bash
   git check-ignore -v client/public/models/private/anims.glb
   git ls-files 'client/public/models/private/**'   # must print nothing
   ```
4. Run `npm run dev`. Third person should show the realistic body with idle / walk / run / crouch / aim / fire / reload / jump / death.

## Without the file

CI and a fresh public checkout have no `anims.glb`. The game falls back to the procedural figure. That is expected and covered by unit tests.

## Clips in anims.glb

`idle`, `walk`, `run`, `crouch_idle`, `crouch_walk`, `aim_idle`, `fire`, `reload`, `jump`, `death`. There is no hit clip; damage uses a short spine flinch.
