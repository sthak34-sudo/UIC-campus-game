# UIC Campus Game

A realistic battle royale on the real University of Illinois Chicago East Campus, played in a web browser.
Built with three.js, Rapier, and Vite.

**Play it:** https://sthak34-sudo.github.io/UIC-campus-game/ (rebuilt automatically from `main`)

**Status:** the full single-player match loop is in:
- loot, combat and a shrinking safe zone
- AI enemy squads, squads with revive and spectate
- an end-of-match screen

Online play with real people is not built yet. The current focus is a quality pass on what exists. See [`PLAN.md`](PLAN.md).

## Run it on your computer

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173 and click the view to capture the mouse.

You start **unarmed** in front of Daley Library, with a rifle on the ground nearby. Walk to it and press **E** to pick it up. Loot (rifles, ammo, bandages, med kits, armor) is spread around campus inside the first safe circle. Practice dummies stand along the library walkway.

## Game modes (add to the address)

| Address ending | What you get |
|---|---|
| *(nothing)* | Solo: you, the zone, loot and practice dummies |
| `?squad=bots` | You plus 3 bot teammates, against 3 enemy bot squads |
| `?squad=bots&enemySquads=N` | Choose 0–4 enemy squads |
| `?quality=low`, `medium` or `high` | Graphics quality (default: picked for your computer) |
| `?zoneFast=1` | Zone timers run 10× faster |
| `?zoneSeed=N` | A different set of zone circles |
| `?sky=bridges` | Late-afternoon sky instead of overcast |
| `?debug=perf` | FPS, frame time and draw-call panel |

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Run |
| Space | Jump |
| C | Crouch (toggle) |
| Mouse | Look (click to capture, Esc to release) |
| Left click | Shoot |
| Right mouse (hold) | Aim over the shoulder |
| R | Reload |
| E | Pick up |
| Q | Use a med kit |
| B | Use a bandage |
| V | First / third person |
| F3 | Debug line |
| **Squad mode only:** P | Ping |
| **Squad mode only:** hold F | Revive a downed teammate |
| **Squad mode only:** Left / Right | Switch between teammates while spectating after you die |

**Test keys:** these only work in `npm run dev`, or when the address includes `?debug`. They're switched off in the public game.

| Key | Action |
|---|---|
| H | Hurt yourself |
| Z | Skip the zone timer |
| K | Knock down or finish yourself |
| J | Knock down a bot |
| L | Heal the squad |
| O | Wipe your squad |

## Art and licences

**Committed to the repository:**
- the realistic body and the free (CC0) animations, so the public build shows an animated human
- every other committed asset, each listed in [`CREDITS.md`](CREDITS.md)

**Optional private animations:** if you have a private `anims.glb` (Mixamo) in `client/public/models/private/`, the game uses it instead of the free animations. That file is never committed.

> Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago.
