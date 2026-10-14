> **Note:** Raw research from the Facade Researcher (Oct 14 2026), meant to help engineers rebuild facades. PLAN.md wins where it differs. WebFetch failed with DNS errors and direct fetches were blocked, so **every fact below comes from WebSearch result snippets**, and each one cites the page it came from.
>
> **How to read the confidence tags:**
> - **(src)**: stated by a cited source.
> - **(unverified)**: from a weak or third-party source, or the sources conflict.
> - **(est.)**: my own estimate. None of the sources give colors or exact dimensions, so **every hex value in this file is an estimate.** Each one is a typical value for the named material in its weathered state. Check them against the owner's photos (see `docs/photo-guide.md`) before treating them as final.

# UIC East Campus: Facade Reference

## 1. What the whole campus has in common (read this first)

- **Three materials only (src):** Netsch chose "granite, concrete, and brick", used again and again across campus.
  - The granite came from Minnesota quarries.
  - Netsch "developed special colors and sizes of brick as well as six different finishes for the concrete".
  - He used "relatively low strength reinforced concrete" to save money. Because of this the concrete spalls, so real buildings show patches and repairs. [UIC Library: SEL page; Circle Campus history]
- **Two phases of design (src):**
  1. **Phase 1–2 (1963–66):** "a series of rectangular forms with brick, precast concrete, and glass exteriors". These are the classroom halls, Lecture Centers, Library, SCE, SEL and University Hall.
  2. **Phase 3 (1967–70):** **Field Theory**. Squares are rotated by 45° and stacked into complex plans. Examples: Architecture & Art Building (the first), Behavioral Sciences Building (the most sophisticated), SES and SEO.
- **The exposed structure is the facade.**
  - The typical Netsch building has **exterior reinforced-concrete piers** with **recessed window walls** behind them.
  - On the 3-story halls, the upper two floors have **open galleries** (a walk-behind ledge between the piers and the glass).
  - University Hall and SEO "incorporate similar design elements" (src).
  - So windows sit **deep in shadow**, often a full gallery depth (~1–1.5 m, est.) behind the face of the concrete, not flush with the wall.
- **"Block I" windows (src):** the upper two floors of the classroom buildings have **long narrow windows in the shape of a block letter "I"** (for Illinois).
  - The long central rectangle is **bronze-tinted glass**, a new product at the time, used to control heat.
  - The **trapezoidal top and bottom pieces are clear glass**.
  - The recess limits daylight so much that no blinds are needed.
  - University Hall's windows are described as matching the classroom buildings.
- **The big brick buildings use double-size brick (src):** at the Science & Engineering Laboratories, the bricks are **twice the size** of those on smaller buildings. They are laid to form "an endless pattern of letter I's".
- **Granite details (src):**
  - Granite slabs up to **1 ft thick** formed the roof edge of the Lecture Centers and the former Great Court.
  - Granite stairs and breezeways appear at SES.
  - **Engraved granite name blocks** mark buildings (for example SEO, north and south sides).
  - "Tiger tooth" chain-linked granite bollards lined the old Great Court and stairs.
- **Twisted columns (src):** the concrete **"butterfly" columns** around the Lecture Centers (and the old walkways) are **rotated 45°** and have flared, butterfly-shaped capitals. SEL's giant **pylons** are the same shape scaled up, without the butterfly capital.
- **What has been demolished (src):** the Great Court (on the Lecture Center roofs), the Circle Forum amphitheater and all the elevated granite walkways were removed **1993–1999**. Do not model them.
- **Recladding wave:**
  - Lincoln, Douglas and Grant Halls lost their original concrete-and-glass skins **2009–2012**.
  - Taft Hall's concrete facade panels were **demolished in 2025** and are being replaced (reopening planned for fall 2026).
  - Henry and Jefferson Halls are under renovation by Krueck Sexton Partners, which keeps the "culturally sensitive" facade elements.
  - SES is getting new windows and brick repair (2026–27).
- **Not Netsch (src):** Student Center East (C.F. Murphy Associates), ETMSW (Harry Weese & Associates) and the post-1980 buildings (Pavilion/arena, SRF, ARC, CDRLC, residence halls).

### Campus-wide palette (all hex values are est.)

