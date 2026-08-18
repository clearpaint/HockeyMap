# College Hockey Map

An interactive map of NCAA men's and women's **Division I** and **Division III** ice
hockey programs, plus every **ACHA Men's Division 1** club hockey program (a separate
League filter — switch NCAA off to see club hockey on its own). ACHA D2/D3 are a
future pass. Zoom into a region, click a program, and go straight to its athletics
site. Filter by league, division, region, conference, and field of study; sort the
list by name, state, conference, division, or rank.

The same engine also maps **college lacrosse** — a sport switcher in the masthead
flips between hockey and lacrosse, and a school that fields both shows an "Also fields
[sport] here" note on its card. See **[Two sports, one engine](#two-sports-one-engine)**
below for how the sport axis works and how to add a third.

No build step, no npm install, no API keys.

The map uses **real street tiles** (CARTO light basemap, with a Satellite layer you
can switch to at top right), so you can see the neighbourhood a campus actually sits
in — zoom into Chestnut Hill and Commonwealth Avenue is right there. That needs an
internet connection. With no connection the page falls back to a built-in offline
vector map of the US and says so; every filter, sort, and link keeps working either
way.

---

## Run it

**The quickest way** — open `hockey-map.html` by double-clicking it. That's a
self-contained single file with the CSS, JavaScript, and every school inlined. With no
connection it uses the offline vector map; with one it upgrades to street tiles. You
can email it or drop it on a USB stick.

**For development**, serve the folder and use `index.html`:

```bash
npx serve .        # then open the printed URL
# or
python -m http.server 8000
```

> `index.html` needs a server. Browsers refuse to load external ES modules over
> `file://` (an opaque origin fails the CORS check), so opening it directly renders
> an empty map. That's exactly why `hockey-map.html` exists. After editing anything
> in `js/` or `css/`, re-run `node tools/build-standalone.cjs` to refresh it.

---

## Two sports, one engine

Hockey and lacrosse share every renderer, filter, and tool. Nothing about the map,
list, clustering, or detail card is hockey-specific — a **sport registry** supplies
the parts that differ (branding, which divisions and leagues exist, which dataset to
show), and the masthead switcher swaps the active sport at runtime. Both datasets load
up front, so switching is instant and cross-sport lookups are free.

```
js/sports.js          the registry — one entry per sport (SPORTS map)
js/data.js            hockey schools          (export const SCHOOLS)
js/data-lacrosse.js   lacrosse schools        (export const LACROSSE_SCHOOLS)
```

Each `SPORTS` entry declares its `wordmark`, page `title`, `divisions`, `leagues`, and
`data`:

```js
hockey:   { divisions: ["D1", "D3"],       leagues: ["NCAA", "ACHA"], data: SCHOOLS },
lacrosse: { divisions: ["D1", "D2", "D3"], leagues: ["NCAA"],         data: LACROSSE_SCHOOLS },
```

Everything data-derived flows from that entry: the division **pills** and **tally rows**
are built from `divisions` (lacrosse's third tier, **D2**, shows up automatically — it
has its own colour, `--d2line`), and the **League** filter hides itself when a sport has
only one league (lacrosse has no club tier yet, so no league toggle appears). No division
or league is hardcoded in `main.js` anymore.

### Cross-sport "plays both"

A campus that fields **both** sports uses the **same `id`** in both datasets (e.g.
`"cornell"` appears in `js/data.js` and `js/data-lacrosse.js` with identical
`lat`/`lon`). `IDS_BY_SPORT` in `js/sports.js` is a per-sport `Set` of ids, so the
intersection is a cheap lookup; the detail card renders "Also fields Hockey here" (or
Lacrosse) from it. The two datasets are **never merged** — the link is derived and
read-only. `tools/verify-data.cjs` has a cross-sport check that fails the build if a
shared id disagrees on coordinates or state between the two files.

> Lacrosse data is currently a small **hand-verified sample** (~25 records: Ivy men,
> Ivy/Big Ten women, a few D2/D3) that proves the schema and UI end-to-end. The full
> ~900-program NCAA dataset is a follow-up gather pass.

