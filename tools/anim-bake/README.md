# CC0 clip bake

Re-bakes `client/public/models/characters/player_anims_cc0.glb` from the Quaternius Universal Animation
Library (CC0, https://quaternius.com/packs/universalanimationlibrary.html). The source pack isn't committed;
download `UAL1_Standard.glb` and point `SRC` at it.

    SRC=/path/UAL1_Standard.glb node tools/anim-bake/bake.mjs

Needs `three` and `@gltf-transform/core` (install them in a scratch folder; they aren't app dependencies).

How it works: a world-space delta transfer (target = source_now * source_rest^-1 * target_rest) per bone.
That is only right when both rests have the same limb directions, so before baking each source rest
rotation is swung so its bone axis matches the MakeHuman rest (legs, spine, arms, clavicles; feet keep
their own flat rest). A small stance tidy then narrows the standing clips to about shoulder width.
Env knobs: `LEG_IN`, `LEG_FB`, `ARM_IN` (degrees), `NOALIGN=1` to reproduce the old bake.

## Rifle (`rifle.mjs`)
Builds `client/public/models/weapons/rifle_cc0.glb` from Kenney's Blaster Kit 2.1 `blaster-f` (CC0, https://kenney.nl/assets/blaster-kit). It wraps the model in a `rifle` node at scale 0.65 (barrel along -Z) and adds `Grip`, `Foregrip` and `Muzzle` socket nodes, which `client/src/player/rifle.ts` uses for the two-hand IK and the muzzle flash.

    npx -y -p @gltf-transform/core -p @gltf-transform/extensions node tools/anim-bake/rifle.mjs \
      "<kit>/Models/GLB format/blaster-f.glb" client/public/models/weapons/rifle_cc0.glb