| Material | Plain words | Clean hex (est.) | Weathered or base hex (est.) | Notes |
|---|---|---|---|---|
| Netsch exposed concrete (board-formed / bush-hammered piers, beams) | warm light grey, faint buff/sand cast | `#b8b2a6` | `#9a948a` mid-wall, `#6f6a62` dark base/drip stains | Use 2–3 of the "six finishes" as variation: smooth cast (lighter), board-formed (fine horizontal grain), sandblasted/exposed aggregate (speckled, slightly darker). Expect patch repairs, in slightly different tones (UH 2017–18 repair). |
| Precast concrete panels (1960s halls, the Taft-type grilles) | slightly cooler and smoother grey than cast-in-place | `#c0bbb2` | `#8f8a82` | |
| UIC face brick (the "special colors" brick) | dark red-brown with purple-brown variation (est., **unverified: highest-priority photo check**) | `#7a4636` | `#5e3529` (dark bricks in range), `#8d5a45` (light bricks) | No source names the color. SES's brick has "a unique color range" that needed a custom-fired match, so render it **with per-brick color variation, not one flat color**. |
| Double-size brick (SEL, SES) | same family, larger modules | as above | as above | Module ≈ 2× a standard 8"×2⅔" course. Try about **400 × 135 mm** (est.). |
| Mortar | grey-buff | `#9b958a` | | |
| Minnesota granite (steps, slabs, name blocks, bollards) | grey-pink or red-brown speckled (unverified: Minnesota quarries are known for red "mahogany" and grey-pink stone) | `#8c7d74` | `#6e625b` | Thermal or flamed finish, low gloss |
| Bronze-tinted glass (centre of "I" windows, UH) | dark brown-bronze, reflective in daylight | `#4a3f33` | | Base color for reflections. Use about 35% reflectance. |
| Clear glass (top/bottom trapezoids, new curtain walls) | dark grey-green interior read | `#5f6b6b` | | |
| Window frames / mullions (1960s) | dark bronze anodized aluminum (est., **unverified**) | `#3d3329` | | Matches the bronze glass era. Thin frames, deep in a recess. |
| Stucco infill (Daley Library west wall) | flat light grey-beige | `#b9b3a7` | | Marks where a wing was never built |
| Asphalt / roads | | `#3a3a3a` | | |
| Concrete sidewalks (2023 Quad, 20-ft walks) | light grey broom-finish | `#b5b3ad` | | |

---

## 2. Building specs (priority order)

### 2.1 University Hall (UH), 601 S Morgan
| Item | Spec |
|---|---|
| Size | 28 stories, **338 ft (103 m)**, completed 1965 (src). Average floor-to-floor ≈ 3.6 m (est.), with a taller base. |
| Massing | **Gets wider as it rises in 3 steps, by cantilevers** (src). Seen from the east and west: 150 ft (45.7 m) wide up to floor 8, 160 ft (48.8 m) on floors 9–16, 170 ft (51.8 m) on floors 17–28. Seen from the north and south, the width is constant. Huge columns at ground level carry the load (src). |
| Facade system | **Exposed cast-in-place reinforced concrete skeleton** (src). Vertical piers and horizontal floor edges form the grid. Behind them, at every floor 3–28, there is a **"gallery ledge"** (src: the 2017–18 repair re-roofed "all of the gallery ledges on floors three through 28"). So each floor has a recessed open ledge in front of the glass, as at Henry and Jefferson Halls. |
| Windows | **Narrow, recessed windows matching the classroom buildings** (src): bronze-tinted glass, likely the Block-I form (unverified for UH specifically). Bay width ≈ 1.5–2 m between piers (est.). Window ≈ 0.9–1.2 m wide × 2.4 m tall (est.). Frames dark bronze (est.). |
| Top | **28th floor: windows replaced with a new curtain wall system** in 2017–18 (src). The top floor reads as more continuous glass than the floors below. |
| Colors | Concrete `#b8b2a6` → `#9a948a`. Repaired patches and a weatherproof sealer were applied in 2017–18 (src), so the tone is somewhat even with patchy repairs. Glass `#4a3f33`. |
| Look in one sentence | A tall, raw grey concrete grid of piers and floor ledges, with dark bronze glass set deep in shadow, stepping outward twice like broad shoulders and standing on giant columns. |

