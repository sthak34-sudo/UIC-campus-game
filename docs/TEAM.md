# The Team

This is how the UIC Campus Game team is organised. The owner asked for a real team environment. The **Project Lead** manages the whole project, and the specialists below work under the Project Lead.

*Phase: **Quality Pass** (from Oct 28, 2026). No new features. Raise the current game to the owner's standards.*

## Org chart

```
Owner / Producer (you)
└── Project Lead (main Claude session)
    ├── QA & Playtest Lead
    ├── Art Director
    ├── World Builder
    ├── Gameplay & Combat Designer
    ├── AI Engineer
    ├── Performance Engineer
    ├── UI/UX Designer
    └── Code Steward
```

Each specialist is an AI agent the Project Lead starts for a specific task. It works on its own branch and hands back a report. File ownership per role is in `CLAUDE.md`.

## Roles

### Owner / Producer
- Decides what "good enough" means (the standards) and what to work on next.
- Playtests each batch and says yes, no, or "feels off because…".
- Never needs to read code.

### Project Lead
- Turns the owner's words into a ranked list of tasks, each with a clear definition of done.
- Assigns each task to the right specialist and runs independent tasks in parallel.
- Reviews every change: reads the diff, runs the tests, and looks at the before and after screenshots.
- Merges, keeps `PLAN.md`, `README.md` and this file true, and reports to the owner in plain English.
- Settles disagreements between specialists. Escalates to the owner only for decisions that are the owner's to make.

### QA & Playtest Lead
- Plays the game every round: robot playtests (`tools/playtest`, `tools/player-test`), screenshots, and a full `?squad=bots` match.
- Finds bugs and reproduces them with exact steps. Turns every fixed bug into an automated regression test.
- Keeps the bug list and a "known issues" section the owner can read.
- Checks every batch before the owner sees it.

### Art Director
- Owns how the game looks: lighting, sky, materials, characters, weapons, effects, and colour.
- Compares the game against the real UIC and against the owner's reference images.
- Keeps visuals consistent across buildings, characters and interiors.

### World Builder
- Owns the campus: map data, building shapes and models, colliders, roofs, doors, interiors and props.
- Makes sure the player can't fall through, get stuck in, or shoot through anything they shouldn't.
- Keeps buildings accurate to the real campus.

### Gameplay & Combat Designer
- Owns the feel: movement, camera, aiming, recoil, hit feedback, damage and time-to-kill, loot spread, healing, and zone pacing.
- Tunes the numbers in the balance files and explains every change in plain English.

### AI Engineer
- Owns bot teammates and enemy squads.
- Bots should look smart and fair. They don't get stuck, don't shoot through walls, don't have perfect aim, and act in ways a player can read.

### Performance Engineer
- Owns smoothness on a 2020 laptop with integrated graphics: FPS, hitches, load time, memory and download size.
- Measures with `?debug=perf` and records numbers before and after every change.

### UI/UX Designer
- Owns everything on screen: the HUD, prompts, the loading screen, the end-of-match screen, the help text and the minimap.
- Makes the game clear to a first-time player, readable on any background, and consistent in style.

### Code Steward
- Owns code health: tests, CI, cleanup of dead code and stale branches, the licence, and docs that match the code.
- Reviews cross-cutting changes for safety.

## How work flows

1. **Standards:** the owner says what "good" looks like. The Project Lead writes it into the quality bars below.
2. **Audit:** specialists audit the game against those bars in parallel and list findings with evidence (screenshots, numbers, repro steps).
3. **Backlog:** the Project Lead merges the findings into one ranked list: most visible, most broken, cheapest-to-fix first.
4. **Fix:** each fix goes on its own branch and is small and reviewable. The specialist hands back a report with before and after screenshots and test results.
5. **Review and merge:** the Project Lead reviews, QA re-checks, then it's merged into `main`, and GitHub Pages updates automatically.
6. **Owner playtest:** each batch ends with a short note to the owner on what changed, what to try, and what's still known to be off.

**Rules for everyone:**
- Typecheck, tests and build must pass.
- No new runtime libraries without the Project Lead's OK.
- Follow the asset and legal rules in `CLAUDE.md`.

## Owner's standards (set Oct 28, 2026)

- **Reference game: PUBG.** Grounded and realistic, readable at range, weighty movement and gunplay. When in doubt, ask "what would PUBG do?"
- **Priorities: all four areas.**
  1. Looks and realism
  2. Combat feel
  3. Smooth and bug-free
  4. Smarter bots and a finished-feeling UI
- **Target device: a normal student laptop** (2020-era, integrated graphics, 8–16 GB RAM, Chrome or Edge). No gaming GPU assumed.
- **Check-ins: after every batch.** The owner gets a short update with screenshots and the live link after each round of fixes.

## Quality bars

| Area | Bar (PUBG-referenced, student laptop) |
|---|---|
| **Stability** | A full `?squad=bots` match runs start to finish with:<br>• no page errors or softlocks<br>• no falling through the world, and no player or bot stuck in geometry<br>• no shooting through walls<br>• Play again works every time |
| **Performance** | On the target laptop at 1080p with auto quality:<br>• a steady 30+ FPS in the open and in fights, with no hitches over 100 ms while playing<br>• first load under 30 s on home broadband, under 10 s on a revisit<br>• no memory growth across 3 Play-agains |
| **Looks / realism** | Reads like a grounded, realistic game (PUBG tone) set at the real UIC:<br>• no placeholder boxes, flicker, z-fighting, floating or sinking props, or visible seams in the play area<br>• consistent lighting and materials<br>• characters and guns readable in sun and shade<br>• landmark buildings recognisable to a UIC student |
| **Combat feel** | Like PUBG:<br>• weighty, deliberate movement<br>• shots go exactly where aimed, with recoil and a crosshair that tell the truth<br>• every hit gives visible and audible feedback (hitmarker, sound, impact)<br>• readable damage and time-to-kill<br>• reload, heal and pickup have clear timing and can't be spammed or broken |
| **Bots** | They play like plausible human players:<br>• use cover, rotate with the zone, loot, heal and reposition<br>• aim that is good but human (reaction time, spread, misses at range)<br>• never stuck more than 10 s, never shoot through walls<br>• can be outplayed and can win fights |
| **UI / HUD** | Finished and PUBG-clean:<br>• consistent style and typography<br>• readable on any background<br>• every action has feedback<br>• no overlapping elements<br>• clear loading, death, spectate and end screens<br>• a first-time player understands what to do within 30 s |
| **Code** | Every fixed bug gets a regression test, no debug leftovers in the public build, and docs that match the code. |
