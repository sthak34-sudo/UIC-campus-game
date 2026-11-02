# Combat and game-feel audit (round 1, audit only)

Auditor: Gameplay & Combat Designer. Branch `claude/uic-campus-game-plan-btnm3c`. **No code was changed.**

Method: code reading with file:line evidence, plus headless Vitest runs of the real `damage.ts`, `zoneLogic.ts` and `camera.ts` modules (scratch scripts outside the repo). A live render probe (port 5304) was attempted and dropped because the shared machine was overloaded (software WebGL, load average ~38, screenshot timed out). Nothing below depends on a screenshot. Findings marked "unmeasured" say so.

PUBG figures are the ones in the Project Lead brief, or approximate from memory; treat them as targets, not facts.

## Summary

The pieces are all there (aimed shot with camera/muzzle parallax, hitscan on Rapier, zone, heal channel, loot, kill feed). The feel is far from PUBG for four reasons:

1. **The weapon is a semi-auto pea-shooter with perfect accuracy.** One click is one shot, there is no recoil, no spread, no movement penalty and a fixed crosshair. Damage is 28 per body shot at about 400 RPM, against roughly 41 at 700 RPM for an M416, so DPS is about 2.5x too low.
2. **Almost no feedback.** Getting shot by a bot produces nothing (no flinch, no sound, no direction cue). Landing a shot only tints the crosshair for 0.12 s. Audio is one gunshot and two impact sounds. No footsteps, reload, heal, hit or kill sounds.
3. **The zone breaks the camera and healing.** Zone damage is applied every frame through the "you were hit" path. That kicks the camera by ~26 degrees and cancels any heal, so you cannot heal outside the zone. This is the one real bug.
4. **Movement baseline is a stroll.** Plain WASD is 1.4 m/s. You must hold Shift for 4.5 m/s. PUBG's default jog is about 4.7 and sprint about 6.3.

What already works and should be kept: the aimed shot goes from the muzzle to the exact point the camera ray finds, so the crosshair is honest and a corner you hide behind takes the bullet (`weapon.ts` `castAimedShot`, `combat/index.ts:250`). The crosshair dims when the muzzle is blocked (`hud.ts` `setMuzzleBlocked`). Fire rate, reload and heal can't be spammed. Armor works as a damage pool. Pure-function design makes all the fixes below cheap to test.

## Current vs PUBG (numbers)

| Item | Ours (file:line) | PUBG target | Verdict |
|---|---|---|---|
| Body damage | 28 (`balance.ts:12`) | ~41-43 (M416) | Too low |
| Fire interval / RPM | 0.15 s / 400 (`balance.ts:30`) | 0.086 s / ~700 | Too slow, and no hold-to-fire |
| Unarmored time-to-kill, 10 m | 4 shots, 0.45 s | 3 shots, ~0.17 s | 2.6x slow |
| TTK, armor 100, 10 m | 8 shots, 1.05 s | ~5 shots (lvl 3 vest), ~0.35 s | 3x slow |
| Headshot multiplier | 2.0 (`balance.ts:14`) | ~2.1-2.35 | OK (small bump) |
| Limb multiplier | 0.6 (`balance.ts:16`) | ~0.9-1.0 | Too punishing |
| Damage falloff | full to 20 m, 0.5x at 70 m and beyond (`balance.ts:18-22`) | negligible inside 100 m | Far too steep |
| Hitscan range | 150 m (`balance.ts:54`) | 400+ m | Short for a 1.4 km map |
| Armor | soaks 50% of every hit, headshots too (`balance.ts:26`) | ~30-40%, helmet separate | Strong; doubles TTK at full armor |
| Magazine / reload | 30 / 1.7 s (`balance.ts:33-35`) | 30 / ~2.2 s tactical, ~3.1 s empty | Reload too fast, no empty variant |
| Bandage | +15 over 3 s, cap 75 (`balance.ts:39-41`) | +10 over 4 s, cap 75 | Slightly generous |
| Med kit | +50 over 6 s (`balance.ts:36,44`) | +100 over 8 s | Weak |
| Damage cancels heal | yes (`combat/index.ts:222`) | no (only firing/moving actions) | Stricter than PUBG |
| Default move / run / crouch | 1.4 / 4.5 (Shift) / 1.15 m/s (`config.ts:10-37`) | 4.7 jog / 6.3 sprint / 2.7 crouch | Default far too slow |
| Ground accel | 14 m/s^2 (`config.ts:18`), scaled up with speed (`physics.ts:257`) | ~0.3 s to speed | Fine |
| Jump height | 0.5 m (`config.ts:24`) | ~1 m | Low (P2, unmeasured vs PUBG) |
| Fall damage | none | yes | Missing |
| ADS | shoulder/arm pull-in only, FOV stays 60 (`config.ts:63`, `main.ts:61`) | FOV zoom, slower turn | Missing |
| Recoil / spread | none | yes | Missing |
| Zone | 6 phases, 537 s total, 0.4 to 12 HP/s (`zoneLogic.ts:58-65`) | similar shape | Reasonable; see CMB-16 |
| Audible gunfire range | 0.035 volume at 40 m, silent past 120 m (`gunSound.ts:7-24`) | audible to 300+ m | Too quiet |