### 2.2 Richard J. Daley Library, 801 S Morgan
| Item | Spec |
|---|---|
| Size | **4 stories**, built in two stages (1963–65): a central block, then additions of **two bays at each of the north and south ends** (src). |
| Facade | **Exposed concrete beams and piers** frame the east facade (src: construction photos). The end bays are **brick-faced** (src: "the first brick-faced bays"). Brick sits as infill panels between the concrete frame members. |
| West face | **Stucco panels** where planned west wings were never built (src). "Brick facing was not added to some exterior walls on the west side" (src). So the west face looks plainer and patchier. |
| Ground floor (east) | **IDEA Commons (2011, Woodhouse Tinucci):** a **16-ft-tall ground-floor curtain wall** facing the campus landscape (src). The entry runs **between two prisms of steel grating, brightly lit at night** (src). |
| Windows above | Recessed between the piers. Pattern unverified: likely narrow vertical openings or brick panels with few windows, since this is a library stack building (unverified). |
| Colors | Concrete `#b8b2a6`; brick `#7a4636` (est.); stucco `#b9b3a7`; steel grating dark grey `#4a4c4e` (est.). |
| Look in one sentence | A long, low four-story concrete frame with dark brick bays at its ends, a tall glass ground floor on the east side, and a blank, stuccoed west side. |

### 2.3 Student Center East (SCE) + SCE Tower, 750 S Halsted
| Item | Spec |
|---|---|
| Architect | **C.F. Murphy Associates**, not Netsch (src). Phase 1 (1963–65). Originally "the Union", then "Chicago Circle Center". |
| Low building | **Brick walls** (src: photo "construction of its brick walls" on the east facade). Concrete waffle-slab ceilings with **cruciform columns** inside (src). A **double semi-circular stair leads to a second-floor entrance** to both buildings (src): a strong feature to model. Its east entrance was remodeled in the 1990s (src). |
| Tower | "Union Tower", later "Chicago Circle Center Tower", now SCE Tower (src). It stands at the Halsted/Harrison corner side and has rooms up to at least **floor 6 (Room 613)** (src). OSM height ≈ 37 m (about 8–9 floors). Facade unverified: likely brick piers or panels with concrete floor bands, matching the low block. |
| Colors | Brick `#7a4636` (est.); concrete `#b8b2a6`. |
| Look in one sentence | A big brick-and-concrete student union with a mid-rise brick tower at its corner and a grand curved double stair up to the second floor. |

### 2.4 Lecture Centers A–F and the Quad
| Item | Spec |
|---|---|
| Structure | Low (1–2 story) halls ringed by **concrete "butterfly" columns, twisted 45°** with flared capitals (src). **Brick walls** (src: "constructing a brick wall at Lecture Center B"). Exposed brick and concrete inside too (src). |
| Roof edge | A **1-ft-thick granite slab layer** runs below the roofline (src). This was originally the base of the Great Court plaza on the roofs. |
| Windows | An **exterior metal-framed window wall** between the butterfly columns (src: 1965 construction photo). So the lecture centers are **not windowless**. Frames dark bronze (est.). |
| Roof | The Great Court was removed 1993–99 and the buildings were "remodeled" at that time (src). The current roof form is **unverified**: I found no source for pyramid or skylight roofs, so check photos before adding any. Default to flat roofs with a granite/concrete fascia. |
| Quad paving (current) | Rebuilt **2022–2023** (2018 Master Plan): **20-ft-wide sidewalks**, a **central lawn**, a **stage with ramp** and power, new **shade trees**, a **rain garden**, and an underground stormwater vault (src). Walks are probably broom-finish concrete (est.), with granite kept at steps and walls (unverified). |
| Look in one sentence | Low brick lecture halls behind a colonnade of twisted concrete butterfly columns, capped by a thick granite edge, around a green lawn crossed by wide pale walks. |

### 2.5 Behavioral Sciences Building (BSB), 1007 W Harrison
| Item | Spec |
|---|---|
| Size | 4 stories, ~231,900 sq ft, 1967–69, SOM/Netsch (src). |
| Facade | **Poured-in-place concrete frame; most walls are brick** (src: SOM). Field-theory plan of **rotated squares**, so the facades step and jog at 45° (src). |
| Windows | "Windows were minimized, leaving little natural light" (src). Use **few, small, deep-set openings**, with mostly blank brick. |
| Look in one sentence | A heavy, maze-like brick block with concrete bands, whose walls fold at 45° angles and are almost windowless. |

