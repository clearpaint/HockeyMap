// Boot and wiring. One state object, one render pass — every input mutates
// state then calls render(), so the map, list, and counts can never disagree.
//
// The engine is sport-parameterized: `sport` (from js/sports.js) supplies the
// wordmark, divisions, leagues, and labels, and `activeSchools` is its dataset.
// The sport switcher swaps both and rebuilds the data-derived controls; nothing
// below the switcher hardcodes hockey's divisions or leagues.

import { STUDY_TAGS, regionOf } from "./data.js";
import {
  SPORTS,
  SPORT_ORDER,
  DEFAULT_SPORT,
  DIVISION_LABEL,
  LEAGUE_LABEL,
  IDS_BY_SPORT,
} from "./sports.js";
import { createMap } from "./map.js";
import { applyFilters, sortSchools, facetCounts, emptyQuery, REGION_ORDER } from "./filters.js";
import { renderDetail, renderList } from "./panel.js";

const $ = (id) => document.getElementById(id);
// Named distinctly from panel.js's `esc`: build-standalone.cjs flattens every
// module into one scope, so a second top-level `const esc` would collide and
// break the standalone build. This one only needs to guard attribute values.
const escAttr = (s) => String(s).replace(/"/g, "&quot;");

// Active sport and its dataset. Both are swapped by setSport().
let sport = SPORTS[DEFAULT_SPORT];
let activeSchools = sport.data;

// Facet lists derived from the active dataset — recomputed on every sport switch.
let CONFERENCES = [];
let REGIONS = [];
let STUDY_KEYS = [];

const state = {
  query: emptyQuery(sport),
  sort: "name",
  sortDir: "asc",
  view: "map",
  selectedId: null,
  results: [],
};

// Pool sizes depend on the gender/league selection, so they're computed per render.
const poolFor = (q, status) =>
  activeSchools.filter((s) => q.genders.has(s.gender) && q.leagues.has(s.league) && s.status === status).length;

// Foot-note breaks each gender's active count down by the sport's divisions.
const footNote = () => {
  const part = (label, list) => {
    const byDiv = sport.divisions
      .map((d) => `${list.filter((s) => s.division === d).length} ${d}`)
      .join(" · ");
    return `${list.length} ${label} (${byDiv})`;
  };
  const men = activeSchools.filter((s) => s.gender === "men" && s.status === "active");
  const women = activeSchools.filter((s) => s.gender === "women" && s.status === "active");
  return (
    `${part("men's programs", men)}. ` +
    (women.length
      ? `${part("women's programs", women)}. `
      : "Women's programs are not entered yet — see the README to add them. ") +
    `Rankings and enrollment are unset.`
  );
};

// Other sports this same campus fields — the cross-sport "plays both" hook. Ids
// are shared across datasets where a school plays both, so a set-membership test
// is all it takes.
const otherSportLabels = (school) =>
  SPORT_ORDER.filter((key) => key !== sport.id && IDS_BY_SPORT[key].has(school.id)).map(
    (key) => SPORTS[key].label
  );

// ── Control builders ────────────────────────────────────────────────────────

function checkRow(name, value, label) {
  const l = document.createElement("label");
  l.className = "check";
  l.innerHTML = `<input type="checkbox" name="${name}" value="${escAttr(value)}">
    <span class="check__label"></span><span class="check__n" data-count="${escAttr(value)}"></span>`;
  l.querySelector(".check__label").textContent = label;
  return l;
}

function chipRow(key) {
  const l = document.createElement("label");
  l.className = "chip";
  l.innerHTML = `<input type="checkbox" name="study" value="${escAttr(key)}"><span></span>`;
  l.querySelector("span").textContent = STUDY_TAGS[key];
  return l;
}

function pillRow(name, value, label, mod, checked) {
  const l = document.createElement("label");
  l.className = `pill pill--${mod}`;
  l.innerHTML = `<input type="checkbox" name="${name}" value="${escAttr(value)}"${checked ? " checked" : ""}><span></span>`;
  l.querySelector("span").textContent = label;
  return l;
}

// Rebuild the per-division tally items between the fixed "Showing" and "ACHA"
// entries, so switching sports re-labels and re-colours them.
function buildTally() {
  const dl = $("tally");
  const achaItem = $("tally-acha-item");
  dl.querySelectorAll(".tally__item--div").forEach((n) => n.remove());
  for (const d of sport.divisions) {
    const item = document.createElement("div");
    item.className = `tally__item tally__item--div tally__item--${d.toLowerCase()}`;
    item.innerHTML = `<dt></dt><dd id="tally-${d.toLowerCase()}">—</dd>`;
    item.querySelector("dt").textContent = DIVISION_LABEL[d] ?? d;
    dl.insertBefore(item, achaItem);
  }
}

// The Women's option is disabled until there are women's records to show, so the
// control never promises a view that would come back empty. Selection resets to
// men's, the complete slice for both sports today.
function syncGenderControl() {
  const nWomen = activeSchools.filter((s) => s.gender === "women").length;
  const womensRadio = document.querySelector('input[name="gender"][value="women"]');
  const seg = womensRadio.closest(".seg");
  const note = $("gender-note");
  womensRadio.disabled = !nWomen;
  seg.classList.toggle("is-disabled", !nWomen);
  seg.title = nWomen ? "" : "No women's programs in the data yet";
  note.hidden = !!nWomen;
  if (!nWomen) note.textContent = "Women's programs aren't entered yet.";
  document.querySelector('input[name="gender"][value="men"]').checked = true;
}

// Build every data-derived control for the active sport. Called once on boot and
// again on each sport switch.
function buildControls() {
  // Branding.
  $("wordmark-line-1").textContent = sport.wordmark[0];
  $("wordmark-line-2").textContent = sport.wordmark[1];
  $("masthead-sub").textContent = sport.sub;
  document.title = sport.title;

  // Facets from the active dataset. "TBD" is a placeholder, not a conference.
  CONFERENCES = [...new Set(activeSchools.map((s) => s.conference))]
    .filter((c) => c && c !== "TBD")
    .sort((a, b) => a.localeCompare(b));
  REGIONS = REGION_ORDER.filter((r) => activeSchools.some((s) => regionOf(s) === r));
  STUDY_KEYS = Object.keys(STUDY_TAGS).filter((k) => activeSchools.some((s) => s.studyTags.includes(k)));

  $("group-region").replaceChildren(...REGIONS.map((r) => checkRow("region", r, r)));
  $("group-conference").replaceChildren(...CONFERENCES.map((c) => checkRow("conference", c, c)));
  $("group-study").replaceChildren(...STUDY_KEYS.map(chipRow));

  // League pills: NCAA on by default, other leagues (ACHA) off. Hidden entirely
  // when the sport has only one league — a lone pill filters nothing.
  $("group-league").replaceChildren(
    ...sport.leagues.map((lg) => pillRow("league", lg, LEAGUE_LABEL[lg] ?? lg, lg.toLowerCase(), lg === "NCAA"))
  );
  $("league-group").hidden = sport.leagues.length < 2;

  // Division pills: all on by default.
  $("group-division-pills").replaceChildren(
    ...sport.divisions.map((d) => pillRow("division", d, d, d.toLowerCase(), true))
  );
  $("group-division").hidden = !state.query.leagues.has("NCAA");

  buildTally();

  $("n-future").textContent = activeSchools.filter((s) => s.status === "future").length;
  $("n-unlisted").textContent = activeSchools.filter((s) => s.status === "unlisted").length;
  $("foot-note").textContent = footNote();

  syncGenderControl();
}

function setSport(id) {
  if (!SPORTS[id] || id === sport.id) return;
  sport = SPORTS[id];
  activeSchools = sport.data;
  state.query = emptyQuery(sport);
  state.selectedId = null;
  $("search").value = "";
  for (const i of document.querySelectorAll('input[name="extra"]')) i.checked = false;
  buildControls();
  render();
  if (usingTiles) requestAnimationFrame(() => map.invalidate?.());
}

// Build the initial sport's controls before the map and first render.
buildControls();

// ── Map ───────────────────────────────────────────────────────────────────
// Street tiles when Leaflet is available, the offline SVG map otherwise. Both
// expose the same interface, so nothing below this block cares which is running.

let map;
let usingTiles = false;

if (window.L) {
  try {
    const { createLeafMap } = await import("./leafmap.js");
    // Show the container and hide the SVG *before* initialising: Leaflet reads
    // its viewport size on construction, and a display:none container measures
    // 0x0 — which silently collapses every marker and renders an empty map.
    $("map").hidden = true;
    $("leaflet").hidden = false;
    map = createLeafMap({
      container: $("leaflet"),
      onSelect: select,
      onHint: (z) => {
        // Leaflet's home view is about zoom 4; anything closer counts as zoomed.
        $("zoom-reset").hidden = z <= 4.2;
        $("maphint").classList.toggle("is-gone", z > 4.2);
      },
    });
    usingTiles = true;
    $("maphint").textContent = "Scroll to zoom · drag to pan · switch to Satellite at top right";
  } catch (err) {
    console.warn("Street map unavailable, using the offline map:", err.message);
    $("map").hidden = false;
    $("leaflet").hidden = true;
  }
}

if (!usingTiles) {
  map = createMap({
    svg: $("map"),
    onSelect: select,
    onHint: (k) => {
      $("zoom-reset").hidden = k <= 1.01;
      $("maphint").classList.toggle("is-gone", k > 1.01);
    },
  });
  $("offline-note").hidden = false;
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const filtered = applyFilters(activeSchools, state.query);
  state.results = sortSchools(filtered, state.sort, state.sortDir);
  updateSortIndicators();

  // If the selection filtered out, drop it rather than showing a card for a
  // school that isn't on screen.
  if (state.selectedId && !state.results.some((s) => s.key === state.selectedId)) {
    state.selectedId = null;
  }

  // "of N" tracks whichever pool the status toggles put in play, so the
  // denominator always matches what an empty filter set would show.
  const pool =
    poolFor(state.query, "active") +
    (state.query.includeFuture ? poolFor(state.query, "future") : 0) +
    (state.query.includeUnlisted ? poolFor(state.query, "unlisted") : 0);

  $("tally-shown").textContent = state.results.length;
  for (const d of sport.divisions) {
    const el = $(`tally-${d.toLowerCase()}`);
    if (el) el.textContent = state.results.filter((s) => s.division === d).length;
  }
  const achaShown = sport.leagues.includes("ACHA") && state.query.leagues.has("ACHA");
  $("tally-acha-item").hidden = !achaShown;
  if (achaShown) $("tally-acha").textContent = state.results.filter((s) => s.league === "ACHA").length;
  document.querySelector(".tally__of").textContent = `of ${pool}`;

  const active =
    (state.query.genders.size === 1 && state.query.genders.has("men") ? 0 : 1) +
    (sport.divisions.length - state.query.divisions.size) +
    (achaShown ? 1 : 0) +
    state.query.regions.size + state.query.conferences.size + state.query.study.size +
    (state.query.text.trim() ? 1 : 0);
  $("rail-toggle-count").textContent = active ? `${active} active · ${state.results.length} shown` : `${pool} programs`;

  updateFacetCounts();

  const none = state.results.length === 0;
  $("empty").hidden = !none;
  $("view-map").hidden = state.view !== "map" || none;
  $("view-list").hidden = state.view !== "list" || none;

  map.setSchools(state.results);
  map.setSelected(state.selectedId);

  renderList({
    tbody: $("tbody"),
    schools: state.results,
    selectedId: state.selectedId,
    onSelect: select,
  });

  const selected = activeSchools.find((s) => s.key === state.selectedId) ?? null;
  renderDetail({
    card: $("detail-card"),
    idle: $("detail-idle"),
    school: selected,
    onClose: () => select(null),
    programLabel: sport.programLabel,
    searchNoun: sport.searchNoun,
    alsoPlays: selected ? otherSportLabels(selected) : [],
  });
}

function updateFacetCounts() {
  for (const [field, group] of [
    ["regions", "group-region"],
    ["conferences", "group-conference"],
    ["study", "group-study"],
  ]) {
    const counts = facetCounts(activeSchools, state.query, field);
    for (const node of $(group).querySelectorAll("[data-count]")) {
      const n = counts.get(node.dataset.count) ?? 0;
      node.textContent = n;
    }
    // Grey out a chip that would return nothing, but leave it clickable so a
    // user can still toggle it off.
    for (const input of $(group).querySelectorAll("input")) {
      const n = counts.get(input.value) ?? 0;
      input.closest("label").style.opacity = n === 0 && !input.checked ? ".4" : "";
    }
  }
}

function select(id) {
  state.selectedId = state.selectedId === id ? null : id;
  render();
  if (state.selectedId && state.view === "list") map.focus(state.selectedId);
}

// ── Inputs ────────────────────────────────────────────────────────────────

const SET_BY_NAME = { league: "leagues", division: "divisions", region: "regions", conference: "conferences", study: "study" };

$("filters").addEventListener("change", (e) => {
  if (e.target.name === "gender") {
    state.query.genders =
      e.target.value === "both" ? new Set(["men", "women"]) : new Set([e.target.value]);
    render();
    return;
  }
  if (e.target.name === "extra") {
    const flag = e.target.value === "future" ? "includeFuture" : "includeUnlisted";
    state.query[flag] = e.target.checked;
    render();
    return;
  }
  const key = SET_BY_NAME[e.target.name];
  if (!key) return;
  const set = state.query[key];
  if (e.target.checked) set.add(e.target.value);
  else set.delete(e.target.value);
  // The NCAA division pills only mean something while NCAA is a selected
  // league — hide them rather than leaving controls that filter nothing.
  if (e.target.name === "league") $("group-division").hidden = !state.query.leagues.has("NCAA");
  render();
});

// Sport switcher lives in the masthead, outside the filters form.
for (const r of document.querySelectorAll('input[name="sport"]')) {
  r.addEventListener("change", (e) => {
    if (e.target.checked) setSport(e.target.value);
  });
}

let searchTimer;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value;
  searchTimer = setTimeout(() => {
    state.query.text = v;
    render();
  }, 130);
});

