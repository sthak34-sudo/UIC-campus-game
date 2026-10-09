> **Note:** This is raw research gathered while planning (October 2026). The decisions we actually made are in [`../../PLAN.md`](../../PLAN.md); where they differ, PLAN.md wins. Facts marked "(unverified)" or "(est.)" need checking before we rely on them.

# UIC Campus Game: Campus Research Report (Campus Researcher, Oct 9 2026)

**How this was researched:** WebFetch could not reach any site (every fetch failed with DNS errors on wikipedia.org, uic.edu and other domains). I also did not use curl, as instructed. Every fact below comes from WebSearch result summaries, each with a cited source URL.
- Coordinates marked **(src)** come from Wikipedia or latlong.net as quoted in search results.
- Coordinates marked **(est.)** I worked out from the street address and Chicago's address grid. They should be within about 50–120 m. Please check them against OSM footprints in the build pipeline.
- I wrote no files.

Grid I used for the estimates:
- Longitude: Halsted is about −87.6470, Peoria (900 W) about −87.6495, Morgan (1000 W) about −87.6520, Racine (1200 W) about −87.6570, Ashland (1600 W) about −87.6670.
- Latitude: I‑290/Congress (500 S) is about 41.8756, Harrison (600 S) about 41.8743, Polk (800 S) about 41.8718, Taylor (1000 S) about 41.8696, Roosevelt (1200 S) about 41.8674.
- Blocks south of Roosevelt are spaced about 1.5× further apart, because the downtown address grid is compressed north of Roosevelt.

---

## 1. Map boundary for version 1

### Recommended v1 play area: "East Campus core"
| Edge | Street / feature | Lat or Lon |
|---|---|---|
| **South** | Just south of **Taylor St**. This takes in the Taylor-side science buildings and the first block of Little Italy. | **41.8685** |
| **West** | Just west of **Racine Ave**. This takes in Credit Union 1 Arena, the Student Services Building and the Racine Blue Line station. | **−87.6600** |
| **North** | Just north of the **I‑290 / Congress Pkwy trench**. This takes in the UIC‑Halsted station houses and Art & Design Hall at Van Buren/Peoria. | **41.8772** |
| **East** | Just east of **Halsted St**. This takes in the Student Recreation Facility, the Halsted bus stops and the Hull‑House Museum. | **−87.6455** |

**Overpass/OSM bbox order (S,W,N,E): `41.8685,-87.6600,41.8772,-87.6455`**. The area is about 0.97 km N–S by 1.20 km E–W, roughly 1.2 km².

**Why this box:**
- It covers a full student day in one compact area:
  - dorm: the ARC
  - classes: Lecture Centers, University Hall, Behavioral Sciences Building (BSB), the Science & Engineering buildings, the new CS building
  - food: Student Center East food court, Taylor St
  - library: Daley Library
  - gym: Student Recreation Facility (SRF)
  - arena: Credit Union 1 Arena
  - transit: 2 Blue Line stations and the #8 bus
  - history: Hull‑House
- Its edges are natural ones:
  - The sunken I‑290 expressway is a hard edge on the north, crossable only on bridges.
  - Halsted, a busy arterial, is the east edge.
  - Racine and the arena form the west edge.
  - Taylor St is where Little Italy begins.
- UIC's own visitor page describes the east side as running "along Halsted from Harrison to south of Roosevelt."
- A real walk from corner to corner takes about 15–25 minutes. That is a good size for timed missions, especially if game speed is scaled up about 2×.

### East vs. West Campus
| | East Campus (incl. "South Campus") | West Campus |
|---|---|---|
| What's there | Most undergraduate classes, student housing, Credit Union 1 Arena, recreation, Student Center East. These are the original 1965 "Circle Campus" Brutalist buildings by Walter Netsch/SOM. | Health-sciences colleges (Medicine, Dentistry, Pharmacy, Nursing, Public Health) and the UI Health hospital, inside the Illinois Medical District. Includes Student Center West (828 S Wolcott), Polk Street Residence (1933 W Polk) and the Library of the Health Sciences (1750 W Polk). |
| Transit | Blue Line UIC‑Halsted and Racine; CTA #8 Halsted, #7 Harrison, #12 Roosevelt, #60 Blue Island/26th | Pink Line Polk; Blue Line Illinois Medical District; #9 Ashland; #12 Roosevelt |
| Distance | — | About 1–1.5 km west, past Little Italy (Taylor St). Linked by the UIC Intracampus bus along Harrison and Roosevelt. |
| Approx. bbox (est.) | see above | ~41.8660, −87.6800, 41.8760, −87.6660 (unverified) |