### 2.6 Science & Engineering Offices (SEO), 851 S Morgan
| Item | Spec |
|---|---|
| Size | **13 stories**, opened 1968 (src). OSM height 49 m. |
| Massing | **Two slab sections, slightly offset** from each other (src). |
| Distinctive | **Concrete-framed scissor staircases visible from outside**, one in each section (src). Model them as open concrete stair towers with diagonal flights showing through the frame. |
| Windows | **Narrow recessed windows** (src), Netsch style. Bronze glass (est.). |
| Signage | **Engraved granite block** with the building name on the north and south sides (src). This is fine to model, since it is a building name, not a logo. |
| Look in one sentence | A 13-story concrete office slab in two offset halves, with narrow dark slot windows and exposed zig-zag scissor stairs on the outside. |

### 2.7 Science & Engineering Laboratories (SEL / SELE), 950 S Halsted
| Item | Spec |
|---|---|
| Facade | **Double-size brick** forming an "endless pattern of letter I's" (src). |
| Structure | **Huge exterior concrete pylons, twisted 45°** (no butterfly capital), carrying a **steel-framed roof** (src). The center addition (1966–67) has brick exterior walls between the pylons (src). |
| Windows | Few. The wall is mostly patterned brick (est.). |
| Look in one sentence | A massive lab block of oversized dark brick in a repeating "I" pattern, punctuated by giant rotated concrete pylons. |

### 2.8 Science & Engineering South (SES), 845 W Taylor
| Item | Spec |
|---|---|
| Date | 1967, Phase 3, Field Theory (src). |
| Facade | **Brick: nonstandard (large) size with a distinctive color range** (src). Over 113,000 sq ft of masonry is being repaired and cleaned (src). |
| Ground level | **Granite covered breezeway and granite stairs** (src); concrete plazas; storefront entries; **skylights** (src). |
| Windows | About **300 window units** are being replaced (2026–27) (src). Original pattern unverified (est.: narrow recessed). |
| Look in one sentence | A large brick Field-Theory science building with granite breezeways, under scaffolding in 2026–27. |

### 2.9 Engineering Research Facility (ERF), 842 W Taylor
| Item | Spec |
|---|---|
| Facts | Described only as an "existing mid-century building" (src: Chicago YIMBY). The new CDRLC attaches to it, so ERF's Brutalist style "remains very visible" (src: Axios). |
| Facade | **Unverified.** Treat it as a campus-style brick-and-concrete lab building until photos arrive. |

### 2.10 Computer Design Research and Learning Center (CDRLC), 900 W Taylor (opened 2025)
| Item | Spec |
|---|---|
| Architects | LMN Architects (design) + Booth Hansen (record) (src). 5 floors, 135,000 sq ft (src). |
| Form | **Curvilinear / sinuous facade** with softer, curved edges that break from the orthogonal campus (src). |
| Materials | **Precast concrete panels in 4 finishes: acid-etched, terra cotta inlay, polished, smooth**. **8,800 sq ft of inset terra-cotta panels.** Bronze detailing; metal panels and screening; a bronze mesh screen (src). 29,000 sq ft of glazing, curtain walls and skylights (src). |
| Windows | **Wide, recessed windows** (horizontal-proportioned punched openings), cut into the precast (src). |
| Colors | Precast: light warm grey `#c9c3b8` (est.). Terra cotta: warm orange-red `#a8573a` (est., unverified). Bronze metal `#6b5137` (est.). |
| Look in one sentence | A curving five-story precast-concrete building with wide deep windows, inlaid with terra-cotta and bronze accents: a softened, modern take on Netsch. |

### 2.11 Student Recreation Facility (SRF), 737 S Halsted (2005–06)
| Item | Spec |
|---|---|
| Facts | 151,000–155,000 sq ft; a "bold, contemporary form" acting as an eastern **gateway**. **Extensive glass along the facade and a soaring atrium lobby** show the activity inside (src: Dewberry). A 42–43 ft climbing wall is a visual anchor (src). |
| Cladding | **Metal panels** (src: a UIC notice about loose panels). Panel color unverified (est. silver-grey `#9ea3a6`). |
| Look in one sentence | A glassy, contemporary gym clad in metal panels, with a tall atrium that shows the climbing wall to Halsted Street. |

