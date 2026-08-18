// Street-level map built on Leaflet with real tiles, so you can see the
// neighbourhood a campus actually sits in.
//
// Exposes the same interface as createMap() in map.js — setSchools, setSelected,
// focus, reset — so js/main.js can use either one. If Leaflet or its tiles are
// unavailable (offline, or the standalone file with no network), main.js falls
// back to the offline SVG renderer instead.

import { STATE_BORDERS } from "./borders.js";

const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
// Place names sit on top of imagery, which has none of its own.
const CARTO_LABELS = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";

// Framed on the lower 48, where all but two programs are. Alaska is reachable by
// panning or by picking the Alaska region filter; including it in the home view
// forces a zoom so wide that the Northeast becomes an unreadable blob.
const HOME = [[25.5, -125], [49.5, -66]];

// At/above this zoom the cluster group stops clustering (see
// disableClusteringAtZoom below), so markers are individual and big enough to
// read — that's exactly when the faceoff dots bloom into logo crests.
const LOGO_ZOOM = 9;

const DIV_LABEL = { d1: "D1", d2: "D2", d3: "D3", acha1: "ACHA D1", acha2: "ACHA D2", acha3: "ACHA D3" };

export function createLeafMap({ container, onSelect, onHint }) {
  const L = window.L;
  if (!L) throw new Error("Leaflet not loaded");

  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    // Two Alaska programs sit far west; without this the home view wraps oddly.
    worldCopyJump: false,
    maxZoom: 19,
    minZoom: 3,
  });

  map.fitBounds(HOME, { padding: [12, 12] });

  const streets = L.tileLayer(CARTO_LIGHT, { attribution: CARTO_ATTR, maxZoom: 19, subdomains: "abcd" });
  const imagery = L.layerGroup([
    L.tileLayer(ESRI_IMAGERY, { attribution: ESRI_ATTR, maxZoom: 19 }),
    L.tileLayer(CARTO_LABELS, { maxZoom: 19, subdomains: "abcd", opacity: 0.9 }),
  ]);

  streets.addTo(map);

  // State lines, drawn on top of whichever basemap is active. CARTO renders them
  // very faintly and the satellite imagery has none at all, so without this you
  // can't tell which state a program is in.
  // Own pane, below markers (pane z-index 600) and above tiles (200).
  map.createPane("borders");
  map.getPane("borders").style.zIndex = 350;
  map.getPane("borders").style.pointerEvents = "none";

  const borders = L.geoJSON(STATE_BORDERS, {
    pane: "borders",
    interactive: false,
    style: { color: "#0e1b2a", weight: 1, opacity: 0.34, dashArray: "4 3", fill: false },
  }).addTo(map);

  // Boundaries need to be lighter on dark imagery than on the pale street map.
  const styleFor = (dark) =>
    borders.setStyle({
      color: dark ? "#ffffff" : "#0e1b2a",
      opacity: dark ? 0.5 : 0.34,
      weight: dark ? 1.1 : 1,
    });
  map.on("baselayerchange", (e) => styleFor(e.name === "Satellite"));

  L.control
    .layers({ Streets: streets, Satellite: imagery }, { "State lines": borders }, { position: "topright" })
    .addTo(map);

  // Marker cluster plugin if present; otherwise a plain layer group. The map
  // works either way — clustering only makes dense areas like Boston legible.
  const clustered = typeof L.markerClusterGroup === "function";
  const layer = clustered
    ? L.markerClusterGroup({
        // Tight radius: the point of this map is seeing where a campus sits, so
        // markers should separate early rather than hide in a badge of 88.
        maxClusterRadius: 22,
        // Stop clustering entirely once you're looking at a metro area.
        disableClusteringAtZoom: 9,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster) => {
          const kids = cluster.getAllChildMarkers();
          // A cluster leans to whichever division has the most markers in it, so
          // the colour still carries meaning when markers are collapsed.
          const tally = new Map();
          for (const m of kids) {
            const key = m.options.division.toLowerCase();
            tally.set(key, (tally.get(key) ?? 0) + 1);
          }
          let lean = "d1";
          let best = -1;
          for (const [key, n] of tally) {
            if (n > best) { lean = key; best = n; }
          }
          return L.divIcon({
            html: `<span>${cluster.getChildCount()}</span>`,
            className: `lmark-cluster lmark-cluster--${lean}`,
            iconSize: [30, 30],
          });
        },
      })
    : L.layerGroup();
  layer.addTo(map);

  const markers = new Map();
  let selectedId = null;

  // Local to this module to avoid colliding with the same-named helper in
  // panel.js once build-standalone.cjs flattens every module into one scope.
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Crests only appear once you've zoomed past LOGO_ZOOM — which is exactly the
  // zoom where the cluster group stops clustering (disableClusteringAtZoom
  // above), so the whole map flips from small dots/count-badges to full logos in
  // one clean step. Mixing 34px logos with count badges at the same zoom reads as
  // more cluttered, not less, so we deliberately gate on zoom, not density.
  const showLogo = (school) => !!school.logoUrl && map.getZoom() >= LOGO_ZOOM;

  // Shared class list so a logo marker keeps the same division colour, selected
  // ("is-on") and provisional ("pending") states the faceoff dot has.
  const markClass = (school, on, extra = "") =>
    `lmark${extra} lmark--${school.division.toLowerCase()}${on ? " is-on" : ""}${
      school.status !== "active" ? " lmark--pending" : ""
    }`;

  // The faceoff circle, carried over from the offline map: a dot inside a ring.
  const faceoff = (school, on) =>
    L.divIcon({
      className: markClass(school, on),
      html: '<span class="lmark__ring"></span><span class="lmark__dot"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

  // Zoomed in, a school with a crest shows the crest instead of the dot.
  const logoMarker = (school, on) =>
    L.divIcon({
      className: markClass(school, on, " lmark--logo"),
      html: `<img class="lmark__img" src="${esc(school.logoUrl)}" alt="" loading="lazy">`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

  const icon = (school, on) =>
    (showLogo(school) ? logoMarker : faceoff)(school, on);

  // Hover card: the crest (when we have one) plus name and division/conference.
  const tooltipHtml = (s) => {
    const meta = `${DIV_LABEL[s.division.toLowerCase()] ?? esc(s.division)}${
      s.conference ? ` · ${esc(s.conference)}` : ""
    }`;
    const logo = s.logoUrl
      ? `<img class="logo-tip__img" src="${esc(s.logoUrl)}" alt="">`
      : "";
    return `<div class="logo-tip">${logo}<div class="logo-tip__text"><strong>${esc(
      s.name
    )}</strong><span>${meta}</span></div></div>`;
  };

  // Zooming to a school's area is an explicit action, not something hovering does
  // on its own — auto-zoom-on-hover felt jumpy. So the hover bubble is an
  // interactive popup: the same info card plus a "Zoom here" button you slide
  // into and click. A short close delay bridges the gap between marker and popup
  // so it doesn't vanish before the cursor arrives, and hovering the popup itself
  // cancels the close. autoPan is off so a hover never shoves the map around.
  const AREA_ZOOM = 11; // town level — close enough to read the streets around campus
  const hoverPopup = L.popup({
    closeButton: false,
    closeOnClick: false,
    autoPan: false,
    offset: [0, -14],
    className: "logo-pop-wrap",
  });
  let closeTimer = null;
  const scheduleClose = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => map.closePopup(hoverPopup), 260);
  };

  const ZOOM_ICON =
    '<svg class="logo-pop__ico" viewBox="0 0 20 20" width="13" height="13" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.8 12.8 17 17"/><path d="M8.5 6.2v4.6M6.2 8.5h4.6"/></svg>';

  // Build the bubble from arbitrary info HTML plus a zoom button, wire the
  // hover-to-keep-open behaviour and the button's fly action, then show it.
  const showZoomPopup = (latlng, innerHtml, label, fly) => {
    clearTimeout(closeTimer);
    const el = document.createElement("div");
    el.className = "logo-pop";
    el.innerHTML = `${innerHtml}<button type="button" class="logo-pop__zoom">${ZOOM_ICON}<span>${label}</span></button>`;
    el.addEventListener("mouseenter", () => clearTimeout(closeTimer));
    el.addEventListener("mouseleave", scheduleClose);
    el.querySelector(".logo-pop__zoom").addEventListener("click", () => { map.closePopup(hoverPopup); fly(); });
    hoverPopup.setLatLng(latlng).setContent(el).openOn(map);
  };

  const openHoverPopup = (s) =>
    showZoomPopup([s.lat, s.lon], tooltipHtml(s), "Zoom here", () =>
      map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), AREA_ZOOM), { duration: 0.7 })
    );

  // Overlapping dots collapse into a cluster badge, so the per-marker popup can't
  // reach them. Hovering the badge offers the same "zoom" affordance, flying to
  // the cluster's own bounds to fan the stacked programs apart.
  const openClusterPopup = (cluster) => {
    const n = cluster.getChildCount();
    const inner =
      `<div class="logo-tip"><div class="logo-tip__text"><strong>${n} programs here</strong>` +
      `<span>stacked at this zoom</span></div></div>`;
    showZoomPopup(cluster.getLatLng(), inner, "Zoom in", () =>
      map.flyToBounds(cluster.getBounds().pad(0.25), { duration: 0.6, maxZoom: 15 })
    );
  };
  if (clustered) {
    layer.on("clustermouseover", (e) => openClusterPopup(e.layer));
    layer.on("clustermouseout", scheduleClose);
  }

  function setSchools(list) {
    layer.clearLayers();
    markers.clear();

    for (const s of list) {
      const m = L.marker([s.lat, s.lon], {
        icon: icon(s, s.key === selectedId),
        division: s.division,
        keyboard: true,
        alt: s.name,
      });
      m.on("mouseover", () => openHoverPopup(s));
      m.on("mouseout", scheduleClose);
      m.on("click", () => onSelect?.(s.key));
      m.on("keypress", (e) => {
        if (e.originalEvent?.key === "Enter" || e.originalEvent?.key === " ") onSelect?.(s.key);
      });
      markers.set(s.key, { marker: m, school: s });
      layer.addLayer(m);
    }
  }

  function setSelected(id) {
    // Repaint only the two markers whose state changed.
    for (const changed of [selectedId, id]) {
      const entry = changed && markers.get(changed);
      if (entry) entry.marker.setIcon(icon(entry.school, changed === id));
    }
    selectedId = id;

    if (id && markers.has(id) && clustered) {
      // Pull a selected marker out of its cluster so it's actually visible.
      layer.zoomToShowLayer?.(markers.get(id).marker, () => {});
    }
  }

  function focus(id) {
    const entry = markers.get(id);
    if (!entry) return;
    // Close enough to read the streets around campus.
    map.flyTo([entry.school.lat, entry.school.lon], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }

  function reset() {
    map.flyToBounds(HOME, { padding: [12, 12], duration: 0.8 });
  }

  // Repaint every marker's icon when the view crosses the logo threshold, so the
  // whole map flips between dots and crests in one step.
  let showingLogos = map.getZoom() >= LOGO_ZOOM;
  map.on("zoomend", () => {
    onHint?.(map.getZoom());
    const now = map.getZoom() >= LOGO_ZOOM;
    if (now === showingLogos) return;
    showingLogos = now;
    for (const { marker, school } of markers.values()) {
      marker.setIcon(icon(school, school.key === selectedId));
    }
  });

  // Exposed so tests can drive the view precisely; harmless in the browser.
  window.__hockeyMap = map;
  // Leaflet needs a nudge when its container was hidden at init (the list tab).
  const invalidate = () => map.invalidateSize();

  return { setSchools, setSelected, focus, reset, invalidate, isLeaflet: true, get zoom() { return map.getZoom(); } };
}