$("filters").addEventListener("reset", () => {
  // Let the browser clear the inputs first, then re-derive state from scratch.
  requestAnimationFrame(() => {
    state.query = emptyQuery(sport);
    for (const i of $("filters").querySelectorAll('input[name="division"]')) i.checked = true;
    for (const i of $("filters").querySelectorAll('input[name="league"]')) i.checked = i.value === "NCAA";
    $("group-division").hidden = false;
    document.querySelector('input[name="gender"][value="men"]').checked = true;
    $("search").value = "";
    render();
  });
});

$("empty-reset").addEventListener("click", () => $("reset").click());

$("sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  state.sortDir = "asc";
  render();
});

// List-view column headers double as sort controls: click to sort by that
// column, click the active column again to reverse it. The dropdown (used by
// the map view too, where there are no headers to click) stays in sync either
// way, so there's one source of truth for the current sort.
$("table").addEventListener("click", (e) => {
  const th = e.target.closest(".th-sort");
  if (!th) return;
  const key = th.dataset.sort;
  if (state.sort === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sort = key;
    state.sortDir = "asc";
  }
  $("sort").value = key;
  render();
});

function updateSortIndicators() {
  for (const th of document.querySelectorAll(".th-sort")) {
    const active = th.dataset.sort === state.sort;
    th.classList.toggle("is-active", active);
    th.classList.toggle("is-desc", active && state.sortDir === "desc");
  }
}