### 2.12 Academic and Residential Complex (ARC), 940 W Harrison (2019)
| Item | Spec |
|---|---|
| Architect / massing | Solomon Cordwell Buenz (SCB). An **angular 10-story residence tower** plus a **curvilinear 2-story academic building**, linked on two levels (src). |
| Materials | **Precast concrete**, "lighter and more transparent" than the old campus buildings. **3 precast forms yield 70 panel types**, with **3-inch projections** for depth (src). **Folded aluminum fins** tuned by daylight studies. **Fritted glass.** Large expanses of glass on the ground floor (src). |
| Colors | Precast light grey-white `#cfcbc3` (est.); aluminum fins silver `#b4b8ba` (est.); glass blue-grey `#6f7f88` (est.). |
| Look in one sentence | A crisp, pale precast tower whose angled panels and silver fins echo Netsch's rotated geometry, sitting on a glassy curved two-story base. |

### 2.13 Grant / Lincoln / Douglas Halls (classroom cluster, reclad)
| Item | Spec |
|---|---|
| Original | 3 stories, mid-1960s, **concrete-framed window panels** (src: photos of them being installed on the 2nd and 3rd floors of Grant Hall). Block-I windows on the upper floors. |
| Now | **Renovated and reclad in glass 2009–2012** (src: Preservation Chicago). Douglas Hall: The Architects Enterprise. The **concrete-and-glass exterior was removed** but the "lines of Netsch's original design" were kept; it has automated shades, geothermal wells and rooftop solar (src). Lincoln Hall: LEED Gold, $13.7 M, "new window treatments" (src). |
| Model | Today: a 3-story box with **glass curtain walls** following the old bay rhythm, plus rooftop PV panels (est.). |
| Look in one sentence | Three-story Netsch boxes now wrapped in modern glass, with the old structural rhythm still visible. |

### 2.14 Burnham / Taft / Addams Halls (classroom cluster)
| Item | Spec |
|---|---|
| Original | 3 stories, nearly identical, linked by **second-floor enclosed bridges** (src). **"Rhythmic bands of pointed concrete grilles between which light passes"** on the upper two floors (src). These are precast concrete facade panels (src: they were removed as "exterior concrete facade panels"). |
| Burnham, Addams | Still original concrete grilles (as of 2023, src). Model the pointed-arch-like **precast grille bays** on floors 2–3, with a recessed ground floor. |
| Taft | **Facade panels demolished 2025**; new exterior wall system by **Gensler**, reopening fall 2026 (src). Final look **unverified**. |
| Look in one sentence | Three-story concrete halls whose upper floors are bands of pointed precast concrete grilles over dark glass. |

### 2.15 Henry / Jefferson Halls
| Item | Spec |
|---|---|
| Original | 3 stories, **exterior reinforced-concrete piers**; upper two floors have **recessed window walls with open galleries** (src). Linked by a two-story **glass-enclosed passage** (an ADA replacement for the old walkway) (src). |
| Renovation | Krueck Sexton Partners, about $24 M. **Keeps the facade elements.** A **salvaged burnished concrete-block screen** forms the new shared entry, lit like a lantern at night. The **brick wall along Harrison Street is removed** and replaced with plantings (src). |
| Look in one sentence | Low concrete pier-and-gallery halls with dark recessed glass, joined by a glass bridge. |

### 2.16 Stevenson Hall
- No description found **(unverified)**. Treat it as part of the 1960s classroom family, with concrete piers and recessed Block-I upper floors (est.).

### 2.17 Student Services Building (SSB), 1200 W Harrison
- Location: NW corner of Harrison and Racine (src).
- Architect and date: **unverified**. A 1970 Harry Weese & Associates proposal for a "Student Services Classroom-Office Building" exists, but its site is listed as Morgan–Halsted, so it may be a different building.
- Facade: unverified.

### 2.18 Credit Union 1 Arena (built as UIC Pavilion), 525 S Racine
- **SOM** (Wikipedia infobox, unverified), opened 1982.
- Renovated 2001 and 2005; the 2005 work **added a main lobby** (src). A new name marquee was added in 2019 (src).
- Facade: **unverified**. Do not add brand logos; the marquee can be a blank LED panel.

### 2.19 Architecture & Design Studios (former Art & Architecture Building)
- 1967, Phase 2. **Netsch's first Field-Theory building**; only **about 40% was built** and the classroom wings were never added (src).
- **Exterior walls were left without brick facing** where the addition was planned (src). So the building is brick with some bare or plain concrete-block walls.
- Interior skylights (src).
- Look in one sentence: a jagged, rotated-square brick building with unfinished plain walls where the wings should have been.

