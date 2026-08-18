// The ice: renders states and faceoff-circle markers from pre-projected
// coordinates in js/geo.js, and owns pan/zoom. No mapping library at runtime —
// tools/build-map.cjs already did the projection work.

import { VIEW, STATES, POINTS } from "./geo.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const MIN_K = 1;
const MAX_K = 14;
// Markers closer than this many screen pixels collapse into a count badge.
const CLUSTER_PX = 15;

export function createMap({ svg, onSelect, onHint }) {
  // Trim the empty south edge to buy size for the dense Northeast. The limit is
  // the Alaska inset, which Albers USA places at the bottom-left: Anchorage sits
  // at y≈530, so 60 is the most that can go while keeping every marker in frame
  // with margin to spare. tools/check-crop.cjs re-verifies this.
  const CROP_BOTTOM = 60;
  const H = VIEW.height - CROP_BOTTOM;
  svg.setAttribute("viewBox", `0 0 ${VIEW.width} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const statesLayer = svg.querySelector("#layer-states");
  const marksLayer = svg.querySelector("#layer-marks");

  let t = { k: 1, x: 0, y: 0 };
  let schools = [];
  let selectedId = null;
  const stateNodes = new Map();

  // ── States ──────────────────────────────────────────────────────────────
  for (const s of STATES) {
    const g = el("g");
    const base = el("path", { d: s.d, class: "state" });
    base.setAttribute("role", "button");
    base.setAttribute("tabindex", "-1");
    base.append(el("title"));
    base.querySelector("title").textContent = `Zoom to ${s.name}`;
    // A second, non-interactive copy carries the scratch texture so hover
    // fills on the base path still read through.
    const tex = el("path", { d: s.d, class: "state state--scratched" });
    base.addEventListener("click", (e) => {
      e.stopPropagation();
      fitTo(s);
    });
    g.append(base, tex);
    statesLayer.append(g);
    stateNodes.set(s.id, base);
  }

  // ── Transform plumbing ─────────────────────────────────────────────────
  function clamp() {
    // Keep the map from being dragged off its own frame.
    const spanX = VIEW.width * (t.k - 1);
    const spanY = H * (t.k - 1);
    t.x = Math.min(0, Math.max(-spanX, t.x));
    t.y = Math.min(0, Math.max(-spanY, t.y));
  }

  let renderedK = null;

  function apply() {
    clamp();
    const tr = `translate(${t.x} ${t.y}) scale(${t.k})`;
    statesLayer.setAttribute("transform", tr);
    marksLayer.setAttribute("transform", tr);
    // Marker size and cluster grouping depend only on the scale, so a pan needs
    // no re-render. This matters for more than speed: replacing marker nodes
    // between pointerdown and pointerup would cancel the click that follows.
    if (t.k !== renderedK) {
      renderedK = t.k;
      render();
    }
  }

  function zoomAt(factor, px, py) {
    const k2 = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
    if (k2 === t.k) return;
    // Hold the point under the cursor fixed.
    t.x = px - ((px - t.x) * k2) / t.k;
    t.y = py - ((py - t.y) * k2) / t.k;
    t.k = k2;
    apply();
    onHint?.(t.k);
  }

  // Convert a client point into the SVG's own coordinate space.
  function toLocal(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const scale = VIEW.width / r.width; // uniform: preserveAspectRatio meet
    const offsetY = (r.height - H / scale) / 2;
    return [(clientX - r.left) * scale, (clientY - r.top - offsetY) * scale];
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [lx, ly] = toLocal(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, lx, ly);
  }, { passive: false });

  // Drag to pan, with pointer capture so it survives leaving the element.
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // Deliberately no setPointerCapture here. Capturing retargets the
    // subsequent pointerup *and click* to the SVG, so a click on a marker would
    // be delivered to the background instead. Capture is taken below, only once
    // the pointer has actually moved far enough to count as a pan.
    drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false, id: e.pointerId };
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const scale = VIEW.width / r.width;
    const dx = (e.clientX - drag.x) * scale;
    const dy = (e.clientY - drag.y) * scale;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true;
      svg.classList.add("is-panning");
      // Now that it's a pan and not a click, keep receiving events even if the
      // pointer leaves the map.
      try { svg.setPointerCapture(drag.id); } catch { /* pointer already gone */ }
    }
    if (!drag.moved) return;
    t.x = drag.tx + dx;
    t.y = drag.ty + dy;
    apply();
  });
  const endDrag = (e) => {
    if (!drag) return;
    // Suppress the click that follows a real drag, so panning off a state
    // doesn't also zoom to it.
    if (drag.moved) svg.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
    drag = null;
    svg.classList.remove("is-panning");
    if (e?.pointerId != null && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // Pinch zoom.
  const touches = new Map();
  let pinchStart = null;
  svg.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      drag = null;
      const [a, b] = e.touches;
      pinchStart = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k: t.k };
    }
  }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchStart) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const [lx, ly] = toLocal((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      zoomAt((dist / pinchStart.dist) * (pinchStart.k / t.k), lx, ly);
      pinchStart.dist = dist;
      pinchStart.k = t.k;
    }
  }, { passive: false });
  svg.addEventListener("touchend", () => { if (pinchStart) pinchStart = null; touches.clear(); });

  // ── Fit to a state's bounds ────────────────────────────────────────────
  function fitTo(state) {
    const node = stateNodes.get(state.id);
    if (!node) return;
    const b = node.getBBox();
    const pad = 26;
    const k = Math.min(
      MAX_K,
      Math.max(MIN_K, Math.min(VIEW.width / (b.width + pad * 2), H / (b.height + pad * 2)))
    );
    animateTo({
      k,
      x: VIEW.width / 2 - (b.x + b.width / 2) * k,
      y: H / 2 - (b.y + b.height / 2) * k,
    });
    for (const n of stateNodes.values()) n.classList.remove("is-fitted");
    node.classList.add("is-fitted");
    onHint?.(k);
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  function animateTo(target) {
    if (reduced.matches) {
      t = { ...target };
      apply();
      return;
    }
    const from = { ...t };
    const t0 = performance.now();
    const dur = 520;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      t = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      apply();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function reset() {
    animateTo({ k: 1, x: 0, y: 0 });
    for (const n of stateNodes.values()) n.classList.remove("is-fitted");
    onHint?.(1);
  }

  // Clicking bare ice clears the selection.
  svg.addEventListener("click", (e) => {
    if (e.target === svg || e.target.classList.contains("state")) {
      if (e.target === svg) onSelect?.(null);
    }
  });

  // ── Markers ────────────────────────────────────────────────────────────
  // Grid-bucket clustering in screen space: cheap, stable, and it dissolves
  // naturally as k grows.
  function cluster(list) {
    const cell = CLUSTER_PX / t.k;
    const buckets = new Map();
    for (const s of list) {
      const p = POINTS[s.schoolId];
      if (!p) continue;
      const key = `${Math.round(p[0] / cell)}:${Math.round(p[1] / cell)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push({ s, p });
    }
    return [...buckets.values()];
  }

  function render() {
    const groups = cluster(schools);
    const frag = document.createDocumentFragment();
    // Counter-scale so a marker is a constant size on screen at any zoom.
    const r = 1 / t.k;
    let i = 0;

    for (const group of groups) {
      // Keep a selected school visible as itself, never folded into a badge.
      const sel = group.find((m) => m.s.key === selectedId);
      if (group.length > 1 && !sel) {
        const cx = group.reduce((a, m) => a + m.p[0], 0) / group.length;
        const cy = group.reduce((a, m) => a + m.p[1], 0) / group.length;
        const g = el("g", { class: "cluster", role: "button", tabindex: "0" });
        g.append(el("circle", { class: "cluster__disc", cx, cy, r: 8.5 * r, "stroke-width": 1 * r }));
        const label = el("text", { class: "cluster__n", x: cx, y: cy });
        label.setAttribute("font-size", 9 * r);
        label.textContent = group.length;
        g.append(label);
        const names = group.map((m) => m.s.name).sort();
        const title = el("title");
        title.textContent = `${group.length} programs: ${names.join(", ")}. Zoom in to separate.`;
        g.append(title);
        const zoomIn = () => {
          animateTo({
            k: Math.min(MAX_K, t.k * 3),
            x: VIEW.width / 2 - cx * Math.min(MAX_K, t.k * 3),
            y: H / 2 - cy * Math.min(MAX_K, t.k * 3),
          });
        };
        g.addEventListener("click", (e) => { e.stopPropagation(); zoomIn(); });
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoomIn(); }
        });
        frag.append(g);
        continue;
      }

      for (const { s, p } of group) {
        const g = el("g", {
          class: `mark mark--${s.division.toLowerCase()}${s.key === selectedId ? " is-on" : ""}`,
          role: "button",
          tabindex: "0",
        });
        g.dataset.id = s.key;
        if (document.body.classList.contains("is-booting")) {
          g.style.setProperty("--d", `${380 + Math.min(i, 60) * 9}ms`);
        }
        g.append(el("circle", { class: "mark__halo", cx: p[0], cy: p[1], r: 9 * r, "stroke-width": 1.4 * r }));
        g.append(el("circle", { class: "mark__ring", cx: p[0], cy: p[1], r: 6.2 * r, "stroke-width": 1.1 * r }));
        g.append(el("circle", { class: "mark__dot", cx: p[0], cy: p[1], r: 2.5 * r }));
        const title = el("title");
        title.textContent = `${s.name} — ${s.division}${s.conference ? `, ${s.conference}` : ""} (${s.city}, ${s.state})`;
        g.append(title);
        g.addEventListener("click", (e) => { e.stopPropagation(); onSelect?.(s.key); });
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(s.key); }
        });
        frag.append(g);
        i++;
      }
    }

    marksLayer.replaceChildren(frag);
  }

  return {
    setSchools(list) { schools = list; renderedK = t.k; render(); },
    setSelected(id) { selectedId = id; renderedK = t.k; render(); },
    // Centre on one school without changing zoom, used when the list drives
    // the map.
    focus(id) {
      // `id` here is a program key; points are stored per school.
      const p = POINTS[String(id).replace(/-(men|women)$/, "")];
      if (!p) return;
      const k = Math.max(t.k, 4);
      animateTo({ k, x: VIEW.width / 2 - p[0] * k, y: H / 2 - p[1] * k });
    },
    reset,
    get zoom() { return t.k; },
  };
}
