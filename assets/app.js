(() => {
  "use strict";
  const SWEEPS = window.SWEEPS, PAPER_RHO = window.PAPER_RHO;
  const C = { cosmos: "#008a72", wan: "#b44b33", ink: "#17242c", ink3: "#6c767d", grid: "#eceeed", axis: "#c3c8c6", panel: "#fcfcfb" };  // = page surface (dot rings)
  const familyColor = s => (s.model === "Cosmos" ? C.cosmos : C.wan);

  const SCORES = [
    { key: "cg", label: "Contact Gain", axis: "Contact Gain (×100)", lowerBetter: false },
    { key: "logme", label: "LogME", axis: "LogME", lowerBetter: false },
    { key: "fvd", label: "FVD", axis: "FVD", lowerBetter: true },
    { key: "train", label: "Training loss", axis: "Training loss", lowerBetter: true },
    { key: "val", label: "Validation loss", axis: "Validation loss", lowerBetter: true },
  ];
  const scoreByKey = Object.fromEntries(SCORES.map(s => [s.key, s]));
  // decimals as printed in the paper: MolmoSpaces = Fig. 3 heatmap, RoboCasa = Table II
  const DECIMALS = { MolmoSpaces: { cg: 3, logme: 3, fvd: 2, train: 5, val: 6 },
                     RoboCasa: { cg: 2, logme: 3, fvd: 1, train: 4, val: 4 } };
  const minus = str => String(str).replace(/^-/, "−");
  const fmtScore = (sweep, key, v) => minus(v.toFixed(DECIMALS[sweep.benchmark][key]));
  const pct = v => v.toFixed(1) + "%";
  const ck = step => step + "K";

  // ---------- helpers ----------
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, cls, anchor = "start", extra = {}) {
    const t = el("text", { x, y, class: cls, "text-anchor": anchor, ...extra }, parent);
    t.textContent = str;
    return t;
  }
  function h(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  // tick step whose count is closest to the target
  function niceTicks(lo, hi, count = 5) {
    const span = hi - lo || Math.abs(hi) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).sort((a, b) => Math.abs(span / a - count) - Math.abs(span / b - count))[0];
    const ticks = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(12));
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (Math.abs(step / mag - 2.5) < 1e-9 ? 1 : 0));
    return { ticks, fmt: v => minus(v.toFixed(dec)) };
  }
  const scale = (d0, d1, r0, r1) => v => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  // index of the checkpoint a score selects (ties go to the earlier checkpoint)
  function pickIndex(sweep, key) {
    const sgn = scoreByKey[key].lowerBetter ? -1 : 1;
    let best = 0;
    for (let i = 1; i < sweep.steps.length; i++) if (sgn * sweep[key][i] > sgn * sweep[key][best]) best = i;
    return best;
  }
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  // place a text label at the first candidate offset that clears every obstacle box and stays in bounds; null if none fits
  function placeLabel(parent, str, cls, x, y, cands, obstacles, bounds) {
    const t = text(parent, x, y, str, cls);
    for (const [dx, dy, anchor] of cands) {
      t.setAttribute("x", x + dx); t.setAttribute("y", y + dy); t.setAttribute("text-anchor", anchor);
      const b = t.getBBox(), box = { x: b.x - 2, y: b.y - 1, width: b.width + 4, height: b.height + 2 };
      const inside = box.x >= bounds.x0 && box.x + box.width <= bounds.x1 && box.y >= bounds.y0 && box.y + box.height <= bounds.y1;
      if (inside && !obstacles.some(o => overlaps(box, o))) { obstacles.push(box); return { t, box }; }
    }
    t.remove();
    return null;
  }
  const dotBox = (x, y, r) => ({ x: x - r - 1, y: y - r - 1, width: 2 * r + 2, height: 2 * r + 2 });

  function showTip(tip, panel, px, py, rows, head, color) {
    tip.replaceChildren(
      h("div", { class: "t-head" }, [h("i", { style: `background:${color}` }), head]),
      ...rows.map(([label, value]) => h("div", { class: "t-row" }, [h("span", { text: label }), h("b", { text: value })])));
    tip.classList.add("show");
    const pw = panel.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = px + 14, top = py - th - 10;
    if (left + tw > pw - 4) left = px - tw - 14;
    if (top < 4) top = py + 14;
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = top + "px";
  }
  const hideTip = tip => tip.classList.remove("show");

  // ---------- score selector (radiogroup built once; only state changes) ----------
  let currentScore = "cg";
  const seg = document.getElementById("score-seg");
  const segButtons = SCORES.map((sc, i) => {
    const b = h("button", { type: "button", role: "radio", text: sc.label });
    b.addEventListener("click", () => setScore(sc.key));
    b.addEventListener("keydown", e => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const j = e.key === "Home" ? 0 : e.key === "End" ? SCORES.length - 1 : d ? (i + d + SCORES.length) % SCORES.length : -1;
      if (j < 0) return;
      e.preventDefault();
      setScore(SCORES[j].key);
      segButtons[j].focus();
    });
    seg.appendChild(b);
    return b;
  });
  function setScore(key) {
    currentScore = key;
    segButtons.forEach((b, i) => {
      const on = SCORES[i].key === key;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    renderPanels();
    renderExplorerTable();
    const sc = scoreByKey[key];
    document.getElementById("score-status").textContent =
      `${sc.label} selected. Picks: ` + SWEEPS.map(s => `${s.benchmark} ${s.model} ${ck(s.steps[pickIndex(s, key)])}`).join(", ") + ".";
  }

  // ---------- scatter panels ----------
  const panelsEl = document.getElementById("panels");
  const panelEls = SWEEPS.map(s => {
    const tip = h("div", { class: "tip", "aria-hidden": "true" });
    const chart = h("div");
    const meta = h("p", { class: "meta" });
    const panel = h("div", { class: "panel" }, [
      h("h4", {}, [h("span", { class: "key", style: `background:${familyColor(s)}` }), `${s.benchmark} · ${s.modelFull}`]),
      meta, chart, tip]);
    panelsEl.appendChild(panel);
    return { sweep: s, panel, chart, meta, tip };
  });
  const renderPanels = () => panelEls.forEach(drawScatter);

  function drawScatter({ sweep, panel, chart, meta, tip }) {
    const sc = scoreByKey[currentScore], key = sc.key, n = sweep.steps.length;
    const xs = sweep[key], ys = sweep.success;
    const pick = pickIndex(sweep, key);
    const bestSucc = Math.max(...ys);
    const bestSteps = sweep.steps.filter((_, i) => ys[i] === bestSucc).map(ck);
    const ties = sweep.steps.filter((_, i) => i !== pick && xs[i] === xs[pick]).map(ck);
    const fmt = v => fmtScore(sweep, key, v);

    meta.replaceChildren(
      "Spearman ρ = ", h("b", { text: minus(PAPER_RHO[key][sweep.id].toFixed(3)) }), ` · picks ${ck(sweep.steps[pick])} → `,
      h("b", { text: pct(ys[pick]) }),
      ys[pick] === bestSucc ? " (a best checkpoint)" : ` (best: ${bestSteps.join(", ")} at ${pct(bestSucc)})`,
      ties.length ? ` · tied with ${ties.join(", ")} in the rounded values; the paper's unrounded score picks ${ck(sweep.steps[pick])}` : "");

    const W = Math.max(280, chart.clientWidth || 460), H = Math.round(Math.min(330, Math.max(240, W * 0.6)));
    const m = { l: 46, r: 14, t: 16, b: 46 };
    let lo = Math.min(...xs), hi = Math.max(...xs);
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const xt = niceTicks(lo, hi, W < 400 ? 3 : 5);
    const sx = sc.lowerBetter ? scale(hi, lo, m.l, W - m.r) : scale(lo, hi, m.l, W - m.r);
    const yt = niceTicks(0, bestSucc * 1.15, W < 400 ? 4 : 5);
    const yTop = Math.max(yt.ticks[yt.ticks.length - 1], bestSucc * 1.12);
    const sy = scale(0, yTop, H - m.b, m.t);
    const color = familyColor(sweep);

    chart.replaceChildren();
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "group",
      "aria-label": `${sweep.benchmark} ${sweep.model}: ${sc.label} versus robot success for ${n} checkpoints. Use arrow keys to move between checkpoints.` });
    chart.appendChild(svg);

    // grid + axes (no gridline right next to the best-success line)
    const g = el("g", { class: "tick" }, svg);
    for (const t of yt.ticks) {
      const y = sy(t);
      if (y < m.t - 1) continue;
      if (Math.abs(y - sy(bestSucc)) >= 10) el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid, "stroke-width": 1 }, g);
      text(g, m.l - 8, y + 4, yt.fmt(t), "", "end");
    }
    el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: C.axis, "stroke-width": 1 }, g);
    for (const t of xt.ticks) {
      const x = sx(t);
      if (x < m.l + 12 || x > W - m.r + 1) continue;
      el("line", { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, stroke: C.axis }, g);
      text(g, x, H - m.b + 17, xt.fmt(t), "", "middle");
    }
    text(svg, (m.l + W - m.r) / 2, H - 8, `${sc.axis}${sc.lowerBetter ? " (axis reversed)" : ""} · preferred →`, "axis-title", "middle");
    text(svg, 12, (m.t + H - m.b) / 2, "Robot success (%)", "axis-title", "middle", { transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` });

    // best observed success
    el("line", { x1: m.l, x2: W - m.r, y1: sy(bestSucc), y2: sy(bestSucc), stroke: C.ink3, "stroke-width": 1, opacity: 0.55 }, svg);

    // points, in checkpoint order (DOM + focus order); pick ring drawn on a top layer
    const layer = el("g", {}, svg);
    const top = el("g", { "pointer-events": "none" }, svg);
    const pts = sweep.steps.map((st, i) => {
      const x = sx(xs[i]), y = sy(ys[i]);
      const grp = el("g", { class: "pt", tabindex: i === pick ? 0 : -1, role: "img",
        "aria-label": `${ck(st)}: ${sc.label} ${fmt(xs[i])}, success ${pct(ys[i])}${i === pick ? ", selected" : ""}` }, layer);
      el("circle", { cx: x, cy: y, r: 12, fill: "transparent" }, grp);
      const dot = el("circle", { cx: x, cy: y, r: 5, fill: color, stroke: C.panel, "stroke-width": 2 }, grp);
      el("circle", { cx: x, cy: y, r: 11, fill: "none", stroke: "transparent", class: "halo-focus" }, grp);
      return { i, x, y, dot, grp };
    });
    const px = pts[pick];
    el("circle", { cx: px.x, cy: px.y, r: 10, fill: "none", stroke: C.ink, "stroke-width": 1.5 }, top);

    // direct labels: "best X%" and the selected checkpoint, placed clear of the dots
    const obstacles = pts.map(p => dotBox(p.x, p.y, p.i === pick ? 11 : 6));
    const bounds = { x0: m.l, x1: W, y0: 0, y1: H - m.b - 2 };
    const by = sy(bestSucc);
    placeLabel(top, `best ${pct(bestSucc)}`, "annot-muted", 0, by,
      [[m.l + 4, -5, "start"], [W - m.r - 2, -5, "end"], [m.l + 4, 14, "start"], [W - m.r - 2, 14, "end"]], obstacles, bounds);
    const near = [[0, -17, "middle"], [12, -17, "end"], [-12, -17, "start"], [-16, 4, "end"], [16, 4, "start"],
                  [0, 27, "middle"], [12, 27, "end"], [-12, 27, "start"]];
    // farther spots (joined to the ring by a leader line) for dense clusters
    const far = [];
    for (const d of [34, 50, 66]) far.push([-d, -d * 0.6, "end"], [0, -d, "middle"], [-d, d * 0.8, "end"], [0, d + 10, "middle"], [d, -d * 0.6, "start"], [d, d * 0.8, "start"]);
    const lab = placeLabel(top, `${ck(sweep.steps[pick])} selected`, "annot", px.x, px.y, near.concat(far), obstacles, bounds);
    if (lab && Math.hypot(lab.box.x + lab.box.width / 2 - px.x, lab.box.y + lab.box.height / 2 - px.y) > 30) {
      const cx = Math.max(lab.box.x, Math.min(px.x, lab.box.x + lab.box.width));
      const cy = Math.max(lab.box.y, Math.min(px.y, lab.box.y + lab.box.height));
      const ang = Math.atan2(cy - px.y, cx - px.x);
      top.insertBefore(el("line", { x1: px.x + 10 * Math.cos(ang), y1: px.y + 10 * Math.sin(ang), x2: cx, y2: cy,
        stroke: C.ink3, "stroke-width": 1 }), top.firstChild);
    }

    // hover / focus
    let active = null;
    function activate(p) {
      if (active && active !== p) active.dot.setAttribute("r", 5);
      active = p;
      p.dot.setAttribute("r", 7);
      const i = p.i, sgn = sc.lowerBetter ? -1 : 1;
      const rank = xs.filter(v => sgn * v > sgn * xs[i]).length + 1;
      const box = svg.getBoundingClientRect(), pb = panel.getBoundingClientRect();
      showTip(tip, panel, p.x * (box.width / W) + (box.left - pb.left), p.y * (box.height / H) + (box.top - pb.top), [
        ["Success", pct(ys[i])], [sc.label, fmt(xs[i])], [`Rank by ${sc.label}`, `${rank} of ${n}`],
      ], `${sweep.benchmark} · ${sweep.model} · ${ck(sweep.steps[i])}${i === pick ? " · selected" : ""}`, color);
    }
    function deactivate() {
      if (active) active.dot.setAttribute("r", 5);
      active = null;
      hideTip(tip);
    }
    pts.forEach(p => {
      p.grp.addEventListener("focus", () => activate(p));
      p.grp.addEventListener("blur", deactivate);
    });
    // roving focus: arrow keys move along the x-axis, Home/End jump to the ends, Escape hides the tooltip
    const byX = [...pts].sort((a, b) => a.x - b.x);
    svg.addEventListener("keydown", e => {
      if (e.key === "Escape") { deactivate(); return; }
      const cur = byX.findIndex(p => p.grp === document.activeElement);
      if (cur < 0) return;
      const next = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 0, End: byX.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const target = byX[Math.max(0, Math.min(byX.length - 1, next))];
      pts.forEach(p => (p.grp.tabIndex = p === target ? 0 : -1));
      target.grp.focus();
    });
    // nearest-point layer for mouse and touch
    const hit = el("rect", { x: m.l - 10, y: m.t - 10, width: W - m.l - m.r + 20, height: H - m.t - m.b + 20, fill: "transparent" });
    svg.insertBefore(hit, layer);
    const nearest = e => {
      const box = svg.getBoundingClientRect();
      const qx = (e.clientX - box.left) * (W / box.width), qy = (e.clientY - box.top) * (H / box.height);
      let best = null, bd = 30 * 30;
      for (const p of pts) { const d = (p.x - qx) ** 2 + (p.y - qy) ** 2; if (d < bd) { bd = d; best = p; } }
      if (best) activate(best); else deactivate();
    };
    svg.addEventListener("pointermove", nearest);
    svg.addEventListener("pointerdown", nearest);
    svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") deactivate(); });
  }

  // ---------- data table twin ----------
  function renderExplorerTable() {
    const sc = scoreByKey[currentScore];
    const steps = [...new Set(SWEEPS.flatMap(s => s.steps))].sort((a, b) => a - b);
    const head1 = h("tr", { class: "group" }, [h("td"), ...SWEEPS.map(s => h("th", { colspan: "2", scope: "colgroup", class: "c", text: `${s.benchmark} ${s.model}` }))]);
    const head2 = h("tr", {}, [h("th", { scope: "col", text: "Checkpoint" }), ...SWEEPS.flatMap(() => [h("th", { scope: "col", text: sc.label }), h("th", { scope: "col", text: "Success" })])]);
    const body = steps.map(st => h("tr", {}, [h("th", { scope: "row", text: ck(st) }), ...SWEEPS.flatMap(s => {
      const i = s.steps.indexOf(st);
      if (i < 0) return [h("td", { text: "–" }), h("td", { text: "–" })];
      const sel = i === pickIndex(s, sc.key);
      return [h("td", { class: sel ? "best" : "", text: fmtScore(s, sc.key, s[sc.key][i]) + (sel ? " ◂" : "") }), h("td", { text: pct(s.success[i]) })];
    })]));
    const table = h("table", {}, [
      h("caption", { class: "sr-only", text: `${sc.label} and robot success per checkpoint; ◂ marks the checkpoint ${sc.label} selects` }),
      h("thead", {}, [head1, head2]), h("tbody", {}, body)]);
    document.getElementById("explorer-table").replaceChildren(table,
      h("p", { class: "table-note", text: `◂ marks the checkpoint ${sc.label} selects. MolmoSpaces values are as printed in the paper's Fig. 3 and RoboCasa values as in its Table II; RoboCasa Cosmos success uses the held-out-selected action decoder.` }));
  }

  // ---------- copy BibTeX ----------
  document.getElementById("copy-bib").addEventListener("click", async e => {
    const btn = e.currentTarget, pre = document.getElementById("bib");
    try { await navigator.clipboard.writeText(pre.textContent); btn.textContent = "Copied"; }
    catch {
      const r = document.createRange(); r.selectNodeContents(pre);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      btn.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "Press ⌘C" : "Press Ctrl+C";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });

  // ---------- init + responsive redraw ----------
  setScore("cg");
  let raf = 0, lastW = 0;
  new ResizeObserver(() => {
    const w = panelsEl.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderPanels);
  }).observe(panelsEl);
})();
