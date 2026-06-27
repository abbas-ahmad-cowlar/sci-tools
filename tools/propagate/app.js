/* Propagate, UI layer. Wires the DOM to the engine in propagate.js. */
"use strict";
(function () {
  const P = window.Propagate;
  const $ = (id) => document.getElementById(id);
  const exprEl = $("expr"), msgEl = $("msg"), varsBody = $("vars"), varsEmpty = $("vars-empty");
  const rval = $("rval"), rsub = $("rsub"), budgetEl = $("budget"), relHint = $("rel-hint");
  const sigSel = $("sig"), exEl = $("examples"), copyBtn = $("copy"), toastEl = $("toast");

  // store: name -> { value, sigma, unit } (strings, so partial input is fine)
  const store = {
    I: { value: "0.5", sigma: "0.01", unit: "A" },
    R: { value: "100", sigma: "2", unit: "Ω" },
  };
  let lastVars = [];

  const EXAMPLES = [
    { label: "Resistor power  P = I²·R", expr: "I^2 * R", vars: { I: ["0.5", "0.01", "A"], R: ["100", "2", "Ω"] } },
    { label: "Density  ρ = m / V", expr: "m / V", vars: { m: ["12.3", "0.1", "g"], V: ["4.5", "0.2", "cm³"] } },
    { label: "Kinetic energy  E = ½·m·v²", expr: "0.5 * m * v^2", vars: { m: ["2", "0.05", "kg"], v: ["10", "0.3", "m/s"] } },
    { label: "Thin lens  f = u·v/(u+v)", expr: "(u*v) / (u+v)", vars: { u: ["20", "0.5", "cm"], v: ["30", "0.8", "cm"] } },
    { label: "Pendulum  T = 2π·√(L/g)", expr: "2*pi*sqrt(L/g)", vars: { L: ["1.0", "0.005", "m"], g: ["9.81", "0.02", "m/s²"] } },
    { label: "Photon energy  E = h·c/λ", expr: "h*c / lam", vars: { lam: ["633e-9", "1e-9", "m"] } },
    { label: "Snell  n₂ = n₁·sinθ₁/sinθ₂", expr: "n1*sin(t1)/sin(t2)", vars: { n1: ["1.000", "0.001", ""], t1: ["0.5236", "0.0017", "rad"], t2: ["0.3398", "0.0017", "rad"] } },
    { label: "Beam waist  w = λ/(π·na)", expr: "lam / (pi*na)", vars: { lam: ["1.55e-6", "5e-9", "m"], na: ["0.14", "0.005", ""] } },
  ];

  /* ---------- helpers ---------- */
  function num(s) { if (s == null || s === "") return NaN; const v = Number(s); return v; }
  function trim(x) {
    if (!isFinite(x)) return "–";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) return x.toExponential(2).replace("e+", "e");
    return String(Number(x.toPrecision(4)));
  }
  function mix(c1, c2, t) {
    const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = p(c1), b = p(c2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove("show"), 1500); }

  /* ---------- variable table ---------- */
  function renderVars(vars) {
    varsBody.innerHTML = "";
    varsEmpty.style.display = vars.length ? "none" : "block";
    vars.forEach((name) => {
      if (!store[name]) {
        const phys = P.PHYS[name];
        store[name] = phys
          ? { value: String(phys[0]), sigma: "", unit: phys[1], isConst: true }
          : { value: "", sigma: "", unit: "" };
      }
      const s = store[name];
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.innerHTML = `<span class="vname">${escapeHtml(name)}</span>`;
      tr.appendChild(tdName);

      tr.appendChild(inputCell(s, "value", "value", "num"));
      const pmCell = inputCell(s, "sigma", "± uncertainty", "num");
      tr.appendChild(pmCell);
      tr.appendChild(inputCell(s, "unit", "unit", "unit"));

      varsBody.appendChild(tr);
    });
  }
  function inputCell(s, key, ph, cls) {
    const td = document.createElement("td");
    if (cls === "num") td.className = "num";
    const inp = document.createElement("input");
    inp.className = "vin" + (cls === "unit" ? " unit" : "");
    inp.value = s[key];
    inp.placeholder = key === "unit" ? "–" : ph;
    inp.spellcheck = false; inp.autocomplete = "off";
    inp.addEventListener("input", () => { s[key] = inp.value; compute(); });
    td.appendChild(inp);
    return td;
  }
  function escapeHtml(t) { return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* ---------- compile on expression change ---------- */
  function recompile() {
    const src = exprEl.value.trim();
    let compiled;
    try { compiled = P.compile(src); }
    catch (e) {
      exprEl.classList.add("err");
      msgEl.classList.remove("okmsg");
      msgEl.textContent = "⚠ " + (e.message || "parse error") + (e.pos != null ? `  (at ${e.pos + 1})` : "");
      return; // keep last table & result
    }
    exprEl.classList.remove("err");
    msgEl.classList.add("okmsg");
    msgEl.textContent = compiled.vars.length ? `${compiled.vars.length} variable${compiled.vars.length > 1 ? "s" : ""}: ${compiled.vars.join(", ")}` : "no variables, constant expression";
    lastVars = compiled.vars;
    renderVars(compiled.vars);
    compute();
  }

  /* ---------- compute result + budget ---------- */
  let lastResult = null;
  function compute() {
    const src = exprEl.value.trim();
    const vobj = {};
    let missing = false;
    for (const name of lastVars) {
      const s = store[name] || {};
      const v = num(s.value);
      if (!isFinite(v)) missing = true;
      vobj[name] = { value: v, sigma: num(s.sigma) || 0 };
    }
    let res;
    try { res = P.propagate(src, vobj); } catch (e) { res = null; }
    lastResult = res;

    if (missing) { showPlaceholder("enter all values"); return; }
    if (!res || !res.ok) { showPlaceholder("undefined, check the expression or domain"); return; }

    const sig = parseInt(sigSel.value, 10) || 2;
    const f = P.format(res.value, res.sigma, sig);
    const tail = f.exp != null ? ` <span class="unit">×10<sup>${f.exp}</sup></span>` : "";
    if (res.sigma > 0) {
      rval.innerHTML = (f.exp != null ? "<span>(</span>" : "") +
        `<span>${f.value}</span> <span class="pm">±</span> <span>${f.sigma}</span>` +
        (f.exp != null ? "<span>)</span>" : "") + tail;
    } else {
      rval.innerHTML = `<span>${f.value}</span>` + tail;
    }
    const relPct = isFinite(res.relative) ? (res.relative * 100) : Infinity;
    rsub.innerHTML =
      `<span>σ = ${trim(res.sigma)}</span>` +
      (isFinite(relPct) ? `<span>relative <b>${relPct < 0.01 ? relPct.toExponential(1) : relPct.toFixed(relPct < 1 ? 2 : 1)}%</b></span>` : "");
    relHint.textContent = isFinite(relPct) ? `±${relPct < 1 ? relPct.toFixed(2) : relPct.toFixed(1)}%` : "";

    renderBudget(res);
  }
  function showPlaceholder(text) {
    rval.innerHTML = `<span style="color:var(--faint);font-size:20px">${text}</span>`;
    rsub.innerHTML = ""; relHint.textContent = "";
    budgetEl.innerHTML = `<div class="budget-empty">${text === "enter all values" ? "Fill in every value to compute." : ""}</div>`;
  }

  function renderBudget(res) {
    const terms = res.terms.filter((t) => t.sigma > 0 && isFinite(t.contribution) && t.c2 > 0);
    if (!terms.length) {
      budgetEl.innerHTML = `<div class="budget-empty">Add ±uncertainties to see which one dominates.</div>`;
      return;
    }
    const maxPct = terms[0].percent || 1;
    budgetEl.innerHTML = "";
    terms.forEach((t) => {
      const s = store[t.name] || {};
      const unit = s.unit ? ` ${escapeHtml(s.unit)}` : "";
      const frac = t.percent / 100;
      const color = mix("#5ad0a8", "#ff6b6b", Math.min(1, frac * 1.15)); // green→red as it dominates
      const div = document.createElement("div");
      div.className = "brow";
      div.innerHTML =
        `<div class="brow-top"><span class="brow-name">${escapeHtml(t.name)}<small>±${trim(t.sigma)}${unit}</small></span>` +
        `<span class="brow-pct">${t.percent.toFixed(t.percent < 1 ? 2 : 1)}%</span></div>` +
        `<div class="bar"><i style="width:${(t.percent / maxPct * 100).toFixed(1)}%;background:${color}"></i></div>` +
        `<div class="brow-foot">contributes ±${trim(Math.abs(t.contribution))} to f &nbsp;·&nbsp; ∂f/∂${escapeHtml(t.name)} = ${trim(t.slope)}</div>`;
      budgetEl.appendChild(div);
    });
  }

  // We don't do unit algebra; only echo a unit if exactly one variable drives a
  // pure proportional expression. Otherwise leave it blank (honest).
  function guessUnit() { return ""; }

  /* ---------- copy ---------- */
  function copyResult() {
    if (!lastResult || !lastResult.ok) { toast("Nothing to copy"); return; }
    const sig = parseInt(sigSel.value, 10) || 2;
    const f = P.format(lastResult.value, lastResult.sigma, sig);
    let txt = `f = ${exprEl.value.trim()}\n${f.combined}`;
    if (isFinite(lastResult.relative)) txt += `   (relative ${(lastResult.relative * 100).toPrecision(3)}%)`;
    txt += "\nError budget:";
    lastResult.terms.filter((t) => t.c2 > 0).forEach((t) => { txt += `\n  ${t.name}: ${t.percent.toFixed(1)}%  (±${trim(Math.abs(t.contribution))})`; });
    navigator.clipboard?.writeText(txt).then(() => toast("Result copied"), () => toast("Copy failed"));
  }

  /* ---------- examples ---------- */
  function initExamples() {
    EXAMPLES.forEach((ex, i) => {
      const o = document.createElement("option");
      o.value = String(i); o.textContent = ex.label;
      exEl.appendChild(o);
    });
    exEl.addEventListener("change", () => {
      if (exEl.value === "") return;            // placeholder picked, do nothing
      const ex = EXAMPLES[+exEl.value];
      if (!ex) return;
      exprEl.value = ex.expr;
      for (const [k, v] of Object.entries(ex.vars)) store[k] = { value: v[0], sigma: v[1], unit: v[2] };
      recompile();
      // leave the dropdown showing the chosen example's label
    });
  }

  /* ---------- wire up ---------- */
  exprEl.addEventListener("input", recompile);
  sigSel.addEventListener("change", compute);
  copyBtn.addEventListener("click", copyResult);
  window.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") copyResult(); });

  initExamples();
  recompile();
})();