Headless TTK table (real `resolveIncomingDamage`, body shots, current balance):

| Armor | 10 m | 40 m | 70 m |
|---|---|---|---|
| 0 | 4 shots, 0.45 s | 5, 0.60 s | 8, 1.05 s |
| 50 | 6, 0.75 s | 7, 0.90 s | 11, 1.50 s |
| 100 | 8, 1.05 s | 9, 1.20 s | 15, 2.10 s |

Bot rounds are 0.6x damage (`botAim.ts:15`) on a 0.5 s interval, so a bot needs 6 to 24 body hits and 2.5 to 11.5 s to kill the player. A player kills a bot 6 to 10 times faster.

## Findings

| ID | Sev | Title | Effort | Owner |
|---|---|---|---|---|
| CMB-01 | P0 | Zone damage kicks the camera every frame and blocks healing | S | Gameplay |
| CMB-02 | P0 | Rifle is click-per-shot only (no full-auto) | S | Gameplay |
| CMB-03 | P0 | No recoil, no spread, static crosshair, no movement/stance penalty | M | Gameplay |
| CMB-04 | P0 | Player gets no feedback when shot by a bot | M | Gameplay + AI Engineer + UI/UX |
| CMB-05 | P1 | Weak outgoing hit/kill feedback | S | Gameplay + UI/UX |
| CMB-06 | P1 | Damage, fire rate, falloff and armor give the wrong time-to-kill | S | Gameplay |
| CMB-07 | P1 | Heal rules: damage cancels, reload runs together, med kit weak | S | Gameplay |
| CMB-08 | P1 | Default movement 1.4 m/s; no sprint tier; crouch too slow | S | Gameplay |
| CMB-09 | P1 | Audio: one gunshot and two impacts, quiet at range | M-L | Gameplay |
| CMB-10 | P1 | No ADS zoom or sensitivity change | S | Gameplay |
| CMB-11 | P1 | Crouched player can never be headshot by bots | S | Gameplay (+ AI Engineer review) |
| CMB-12 | P2 | Bullet origin stays at 1.4 m when crouched | S | Gameplay |
| CMB-13 | P2 | Reload: one flat time, no empty variant, wall-clock timer | S | Gameplay |
| CMB-14 | P2 | No fall damage | S | Gameplay |
| CMB-15 | P2 | Loot mix: no outdoor armor/med kits; pickup ignores walls | S | Gameplay |
| CMB-16 | P2 | Zone pacing: opening circle is 37% off-map; final never closes | S | Gameplay |

### CMB-01 (P0) Zone damage kicks the camera every frame and blocks healing

Evidence:
- `zone/index.ts:193-195` calls `opts.applyDamage(amount)` every frame with `dps * dt`. `main.ts:171` forwards that to `combat.applyZoneDamage`, which is `combat/index.ts:426` and goes into `applyLocalDamage(amount, null)`.
- `applyLocalDamage` (`combat/index.ts:222`) calls `cancelHeal('Healing interrupted')`. Then with `from = null` it calls `flinchFrom` (`combat/index.ts:210`), which calls `player.flinch()` (`player/index.ts:348-350`), which calls `rig.kick(undefined, 1)`.
- `camera.ts:89-90` adds `kickPitch += 0.1` and a random yaw jitter on every call. The kick decays at `exp(-12 dt)` (`camera.ts:126`). At 60 fps the kick re-triggers every 16 ms and piles up.
- Measured headless with the real `CameraRig`: 120 frames (2 s) of zone ticks leave the view pitched 25.9 degrees off with yaw jitter. The steady state is about 0.55 rad (31 degrees). The player cannot aim while standing in the zone, and the flinch animation restarts every frame.
- Heal: Q or B starts a channel (`combat/index.ts:333`). The next frame's zone tick cancels it, the hint spams "Healing interrupted", and the item is kept. A player outside the zone cannot bandage at all.