### What to leave for later
- **v1.5 "South Campus strip":** extend south to about 41.8640 and east to about −87.6435. This adds:
  - UIC Dorin Forum (graduation and career fairs)
  - Physical Education Building and Curtis Granderson Stadium
  - Flames Athletic Center
  - James Stukel Towers and the other south-side halls
  - Maxwell St and Jim's Original
- **v2:** Little Italy west to Ashland (Conte di Savoia, Pompei, Arrigo Park), and Greektown north to Madison.
- **v3:** West Campus and the Medical District. The intracampus bus could act as a fast-travel link.

**Data warnings for the map team:**
1. The **Computer Design Research and Learning Center opened July 16, 2025**. OSM may still show a construction site or nothing there.
2. **Racine Blue Line was rebuilt.** The Racine Ave entrance reopened in October 2025; the Loomis entrance stays closed until about 2027.
3. The elevated walkways and the "Great Court" were demolished in 1993–99. Do not model them, except perhaps as an optional history layer.

---

## 2. Landmarks (inside or near the v1 box)

| # | Name (current as of 2026) | Lat, Lon | Real-life role | Why a player goes there |
|---|---|---|---|---|
| 1 | **University Hall (UH)**, 601 S Morgan | 41.8738, −87.6510 (src) | 28-story admin and faculty tower. Chancellor's office on top floor; School of Literatures, Cultural Studies & Linguistics (LCSL) offices on floors 15–18; Rebecca Port Center on floors 1–2. | Office hours, admin errands, skyline view from the top floor; the main landmark players orient by |
| 2 | **Richard J. Daley Library** (incl. IDEA Commons), 801 S Morgan | 41.8719, −87.6505 (src: latlong.net) | Main library. IDEA Commons on the 1st floor (café, 100+ computers); Special Collections on the 3rd floor. | Return books, study sessions, late-night safe zone |
| 3 | **Student Center East (SCE)** + food court, 750 S Halsted | 41.8728, −87.6483 (est.) | Student union (originally "Chicago Circle Center"). Dining run by Sodexo: **Panda Express** (Fall 2026: Mon–Fri 10–8, Sat 9–4), **Chick‑fil‑A**, **605 Commons** dining hall. | Food between classes, meeting point, room bookings |
| 4 | **Lecture Center Quad** (Lecture Centers A–F, 803/805 S Morgan), incl. **Latino Cultural Center** in Lecture Center B2 | 41.8728, −87.6498 (est.) | Central lecture halls around the Quad. The Quad hosts the annual **Involvement Fair** (200+ organization tables). | Big classes, club fair, central hub / spawn plaza |
| 5 | **Behavioral Sciences Building (BSB)**, 1007 W Harrison | 41.8737, −87.6530 (est.) | Netsch's "Field Theory" building (1967); famous for its maze-like layout | Navigation challenge: "find room ___ in BSB" |
| 6 | **Science & Engineering Offices (SEO)**, 851 S Morgan | 41.8710, −87.6512 (est.) | College of Engineering offices | Office hours, deliveries |
| 7 | **Science & Engineering Laboratories East (SELE)**, 950 S Halsted | 41.8702, −87.6481 (est.) | Lab building | Lab-class missions |
| 8 | **Science & Engineering South (SES)**, 845 W Taylor (SW corner of Taylor & Halsted) | 41.8692, −87.6480 (est.) | Science classrooms and labs | Far-south class destination, longest walk from the dorms |
| 9 | **Engineering Research Facility (ERF)**, 842 W Taylor (Halsted & Taylor) | 41.8700, −87.6476 (est.) | Home of the Electronic Visualization Lab (EVL), where the CAVE virtual-reality room was created | Easter egg / tech side quest |
| 10 | **Computer Design Research & Learning Center (CDRLC)**, Taylor St next to **Memorial Grove** (Taylor & Morgan) | ~41.8700, −87.6505 (est., unverified; the address is given as both 850 and 900 W Taylor) | New CS building that opened July 16, 2025: 135,000 sq ft with a 5-story atrium. Memorial Grove is a historic garden at the campus's SW corner. | Newest building; CS-major missions; quiet garden zone |
| 11 | **Student Recreation Facility (SRF)**, 737 S Halsted | 41.8727, −87.6460 (est.) | Gym, across Halsted from SCE. Opened 2006; 42-ft climbing wall, pool, hot tub, lazy river. | Stamina buffs, fitness mini-games |
| 12 | **Academic & Residential Complex (ARC)**, 940 W Harrison | 41.8749, −87.6507 (est.) | 10-story, 548-bed residence hall plus 2-story academic building (2019), steps from the UIC‑Halsted station | Default player spawn / "home" |
| 13 | **Credit Union 1 Arena** (built as UIC Pavilion), 525 S Racine | 41.8747, −87.6561 (src) | 8,000 seats for basketball, 10,300 for concerts. Hosts Flames games and the "Spark in the Park" welcome concert. | Game-night and concert events, big multiplayer gatherings |
| 14 | **Student Services Building (SSB)**, 1200 W Harrison (NW corner of Racine) | 41.8747, −87.6575 (est.) | Admissions, registrar-type offices, career services | "Bureaucracy" errand missions |
| 15 | **UIC‑Halsted Blue Line station**, 430 S Halsted | 41.8756, −87.6497 (src; that point is near the Peoria end) | Station in the expressway median with **3 entrances: Halsted, Peoria and Morgan**. The Blue Line runs 24 hours. | Commuter spawn, "catch the train" missions |
| 16 | **Racine Blue Line station**, 430 S Racine | 41.8758, −87.6597 (src; open entrance at Racine Ave, about −87.6570) | Rebuilt station; Loomis entrance closed until about 2027 | West-side commuter spawn |
| 17 | **CTA #8 Halsted bus stops** (Halsted at Harrison, Polk, Taylor and Roosevelt) | e.g. Halsted & Polk 41.8718, −87.6470 (est.) | Main north–south bus; connects to the UIC‑Halsted station and the Dorin Forum. Not 24 hours (late-night cutoff unverified). | Bus-vs-walk choices, timed waits |
| 18 | **Jane Addams Hull‑House Museum**, 800 S Halsted | 41.8717, −87.6475 (src) | National Historic Landmark. Two surviving buildings of the 1889 settlement house. Free; open Tue–Sat, check hours. | History quest, quiz pop-ups |
| 19 | **"U‑I‑C" hedges**, Harrison & Halsted (a second set at Morgan & Roosevelt) | ~41.8743, −87.6472 (est.) | Hedges planted in the letters UIC, best seen from above | Scavenger hunt (and a nice detail for an overhead camera) |
| 20 | **Grant / Lincoln / Douglas Halls** (classroom cluster) | positions: use OSM (unverified) | Renovated classrooms with geothermal heating/cooling; Douglas Hall is LEED Gold | Generic class destinations |
| 21 | **Art & Design Hall / Gallery 400**, 400 S Peoria (north of I‑290) | 41.8768, −87.6495 (est.) | Free contemporary art gallery of UIC's College of Architecture, Design, and the Arts (CADA) | Art-class missions, exhibit collectible |
| 22 | **Mario's Italian Lemonade**, 1068 W Taylor | 41.8698, −87.6538 (est.) | Seasonal Italian ice stand since 1954; open about May 1 to mid-September | Seasonal "summer" event (closed in-game Oct–Apr) |
| 23 | **Al's #1 Italian Beef**, 1079 W Taylor | 41.8694, −87.6540 (est.) | Oldest Al's location (1938); counter only, standing room | Food-delivery missions |
| **Near the box (v1.5+)** | | | | |
| 24 | **UIC Dorin Forum**, 725 W Roosevelt | 41.8670, −87.6459 (src) | 3,000-seat event hall (opened 2008). Commencements, career fairs. | Graduation / career-fair finale |
| 25 | **Physical Education Building + Les Miller Field at Curtis Granderson Stadium**, 901 W Roosevelt | ~41.8662, −87.6500 (est.) | Gym and pool; baseball park that opened April 17, 2014 | Sports side-quests |
| 26 | **Jim's Original + Maxwell Street Market**, 1250 S Union Ave / Maxwell St (Halsted–Union) | 41.8665, −87.6445 / 41.8651, −87.6460 (est.) | Maxwell Street Polish stand since 1939. UIC ordered it to move in 2026, but a lease extension keeps it here "a few more years". The Sunday market returned to Maxwell St in 2025 (May–Oct). | Late-night food; seasonal Sunday market event |
| 27 | **Little Italy west: Conte di Savoia** (1438 W Taylor) and **Pompei** (1531 W Taylor) | 41.8698, −87.6629 / 41.8694, −87.6652 (est.) | Italian grocery/deli (since 1948) and pizza/strudel spot (since 1909). Pompei's 2026 status is unverified. | Long-distance food runs (v2) |
| 28 | **Greektown** (Halsted, Van Buren to Madison): Greek Islands (200 S Halsted), National Hellenic Museum (333 S Halsted) | ~41.8796, −87.6473 (est.) | Restaurant strip just north of I‑290 | v2 expansion via the Halsted bridge |