### 2.20 Art & Exhibition Hall (400 S Peoria) and CUPPA Hall (412 S Peoria)
- Both are **former Formfit Company industrial buildings** north of I-290, bought by UIC in 1979 (src).
- Art & Exhibition Hall: **beige brick** (src: art.uic.edu photo caption), est. `#c2ab8a`. Industrial loft windows (est.).
- CUPPA Hall: adaptive-reuse loft. Windows partly replaced around 2015 (src). Facade color unverified.

### 2.21 Education, Theatre, Music & Social Work (ETMSW), 1040 W Harrison
- **Harry Weese & Associates** (src: photo metadata), built 1969–71. Originally the Education & Communications Building.
- **Brick facing** (src: scaffolding photo for the brick installation, 1970). Color unverified.

### 2.22 Jane Addams Hull-House Museum and Residents' Dining Hall, 800 S Halsted
- **Mansion (1856):** **Italianate**, **red brick** (completely **refaced with new brick** in the 1960s restoration), **large columned porch / portico with Corinthian columns**, **hipped roof**, **arched windows** (src). Brick est. `#9a4a36`; white or cream trim `#e8e2d4` (est.).
- **Dining Hall (1905/1907, Pond & Pond):** **Arts & Crafts** style (src). Brick color unverified (est. dark red-brown). It was moved and realigned onto its current lot (src).
- Look in one sentence: a small Victorian red-brick house with a white columned porch, beside an Arts-&-Crafts brick hall, surrounded by concrete giants.

### 2.23 UIC-Halsted Blue Line station entrances (430 S Halsted / Peoria / Morgan)
- **Halsted station house (rebuilt 2000–01):** "**sharp angles and triangular shapes**" (src: chicago-l.org). Third-party description: **red-brick station house with a flat white roof** (unverified).
- It is now mostly hidden by a **large, tall crosswalk canopy** built over the Halsted bridge in **2016** (Circle Interchange project) (src).
- **Peoria entrance:** renovated 2014–16 with an elevator (src).
- **Morgan entrance:** rebuilt 2000 with an ADA ramp to the platform (src).
- No CTA logos.

### 2.24 Halsted Street Parking Structure (and Harrison Street structure)
- Halsted structure: elevation drawings dated **1977** (src). Cladding unverified (est. plain cast-in-place concrete with open horizontal decks, `#a9a49b`).
- Harrison Street structure: at 1100 W Harrison, just east of the arena (src). Cladding unverified.

### 2.25 Residence halls: Student Residence & Commons (Courtyard / North / South) and Commons West
- Built about **1988–1992** at Harrison and Halsted (src). **Commons West is 4 stories** (src).
- Facades **unverified**. Late-1980s campus housing is typically brick (est.), but check photos first.

---

## 3. The 5 biggest differences from a generic "grey concrete campus"

1. **Brick is everywhere, not just concrete.** SCE, the Lecture Centers, Daley Library's bays, BSB, SEL, SES, ETMSW and Hull-House are brick-walled. Concrete is the frame and brick is the wall, in a dark red-brown range with per-brick variation (est.). SEL and SES use **double-size brick in an "I" pattern**.
2. **Windows are recessed deep behind the structure, and the glass is bronze.**
   - Use narrow **Block-I windows**: a bronze centre with clear trapezoids top and bottom.
   - Set them behind exterior piers, often behind an **open gallery ledge** (UH floors 3–28, Henry and Jefferson upper floors).
   - Flush grey glass in a flat wall is the single most "wrong" thing to fix.
3. **University Hall steps outward twice** (150 → 160 → 170 ft on the east and west faces, at floors 9 and 17), stands on giant ground columns, and has a newer glass curtain wall on floor 28.
4. **Signature structural details make each building recognizable:**
   - twisted-45° **butterfly columns** ringing the Lecture Centers, plus a **1-ft granite slab edge** at the roofline
   - giant twisted **pylons** at SEL
   - **exposed scissor stairs** on SEO
   - **pointed precast grilles** on Burnham and Addams
   - **rotated-square (45°) plans** for BSB, SES and the Architecture & Design Studios