### Adding a third sport

1. Create `js/data-<sport>.js` with the same record shape as `js/data.js`. **Export it
   under a distinct name** (e.g. `export const SOCCER_SCHOOLS`) — `build-standalone.cjs`
   flattens every module into one scope, so a second `export const SCHOOLS` would
   collide. End the file with the same normalizer (`.map()` adding `schoolId`/`key`);
   reuse hockey/lacrosse `id`s for shared campuses.
2. Add an entry to `SPORTS` in `js/sports.js` and its slug to `SPORT_ORDER`. Add any
   new division codes to `DIVISION_LABEL`.
3. Add a radio to the `.segmented--sport` switcher in `index.html`.
4. If it introduces a division code with no colour yet, add a `--<code>line` family in
   `css/app.css` (mirror the `--d2line` block: pill, marker, cluster, divtag, tally).
5. Teach the tooling: add the file to `MODULES` in `tools/build-standalone.cjs`, load it
   in `tools/build-map.cjs` and `tools/verify-data.cjs`.
6. Verify: `node tools/verify-data.cjs`, `node tools/build-map.cjs`,
   `node tools/build-standalone.cjs`, then `node tools/smoke-lacrosse.cjs` (adapt it, or
   add a sibling) to confirm the switcher, division axis, and cross-sport note.

---

## Adding ACHA D2/D3 club programs  ← NEXT TASK

NCAA doesn't sponsor a Division II hockey championship. Schools without an NCAA D1/D3
team often still field one through **ACHA** (American Collegiate Hockey Association),
a separate club-hockey body with its own three tiers — ACHA D1, D2, D3 — that are
*not* equivalent to NCAA's divisions.

**ACHA Men's Division 1 is done** — all 67 active programs, verified against each of
the 9 D1 conferences' current member lists (Wikipedia, cross-checked Aug 2026):
WCHL, WHAC, ECHA, CHMA, ACCHL, GLCHL, MCH, NECHL, and GL6. A few schools that still
show up on old conference pages (Arizona State, Niagara, Canisius, RIT, Robert
Morris, Western Michigan, SUNY Oswego) were **excluded** because they already play
NCAA hockey in this data — those are stale entries from before those schools moved up,
not real dual programs. Recheck this list periodically since ACHA conference rosters
change most summers.

**Still missing: ACHA D2 and D3**, and ACHA women's hockey — likely 200+ more records,
much less centrally tracked than D1. Add them to `js/data.js` with `league: "ACHA"`
and `division: "ACHA2"` or `"ACHA3"`:

```js
{ id: "iowa-state", name: "Iowa State", division: "ACHA1", league: "ACHA",
  city: "Ames", state: "IA", zip: "50011",
  lat: 42.0267, lon: -93.6465,
  conference: "MCH",
  knownFor: "ACHA D1 club hockey",
  studyTags: ["stem"],
  schoolUrl: "https://www.iastate.edu",
  hockeyUrl: "https://isucyclonehockey.com" }
```

Notes for whoever does this:

- **Reuse the `id`** for a school that already has an NCAA program — same rule as
  gender sharing. The `key` becomes `${id}-${gender}-acha` (the `-acha` suffix is
  omitted for NCAA records, so existing keys are untouched).
- ACHA is a **League** filter (NCAA / ACHA club, both checkable independently) —
  uncheck NCAA and check ACHA to see club programs on their own, or check both to see
  everything at once. The NCAA-only Division pills hide themselves while NCAA is
  unchecked, since they'd otherwise filter nothing.
- ACHA is treated as its own colour (`--achaline` in `css/app.css`), distinct from the
  NCAA D1 blue / D3 red, since it's a different governing body, not a third NCAA
  division.
- Then run:

```bash
node tools/build-map.cjs        # projects any new campuses
node tools/verify-data.cjs      # location agreement, unique keys, coords on land
node tools/build-standalone.cjs
```

