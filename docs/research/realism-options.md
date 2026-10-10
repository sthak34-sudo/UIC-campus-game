# How realistic can the UIC campus look? (Research summary, October 2026)

The owner asked for realism "close to GTA 6", with buildings that look like they do in real life.
Five researchers each studied one approach, and a skeptical fact-checker tried to disprove each report.
The raw results are in `realism-research-raw.json`.

## Honest headline

**No approach available to this project reaches GTA 6.** GTA 6 took Rockstar about a decade, thousands of
staff, and an estimated $1–2B+ (analyst estimate, unconfirmed). What *is* achievable:

- The campus can be **geometrically exact**. Real footprints and real heights from laser scans already work.
- It can be **recognizably UIC** from any angle.
- It can look like a **good architectural visualization or an older-generation open-world game**.

Brutalist concrete is one of the more forgiving styles to make convincing.

## The five approaches (scores are out of 10; GTA 6 = 10)

Scores are after fact-checking, and all are estimates.

| Approach | Street level | From the air | Runs in a browser? | AI agents can build it here? | Verdict |
|---|---|---|---|---|---|
| **A. Browser, realistic 3D models** (three.js, laser-scan heights, real materials, owner's photos for landmarks) | 3.5–4.5 | 6 | Yes, on any recent laptop | Yes (5.5/10) | **Recommended baseline** |
| **B. Google Earth 3D tiles** streamed in | 2–3 | 8 | Yes | Yes | **Backdrop only.** Melted-looking up close. Google's terms forbid using the tiles for collision or caching them. |
| **C. Unreal Engine 5 desktop game** | 5–6 (7 in polished spots) | 7 | **No.** Download only; streaming to a browser costs ~$1–2 per player-hour. | **Barely** (3/10) | Highest ceiling, but the owner needs a ~$1.5–2.5k gaming PC, players need gaming GPUs, and the owner does editor work |
| **D. Photo-scanned landmarks** (the owner films buildings → "Gaussian splats") | 5–6 for the scanned spots | 3 | Yes | Partly | **Add-on for 4–6 hero spots**, e.g. University Hall or the Quad. No day/night lighting, and roofs are missing without a drone. |
| **E. Ground-truth data** (laser scans, footprints) | — | — | — | Yes (8/10) | **Use in every approach.** Already working. |

## Key facts that drove the recommendation

- **Laser-scan heights already work.**
  - USGS 3DEP LiDAR (Cook County 2017) is reachable and public domain.
  - Measured University Hall is 104.3 m, against 103 m published.
  - It fixed map-data errors: the arena is 13.8 m in the scan versus 7 m in the map data.
- **Overture Maps** gives current footprints, heights for 92% of core buildings, 604 trees, 74 benches, 41 street lamps and 572 sidewalk segments. It is ODbL-licensed, so we must credit "© OpenStreetMap contributors".
- **Buildings finished after 2017**, such as the ARC (2019) and the CS building (2025), are not in the 2017 scan, so they need floor counts by hand.
- **Biggest realism drivers, ranked:**
  1. lighting/sky
  2. correct scale
  3. weathered materials
  4. haze
  5. trees
  6. window depth
  7. post-processing
  8. small clutter
  9. reflections
  10. people/cars

  Bad animation looks worse than none.
- **Google tiles:** the Map Tiles API terms (section 3.2) ban caching, building models from Google content, and "programmatic" measurement. Violations can lead to immediate suspension.
- **Unreal Engine 5:** the editor needs Windows, 32 GB RAM and an 8 GB+ GPU. It can't run in this cloud container, so AI agents can't test their own work.
- **Splats:** the Spark renderer (MIT, three.js) works in browsers. Cleaning splats and making collision shapes from them needs a GPU. A full-campus scan would be 1–2.5 GB.
- **There is no 3D artist on the team.** Blender, run without a screen, is a middle path: agents can script facade models and render previews on CPU.

## Hosts the owner should unblock for the best result

- **Free materials:** `polyhaven.com`, `dl.polyhaven.org`, `api.polyhaven.com`, `ambientcg.com`
- **Map data:** `overpass-api.de`, `api.openstreetmap.org` (optional; Overture works now)
- **UIC's official building and floor list:** `maps.uic.edu`
- **Newer 2022 laser scan (optional):** `clearinghouse.isgs.illinois.edu`, `data.isgs.illinois.edu`