Fix: add a separate zone path in `combat/index.ts`: reduce health directly (and through the squad bridge), no flinch, no heal cancel. Show a subtle red edge pulse once per second instead. Camera kick only for bullet hits. Add a regression test that 120 zone ticks leave `kickPitch` at 0 and an active heal channel running.
Effort: S. Owner: Gameplay & Combat (`combat/index.ts`; `main.ts` needs no change).

### CMB-02 (P0) Rifle is click-per-shot only

Evidence: the only fire trigger is the mousedown edge, `player/input.ts:67` (`fireQueued = true`), consumed once per frame by `consumeFire()` (`input.ts:214`). Holding the button does nothing. There is no held-fire flag anywhere (grep for hold/auto/firing found nothing). The rifle can never exceed the click rate of the player, and the 0.15 s limiter (`balance.ts:30`) only matters for fast clickers. A PUBG rifle is full-auto.
Fix: track `fireHeld` (mousedown to mouseup, cleared on blur and `setEnabled(false)`); each frame, if held and the interval has elapsed, emit `fire`. Keep one click equals one shot at low rate. Set `fireInterval` 0.09 (see CMB-06). Add a test for held fire producing N shots in N x interval seconds.
Effort: S. Owner: Gameplay & Combat (`player/input.ts`, `combat/index.ts`).

### CMB-03 (P0) No recoil, no spread, static crosshair, no movement penalty

Evidence: no recoil or spread code exists in `combat/` or `player/` (grep for recoil/spread/bloom finds only bot aim, `squad/botAim.ts:13`). `fire()` (`combat/index.ts:250-310`) shoots exactly along the camera direction. The crosshair is a fixed 18 px (`hud.ts:48`). Run-and-gun, jump-shooting and standing all have identical, perfect accuracy; jump has no cooldown (`physics.ts` jump on every landing). The owner's bar says "shots go exactly where aimed, with recoil and a crosshair that tell the truth": today the crosshair tells the truth only because nothing varies.
Fix (concrete starting numbers, tune by feel):
- Vertical recoil: +0.45 degrees pitch per shot hip, +0.30 ADS, random yaw +-0.15 degrees. Add the recoil to `kickPitch` with a slow recovery (about 6 degrees/s back toward the aim point) so sprays climb.
- Spread cone (half-angle) added to the shot direction: standing 1.2 degrees hip, crouched 0.8, moving +1.0, airborne +2.5, ADS x0.25. Bloom +0.1 degree per shot, decaying over 0.3 s.
- Crosshair arms spread with the cone, so the crosshair still tells the truth.
- No firing while sprinting (see CMB-08).
Effort: M. Owner: Gameplay & Combat (`combat/index.ts`, `combat/hud.ts`, `player/camera.ts`).

### CMB-04 (P0) Player gets no feedback when shot by a bot

Evidence: bot-to-player damage in `squad/adapter.ts:872-877` runs `shootBot(...)` and then only `opts.combat.setVitals(...)` for the player. It never goes through `applyLocalDamage`, so there is no `flinch` (no camera kick, no hit reaction), no `cancelHeal` (a heal keeps going while being shot, contradicting the rule in `heal.ts:1-3`), no hit sound, and no on-screen direction indicator. The only feedback is the health bar number. (The only `flinch` calls in the squad code are for bot avatars, `adapter.ts:495,877`.) Standards: "every hit gives visible and audible feedback".
Fix: add `onPlayerShot(fromWorldPos, damage)` to the combat/squad bridge and call it from `adapter.ts:876`. In combat: flinch with the real direction, cancel heal, play a hurt/hit sound, show a directional red arc at the screen edge (UI/UX draws it) and a short vignette scaled to damage.
Effort: M. Owner: Gameplay (`combat/index.ts`), AI Engineer (`squad/adapter.ts` call), UI/UX (indicator).

### CMB-05 (P1) Weak outgoing hit and kill feedback