---

## Editing the data

Everything lives in **`js/data.js`** — one object per school, safe to hand-edit:

```js
{ id: "boston-college", name: "Boston College", division: "D1",
  city: "Chestnut Hill", state: "MA", zip: "02467",
  lat: 42.3355, lon: -71.1685,
  conference: "Hockey East",
  knownFor: "Elite academics, national titles",
  studyTags: ["liberal-arts", "business"],
  schoolUrl: "https://www.bc.edu",
  hockeyUrl: "https://bceagles.com/sports/mens-ice-hockey" }
```

Fields omitted from a record default to `rank: null`, `enrollment: null`,
`rankNote: ""`, `status: "active"`, `statusNote: ""`, `firstSeason: null`.

### Verifying after an edit

```bash
node tools/verify-data.cjs     # counts, duplicate ids, coords inside their state
```

Run this after any change to `js/data.js`. It's the check that caught a Roger
Williams coordinate sitting in the water off Rhode Island.

### Setting a rank

`rank` and `enrollment` ship as `null` for every school and render as a muted
"not set" — deliberately, so nothing on the page looks like data when it isn't.
To fill one in:

```js
rank: 4, rankNote: "USCHO poll, Mar 2026",
```

Sorting by rank puts unset schools last, so you can rank a handful and they'll
sort to the top without touching the rest.

