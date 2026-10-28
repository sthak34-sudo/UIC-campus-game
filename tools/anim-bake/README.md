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
The clip file also carries an unarmed set (`unarmed_idle`, `unarmed_walk`, `unarmed_run`, `unarmed_jump`, from UAL `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Jump_Start`) that the game plays while the player has no weapon, and the air clips `fall` (UAL `Jump_Loop`, looped once the take-off clip is nearly over) and `land` (UAL `Jump_Land`, played after a long fall).
Env knobs: `LEG_IN`, `LEG_FB`, `ARM_IN` (degrees), `NOALIGN=1` to reproduce the old bake.

## Rifle (`rifle.mjs`)
Builds `client/public/models/weapons/rifle_m4_cc0.glb` from the CC0 "M4A1" in the 3DModelsCC0 Free CC0 Guns & Explosives Pack (https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack; GLB export in https://github.com/BoQsc/cc0-guns-explosives-pack-glb/releases/tag/0, `Guns.Explosives_glb.zip`). It flattens the parts, resizes the PBR textures to 1024 px WebP, and adds `Grip`, `Foregrip` and `Muzzle` socket nodes (barrel along -Z, metres) that `client/src/player/rifle.ts` uses for the two-hand IK and the muzzle flash. The output is byte-for-byte reproducible.

    # in a scratch dir: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
    node tools/anim-bake/rifle.mjs "<pack>/M4A1/M4A1.glb" client/public/models/weapons/rifle_m4_cc0.glb