Evidence: a landed shot only recolors the crosshair for 0.12 s (`hud.ts:159-163`, called at `combat/index.ts:295,301`). There is no hit sound, no head-shot sound, no damage number, and no kill confirmation for dummies (a dummy dying has no cue at all, `combat/index.ts:291-296`). Bot kills only show in the squad kill feed. Blocked teammate hits show nothing (`index.ts:301`).
Fix: hitmarker tick sound (normal and a sharper head variant), crosshair flash 0.12 to 0.2 s with a diagonal X shape, a red X plus "ding" on kill, small floating damage number (optional), "Teammate" hint on a blocked friendly hit. Needs two CC0 sounds, recorded in `CREDITS.md`.
Effort: S. Owner: Gameplay & Combat (+ UI/UX for the marker art).

### CMB-06 (P1) Damage, fire rate, falloff and armor give the wrong time-to-kill

Evidence: see the numbers table. DPS is 28/0.15 = 187 against ~477 for an M416. Falloff halves damage at 70 m, so a normal campus fight across a quad is half damage; hitscan stops at 150 m (`balance.ts:54`). Armor takes 50% of every hit including headshots (`damage.ts` `resolveIncomingDamage`), so full armor doubles TTK, and there is no helmet.
Fix (hand-computed, not run): `baseDamage` 41, `fireInterval` 0.09, `headshotMultiplier` 2.1, `limbMultiplier` 0.9, `falloffStart` 60, `falloffEnd` 300, `falloffMin` 0.8, `maxRange` 300, `armorMitigation` 0.4 (armor affects body only; keep a flat helmet reduction for later). Result: unarmored 3 shots (0.18 s), 50 armor 4 shots, 100 armor 5 shots. Bot damage scale (`botAim.ts:15`) should drop to about 0.5 so a bot hit is about 20 and TTK against the player stays human; AI Engineer to confirm. Update `damage.test.ts` expectations.
Effort: S. Owner: Gameplay & Combat (`balance.ts`), AI Engineer (bot scale).

### CMB-07 (P1) Heal rules

Evidence:
- Any damage cancels a heal (`combat/index.ts:222`). With CMB-01 this makes healing impossible in the zone.
- Reloading and healing can run at the same time: `beginHeal` (`index.ts:333`) never checks `reloading`, and `reload` (`index.ts:311`) never checks `healing`.
- Numbers: bandage +15 / 3 s (`balance.ts:39-40`), med kit +50 / 6 s (`balance.ts:36,44`) against PUBG bandage +10 / 4 s and med kit +100 / 8 s. A bandage is faster and bigger than PUBG's; the med kit is half as strong.
- Good: Q/B while healing says "Already healing", so no stacking; firing cancels but keeps the item.
Fix: bandage `bandageChannel` 4, `bandageHeal` 10 (cap 75 stays); med kit `medkitChannel` 8, `medkitHeal` 100. Damage no longer cancels; firing, reloading, sprinting and jumping do. Block starting a heal while reloading and a reload while healing, with a hint.
Effort: S. Owner: Gameplay & Combat.

### CMB-08 (P1) Default movement is 1.4 m/s; no sprint tier

Evidence: `config.ts:10` `walkSpeed: 1.4` is the plain WASD speed; `runSpeed: 4.5` only while Shift is held (`player/index.ts` `simulate`: speed picks `inp.run && cfg.allowRun ? runSpeed : walkSpeed`). Crouch is 1.15 m/s, slower than the walk. A player must hold Shift to move at a PUBG jog. There is no sprint above that, and no restriction on firing while fast. Backward and strafing are as fast as forward (`math.ts:19`). Zone need: the far edge in phase 2 needs 3.4 m/s straight-line (CMB-16), which only works with Shift held and no detours.
Fix: default move 4.7 m/s, Shift sprint 6.3 m/s with no firing and no ADS while sprinting (raise `runSpeed`, rename `walkSpeed`), crouch 2.7 m/s, backward x0.8, strafe x0.9. Keep `groundAccel` 14 (about 0.34 s to jog speed). Judgement call for the owner: 1.4 m/s is a real walking pace, but it fights the PUBG reference and the map size. Also raise `camPitchMin` from -40 to -60 degrees (`config.ts:68`) so you can look up at windows in third person.
Effort: S. Owner: Gameplay & Combat (`player/config.ts`, `player/index.ts`, `player/input.ts`).

### CMB-09 (P1) Audio is almost absent

