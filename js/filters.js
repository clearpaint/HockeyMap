// Filtering and sorting. AND across categories, OR within one — picking two
// conferences widens the result; picking a conference and a region narrows it.

import { regionOf } from "./data.js";

export const REGION_ORDER = ["Northeast", "South", "Midwest", "Mountain & West", "Alaska"];

export function emptyQuery(sport) {
  return {
    // Men's by default: it's the complete dataset today, and "Both" would show
    // an unbalanced mix until women's records are entered.
    genders: new Set(["men"]),
    // Every NCAA division the active sport has, on by default — hockey seeds
    // D1/D3, lacrosse D1/D2/D3.
    divisions: new Set(sport ? sport.divisions : ["D1", "D3"]),
    // NCAA only by default — ACHA club programs are a separate "Also show"
    // toggle, same reasoning as includeFuture/includeUnlisted below.
    leagues: new Set(["NCAA"]),
    regions: new Set(),
    conferences: new Set(),
    study: new Set(),
    text: "",
    // Programs that aren't playing yet, and schools from the original source
    // list that aren't on the current NCAA roster, are hidden by default —
    // they'd otherwise inflate every count.
    includeFuture: false,
    includeUnlisted: false,
  };
}

export function applyFilters(schools, q) {
  const text = q.text.trim().toLowerCase();
  return schools.filter((s) => {
    if (!q.genders.has(s.gender)) return false;
    if (!q.leagues.has(s.league)) return false;
    if (s.status === "future" && !q.includeFuture) return false;
    if (s.status === "unlisted" && !q.includeUnlisted) return false;
    if (s.league === "NCAA" && !q.divisions.has(s.division)) return false;
    if (q.regions.size && !q.regions.has(regionOf(s))) return false;
    if (q.conferences.size && !q.conferences.has(s.conference)) return false;
    // A school matches the study filter if it carries any selected tag.
    if (q.study.size && !s.studyTags.some((t) => q.study.has(t))) return false;
    if (text) {
      const hay = `${s.name} ${s.city} ${s.state} ${s.conference ?? ""} ${s.knownFor}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

const byName = (a, b) => a.name.localeCompare(b.name);

// Each sort is a function of direction so a field can decide for itself how
// "unset" behaves when reversed — an unset rank or enrollment should stay at
// the bottom of the list either way, not jump to the top just because the
// direction flipped.
const SORTS = {
  name: (dir) => (a, b) => dir * a.name.localeCompare(b.name),
  state: (dir) => (a, b) => dir * a.state.localeCompare(b.state) || byName(a, b),
  // Conference can be null on unlisted schools; those sort to the end.
  conference: (dir) => (a, b) =>
    dir * (a.conference ?? "￿").localeCompare(b.conference ?? "￿") || byName(a, b),
  division: (dir) => (a, b) => dir * a.division.localeCompare(b.division) || byName(a, b),
  // Unset ranks sort last regardless of direction, rather than reading as
  // rank zero or jumping to the top on reverse.
  rank: (dir) => (a, b) => {
    if (a.rank == null && b.rank == null) return byName(a, b);
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return dir * (a.rank - b.rank) || byName(a, b);
  },
  enrollment: (dir) => (a, b) => {
    if (a.enrollment == null && b.enrollment == null) return byName(a, b);
    if (a.enrollment == null) return 1;
    if (b.enrollment == null) return -1;
    return dir * (a.enrollment - b.enrollment) || byName(a, b);
  },
};

export function sortSchools(list, key, dir = "asc") {
  const build = SORTS[key] ?? SORTS.name;
  return [...list].sort(build(dir === "desc" ? -1 : 1));
}

// Counts shown next to each checkbox: how many results you'd get for that one
// option given every *other* active filter. Keeps the numbers honest instead of
// showing a global total that ignores context.
export function facetCounts(schools, q, field) {
  const probe = {
    ...q,
    genders: new Set(q.genders),
    divisions: new Set(q.divisions),
    regions: new Set(q.regions),
    conferences: new Set(q.conferences),
    study: new Set(q.study),
    [field]: new Set(),
  };
  const base = applyFilters(schools, probe);
  const counts = new Map();
  const bump = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);

  for (const s of base) {
    if (field === "regions") bump(regionOf(s));
    // Some unlisted schools have no known conference; they get no facet row.
    else if (field === "conferences") { if (s.conference) bump(s.conference); }
    else if (field === "study") s.studyTags.forEach(bump);
  }
  return counts;
}
