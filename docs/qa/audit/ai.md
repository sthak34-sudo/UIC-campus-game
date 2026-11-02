# AI audit (round 1): bots vs the owner's bar

Auditor: AI Engineer. Branch `claude/uic-campus-game-plan-btnm3c`. Audit only: no code or committed file was changed except this report.
Bar (docs/TEAM.md, "Bots"): plausible human players that use cover, rotate with the zone, loot, heal and reposition; good-but-human aim (reaction time, spread, misses at range); never stuck more than 10 s; never shoot through walls; can be outplayed and can win fights.

## Summary

**The bots do not yet meet the bar. The biggest gap is not aim, it is that nobody fights.** In a full-length match (normal zone timing, 510 s of game time, 15 bots plus my autopilot player) the bots fired **zero shots**. All 14 deaths were caused by the zone. The three enemy squads stand where they spawn, then walk at 1.47 m/s toward a circle whose edge moves about three times faster, so they die outside it. The human squad "won" with 0 kills.

When a fight does happen (I staged one by placing the player 22 m from an enemy squad) the combat itself is reasonable on the numbers: bullets are real Rapier rays, none passed through a wall, and the spread table is human-like at range. But the bots react in zero time (first shot in the same 1/30 s frame as first sight, all four of them), see in 360 degrees, never use cover or crouch, charge in a straight line to 4 m, and a quarter of their shots hit their own squadmates standing in the way.

Smaller problems: one enemy bot stayed stuck at its spawn for 36.7 s, two teammate bots were stuck 10 to 12 s at the same spot twice, the stuck-route planner can hitch a frame by about 250 ms, bots never use armor or med kits, and zone damage is ignored on downed bots.

What works: line of sight and bullets respect walls (0 of 12 hits had a visible mesh in the way), foe memory sends a bot to the last-seen spot, bots reload, pick up ammo and bandage when safe, teammates follow the player (median 10.8 m behind), no page errors in any run.

## Measured numbers

Sample sizes are small (two full matches, one staged fight) because the machine was shared and the harness steps the game without rendering. Treat each number as "what I saw", not a statistic.

| Metric | Result | Run |
|---|---|---|
| Match duration, normal zone (`zoneSeed=3`, 4 squads of 4) | 510 s game time, ended with 1 squad alive (the human squad) | `realA` |
| Match duration, `zoneFast=1` | 53 s game time; all 16 players dead, 0 squads alive, end screen said "Victory" | `runA` |
| Shots fired by any bot in a full match | **0** | `realA` |
| Deaths by cause in a full match | 14 of 14 zone, 0 bot kills, 0 revives (11 knocks, all by the zone) | `realA` |
| Bot-vs-bot fights | **0** in both full matches | `realA`, `runA` |
| Winner distribution | 2 matches: human squad won once (outlived the others in the zone), nobody won once (all dead) | both |
| Enemy bot distance walked in 510 s | 97 to 180 m each (needed to reach next circle: 245 to 490 m); each spent 97 to 115 s outside the circle | `realA` |
| Enemy squads that moved at all before the zone | none; leaders idle (see AI-01); QA also saw less than 1 m in 150 s | `realA` and QA-11 |
| Loot pickups by bots in a 510 s match | 3 (two ammo boxes, one bandage); 1 bandage attempt, interrupted | `realA` |
| Stuck over 10 s | teammates p1 10.3 s and p2 12.0 s at (-18, -11); enemy p7 **36.7 s, never moved** at (27, 187) | `realA`, `runA` |
| Stuck 1 to 10 s | no other bot stuck longer than 6.2 s (squad C, `runA`); in `realA` every other bot at most 3 s | both |
| Teammate distance behind the player | median 10.8 m (target 6 m), max 192 m (left behind) | `realA` |
| Time to first engagement (staged, 22 m, in sight) | **0.0 s**: all 4 bots fired in the same 1/30 s frame they first saw the player | `engage22` |
| Shots in the staged fight | 23: 12 hit the player (52%), 6 hit a squadmate (26%, blocked), 3 hit the world, 2 missed | `engage22` |
| Hit rate on shots with a clear line | 12 of 17 (71%) at 18 to 25 m. The aim model predicts about 50% at 20 m, so the small sample sits high | `engage22` |
| Player downed by 4 bots at 22 m | about 3 s of firing while they walked 4 m closer; player killed before 110 s | `engage22` |
| Shots that hit through a visible wall or prop | **0** of 12 hits (muzzle to hit point checked against 175 visible meshes) | `engage22` |
| Cases where a bot "saw" a foe that a mesh ray says is hidden | 0 | `engage22` |
| Crouch or cover use by living bots | none; code has no cover logic, crouch flag only for downed bots | code |
| Modelled hit rate (200k samples of `botAimPoint`, body capsule) | 98% at 5 m, 87% at 10 m, 65% at 15 m, 47% at 20 m, 32% at 28 m, 19% at 40 m | model |
| Body hit damage / hits to down from 100 HP | 16.8 / 6 hits; at the 0.5 s interval, about 3.5 s per bot | code |
| Route planner cost (Node, stubbed `isFree`) | 247 ms with a 40 m wall in the way; 2 ms in open ground | bench |
| Page errors / console errors | 0 / 0 in all runs | all |