5. **Newer buildings are deliberately different, so do not render them as Brutalist grey boxes:**
   - Lincoln, Douglas and Grant Halls are **reclad in glass**.
   - The **ARC** is pale precast with silver folded-aluminum fins and fritted glass.
   - The **CDRLC** is a **curving** precast building with terra-cotta inlays and bronze trim.
   - The **SRF** is metal panels and big glass.
   - **Hull-House** is a red-brick Italianate house with a columned porch.

**Photo checks needed most:**
1. the true brick color
2. the granite color
3. window frame color
4. the current Lecture Center roofs
5. SCE Tower's facade
6. ERF, the arena, SSB, the residence halls and the parking structures

---

## 4. Sources
- UIC Library, *The Historic Netsch Campus*:
  - University Hall: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/university-hall
  - Block I window design: https://exhibits.library.uic.edu/the-historic-netsch-campus/block-i-window-design
  - Block I window close-up: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/close-up-detail-of-the-block-i-windows-in-university-hall-1
  - Richard J. Daley Library: https://exhibits.library.uic.edu/the-historic-netsch-campus/richard-j-daley-library
  - Science and Engineering Laboratories: https://exhibits.library.uic.edu/the-historic-netsch-campus/science-and-engineering-laboratories
  - View of the Science and Engineering Laboratories: https://exhibits.library.uic.edu/the-historic-netsch-campus/view-of-the-science-and-engineering-laboratories
  - Science and Engineering Offices: https://exhibits.library.uic.edu/the-historic-netsch-campus/science-and-engineering-offices
  - SEO granite sign: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/granite-sign-for-the-science-and-engineering-offices
  - Henry Hall and Jefferson Hall: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/henry-hall-and-jefferson-hall
  - Walkway joining Henry and Jefferson Halls: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/the-walkway-joining-henry-hall-and-jefferson-hall
  - Tigertooth design: https://exhibits.library.uic.edu/the-historic-netsch-campus/tigertooth-design
  - Circle Forum and exedrae drawing: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/architectural-drawing-of-the-circle-forum-and-exedrae
  - Behavioral Sciences Building drawing: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/architectural-drawing-of-the-behavioral-sciences-building
  - SES architectural plans: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/architectural-plans-for-the-science-and-engineering-south-building
  - The Architecture and Art Building: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/the-architecture-and-art-building
  - ComEd gate: https://scalar-prod.lib.uic.edu/the-historic-netsch-campus/comed-gate
- UIC Library, *UIC History*:
  - The Circle Campus: https://exhibits.library.uic.edu/uic-history/the-circle-campus.19
  - Great Court, Circle Forum and walkways removed: https://exhibits.library.uic.edu/uic-history/the-great-court-circle-forum-and-elevated-walkways-are-removed
  - Major renovations on the east side: https://exhibits.library.uic.edu/uic-history/major-renovations-are-done-to-the-east-side-of-campus
  - SRF opens: https://exhibits.library.uic.edu/uic-history/the-student-recreation-facility-opens-campus-recreation-moves-from-student-center-east
- UIC digital collections (construction photo captions):
  - SCE brick walls: https://digital.library.uic.edu/view/ark:/81984/d3c24qt8q
  - SCE Tower naming: https://digital.library.uic.edu/view/ark:/81984/d30v89p80
  - Lecture Center photos: https://digital.library.uic.edu/browse/collection/364?page=26
  - Daley Library photos: https://digital.library.uic.edu/browse/collection/364/time?page=28
  - ETMSW photos: https://digital.library.uic.edu/view/ark:/81984/d3k64b075
  - Halsted Street Parking Structure drawings: https://digital.library.uic.edu/view/ark:/81984/d3j38kp57
- Open House Chicago, UIC University Hall: https://openhousechicago.org/sites/site/uic-university-hall
- UIC Today:
  - UH facade repair begins: https://live.today.uic.edu/crews-begin-work-to-repair-uh/
  - UH construction begins: https://live.today.uic.edu/university-hall-construction-begins/
  - UIC brutalism: https://today.uic.edu/understanding-uic-brutalism/
  - SES exterior renovation: https://live.today.uic.edu/renovation-work-begins-on-science-and-engineering-south-building-exterior/
  - Taft Hall renovation: https://live.today.uic.edu/taft-hall-renovation-work-to-begin-may-12/
  - Douglas Hall LEED Gold: https://live.today.uic.edu/douglas-hall-earns-gold-for-green/
  - Quad renovations begin: https://today.uic.edu/quad-renovations-begin-this-week/
  - Quad to reopen: https://today.uic.edu/quad-to-reopen-this-week/
  - Daley Library IDEA Commons: https://today.uic.edu/library-space-a-great-architectural-idea/
  - Architectural history walking tour: https://today.uic.edu/walk-through-uics-architectural-history/