Evidence: only `audio/gunSound.ts` and `audio/impactSound.ts` exist; assets are `gunshot_cc0.ogg`, `impact_ground_cc0.ogg`, `impact_wall_cc0.ogg`. No footsteps (grep: none), no reload, heal, pickup, dry-fire click, hitmarker, hurt, zone or ambient sounds. Gunfire falls off as `near/d` times a linear fade to 120 m (`gunSound.ts:7-24`): a bot shooting from 40 m is about 0.035 volume, from 60 m barely audible. PUBG's main information source is hearing footsteps and shots from far away. Stereo pan only, no front/back cue. One shared sample with only +-6% pitch.
Fix: (1) footsteps by speed and surface (concrete, grass, stairs) from CC0 samples, audible to about 25 m; (2) reload, heal channel, pickup, dry-fire click, hitmarker, hurt sounds; (3) gunshot `near` 8 m, `far` 400 m, inverse-distance volume plus a low-pass beyond 100 m; (4) a second shot sample for variety. Record every file in `CREDITS.md`.
Effort: M-L. Owner: Gameplay & Combat (`audio/**`).

### CMB-10 (P1) No ADS zoom or sensitivity change

Evidence: right mouse only sets `aimBlend` (`camera.ts` `update`), which widens the shoulder and shortens the arm (`config.ts:61-64`). The camera FOV stays 60 (`main.ts:61`; nothing else sets `camera.fov` except screenshot viewpoints). Mouse sensitivity is fixed 0.0022 (`config.ts:80`) in both states. Aiming gives no zoom, no slower turning and no movement slowdown.
Fix: ADS lerps FOV 60 to 48 (about 1.25x) over 0.15 s, sensitivity scaled by the FOV ratio (0.8x), move speed x0.7 while aiming. Reset on death and respawn.
Effort: S. Owner: Gameplay & Combat (`player/camera.ts`, `player/index.ts`).

### CMB-11 (P1) Crouched player can never be headshot by bots

Evidence: `botGun.ts:10,54` classifies a player hit as `head` only when `point.y - feetY >= 1.5`. The crouched capsule is 1.2 m tall (`config.ts:35`), so no bullet can reach 1.5 m. Crouching is complete headshot immunity against every bot, which also makes head damage (x2) meaningless once the player learns to crouch.
Fix: pass the player's current capsule height and use `head if hitHeight >= 0.86 x currentHeight`. Add a test: crouched hit at 1.15 m is a head hit.
Effort: S. Owner: Gameplay & Combat (`player/botGun.ts` is in `player/`), AI Engineer review.

### CMB-12 (P2) Bullet origin stays at 1.4 m when crouched

Evidence: `weapon.ts:49-52` `MUZZLE_HEIGHT = 1.4` is added to the feet height regardless of stance. The crouched capsule top is 1.2 m (`config.ts:35`), so the bullet starts 0.2 m above the player's head while the rendered gun is lower (tracer starts from the real barrel, `combat/index.ts` `getMuzzleWorld`). Crouching behind waist-high cover lets you hit what the barrel could not. The camera also drops in crouch (`camera.ts` `stance`).
Fix: muzzle height = 1.4 x (current capsule height / 1.75). Unmeasured visually; derived from code.
Effort: S. Owner: Gameplay & Combat.

### CMB-13 (P2) Reload

Evidence: one flat `reloadTime` 1.7 s (`balance.ts:35`) whether the mag is empty or not; PUBG M416 is about 2.2 s tactical and 3.1 s empty. The finish timer uses `performance.now()` (`combat/index.ts:318`, finish check at `index.ts:401`) while heals use game `dt`, so a backgrounded tab finishes the reload instantly. Reload cannot be cancelled (sprinting, healing). Clicking during reload is silent; no dry-fire click.
Fix: `reloadTime` 2.2, `reloadTimeEmpty` 3.0; use the frame clock; cancel on sprint start and on heal start (with CMB-07).
Effort: S. Owner: Gameplay & Combat.

### CMB-14 (P2) No fall damage

Evidence: `player/index.ts:232` emits `land` with `fallSpeed`, but nothing listens (grep: only the animation). `squad/friendlyFire.ts:3` says "fall damage always applies" but no such code exists. `maxFallSpeed` is 40 m/s (`config.ts:22`) and the only penalty is the killY teleport at -60 m (`player/index.ts:233`). Jumping off UIC's elevated plazas, ramps and roofs costs nothing.
Fix: on landing, damage = (fallSpeed - 7) x 17, ignoring armor, zero below 7 m/s (about 2.5 m drop). Examples: 5 m drop (9.9 m/s) = 49 HP, 8.6 m (13 m/s) = lethal. Cancels heal. Same for bots later.
Effort: S. Owner: Gameplay & Combat (`combat/index.ts` listener on `player.events`).