Not measured (needs a real fight between bots, which never happened): bot-vs-bot win rates, teammate revive under fire, bandage use in contact, cover use by enemy squads. The code paths are read in the findings.

## Findings

Severity: P0 breaks the bar badly, P1 clearly misses it, P2 polish or realism. Owner: AI Engineer unless noted. Code references are to `client/src/`.

| ID | Sev | Title | Evidence | Suggested fix | Effort | Owner |
|---|---|---|---|---|---|---|
| AI-01 | P0 | No fights happen: enemy squads sit at their spawn and the match is decided by the zone | Measured (`realA`, full timing): 0 shots, 0 bot kills, 14 of 14 deaths from the zone. Cause in code: `squad/adapter.ts:739-741` makes an enemy squad's leader the first living member, so for that member `leaderId === body.id`; `botIntent` returns `follow` with itself as target (`squad/bots.ts:68-70`) and `stepToward` never moves (`adapter.ts:824-831`). The other three follow it. Squads only act on a foe within 28 m (`adapter.ts:719`), loot within 12 m (`botLoot.ts:188`) or the zone (`squad/botZone.ts`). In the 20 s smoke run squads C and D spent 20.0 of 20.0 s in `follow` with 0.0 m travelled. Confirms QA-11. | Give each enemy squad a goal: loot route, then a rotation point inside the next circle, then hunt the nearest known squad or the player's last heard shot. The leader needs a `moveTo` goal, not `follow` itself. | M | AI Engineer |
| AI-02 | P1 | Bots react instantly | Measured (`engage22`): first sighting at t=10.333, first shot at t=10.33 for all four bots, so reaction time is 0 s. Code: `squad/botAim.ts:24-28` starts the cooldown at 0 and fires the same frame the target is visible (`adapter.ts:857-859`); the 0.5 s interval only spaces later shots. Bar asks for reaction time. | Add a per-target acquisition delay (0.25 to 0.6 s, random, longer beyond 20 m or when the foe appears at the edge of the bot's view) before the first shot. | S | AI Engineer |
| AI-03 | P1 | Bots see 360 degrees and turn instantly | `adapter.ts:712-726`: any foe within 28 m with a clear ray is "seen", no field of view or facing test; the body then snaps to face it (`adapter.ts:854`, no turn rate). A bot can never be flanked or surprised from behind. | Field of view about 110 degrees plus a "took damage / heard a shot" override; limit turn speed (for example 300 deg/s). | M | AI Engineer |
| AI-04 | P1 | Bots never use cover and never crouch | `adapter.ts:843-853`: `shoot` is `stepToward(foe, stopAt 4)` at 0.85 x walk speed, so they walk into the open and stand 4 m away. Measured: all four bots walked the whole 3.2 s of firing (`chargeTime == shootTime`). Crouch flag is set only for downed bots (`adapter.ts:647`). Nothing in `squad/**` samples cover, strafes or peeks. | Cover picker (points a ray from the foe cannot reach but a short step re-exposes), peek-shoot-duck loop, crouch while shooting from cover, retreat to cover to reload and heal. | L | AI Engineer |
| AI-05 | P1 | Bots only walk (1.47 m/s) and cannot keep ahead of the zone | `adapter.ts:635` `botSpeed = walkSpeed x 1.05`; player run speed is 4.5 m/s (`player/config.ts`). Zone edge speeds are 3.1 to 4.6 m/s (`zone/zoneLogic.ts` `PHASE_TABLE`; QA-11 lists them). Measured: enemy bots walked 97 to 180 m while needing 245 to 490 m, and each spent 97 to 115 s outside the circle (`realA`). Rotation starts only 25 s before a shrink (`botZone.ts` `rotateLeadS`). | Sprint while `botZoneGoal` is non-null; start rotating earlier for bots far from the next circle; later phases: head for the circle edge nearest to them rather than the centre. | S | AI Engineer (Gameplay Designer to confirm zone pacing) |
| AI-06 | P1 | Enemy member start positions are not validated: a bot can be stuck at its spawn all match | Measured (`runA`): enemy `p7` (squad B, slot 3) moved 0.0 m in 51.8 s; it was stuck 36.7 s straight at (27.4, 187.4) while its three squadmates walked 54 to 55 m. Likely cause from code: `squad/enemySpawn.ts:169-173` `memberOffset` shifts slots 1 to 3 by 2.5 m from the validated squad spot and `adapter.ts:218-221` places them there with no ground or wall check. | Check each member start with `wallProbe.free` and `probe.sample`; spiral-search for the nearest free cell. Add a watchdog: after 8 s with no progress, move the bot to the nearest free cell on its route. | S | AI Engineer |
| AI-07 | P1 | Teammates get stuck 10 to 12 s at the same spot, twice | Measured (`realA`): `p1` stuck 10.3 s (follow) at t=222 and `p2` stuck 12.0 s (zone `moveTo`, goal 301 m away) at t=337, both at world (-18.3, -11) near the spawn. The route planner should start after 0.7 s (`routePlan.ts` `stuckAfter`), so it either found no way out or the plan failed. Over the 10 s limit in the bar. Repro: `?squad=bots&zoneSeed=3`, let the squad walk toward the zone from the spawn. | Log the planner result for that spot; likely a dead-end pocket wider than the planner radius. Add the watchdog from AI-06 and a regression test using the recorded coordinates. | M | AI Engineer (World Builder if the pocket is a collider bug) |
| AI-08 | P1 | Stuck-route planner can hitch a frame by about 250 ms | `squad/routePlan.ts:303-306` finds the best open node by scanning the whole open list (quadratic), up to 5000 cells in a 24 m radius. Bench in Node with a free-everywhere stub: 247 ms with a 40 m wall in the way, 2 ms in open ground. In the game each cell also costs a Rapier `intersectionWithShape` (`adapter.ts:902`) and several bots can be stuck at once. Bar: no hitch over 100 ms. | Binary heap, `maxNodes` near 1500, one planning bot per frame, cache failed plans for 1 to 2 s. | S | AI Engineer (Performance Engineer to review) |
| AI-09 | P1 | Bots never use armor, med kits or grenades, and rarely bandage | `squad/botLoot.ts:208` `BOT_LOOT_KINDS = ['gun','ammo','bandage']`; `startBandages: 0` (`botLoot.ts:200`); healing only when calm and under 75 HP. Measured: 3 pickups in 510 s, 1 bandage use (interrupted). A bot hurt in a fight stays hurt; no loot-and-heal loop as the bar asks. | Add armor and med kits to wanted kinds, use them when calm; consider 1 to 2 starting bandages; let enemy squads loot as part of their route (AI-01). | S | AI Engineer |
| AI-10 | P2 | A quarter of bot shots hit their own squadmates | Measured (`engage22`): 6 of 23 shots (26%) hit a squadmate and were blocked (`blocked` in `botHits.ts`), because `botSight.ts` ignores people so a bot "sees" a foe behind a teammate, and `botGun.ts:42-52` stops at the first non-self collider. The squad also bunches in a line because they all walk the same straight path. | Treat a squadmate in the line as an obstruction: sidestep before firing; spread squad members laterally when advancing. | S | AI Engineer |
| AI-11 | P2 | Aim accuracy ignores movement | `botAim.ts:31-40` uses distance only; bots fire while stepping toward the foe with no penalty and the target's strafing changes nothing. Distance curve itself is human-like (see model row). | Add spread terms for the bot's speed and the target's lateral speed, and a short recovery after being hit. | S | AI Engineer |
| AI-12 | P2 | Bots stay at 28 m detection although weapon range is 40 m | `adapter.ts:719` (`d < 28`) vs `BOT_AIM.range = 40` (`botAim.ts`). The long-range part of the spread table is never used; bar says "misses at range". | Raise detection to match range once AI-03 field of view is in, or lower the constant. | S | AI Engineer |
| AI-13 | P2 | A bot with no ammo still charges to 4 m and stands there | `adapter.ts:843-860`: `shoot` movement does not check `botCanShoot` / `botDry`, only the trigger does. | Dry bot: retreat to cover or switch to follow / loot ammo. | S | AI Engineer |
| AI-14 | P2 | Zone damage is silently ignored for downed bots | `adapter.ts:745-748` sends zone damage through `applyDamage`, which returns early for a downed victim (`squad/downed.ts:352-354`); only the 100 s bleed kills them although `DOWN.zoneDamageMult` says the zone should hurt knock health. | Route zone damage for downed bots through `applyDownedDamage`, as the player path does. | S | AI Engineer |
| AI-15 | P2 | A simultaneous wipe by the zone reports a Victory | `runA`: all 16 players died to the zone; `squadsAlive` ended at 0 and the end screen said "Victory! #1 of 4 squads, kills 0". `checkWipe` in `squad/elimination.ts` has no tie rule. Also `zoneFast` is unrepresentative for bot tuning because bot speed is not scaled. | Add a tie rule (most knock health left wins, or no winner screen). | S | AI Engineer |
| AI-16 | P2 | When the human dies, teammate bots stop playing | `bots.ts:68-70` returns `idle` when the leader is dead; surviving mates stand still (zone rotation aside) instead of looting or holding position. | Fall back to the squad-leader behaviour from AI-01. | S | AI Engineer |
| AI-17 | P2 | Downed bots do not crawl anywhere | `adapter.ts:820-821` "Crawl in place for now." | Crawl toward the nearest teammate or cover at `DOWN.crawlSpeed`. | S | AI Engineer |

## Cross-checks of other auditors' findings

- **QA-11 (enemy bots barely move, cannot outrun the zone): confirmed and refined.** Cause is AI-01 (leader follows itself) plus AI-05 (walk-only speed). Measured here: zero shots and 14 of 14 zone deaths in a full match, enemy bots walked 97 to 180 m of the 245 to 490 m needed. The "zone kills inferred" gap in QA-11 is closed: kills with `by: 'zone'` were counted from the squad event log.
- **QA-04 (Play again leaks `#spectate-banner`): confirmed by reading.** `squad/adapter.ts:412-420` creates and appends the banner; `dispose()` (around line 1010) removes the HUD, end screen and debug panel but never `specBanner`. Fix is one line, `specBanner.remove()`, plus a regression test. Owner: AI Engineer.
- **CODE-14 (bots cannot headshot a crouched player): confirmed by reading.** `player/botGun.ts:10,54` counts a head hit only at 1.5 m or more above the feet, and the crouched capsule is 1.2 m (`player/config.ts:35`). Bots still aim the head point at 1.66 m (`botAim.ts`), so for a crouched player the head point is above the capsule and misses. Needs a crouch-aware neck height (Gameplay and Combat Designer owns `player/`, AI Engineer owns the aim point).

## Method

- Code read: all of `squad/**` plus `player/botGun.ts`, `botSight.ts`, `wallProbe.ts`, `botBodies.ts`, `zone/zoneLogic.ts`, `combat/balance.ts`.
- Runs: a private Playwright script (kept in the scratchpad, not committed) loads the game from a Vite server on port 5305, patches the served `main.ts` and `adapter.ts` in memory (no repo file touched) to expose bot internals, and steps the game at 30 Hz without rendering. An autopilot walks the human toward the safe zone (it needed 5 small teleports to get past walls in `realA`). Per-bot stuck time, intents, shots, who each shot hit, and a visible-mesh check from muzzle to hit point were recorded. Raw output is in `screenshots/tmp/audit/ai/*.json` (gitignored).
- Runs: `smoke` (20 s), `runA` (`zoneFast=1`, 53 s), `realA` (`zoneSeed=3`, normal timing, 510 s), `engage22` (player placed 22 m from the nearest enemy squad after the 5 s spawn grace, 110 s). No screenshots were needed.
- Side note, not a finding: 8% of floor checks put a bot 0.45 m above the visible `campus-ground-surroundings` mesh (one bot, same spot). Could be a kerb or a collider-vs-mesh gap; passed to World Builder for a look rather than counted here.