**Do not include (no longer there):**
- **Piazza DiMaggio Joe DiMaggio statue** (Taylor & Bishop): removed in 2019.
- **Arrigo Park Columbus statue:** removed in 2020. A Mother Cabrini monument is planned (2026).
- **Circle Forum / Great Court / elevated walkways:** demolished 1993–99.
- **Halsted-side residence halls:** UIC lists Commons North at 600 S Halsted, Commons West at 700 S Halsted and Courtyard nearby, but I could not confirm which side of Halsted they are on. Take their footprints from OSM.

---

## 3. Fun facts for in-game pop-ups (one line each, with source)

1. **University Hall** is 28 floors and ~338 ft (103 m), the tallest building on Chicago's West Side. It gets *wider* as it rises (150 → 160 → 170 ft), a "big shoulders" design inspired by Carl Sandburg. Sources: https://en.wikipedia.org/wiki/University_Hall_(University_of_Illinois_Chicago), https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/university-hall
2. **The Quad** used to be the "Great Court," a granite plaza on the Lecture Center roofs with a Greek-style amphitheater (the Circle Forum) in the middle. It was torn out in 1993–99. https://exhibits.library.uic.edu/uic-history/the-great-court-circle-forum-and-elevated-walkways-are-removed , https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/the-circle-forum
3. **Elevated walkways:** for the campus's first ~30 years, students walked between buildings on second-story "pedestrian expressways." Netsch built heaters into the steps to melt snow, but they broke and were never replaced. https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/second-story-walkways
4. **"Chicago Circle":** the campus opened Feb 22, 1965. Its name changed at the last minute from "Congress Circle" after the nearby expressway interchange was renamed the Circle Interchange. https://archeyes.com/?p=7118 , https://exhibits.library.uic.edu/uic-history/the-circle-campus.19
5. **Before the Circle:** UIC started in 1946 on **Navy Pier** for GI Bill veterans. Students called it "Harvard on the Rocks." https://exhibits.library.uic.edu/uic-history/the-chicago-undergraduate-division-opens-at-navy-pier
6. **Why "Flames"?** The name was chosen in 1982, when UIC was formed by merging the Circle Campus and the Medical Center. It honors the Great Chicago Fire of 1871 and the city's rebirth afterwards. Earlier teams were the "Chi‑Illini" and "Chikas." https://en.wikipedia.org/wiki/UIC_Flames , https://today.uic.edu/104600-2/
7. **Sparky** the dragon was "born from the embers of the Great Chicago Fire." He has Fire Engine Red fur, Navy Pier Blue head spikes, a Champions Gold tail flame and Chicago-skyline sneakers. Sources disagree on when he first appeared (1986 or the early 1990s; unverified). https://today.uic.edu/meet-sparky-official-mascot-of-the-uic-flames/ , https://today.uic.edu/104600-2/
8. **Behavioral Sciences Building:** Netsch thought it was his best "Field Theory" design (rotated squares). Critics loved it; many people who use it say it's a maze with "hallways that lead to nowhere." https://www.wbez.org/morning-shift/2018/08/23/whats-that-building-uics-behavioral-sciences-building , https://live.today.uic.edu/walk-through-uics-architectural-history/
9. **Student Recreation Facility** opened in 2006: 155,000 sq ft, a 42-ft climbing wall, a 35-person hot tub, and a lazy river. https://exhibits.library.uic.edu/uic-history/the-student-recreation-facility-opens-campus-recreation-moves-from-student-center-east , https://live.today.uic.edu/did-you-know-10-facts-about-uic/
10. **Credit Union 1 Arena** opened May 31, 1982 as the UIC Pavilion and was renamed in 2019. Kendrick Lamar, J. Cole and Travis Scott have played UIC's free "Spark in the Park" welcome concert. https://en.wikipedia.org/wiki/Credit_Union_1_Arena , https://today.uic.edu/free-concert-for-uic-community
11. **Hull‑House** was founded in 1889 by Jane Addams and Ellen Gates Starr. Addams became the first American woman to win the Nobel Peace Prize (1931). Only 2 of the original 13 buildings survive. https://hullhouse.uic.edu/ , https://www.womenshistory.org/education-resources/biographies/jane-addams
12. **CAVE:** the room-sized "CAVE" virtual-reality system was created at UIC's Electronic Visualization Lab and debuted at SIGGRAPH 1992. https://en.wikipedia.org/wiki/Electronic_Visualization_Laboratory
13. **Hidden letters:** hedges at Harrison & Halsted spell "U‑I‑C," best seen from above. Campus also has 3,600+ trees and is an accredited arboretum. https://live.today.uic.edu/did-you-know-10-facts-about-uic/
14. **Daley Library** is named for Mayor Richard J. Daley, who helped bring the campus here. It holds 150 linear feet of his mayoral papers. https://live.today.uic.edu/daley-collection
15. **UIC‑Halsted station** opened in 1958 in the middle of the then-new Congress (now Eisenhower) Expressway. https://en.wikipedia.org/wiki/UIC%E2%80%93Halsted_station
16. **Mario's Italian Lemonade** has served Taylor St since 1954 and closes every September. https://www.dnainfo.com/chicago/20150501/little-italy/marios-italian-lemonade-opens-for-2015-season
17. **Record crowd:** UIC enrolled a record 35,869 students in fall 2025. I found no fall 2026 figure yet. https://today.uic.edu/uic-enrollment-hits-all-time-best-mark/
18. **Curtis Granderson**, an MLB star and UIC alum, gave $5M toward the $10M ballpark that bears his name (opened 2014). https://uicflames.com/facilities/curtis-granderson-stadium/4