- Board of Trustees agenda items:
  - UH facade repair: https://www.trustees.uillinois.edu/trustees/agenda/May-19-2016/028-may-UH-Facade-Repair.pdf
  - SES repairs: https://www.trustees.uillinois.edu/trustees/agenda/May-16-2024/18-May-24-Approve-UIC-Project-for-Science-and-Engineering-South-Repairs.docx
  - Taft Hall project and design: https://www.trustees.uillinois.edu/trustees/agenda/May-16-2024/16-May-24-Approve-UIC-Project-and-Design-Taft-Hall.docx
  - Jefferson and Henry Halls budget and design: https://www.trustees.uillinois.edu/trustees/agenda/March-20-2025/24-Mar-25-Approve-UIC-Budget-Design-Jefferson-Henry-Halls.docx
- Preservation Chicago, Taft Hall: https://www.preservationchicago.org/threatened-taft-hall-at-the-university-of-illinois-chicago-a-2023-chicago-7-most-endangered/
- SOM, Behavioral Sciences Building: https://www.som.com/projects/university-of-illinois-at-chicago-phase-iii-behavioral-sciences-building/
- SOS Brutalism, BSB: https://www.sosbrutalism.org/cms/15891391
- Krueck Sexton Partners, Jefferson and Henry Halls: https://ks.partners/projects/university-of-illinois-at-chicago-jefferson-and-henry-halls/
- CADA, Jefferson and Henry Halls renovation: https://cada.uic.edu/about/jh_hh_renovation/
- Computer Design Research and Learning Center:
  - LMN completion announcement: https://lmnarchitects.com/?p=17283
  - Booth Hansen project page: https://www.boothhansen.com/project/computer-design-research-and-learning-at-university-of-illinois-chicago
  - IMI article: https://imiweb.org/project/university-of-illinois-chicago-academic-building-reinterprets-brutalism-with-precast-terra-cotta-and-terrazzo/
  - BAC Best Precast Project: https://bacweb.org/fr/node/4523
  - Axios: https://www.axios.com/local/chicago/2026/03/31/uic-building-brutalism-chicago-architecture-modern-learning-space
  - Chicago YIMBY: https://chicagoyimby.com/2024/01/uic-computer-design-and-research-center-wraps-up-final-exterior-touches-in-little-italy.html
- Academic and Residential Complex (ARC):
  - AIA award page: https://www.aia.org/design-excellence/award-winners/university-illinois-chicago-academic-and-residential-complex-uic
  - Architizer: https://www.architizer.com/projects/academic-and-residential-complex
  - Construction Equipment Guide: https://www.constructionequipmentguide.com/uic-towers-combine-learning-with-living/42334
  - Education Snapshots: https://educationsnapshots.com/projects/10070/university-of-illinois-at-chicago-academic-and-residential-complex/
- SRF: https://dewberry.com/projects/university-of-illinois-at-chicago---east-campus-recreation-center
- Credit Union 1 Arena:
  - Wikipedia: https://en.wikipedia.org/wiki/Credit_Union_1_Arena
  - Board of Trustees naming item: https://www.trustees.uillinois.edu/trustees/agenda/January-31-2019/006-jan-Pavilion-Credit-Union-1.pdf
- Hull-House:
  - Wikipedia: https://en.wikipedia.org/wiki/Hull_House
  - Chicago Landmarks: https://webapps1.chicago.gov/landmarksweb/web/landmarkdetails.htm?lanId=1329
  - NPS: https://npgallery.nps.gov/GetAsset/54345d68-e4d7-46b6-a692-6085ab17c2ca
- UIC-Halsted station:
  - chicago-l.org: https://www.chicago-l.org/stations/UofI-halsted.html
  - subwaynut.com: https://subwaynut.com/chicago/blue_line/uic_halsted
  - Wikipedia: https://en.wikipedia.org/wiki/UIC%E2%80%93Halsted_station
- CUPPA Hall: https://today.uic.edu/cuppa-staff-relocates-during-building-repairs/
- School of Art: https://art.uic.edu/?p=2
- Commons West: https://housing.uic.edu/halls/commonswest
