# UIC Campus Game: Project Plan

*Last updated: October 10, 2026 · Status: **Plan approved. Now building the realistic map (Milestone 0–1)***

## 0. The plan in one minute

We're building a **3D game of the real UIC campus that you play in a web browser**, with
**other students online at the same time**. Players take on **missions** like
"get to your 9 AM class before the bell" or "catch the Blue Line", racing each other across
a campus built from real map data.

A team of AI agents writes the code. Each agent has one specialty, like a real game studio.
You're the **Producer**: you decide what the game should be and playtest it. I'm the
**Project Lead**: I run the team, review all the work, and explain everything in plain English.

We build in **5 milestones**. Each one ends with something you can actually try:

1. 🗺️ **Walk around UIC:** the real campus in 3D, and you can walk it
2. 👥 **See each other:** other players appear and move in real time
3. 🎯 **First missions:** five missions with timers, points and landmark fun facts
4. 🏁 **Race your friends:** multiplayer races and leaderboards
5. 🚀 **Polish & launch:** sound, our own mascot, speed on school laptops, then share it with classmates

**Cost:** $0 while we build. About $10–15/month once lots of people play together regularly
(that's the server that connects players).

## 1. What we decided (your choices)

| Question | Your answer | What it means |
|---|---|---|
| Look & feel | **3D, real UIC map** | Buildings and streets come from OpenStreetMap, a free public map. Real shapes and real heights, in a clean "low-poly" style. |
| What players do | **Missions / quests** | Timed goals across campus, with points and rewards. |
| Where to play | **Web browser** | Anyone opens a link. Nothing to install. |
| Players | **Multiplayer from day one** | The game is designed for many players from the very first line of code. You'll see other players by Milestone 2. |
| Realism (decided Oct 10) | **Browser + photo landmarks** | As realistic as a browser allows: exact building shapes from laser scans, real concrete/brick materials, good lighting and trees. The owner's own photos make the landmarks look like the real buildings. This is honestly *not* GTA 6 level, which no option here can reach. See [`docs/research/realism-options.md`](docs/research/realism-options.md). |
| Map data source | **Overture Maps + USGS laser scans** | Overture (which includes OpenStreetMap data) works from our cloud computer today. Laser scans (LiDAR) correct wrong heights. |
| Interiors (decided Oct 10) | **Buildings can be entered** | Daley Library first, with a full walkable interior. Every building we work on later gets an interior too. Interiors follow public information and the owner's photos, because exact floor plans aren't published. |
| Owner photos | **Yes** | The owner photographs key buildings using [`docs/photo-guide.md`](docs/photo-guide.md). |

## 2. The team (how the "game studio" works)

Think of this like a small game studio. Each AI agent is a specialist with one job, and
work flows through a review step before it goes into the real game, just like at a company.

| Role | Who | What they do |
|---|---|---|
| **Producer / Owner** | **You** | Decide what the game should be, playtest each milestone, approve or ask for changes. You never need to write code. |
| **Project Lead / Tech Lead** | Me (the main Claude session) | Turn your ideas into tasks, assign them to agents, review every agent's work, make sure the pieces fit together, explain progress to you in plain English. |
| **Map Engineer** | Agent | Turns real OpenStreetMap data into the 3D UIC campus: buildings, streets, sidewalks, grass, trees. |
| **Gameplay Engineer** | Agent | The player character: walking, running, camera, bumping into buildings; the mission system (start, timer, goal, reward). |
| **Multiplayer Engineer** | Agent | The game server: lets players join, see each other move in real time, and race in missions fairly. |
| **Game Designer & Writer** | Agent | Designs the missions, writes the text (mission briefs, landmark fun facts), balances difficulty and points. |
| **UI Designer** | Agent | Everything on screen that isn't the 3D world: title screen, nickname picker, mission tracker, minimap, leaderboard. |
| **QA Tester** | Agent | Plays the game automatically in a real browser, takes screenshots, runs tests, and reports bugs before you see anything. |
| **DevOps / Release** | Agent | Puts the game on the internet (a link you can share) and keeps it updating automatically. |

Not every agent works at the same time. Each phase "staffs up" only the roles it needs.

## 3. How we'll work together (the workflow)

1. **You give direction**: "I want X" or "this feels wrong", in plain English.
2. **I write tasks**: small, clear assignments with a definition of "done".
3. **Agents build in separate drafts.** Each agent works on its own *branch*, a private
   draft copy of the project, so agents never overwrite each other's work.
4. **QA checks the work.** Automated tests plus a robot that opens the game in a browser and takes screenshots.
5. **I review and merge.** If it's good, the draft gets combined into the main game. If not, it goes back to the agent.
6. **You playtest.** At the end of each phase you get a link (or screenshots) to try it and give feedback.

Everything is saved on GitHub in your `UIC-campus-game` repository, so nothing is lost when a
session ends, and you can always see the full history of what changed.

### Words you'll hear (cheat sheet)

| Word | Plain-English meaning |
|---|---|
| **Repository (repo)** | The project folder on GitHub that holds everything. |
| **Branch** | A draft copy of the project where someone can work safely. |
| **Commit** | A saved checkpoint with a note describing what changed. |
| **Pull request (PR)** | "Please review my draft and merge it into the main version." |
| **Client** | The part of the game that runs in the player's browser (graphics, controls). |
| **Server** | A computer on the internet that connects all players so they see each other. |
| **Deploy** | Publish the latest version so the link shows the new game. |
| **Bug** | Something that doesn't work as intended. |

## 4. The world: which part of UIC we build first

**Version 1 = East Campus core**, about 1 km × 1.2 km. It covers a full student day in one compact area:

- **North edge:** just past the I-290 / Eisenhower Expressway trench (includes the UIC-Halsted Blue Line station)
- **South edge:** just past Taylor St (includes the new CS building and the first block of Little Italy)
- **West edge:** just past Racine Ave (includes Credit Union 1 Arena and the Racine Blue Line station)
- **East edge:** just past Halsted St (includes the Student Recreation Facility and Hull-House)

Map data box (south, west, north, east): `41.8685, -87.6600, 41.8772, -87.6455`

Walking it corner to corner takes about 15–25 real minutes. In the game you'll move about 2× faster, so
it should feel big but not empty.

**Key landmarks in version 1:**

- **University Hall:** the 28-story tower, and the thing players will navigate by
- **Daley Library**
- **Student Center East (SCE)** and its food court
- **The Quad and the Lecture Centers:** the main meeting spot where new players appear
- **Behavioral Sciences Building (BSB):** the famous maze
- **Science & Engineering buildings:** SEO, SELE, SES and ERF
- **Computer Design Research & Learning Center:** the new CS building, opened July 2025
- **Student Recreation Facility (SRF)**
- **ARC residence hall:** the player's "home"
- **Credit Union 1 Arena**
- **Student Services Building**
- **Blue Line stations:** UIC-Halsted and Racine
- **#8 Halsted bus stops**
- **Jane Addams Hull-House Museum**
- **The U-I-C hedges**
- **Taylor St spots:** Al's #1 Italian Beef and Mario's Italian Lemonade

**Later expansions:**

- **v1.5:** the South Campus strip (Dorin Forum, Granderson Stadium, Maxwell St)
- **v2:** the rest of Little Italy and Greektown
- **v3:** West Campus and the Medical District

**Things we will *not* build** because they no longer exist in real life:

- The old elevated walkways and the Great Court. They might come back later as a "history mode".
- The DiMaggio and Columbus statues.

## 5. Missions (the core gameplay)

Every mission has a start, a goal, a timer or challenge, and a reward (points / XP).
Multiplayer missions let players race each other or team up.

### Launch missions (version 1: five missions, easy → medium)

| # | Mission | What you do | Route | Multiplayer twist |
|---|---|---|---|---|
| 1 | **The 9 AM Sprint** | Get to class before the bell | ARC dorm → Lecture Center A | Race everyone online |
| 2 | **Welcome Week Tour** | Visit 5 key landmarks and unlock a fun fact at each | Quad → University Hall, Daley Library, SCE, SRF, Blue Line | Experienced players can guide new players for bonus XP |
| 3 | **Lunch Between Classes** | Grab food at SCE and still make it to lab on time | BSB → SCE food court → SES | Race |
| 4 | **Catch the Blue Line** | Make the next train; pick the closest of the station's 3 entrances (Halsted / Peoria / Morgan) | Daley Library → UIC-Halsted station | Race; group-boarding bonus |
| 5 | **Book Due Tonight** | Return an overdue book before the library deadline | ARC → Daley Library (at night) | Solo |

### Missions saved for later (the Designer has 15 more ready)

- **Lost in BSB:** a co-op maze
- **Office Hours Hunt:** University Hall elevator vs. stairs
- **Involvement Fair Stamp Rally:** a team event
- **Beef Run for the Study Group:** a relay delivery
- **Tip-Off at the Arena**
- **Hull-House History Quest**
- **Campus Scavenger Hunt**
- **Capture the Quad:** team vs. team
- **Finals Week Gauntlet**
- Seasonal events, such as summer-only Mario's Lemonade runs

### Fun facts (pop up when you reach a landmark)

The research team has collected 18 sourced facts. A few examples:

- University Hall is 28 floors (about 338 ft), the tallest building on Chicago's West Side. It gets *wider* as it goes up.
- The Quad used to be the "Great Court," a granite plaza with an amphitheater built on the Lecture Center roofs. It was torn out in 1993–99.
- UIC started in 1946 on **Navy Pier**, where students nicknamed it "Harvard on the Rocks."
- The team name "Flames" (1982) honors the Great Chicago Fire of 1871 and the city's rebirth afterwards.
- The room-sized "CAVE" virtual-reality system was invented at UIC's Electronic Visualization Lab.

## 6. Branding rules (keep the project safe)

UIC runs an official trademark licensing program. To stay a fan project that doesn't get into trouble:

- **Don't use:**
  - the UIC logo, the university seal, or the Flames athletics logos
  - Sparky's actual design. We'll create our **own original mascot character** instead.
  - restaurant or CTA logos
- **Don't name the game "UIC ___"** in a way that implies it's official. The title will be decided later.
- **Use fictional names for people.** No real professors or administrators.
- **Fine to use:**
  - real building and street names
  - the real map shape, credited with "© OpenStreetMap contributors"
  - a red and navy color scheme
  - our own flame designs
- **Show a disclaimer** on the title screen: *"Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago."*
- If the game ever makes money or gets promoted publicly, ask UIC's Marketing & Brand Management office first.

Reference colors (official UIC palette, for inspiration only):

- **Fire Engine Red:** `#D50032`
- **Navy Pier Blue:** `#001E62`
- **Chicago Blue:** `#41B6E6`
- **Champions Gold:** `#FFBF3F`

## 7. Technology (what the game is built with)

You don't need to learn any of this. It's here so you know what we're using and why.

| Part of the game | Tool we'll use | Plain-English meaning | Cost |
|---|---|---|---|
| Programming language | **TypeScript** | One language for every part of the game. It catches many mistakes automatically before anyone plays. | Free |
| 3D graphics | **three.js** | The most popular way to draw 3D in a web browser. It has the most examples, so AI agents write it most reliably. | Free |
| Walking & collisions | **Rapier** | Physics that stops you walking through walls and lets you step up curbs. | Free |
| Campus map | **OpenStreetMap** data → our own conversion script | We download UIC's real buildings and streets **once**, save the file in the project, and a script turns it into 3D. | Free |
| Multiplayer | **Colyseus** | A game server made for exactly this kind of game: rooms, syncing players, reconnecting after Wi-Fi drops. | Free software |
| Server hosting | **Render** (Ohio region, closest to Chicago) | The computer on the internet that connects players. | Free while building; ~$10–15/mo for regular big sessions |
| Website hosting | **Cloudflare Pages** | Where the game's link lives. Each change gets its own preview link you can try before it goes live. | Free |
| Characters, trees, cars | **Quaternius** and **Kenney** free 3D models | Ready-made models with walk and run animations that anyone may use for free. | Free |
| Automatic testing | **Vitest** + **Playwright** + **GitHub Actions** | Robots that check every change and play the game in a browser before you see it. | Free |

**Key technical decisions:**

- **The server is the referee.** Your browser draws the game and sends your moves, but the server
  decides mission timers, who reached the finish first, and who won. That makes races fair and hard to cheat.
- **No login in version 1.** You just pick a nickname. We don't collect names, emails, NetIDs or
  student IDs. A free account system (Supabase) can come later if we want saved progress across devices.
- **No free-text chat in version 1.** Players get preset emotes and quick phrases instead, so we
  don't have to moderate what people type.
- **Pinned tool versions.** Every tool version is locked so AI agents don't accidentally mix old and
  new instructions, which is the #1 cause of broken AI-written code.

Full technical details are in [`docs/research/tech-architecture.md`](docs/research/tech-architecture.md).

## 8. Roadmap: milestones and who works on what

Each milestone ends with a **playtest by you** before we move on. If something feels wrong, we fix
it before building on top of it.

### Milestone 0: Foundations (setup)
- **Goal:** the empty project is ready for the team, and the map data is downloaded.
- **Team:** DevOps, Map Engineer
- **Work:**
  - Create the project folders and pin the tool versions.
  - Write a handbook file (`CLAUDE.md`) that every agent reads first.
  - Set up the automatic testing robots.
  - Download UIC's map data and check how many buildings have real height data.
- **You'll see:** a short report on how many campus buildings have real height data, and which ones we had to guess.

### Milestone 0.5: 📸 Realism test scene (added Oct 10)
- **Goal:** prove the realistic look on one spot before building the whole campus.
- **Spot:** University Hall plus the Quad.
- **Team:** Map Engineer, Graphics/Lighting Engineer, QA Tester
- **Work:**
  - Use laser-scan heights.
  - Model University Hall's real window grid and its wider-at-the-top shape.
  - Add weathered concrete materials, sky and sun lighting, shadows, trees, benches and lamp posts.
  - Swap in the owner's photos when they arrive.
- **You'll see:** before-and-after screenshots. You judge "does this look like UIC?"

**Status (Oct 10): first version built ✅** Screenshots are in [`docs/images/realism-test/`](docs/images/realism-test/).
- **Data:** LiDAR heights for 1,171 buildings and 3,806 trees.
- **University Hall:** the stepped 28-floor tower.
- **Daley Library:** a 4-floor walkable interior, tested by a robot walking in and up the stairs.
- **Look:** real sky, sun and shadows, generated PBR materials, and the surrounding city out to the Loop.
- **Waiting on the owner:** photos, plus unblocking free texture sites for even more realistic materials.

### Milestone 1: 🗺️ Walk around UIC
- **Goal:** the real East Campus in 3D, and you walk and run around it.
- **Team:** Map Engineer, Gameplay Engineer, QA Tester, DevOps
- **Work:**
  - Turn the map data into 3D buildings, streets, sidewalks, grass and trees.
  - Build a character you control with keyboard and mouse, and a camera that follows behind you.
  - Make sure you can't walk through walls.
  - Show landmark name labels.
  - Show the "© OpenStreetMap contributors" credit and the fan-project disclaimer.
- **You'll see:** a **link you can open on your laptop** to walk from the ARC to University Hall. You'll check that the campus looks right.

### Milestone 2: 👥 See each other
- **Goal:** many players online in the same campus at once.
- **Team:** Multiplayer Engineer, UI Designer, QA Tester, DevOps
- **Work:**
  - Set up the game server on Render.
  - Add a title screen and nickname picker, with a filter for offensive names.
  - Show other players walking smoothly in real time.
  - Add emotes such as wave and dance, and a player list.
  - Handle reconnecting after Wi-Fi drops.
  - Show a "waking up server…" screen, because the free server naps when nobody is playing.
- **You'll see:** you and a friend (or two browser tabs) walking around together.

### Milestone 3: 🎯 First missions
- **Goal:** the 5 launch missions are playable.
- **Team:** Gameplay Engineer, Game Designer & Writer, UI Designer, Multiplayer Engineer, QA Tester
- **Work:**
  - Build a mission system: start point, goal, timer, rewards and points, with the server keeping score.
  - Add on-screen help to find your way: a direction arrow, a minimap and a mission tracker.
  - Add fun-fact pop-ups at landmarks.
  - Make night-time lighting for "Book Due Tonight".
- **You'll see:** all 5 missions played start to finish. You'll judge whether they're fun, too easy, or too hard.

### Milestone 4: 🏁 Race your friends
- **Goal:** multiplayer competition.
- **Team:** Multiplayer Engineer, Gameplay Engineer, UI Designer, QA Tester
- **Work:**
  - Add a race lobby: "3 players ready, starting in 10…"
  - Have the server judge the finish order.
  - Add leaderboards (best times per mission), group bonuses, and basic anti-cheat (speed and teleport checks).
- **You'll see:** a real race against friends. Afterwards we stress-test with 50 robot players.

### Milestone 5: 🚀 Polish & launch
- **Goal:** ready to share with classmates.
- **Team:** everyone
- **Work:**
  - Add sound effects and music.
  - Design our **own original mascot character**.
  - Make the game run smoothly on cheap school laptops.
  - Add a credits screen, a final title and a public link.
- **You'll see:** the launch version. **You** decide when it's ready to post.

### After launch (ideas, not promises)
- More missions: Lost in BSB, Capture the Quad, Finals Week Gauntlet, and others
- Bigger map: South Campus → Little Italy → West Campus
- Choose your character or major
- Seasonal events
- Phone support
- Saved accounts

## 9. Costs

| Item | When | Cost |
|---|---|---|
| All software tools | Always | **$0** (free and open source) |
| Website hosting (Cloudflare Pages) | Always | **$0** |
| Game server (Render, free plan) | While building and testing | **$0**. It "naps" after 15 minutes with nobody playing and takes about 1 minute to wake up. |
| Game server (Render, Starter plan) | When we hold regular group play sessions | **~$10–15/month** ($7 base + data for many players). Cheaper fallback: Fly.io at ~$5/month. |
| Custom web address (like `uicgame.com`) | Optional | ~$10/year |

We'll set a **billing alert** so there are never surprise charges. Nothing costs money until you
decide to upgrade the server.

## 10. What I need from you

**Right now:**
1. **Read this plan** and tell me what you'd change. Add or remove missions, or anything else.
2. **Unblock the map download.** The cloud computer I work on blocks OpenStreetMap's server. To allow it:
   1. Open the cloud environment menu in this session's title bar and click **Edit**.
   2. Under **Network access**, add these to **Allowed domains**: `overpass-api.de`, `api.openstreetmap.org`
   3. Leave "Allow package managers" ticked.

   ([Instructions with screenshots](https://code.claude.com/docs/en/cloud-environments#network-access))

**Later** (I'll walk you through each one step by step when we get there):

3. **Milestone 1:** create a free **Cloudflare** account so the game gets a public link.
4. **Milestone 2:** create a free **Render** account for the game server.
5. **End of every milestone:** playtest and give feedback. "This feels slow" or "University Hall looks wrong" is exactly what I need.

## 11. Biggest risks (and how we handle them)

| Risk | What could go wrong | How we handle it |
|---|---|---|
| AI agents use outdated instructions | Code breaks because an agent remembers an old version of a tool | Locked versions, a team handbook, automatic tests on every change, and small changes reviewed one at a time |
| Map data is incomplete | Some buildings in OpenStreetMap don't list their real height | Sensible default heights, plus hand-fixes for the ~30 landmark buildings. You can help: "Grant Hall is 4 floors, not 6." |
| Slow on school laptops | Choppy graphics on cheap computers | Keep the 3D simple and test on a low-end laptop every milestone |
| Server costs creep up | Lots of players means lots of data | Billing alerts; send each player only the players near them; we can move to a cheaper host in an afternoon |
| Cheating in races | Someone hacks their speed | The server is the referee and rejects impossible movement |
| Trademark trouble | UIC objects to logos | No logos, our own mascot, and a clear "unofficial fan project" disclaimer |
| Too much at once | The project stalls | Small milestones, each one playable. We finish one before starting the next. |

## 12. Open questions (decide whenever you're ready)

- **Game title:** brainstorm later. It shouldn't sound official, so "UIC: The Official Game" is out.
- **Our original mascot:** a dragon? a flame creature? We'll design it in Milestone 5.
- **Public or private code:** the GitHub repository can stay private. Testing robots are free either way for a project this size.

---

**Research behind this plan:**

- [`docs/research/campus-research.md`](docs/research/campus-research.md): 28 landmarks with
  coordinates, 18 sourced fun facts, 20 mission ideas, branding rules and UIC colors
- [`docs/research/tech-architecture.md`](docs/research/tech-architecture.md): full technical
  comparison, hosting prices, and the map conversion process

*Map data © OpenStreetMap contributors (once downloaded), available under the Open Database License.*