Use the Hull‑House neighborhood history with care. Building the campus in the 1960s displaced about 8,000 residents and 600 businesses (WTTW, https://www.wttw.com/node/1012). It makes a good "history" pop-up, but keep the tone respectful.

---

## 4. Mission ideas (MP = good for multiplayer)

| # | Title | Difficulty | One-line description | Start → End | What makes it fun / hard | MP? |
|---|---|---|---|---|---|---|
| 1 | **The 9 AM Sprint** | Easy | Get to class before the bell. | ARC → Lecture Center A | Timer; crowds surge at class change; shortcut through the Quad | **Race** |
| 2 | **Welcome Week Guide** | Easy | A veteran player guides 1–4 new players to 5 key landmarks. | Quad → UH, Daley, SCE, SRF, Blue Line | Onboarding loop; both guide and newcomers earn XP | **Co-op** |
| 3 | **Lunch Between Classes** | Easy | 20-minute gap: get food at SCE and make it to lab on time. | BSB → SCE food court → SES | Pick the stall with the shortest line (Panda / Chick‑fil‑A / 605 Commons); queues grow at noon | Race |
| 4 | **Book Due Tonight** | Easy | Return an overdue book before the deadline. | ARC → Daley Library | Night lighting; library entrance hours vary | Solo |
| 5 | **Lemonade Run** (seasonal) | Easy | Bring back an Italian ice before it melts. | SES → Mario's (Taylor St) → SES | "Melt meter"; only available May–Sept, like the real stand | Race |
| 6 | **Office Hours Hunt** | Medium | Find Prof. ___'s office hours in University Hall before they end. | Quad → UH 17th floor | Elevator queue vs. stairs gamble; office number clues | Solo / race |
| 7 | **Lost in BSB** | Medium | Find a classroom inside the famously maze-like Behavioral Sciences Building. | BSB entrance → room ___ | Indoor maze based on rotated squares; dead-end hallways | **Co-op** (one player holds the map, one navigates) |
| 8 | **Catch the Blue Line** | Medium | Make the next train downtown. | Daley Library → UIC‑Halsted station | 3 entrances (Halsted / Peoria / Morgan): choose the closest; trains run on a fixed schedule, so missing one means waiting | **Race**; group boarding bonus |
| 9 | **The #8 Bus Gamble** | Medium | Get to a career fair at the Forum. | SCE → Dorin Forum | Walk (reliable) or wait for a bus that may come in bunches | Race |
| 10 | **Involvement Fair Stamp Rally** | Medium | Find 5 specific (fictional) club tables among hundreds on the Quad. | Lecture Center Quad | Table layout shuffles each session; crowd density | **Team** (split the Quad) / competitive |
| 11 | **Beef Run for the Study Group** | Medium | Pick up an Italian beef order and deliver it hot to friends studying in the library. | Al's (Taylor St) → Daley IDEA Commons | Carrying slows you; heat timer | **Relay co-op** |
| 12 | **Tip-Off** | Medium | Get to the arena before the game starts. | ERF lab → Credit Union 1 Arena | Arena is at the far west edge; crowds thicken near it | **"Student section"**: everyone who arrives in time earns a team bonus |
| 13 | **Climb the Wall** | Medium | Reach the top of the SRF's 42-ft climbing wall before belay hours end. | Anywhere → SRF | Stamina mini-game; rewards a speed buff (the lazy river restores stamina) | Race |
| 14 | **Top-Floor Delivery** | Medium | Deliver a sealed envelope from the engineering office to University Hall's top floor. | SEO → UH 28th floor | Vertical challenge; skyline view reward | Solo |
| 15 | **Hull‑House History Quest** | Medium | Visit the museum and answer history pop-ups to earn a badge. | Quad → Hull‑House → Quad | Teaches real history; quiz | Solo / team quiz |
| 16 | **Campus Scavenger Hunt** | Medium–Hard | Photograph the U‑I‑C hedges, Memorial Grove, the Heritage Garden, Gallery 400 and the UIC‑Halsted sign. | Free roam | Clues are riddles; some items are only visible from above | **Team scavenger hunt** |
| 17 | **Ghost Walkways** | Hard | A history overlay brings back the demolished elevated walkways; follow them and collect archive photos. | Harrison St → SES | Time-travel layer; platforming on "ghost" bridges | Solo |
| 18 | **Commuter Chaos** | Hard | Back-to-back exams, arriving by train. | Racine station → Lecture Center (9 AM) → SES (10 AM) | Chained timers; random rain, crowds and late trains; Loomis entrance closed | Race |
| 19 | **Capture the Quad** | Hard | Teams claim landmarks (UH, Daley, SCE, SRF, Arena) by holding them. | Respawn at dorms | Territory control; real-time strategy | **Team PvP** |
| 20 | **Finals Week Gauntlet** | Hard | Four chained objectives: study session → coffee → exam → back to the dorm, with stamina management. | ARC → Daley → SCE → Lecture Center → ARC | Endurance plus timing; the hardest daily-life loop | Leaderboard |

Seasonal and live events for later:
- Maxwell Street Sunday market (v1.5)
- "Spark in the Park" concert night at the arena
- Commencement at the Dorin Forum as an end-of-season finale

---

## 5. Branding cautions (not legal advice)

**Who controls what:**
- UIC runs a trademark licensing program, through Marketing & Brand Management with Learfield Licensing Partners. It protects UIC's "registered trademarks, names, seals, logos, school colors and other indicia."
- Even official registered student organizations may **not** use the official UIC logo or lockups.
- A plain "UIC" word mark application exists, owned by the U of I Board of Trustees.

Sources: https://marketing.uic.edu/uic-licensing-program , https://brand.uic.edu/applying-the-brand/registered-student-organizations , https://trademarks.justia.com/owners/the-board-of-trustees-of-the-university-of-illinois-5890597

**Avoid:**
- UIC circle mark, wordmark, lockups and university seal
- All **Flames athletics marks**: the primary flame logo, the script "Flames" mark, star-cluster and skyline icons, and the "FOR CHICAGO" campaign line
- **Sparky's** likeness or costume design (make an original mascot instead)
- Using "UIC" or "Flames" as the game's *product name*, or anything that implies endorsement
- Third-party logos and trade dress: Panda Express, Chick‑fil‑A, Credit Union 1, and CTA logos/signage design
- Depicting real, identifiable people such as the chancellor or real professors; use fictional names

**Generally fine (low risk), especially with a visible "Unofficial fan project, not affiliated with or endorsed by the University of Illinois Chicago" disclaimer:**
- Real building and place names (University Hall, Daley Library, Halsted St, Blue Line) and real street geometry from OSM, credited "© OpenStreetMap contributors" as ODbL requires
- Generic flame and fire imagery of your own design
- A red/navy color scheme. RSOs are explicitly allowed to use the UIC colors, but don't pair them with marks in a way that looks official.
- Factual references, e.g. "the arena," "the Blue Line"

If the project is ever monetized or promoted publicly, ask UIC Marketing & Brand Management first.

**Official UIC colors (reference):**
| Name | Pantone | HEX | RGB |
|---|---|---|---|
| Fire Engine Red (primary) | 199 C | **#D50032** | 213, 0, 50 |
| Navy Pier Blue (primary) | 2758 C | **#001E62** | 0, 30, 98 |
| Chicago Blue (accent) | 298 C | **#41B6E6** | 65, 182, 230 |
| Champions Gold (accent) | 136 C | **#FFBF3F** | 255, 191, 63 |
| Expo White (neutral) | — | #F2F7EB | 242, 247, 235 |
| Steel Gray (neutral) | — | #333333 | — |

Notes on the color sources:
- The primary and accent values come from brand.uic.edu as quoted in search results.
- The neutrals come from the marketing.uic.edu style guide (lightly verified).
- Third-party "Flames" palettes (#AC1E2D, #091F40) do **not** match the official values, so ignore them.

---

## Sources
- UH: https://en.wikipedia.org/wiki/University_Hall_(University_of_Illinois_Chicago) · https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/university-hall · https://openhousechicago.org/sites/site/uic-university-hall · https://lcsl.uic.edu/about-us/contact-us/
- Campus history: https://exhibits.library.uic.edu/uic-history/the-great-court-circle-forum-and-elevated-walkways-are-removed · https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/second-story-walkways · https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/the-circle-forum · https://archeyes.com/?p=7118 · https://exhibits.library.uic.edu/uic-history/the-chicago-undergraduate-division-opens-at-navy-pier · https://live.today.uic.edu/walk-through-uics-architectural-history/ · https://live.today.uic.edu/did-you-know-10-facts-about-uic/
- Campus layout and directions: https://uic.edu/about/visit-directions · https://maps.uic.edu/Home/UICMapsTextOnly · https://help.uillinois.edu/TDClient/37/uic/KB/ArticleDet?ID=966 · https://www.evl.uic.edu/location · https://today.uic.edu/locations/lecture-center-a1/ · https://latinocultural.uic.edu/home/contact-visit-us/ · https://admissions.uic.edu/node/411 · https://business.uic.edu/getting-to-campus/
- Library: https://www.latlong.net/poi/richard-j-daley-library-511644 · https://today.uic.edu/library-space-a-great-architectural-idea/ · https://live.today.uic.edu/daley-collection
- Student Center East and dining: https://uicdining.sodexomyway.com/en-us/locations/panda-express · https://uicdining.sodexomyway.com/en-us/locations/605-commons · https://today.uic.edu/eateries-under-construction-on-east-side/
- Recreation, housing, new CS building: https://exhibits.library.uic.edu/uic-history/the-student-recreation-facility-opens-campus-recreation-moves-from-student-center-east · https://recreation.uic.edu/facility_srf/ · https://today.uic.edu/uic-opens-new-state-of-the-art-living-and-learning-community/ · https://housing.uic.edu/guest-and-conferences/uic-non-affiliated-housing/conference-housing/academic-and-residential-complex/ · https://today.uic.edu/uics-new-computer-science-building-signifies-enrollment-program-growth/
- BSB and EVL: https://www.wbez.org/morning-shift/2018/08/23/whats-that-building-uics-behavioral-sciences-building · https://en.wikipedia.org/wiki/Electronic_Visualization_Laboratory
- Athletics venues and events: https://en.wikipedia.org/wiki/Credit_Union_1_Arena · https://www.trustees.uillinois.edu/trustees/agenda/January-31-2019/006-jan-Pavilion-Credit-Union-1.pdf · https://today.uic.edu/free-concert-for-uic-community · https://en.wikipedia.org/wiki/UIC_Dorin_Forum · https://uicflames.com/facilities/curtis-granderson-stadium/4 · https://uicflames.com/facilities/?id=6
- Transit: https://en.wikipedia.org/wiki/UIC%E2%80%93Halsted_station · https://transitchicago.com/station/uich · https://en.wikipedia.org/wiki/Racine_station_(CTA_Blue_Line) · https://www.transitchicago.com/blueline/ · https://www.uicradio.net/post/a-tierlist-of-every-cta-bus-route-on-uic-campus · https://today.uic.edu/campus-transportation-options/
- Hull‑House: https://en.wikipedia.org/wiki/Hull_House · https://hullhouse.uic.edu/ · https://www.hullhousemuseum.org/Visit-and-Tours · https://www.wttw.com/node/1012 · https://www.womenshistory.org/education-resources/biographies/jane-addams
- Taylor St / Little Italy: https://www.dnainfo.com/chicago/20150501/little-italy/marios-italian-lemonade-opens-for-2015-season · https://www.timeout.com/chicago/restaurants/als-1-italian-beef · https://www.theinfatuation.com/chicago/reviews/conte-di-savoia · https://www.timeout.com/chicago/restaurants/pompei-on-taylor · https://blockclubchicago.org/2019/01/22/joe-dimaggio-statue-taken-out-of-little-italy-as-national-italian-american-museum-plans-move-to-rosemont/ · https://news.wttw.com/2026/02/18/mother-frances-xavier-cabrini-statue-replace-columbus-little-italy-park-district
- Maxwell St and Greektown: https://www.wttw.com/node/61097 · https://chicago.suntimes.com/restaurants/2026/05/08/jims-original-home-of-maxwell-street-polish-told-to-move-locations-due-to-uic-redevelopment · https://maxwellstreetfoundation.org/events/ · https://chicago.gov/city/en/depts/dca/supp_info/maxwellstreetmarket0.html · https://en.wikipedia.org/wiki/Greektown,_Chicago
- Athletics, mascot, conference: https://en.wikipedia.org/wiki/UIC_Flames · https://today.uic.edu/104600-2/ · https://today.uic.edu/meet-sparky-official-mascot-of-the-uic-flames/ · https://thelowmajor.substack.com/p/name-a-day-calendar-september-17 · https://uicflames.com/news/2022/1/26/general-uic-to-join-the-missouri-valley-conference.aspx
- Brand and trademarks: https://brand.uic.edu/visual-identity/color/ · https://marketing.uic.edu/marketing-toolbox/university-style-guide/visual-elements · https://brand.uic.edu/resources/trademarks-and-licensing · https://brand.uic.edu/applying-the-brand/registered-student-organizations · https://marketing.uic.edu/uic-licensing-program
- Other: https://today.uic.edu/uic-enrollment-hits-all-time-best-mark/ · https://today.uic.edu/events/involvement-fair-fall-2019/ · https://heritagegarden.uic.edu/ · https://pspm.uic.edu/sustainability/carbon-neutral-university/green-buildings · https://en.wikipedia.org/wiki/Gallery_400
