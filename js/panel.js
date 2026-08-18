// The detail card and the list view — the two places a school's full record
// gets rendered.

import { STUDY_TAGS, regionOf } from "./data.js";
// DIVISION_LABEL is the canonical division→label map (see js/sports.js). It's
// imported rather than redeclared here: build-standalone.cjs flattens every
// module into one scope, so a second top-level `const DIVISION_LABEL` would
// collide and break the standalone build.
import { DIVISION_LABEL } from "./sports.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const UNSET = '<span class="unset">not set</span>';

// `programLabel`/`searchNoun` come from the active sport (see js/sports.js) so
// the athletics link reads "Lacrosse program" and its search fallback says
// "lacrosse", not a hardcoded hockey string. `alsoPlays` is the list of other
// sports this same campus fields — the cross-sport hook.
export function renderDetail({
  card,
  idle,
  school,
  onClose,
  programLabel = "Hockey program",
  searchNoun = "ice hockey",
  alsoPlays = [],
}) {
  if (!school) {
    card.hidden = true;
    idle.hidden = false;
    card.replaceChildren();
    return;
  }
  idle.hidden = true;
  card.hidden = false;

  const d = school.division.toLowerCase();
  const tags = school.studyTags.map((t) => `<span>${esc(STUDY_TAGS[t] ?? t)}</span>`).join("");

  const conf = school.conference
    ? esc(school.conference)
    : '<span class="unset">not known</span>';

  // Programs not currently playing say so at the top of the card, not in a
  // footnote — it changes whether the school is an option at all.
  const flag =
    school.status === "future"
      ? `<p class="dcard__flag dcard__flag--future">Not playing yet${
          school.firstSeason ? ` · first season ${esc(school.firstSeason)}-${String(school.firstSeason + 1).slice(2)}` : ""
        }</p>`
      : school.status === "unlisted"
      ? `<p class="dcard__flag dcard__flag--unlisted">Not on the current NCAA roster${
          school.statusNote ? ` · ${esc(school.statusNote)}` : ""
        }</p>`
      : "";

  card.innerHTML = `
    <span class="dcard__div divtag--${d}">${school.gender === "women" ? "Women's" : "Men's"} · ${DIVISION_LABEL[school.division] ?? esc(school.division)}</span>
    <h2 class="dcard__name">${
      school.logoUrl ? `<img class="dcard__logo" src="${esc(school.logoUrl)}" alt="" width="28" height="28">` : ""
    }${esc(school.name)}</h2>
    <p class="dcard__where">
      ${esc(school.city)}, ${esc(school.state)} <span class="zip">${esc(school.zip)}</span>
      &nbsp;·&nbsp; ${esc(regionOf(school))}
    </p>
    ${flag}
    ${
      alsoPlays.length
        ? `<p class="dcard__also">Also fields ${alsoPlays
            .map((label) => `<strong>${esc(label)}</strong>`)
            .join(" and ")} here</p>`
        : ""
    }

    <dl class="dcard__rows">
      <div class="drow"><dt class="drow__k">Conference</dt><dd class="drow__v">${conf}</dd></div>
      <div class="drow"><dt class="drow__k">Known for</dt><dd class="drow__v">${esc(school.knownFor)}</dd></div>
      <div class="drow"><dt class="drow__k">Rank</dt><dd class="drow__v mono">${
        school.rank ? `#${school.rank}${school.rankNote ? `<span class="hint">${esc(school.rankNote)}</span>` : ""}` : UNSET
      }</dd></div>
      <div class="drow"><dt class="drow__k">Enrollment</dt><dd class="drow__v mono">${
        school.enrollment ? school.enrollment.toLocaleString("en-US") : UNSET
      }</dd></div>
      ${tags ? `<div class="drow"><dt class="drow__k">Study</dt><dd class="drow__v"><div class="dcard__tags">${tags}</div></dd></div>` : ""}
    </dl>

    <div class="dcard__links">
      ${link(school.hockeyUrl, programLabel, `${school.name} ${school.gender === "women" ? "women's" : "men's"} ${searchNoun}`)}
      ${link(school.schoolUrl, "School site", school.name)}
    </div>

    <button class="dclose" type="button">Close</button>
  `;

  card.querySelector(".dclose").addEventListener("click", onClose);
}

// Falls back to a search rather than shipping a link that might 404.
function link(url, label, query) {
  if (url) {
    return `<a class="dlink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      <span>${esc(label)}</span><span class="dlink__arrow" aria-hidden="true">↗</span></a>`;
  }
  const q = encodeURIComponent(query);
  return `<a class="dlink" href="https://duckduckgo.com/?q=${q}" target="_blank" rel="noopener noreferrer">
    <span>Search for ${esc(label.toLowerCase())}</span><span class="dlink__arrow" aria-hidden="true">↗</span></a>`;
}

export function renderList({ tbody, schools, selectedId, onSelect }) {
  const frag = document.createDocumentFragment();
  // Only worth a badge when the list actually mixes both.
  const mixed = new Set(schools.map((s) => s.gender)).size > 1;

  for (const s of schools) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.dataset.id = s.key;
    if (s.key === selectedId) tr.classList.add("is-on");
    const gtag = mixed
      ? ` <span class="gtag gtag--${s.gender}">${s.gender === "women" ? "W" : "M"}</span>`
      : "";
    const mark =
      s.status === "future" ? ' <span class="rowflag">not yet playing</span>'
      : s.status === "unlisted" ? ' <span class="rowflag">unlisted</span>'
      : "";
    tr.innerHTML = `
      <td class="c-name">${
        s.logoUrl ? `<img class="rowlogo" src="${esc(s.logoUrl)}" alt="" width="18" height="18">` : ""
      }${esc(s.name)}${gtag}${mark}</td>
      <td><span class="divtag divtag--${s.division.toLowerCase()}">${esc(s.division)}</span></td>
      <td class="c-mono">${s.conference ? esc(s.conference) : '<span class="unset">—</span>'}</td>
      <td class="c-mono">${esc(s.city)}, ${esc(s.state)}</td>
      <td class="c-mono">${s.rank ? `#${s.rank}` : '<span class="unset">—</span>'}</td>
      <td class="c-mono">${s.enrollment ? s.enrollment.toLocaleString("en-US") : '<span class="unset">—</span>'}</td>
      <td class="c-known">${esc(s.knownFor)}</td>
    `;
    tr.addEventListener("click", () => onSelect(s.key));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.key); }
    });
    frag.append(tr);
  }

  tbody.replaceChildren(frag);
}