### CMB-15 (P2) Loot mix and pickup rules

Evidence:
- Outdoor loot is `count` 56 pickups at least 28 m apart (`campusLoot.ts:10-12`) inside the first safe circle (1.33 km^2), about 42 per km^2. Kinds: 22% rifles, 40% ammo, 38% bandages only (`campusLoot.ts:18-19,56-60`). Armor and med kits come only from building markers, one in six each (`buildingLoot.ts:7`). A player in the open never finds armor or a med kit. Building marker count: unmeasured (printed by the `[loot]` console line at boot).
- A new player has exactly one 30 round magazine: picking up a rifle sets the mag to 30 and keeps reserve 0 (`inventory.ts:45`). `startingReserve` 60 is only used by tests.
- `canReachPickup` (`inventory.ts:99-109`) checks distance and +-2 m height only, so loot behind a wall (or on the floor above a 2 m ceiling) is takeable through it.
Fix: outdoor shares gun 0.20, ammo 0.40, bandage 0.28, med kit 0.06, armor 0.06; give the first rifle pickup 30 extra reserve; add a line-of-sight ray (physics world) to pickup.
Effort: S. Owner: Gameplay & Combat (+ World Builder for building marker density).

### CMB-16 (P2) Zone pacing

Evidence (headless `buildZone`, seed 1, bounds from `campus.json`: 1401 x 1227 m):

| Phase | Radius (m) | Centre move | Worst-case distance to cover | Time | Speed needed | HP/s |
|---|---|---|---|---|---|---|
| 1 | 931 to 652 | 15 | 294 | 150 s | 2.0 | 0.4 |
| 2 | 652 to 447 | 203 | 408 | 120 s | 3.4 | 0.8 |
| 3 | 447 to 298 | 79 | 228 | 100 s | 2.3 | 1.6 |
| 4 | 298 to 186 | 95 | 207 | 75 s | 2.8 | 3.2 |
| 5 | 186 to 112 | 74 | 149 | 54 s | 2.8 | 6 |
| 6 | 112 to 36 | 53 | 129 | 38 s | 3.4 | 12 |

Total 537 s (about 9 min).
- The first circle is the smallest circle around the whole rectangle (`zoneLogic.ts:85-92`, radius 931 m). Its area is 2.72 km^2 against a 1.72 km^2 rectangle, so 37% of the opening circle is off the map. Phase 1 therefore shrinks over empty space for 150 s with no pressure on anyone.
- Phases 2 and 6 need 3.4 m/s straight-line from the worst edge, which is 76% of today's 4.5 m/s Shift speed before any detour around buildings (about 1.3x), and impossible at the 1.4 m/s default (CMB-08). At 0.8 HP/s that is survivable, so not a bug, but the margin is thin.
- The last circle stays at 36 m radius forever (`zoneLogic.ts:68`, `FINAL_RADIUS_M`); outside it does 12 HP/s, inside nothing forces a finish, so a bot-vs-bot standoff can stall.
Fix: first circle radius about 720 m (inscribed rectangle plus margin) centred on the play area, keep the other fractions; add a seventh phase closing the last circle to about 10 m over 20 s with 15 HP/s; keep the 9-minute total.
Effort: S. Owner: Gameplay & Combat (`zone/zoneLogic.ts`); `main.ts:111-125` loot uses the same circle, so the Project Lead sees a side effect.

## Not findings (checked and fine)

- **Shot goes where the crosshair points:** yes. `castAimedShot` finds the camera-ray point and fires from the muzzle to it. The only mismatch is the crouched origin height (CMB-12). Close walls: the muzzle ray hits the wall, `blocked` is true and the crosshair dims, so there is no wall clipping.
- **Instant hitscan, no bullet travel or drop:** acceptable at under 300 m on this map.
- **Reload and heal spam:** no stacking (`reloading` guard, "Already healing", "Magazine full" hints).
- **Dummy hit zones:** head ball and body capsule work; practice dummies respawn after 5 s.
- **Camera:** spring arm with wall sweep, shoulder offset, smoothed ADS blend. Fine.

## Out of scope for this phase (noted only)

Prone, lean/peek, vehicles, grenades, attachments, helmet tier, death crates, second weapon slot, boost items. The Quality Pass says no new features.