$("zoom-reset").addEventListener("click", () => map.reset());

for (const [tab, view] of [["tab-map", "map"], ["tab-list", "list"]]) {
  $(tab).addEventListener("click", () => {
    state.view = view;
    $("tab-map").setAttribute("aria-selected", String(view === "map"));
    $("tab-list").setAttribute("aria-selected", String(view === "list"));
    $("tab-map").classList.toggle("is-on", view === "map");
    $("tab-list").classList.toggle("is-on", view === "list");
    render();
    // Leaflet measures its container on init; if that happened while the map tab
    // was hidden it renders a grey box until told to re-measure.
    if (view === "map") requestAnimationFrame(() => map.invalidate?.());
  });
}

const rail = $("rail");
$("rail-toggle").addEventListener("click", () => {
  const open = rail.dataset.open === "true";
  rail.dataset.open = String(!open);
  $("rail-toggle").setAttribute("aria-expanded", String(!open));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.selectedId) select(null);
});

// ── Go ────────────────────────────────────────────────────────────────────

document.body.classList.add("is-booting");
render();
// The tile map's container is inside a flex column that may not have settled on
// the first frame; re-measuring once is cheap insurance against a grey box.
if (usingTiles) requestAnimationFrame(() => map.invalidate?.());
// Markers animate in once; drop the flag so later re-renders (filtering,
// zooming) don't replay the entrance.
setTimeout(() => document.body.classList.remove("is-booting"), 1400);