**NCAA D1 is done for enrollment (all 97 D1 men's/women's records) and for rank
(the 2025-26 USCHO final polls — 20 men's teams from the April 13, 2026 poll, 13 of
15 women's teams from the March 23, 2026 poll).** Rank is a snapshot, not a live
feed — every `rankNote` says which poll and when, so it's obvious when a number is
stale and needs a refresh next season.

Two ranked D1 women's programs are missing entirely from the data and couldn't be
ranked: **Northeastern** (#4) and **Mercyhurst** (#12). They were missed in the
original women's-programs pass — add them the same way as any other women's record
(see the notes further up) before their ranks can be applied.

**NCAA D3 is now done for enrollment (all 146 active D3 men's/women's records,**
gathered from conference-membership pages, one fetch per conference) **and for
rank of the men's top 15** (the NCAA Division III Percentage Index, aka NPI —
D3 has no media poll like USCHO's D1 rankings, so NPI is the closest dated,
public, full-field ranking that exists). D3 women's rank hit the same gap as
before: no accessible ranked list was found, so it's left `null` rather than
estimated, except one confirmed data point: Williams (women's) finished the
final March 30, 2026 USCHO D3 women's poll at #5 — the only spot in that poll
a reliable source actually named; the rest of the field wasn't recoverable
from the sources checked, so it's left unranked rather than guessed.

**Still missing:** enrollment and rank for ACHA D1 (67 records) — ACHA publishes
computer rankings but no accessible dated list was found at research time. Leave
`rank: null` rather than estimate — that's what "not set" is for.

**Team logos (`logoUrl`)** are set for all 145 D3 records (91 men's + 54
women's) — the D3 nitty-gritty reports render each team's crest right next to
its name, so `tools/ingest/local-fetcher/extract_logos.cjs` pulls it from the
same page the rank data comes from. D1 and ACHA schools don't have a logo
source yet; `logoUrl` is `null` for them and the UI just omits the icon.

### Refreshing rank/enrollment with `tools/ingest/`

Once a year (final polls land at season's end; enrollment barely changes
year to year), refresh instead of hand-patching `js/data.js` line by line:

```bash
node tools/ingest/ncaa-rankings.cjs > rankings.json   # D1 men's/women's polls, from ncaa.com
node tools/ingest/enrollment.cjs "<wikipedia-conference-url>" > enrollment.json
node tools/ingest/apply.cjs rankings.json             # merges into js/data.js, then re-verifies
```

`ncaa-rankings.cjs` and `enrollment.cjs` fetch from `ncaa.com` and Wikipedia,
both reachable from a normal environment — that covers D1 rankings and all
enrollment. **`stats.ncaa.org` is not reachable from here** — requests from a
datacenter/cloud IP get a 403 from Akamai's edge (confirmed: identical block
via a plain HTTP request and a full headless-Chromium session, while the same
URL works fine from a residential browser). D3's NPI ranking only lives on
`stats.ncaa.org`, with no `ncaa.com` equivalent, so that one needs
`tools/ingest/local-fetcher/` — a script you run on your own machine instead,
driving a real browser (Playwright) since the D3 pages also sit behind an
Akamai JS challenge a plain HTTP client can't pass. See
`tools/ingest/local-fetcher/README.md` for the full loop.

Every fetcher reports names/teams it couldn't match to a `js/data.js` `id`
rather than silently dropping them — check that list before applying; it's
either a missing school record or a name-spelling mismatch worth a quick fix.

`apply.cjs` never overwrites a field that's already set unless you pass
`--force` (e.g. `node tools/ingest/apply.cjs rankings.json --force` when a new
season's poll should replace last year's).

### Adding a school

Append a record with a unique `id`, then re-project the map:

```bash
node tools/build-map.cjs          # updates js/geo.js with the new campus point
node tools/build-standalone.cjs   # refresh the single-file build
```

`tools/build-map.cjs` prints a warning if a coordinate can't be projected — that
usually means the lat/lon is outside the continental US, Alaska, or Hawaii.

### Fixing a coordinate

Edit `lat`/`lon` and re-run both commands above. Campus-level precision is plenty;
the map only needs the marker on the right side of town.

---

## Roster and data provenance

**Rosters are verified.** Every program was checked against Wikipedia's D1 and D3
program lists (Aug 2026) and cross-checked against each conference's own member
table — AHA, UCHC, NCHA, Little East, MASCAC, and CNE were all read directly. The
totals match the sources: **64 D1** (62 playing + Tennessee State 2026-27 and
Maryville 2027-28) and **92 D3** (91 playing + Saint Anselm 2027-28).

That cross-check corrected several things from the original source list:

- The Pennsylvania D3 schools (Albright, Alvernia, Arcadia, Lebanon Valley, Neumann,
  Stevenson, Wilkes) plus King's and Misericordia are in the **MAC**, not the UCHC —
  they left the UCHC after 2023-24.
- Norwich, Castleton, Babson, UMass Boston, Plymouth State, Keene State, Southern
  Maine, UMass Dartmouth, Western Connecticut and New England College are **Little
  East**.
- Brockport and Geneseo are **UCHC**, not SUNYAC. Hobart and Skidmore are **SUNYAC**.
- Rivier and Saint Joseph (CT) are **MASCAC** associates.
- Castleton is now **Vermont State Castleton**; Morrisville and Oswego are branded
  **SUNY**.

**Coordinates are verified.** A geometric check confirms all 162 records fall inside
the state polygon they claim — see the "coordinates verified" step below.

### The `status` field

Not every record is a program you can play for today, so each one is typed:

| `status` | Meaning | Shown by default |
|---|---|---|
| `active` | Currently playing — 154 records | yes |
| `future` | Announced, not yet playing (`firstSeason` says when) — 3 | no |
| `unlisted` | On the original source list but **not** on the current NCAA roster — 5 | no |

The two "Also show" checkboxes in the filter rail turn the extra pools on. The detail
card flags any non-active program at the top, and the list view tags the row — so a
program that isn't an option never silently looks like one.

The 5 `unlisted` records each carry a `statusNote` with what was found: Anna Maria
(college closing), Hilbert (UCHC women's hockey only), and Bryn Athyn, Calvin and
Houghton (not on the current D3 roster — likely ACHA club teams). They're kept rather
than deleted so nothing from your list disappears without explanation. **These are the
records most worth verifying.**

### Still empty

**Rank and enrollment are `null` for all 162 records** — see "Setting a rank" above.

---

## How it works

The projection runs **once, at build time**. `tools/build-map.cjs` loads a US
TopoJSON, projects it with d3-geo's `geoAlbersUsa()` (which carries the Alaska and
Hawaii insets — two programs are in Alaska), and writes plain SVG path strings plus
`{id: [x, y]}` pixel pairs to `js/geo.js`. The page then ships no mapping library
at all; pan, zoom, and clustering are a few dozen lines of arithmetic in `js/map.js`.

```
index.html                 markup and page structure
css/app.css                all styling
js/data.js                 the hockey school list  ← edit this
js/data-lacrosse.js        the lacrosse school list
js/sports.js               sport registry — branding, divisions, leagues per sport
js/geo.js                  GENERATED — projected paths and points (both sports)
js/leafmap.js              street/satellite tile map (Leaflet)
js/map.js                  offline fallback map: states, markers, pan/zoom
js/filters.js              filter and sort logic
js/panel.js                detail card and list view
js/main.js                 state store, sport switcher, and wiring
hockey-map.html            GENERATED — self-contained single-file build (both sports)
data/us-states-raw.json    source TopoJSON (build input only)
tools/                     build scripts, browser test, vendored d3 (build only)
```

Nothing under `tools/` or `data/` is needed to view the page.

### Design notes

Division owns the color axis: D1 markers are blue-line blue, D3 are red-line red, and
lacrosse's D2 gets its own amber (`--d2line`). Each program is drawn as a
**faceoff circle** — a dot inside a thin ring — that cuts open on hover. In dense
areas (Boston, upstate New York, Minnesota) markers within 15 screen pixels
collapse into a count badge and separate as you zoom.

---

## Tests

```bash
npm i -D playwright && npx playwright install chromium   # one-time

node tools/verify-data.cjs      # data checks for both datasets + cross-sport agreement
node tools/smoke.cjs            # offline map + all shared UI (hockey)
node tools/smoke-street.cjs     # the street/tile map (hockey)
node tools/smoke-lacrosse.cjs   # the sport switcher, D2 axis, and cross-sport note
```

`smoke.cjs` blocks the Leaflet CDN on purpose so it exercises the offline fallback
and passes with no network. `smoke-street.cjs` serves locally vendored copies of
Leaflet from `tools/vendor/`, so it tests our marker/cluster/selection code even
when the CDN is unreachable. Add `--shot` to either for screenshots, or `--file` to
`smoke.cjs` to check the standalone build over `file://`.

`smoke-lacrosse.cjs` is the second-sport suite: it flips the switcher to lacrosse and
asserts the branding, the D1/**D2**/D3 division pills and tally, that every lacrosse
campus plots (including a D2 marker in the D2 colour), that a D2 card reads "Division
II", that a school playing both shows the cross-sport note while a lacrosse-only one
doesn't, and that switching back leaves hockey untouched.

The suite covers marker counts against the data, filter/map/list agreement, real
mouse clicks on markers, click-after-pan, keyboard operation, the empty state, and
the 375px layout. Two checks exist specifically as regression guards:

- **"real mouse click on a marker opens its card"** — `setPointerCapture()` on
  `pointerdown` retargets the following `click` to the SVG, so marker clicks were
  silently swallowed. Capture is now taken only after the pointer moves far enough
  to count as a pan.
- **"no marker falls outside the cropped map frame"** — the offline map crops its
  empty south edge for size. Alaska sits lowest, so this catches a crop tightened
  too far.
- **"markers are actually in the DOM"** (street suite) — initialising Leaflet in a
  `display:none` container makes it measure 0×0 and render *zero* markers with no
  error. `main.js` now unhides the container before constructing the map.

### Regenerating the state-line overlay

`js/borders.js` is generated. If you ever change the source topology:

```bash
node tools/build-borders.cjs
```

It emits only the *interior* state boundaries (54 lines, 32 KB) — the coastline is
already drawn by the basemap, so including the national outline would quadruple the
file to redraw something you can already see. Lines are dashed navy over the street
basemap and dashed white over satellite imagery, and can be switched off under
Layers.
