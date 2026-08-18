// Sport registry — the one place that knows what's sport-specific.
//
// The map engine (main.js, filters.js, panel.js, the two map renderers) is
// otherwise sport-agnostic: it renders whatever list of school records it's
// handed and derives conferences/regions/divisions from the data. Everything
// that DOES differ between hockey and lacrosse — the wordmark, the page title,
// which divisions and leagues exist, the detail-card program label — lives here,
// keyed by sport. Adding a third sport is: add a dataset module, add an entry.
//
// Both datasets are imported eagerly. They're small, and holding both in memory
// is what makes the cross-sport "also plays here" link cheap (see main.js).

import { SCHOOLS } from "./data.js";
import { LACROSSE_SCHOOLS } from "./data-lacrosse.js";

export const SPORTS = {
  hockey: {
    id: "hockey",
    label: "Hockey",
    // Two stacked wordmark lines — the second is the outlined "Map".
    wordmark: ["College Hockey", "Map"],
    title: "College Hockey Map — NCAA D1 & D3 Programs",
    sub: "Every NCAA Division I and Division III program. Zoom in, click a school, go straight to the ice.",
    // NCAA hockey has only two divisions; ACHA club is an opt-in overlay.
    divisions: ["D1", "D3"],
    leagues: ["NCAA", "ACHA"],
    data: SCHOOLS,
    // Detail-card link label + the noun used to build a fallback web search.
    programLabel: "Hockey program",
    searchNoun: "ice hockey",
  },
  lacrosse: {
    id: "lacrosse",
    label: "Lacrosse",
    wordmark: ["College Lacrosse", "Map"],
    title: "College Lacrosse Map — NCAA D1, D2 & D3 Programs",
    sub: "Every NCAA Division I, II, and III program. Zoom in, click a school, go straight to the field.",
    // Lacrosse adds a D2 tier hockey never had; no club league yet.
    divisions: ["D1", "D2", "D3"],
    leagues: ["NCAA"],
    data: LACROSSE_SCHOOLS,
    programLabel: "Lacrosse program",
    searchNoun: "lacrosse",
  },
};

// Order the switcher presents them in, and the sport shown on first load.
export const SPORT_ORDER = ["hockey", "lacrosse"];
export const DEFAULT_SPORT = "hockey";

// Human labels for the division axis, shared by the tally, pills, and detail
// card so "D2" reads as "Division II" everywhere.
export const DIVISION_LABEL = {
  D1: "Division I",
  D2: "Division II",
  D3: "Division III",
  ACHA1: "ACHA D1",
  ACHA2: "ACHA D2",
  ACHA3: "ACHA D3",
};

export const LEAGUE_LABEL = { NCAA: "NCAA", ACHA: "ACHA club" };

// School ids present in each sport's dataset — the hook for "plays both". Ids
// are deliberately shared across datasets where a campus fields both sports, so
// an intersection of these sets is the list of schools that do.
export const IDS_BY_SPORT = Object.fromEntries(
  SPORT_ORDER.map((key) => [key, new Set(SPORTS[key].data.map((s) => s.id))])
);
