/* =========================================================================
   PhotonBench — UI wiring. Links the spectral fields, the live units
   calculator, the power/dB converter and the constants browser.
   ========================================================================= */
(function () {
  "use strict";
  const PB = window.PB;
  const U = PB.units, O = PB.optics;
  const $ = (id) => document.getElementById(id);
  const fmt = U.fmtNum;

  // ---------------------------------------------------------------- toast
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove("show"), 1200);
  }

  // ===================================================== spectral converter
  const SPEC_FIELDS = ["wavelengthNm", "freqTHz", "energyEV", "wavenumberCm", "angularRadS", "periodFs"];

  function setSpectral(fromField, value, keepEl) {
    const d = O.spectral(fromField, value);
    if (!d) return;
    const vals = {
      wavelengthNm: d.wavelengthM / 1e-9,
      freqTHz: d.freqHz / 1e12,
      energyEV: d.energyEV,
      wavenumberCm: d.wavenumberCm,
      angularRadS: d.angularRadS,
      periodFs: d.periodS / 1e-15
    };
    SPEC_FIELDS.forEach((f) => {
      const el = $("f-" + f);
      if (el !== keepEl) el.value = fmt(vals[f]);
    });
    updateRuler(vals.wavelengthNm, d);
  }

  function updateRuler(lambdaNm, d) {
    const lo = 380, hi = 750;
    const marker = $("ruler-marker");
    let pct = (lambdaNm - lo) / (hi - lo) * 100;
    const off = pct < 0 || pct > 100;
    marker.style.left = Math.max(0, Math.min(100, pct)) + "%";
    marker.classList.toggle("off", off);

    const [r, g, b] = O.wavelengthToRGB(lambdaNm);
    const dot = $("band-dot");
    const visible = r + g + b > 0;
    dot.style.background = visible ? `rgb(${r},${g},${b})` : "#3a3f4a";
    dot.style.color = visible ? `rgb(${r},${g},${b})` : "#3a3f4a";
    $("band-name").textContent = O.bandName(lambdaNm);

    // medium wavelength + photon flux
    const n = parseFloat($("f-nindex").value) || 1;
    $("lambda-medium").textContent = fmt(lambdaNm / n) + " nm";
    $("flux").textContent = fmt(d.photonsPerSecPerWatt) + " s⁻¹";
  }

  function buildRuler() {
    const stops = [];
    for (let nm = 380; nm <= 750; nm += 5) {
      const [r, g, b] = O.wavelengthToRGB(nm);
      const pct = (nm - 380) / (750 - 380) * 100;
      stops.push(`rgb(${r},${g},${b}) ${pct.toFixed(1)}%`);
    }
    $("ruler-bar").style.background = "linear-gradient(90deg," + stops.join(",") + ")";
    const ticks = $("ruler-ticks");
    [400, 500, 600, 700].forEach((t) => {
      const s = document.createElement("span");
      s.textContent = t;
      s.style.left = (t - 380) / 370 * 100 + "%";
      ticks.appendChild(s);
    });
  }

  function wireSpectral() {
    SPEC_FIELDS.forEach((f) => {
      $("f-" + f).addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        if (v > 0 && isFinite(v)) setSpectral(f, v, e.target);
      });
    });
    $("f-nindex").addEventListener("input", () => {
      const v = parseFloat($("f-wavelengthNm").value);
      if (v > 0) setSpectral("wavelengthNm", v, null);
    });

    const presets = [
      ["405 nm", "violet diode", 405], ["488 nm", "Ar⁺", 488], ["532 nm", "green DPSS", 532],
      ["632.8 nm", "He-Ne", 632.8], ["800 nm", "Ti:Sapph", 800], ["1064 nm", "Nd:YAG", 1064],
      ["1550 nm", "telecom C", 1550], ["10.6 µm", "CO₂", 10600]
    ];
    const wrap = $("presets");
    presets.forEach(([label, name, nm]) => {
      const b = document.createElement("button");
      b.innerHTML = `<b>${label}</b> ${name}`;
      b.onclick = () => { setSpectral("wavelengthNm", nm, null); };
      wrap.appendChild(b);
    });
  }

  // ========================================================= units calculator
  function renderCalcResult(str) {
    const out = $("calc-result");
    const r = U.evaluate(str);
    if (!str.trim()) { out.innerHTML = '<span class="cr-placeholder">= …</span>'; out.classList.remove("err"); return null; }
    if (r.ok && !r.empty) {
      out.classList.remove("err");
      out.innerHTML = '<span class="eq">=</span><b>' + r.display + "</b>";
      return r;
    }
    out.classList.add("err");
    out.textContent = r.error ? "⚠ " + r.error : "";
    return null;
  }

  function pushHistory(expr, display) {
    const wrap = $("calc-history");
    const item = document.createElement("div");
    item.className = "h-item";
    item.innerHTML = `<span class="h-expr">${escapeHtml(expr)}</span><span class="h-val">${escapeHtml(display)}</span>`;
    item.onclick = () => { const i = $("calc-input"); i.value = expr; i.focus(); renderCalcResult(expr); };
    wrap.insertBefore(item, wrap.firstChild);
    while (wrap.children.length > 12) wrap.removeChild(wrap.lastChild);
  }

  function wireCalc() {
    const input = $("calc-input");
    input.addEventListener("input", () => renderCalcResult(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const r = renderCalcResult(input.value);
        if (r) pushHistory(input.value.trim(), r.display);
      }
    });
    const examples = [
      "h c / 1064nm in eV", "kB * 300K in eV", "1 / sqrt(eps0 mu0)",
      "5 V / 2 kohm in mA", "2 pi / 800nm", "1 atm in Torr"
    ];
    const ewrap = $("calc-examples");
    examples.forEach((ex) => {
      const b = document.createElement("button");
      b.textContent = ex;
      b.onclick = () => { input.value = ex; input.focus(); renderCalcResult(ex); };
      ewrap.appendChild(b);
    });
  }

  // ============================================================ power / dB
  const PFIELDS = ["mW", "dBm", "watt", "dBW"];
  function setPower(fromField, value, keepEl) {
    const p = O.powerFrom(fromField, value);
    if (!p) return;
    const map = { mW: p.mW, dBm: p.dBm, watt: p.watt, dBW: p.dBW };
    PFIELDS.forEach((f) => {
      const el = $("p-" + f);
      if (el !== keepEl) el.value = fmt(map[f]);
    });
  }

  let ratioMode = "power";
  function setRatioFrom(which) {
    const k = ratioMode === "power" ? 10 : 20;
    const rEl = $("r-ratio"), dEl = $("r-db");
    if (which === "ratio") {
      const v = parseFloat(rEl.value);
      if (v > 0) dEl.value = fmt(k * Math.log10(v));
    } else {
      const v = parseFloat(dEl.value);
      if (isFinite(v)) rEl.value = fmt(Math.pow(10, v / k));
    }
  }

  function wirePower() {
    PFIELDS.forEach((f) => {
      $("p-" + f).addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        if (isFinite(v)) setPower(f, v, e.target);
      });
    });
    $("r-ratio").addEventListener("input", () => setRatioFrom("ratio"));
    $("r-db").addEventListener("input", () => setRatioFrom("db"));
    $("r-mode").querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        $("r-mode").querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        ratioMode = b.dataset.mode;
        setRatioFrom("ratio");
      };
    });
  }

  // ============================================================ constants
  function wireConstants() {
    const list = U.constantList();
    const grid = $("const-grid");
    const search = $("const-search");

    function render(filter) {
      grid.innerHTML = "";
      const q = (filter || "").toLowerCase();
      list.filter((c) => !q || c.name.toLowerCase().includes(q) || c.about.toLowerCase().includes(q))
        .forEach((c) => {
          const el = document.createElement("button");
          el.className = "const-item";
          el.innerHTML =
            `<div class="ci-top"><span class="ci-name">${c.name}</span><span class="ci-unit">${c.unit || "—"}</span></div>` +
            `<div class="ci-val">${c.value}</div><div class="ci-about">${escapeHtml(c.about)}</div>`;
          el.onclick = () => insertIntoCalc(c.name);
          grid.appendChild(el);
        });
      if (!grid.children.length) grid.innerHTML = '<div style="color:var(--ink-faint);font-size:11px;padding:8px;">no match</div>';
    }
    search.addEventListener("input", () => render(search.value));
    render("");
  }

  function insertIntoCalc(symbol) {
    const input = $("calc-input");
    let v = input.value;
    if (v && !/[\s(*/+\-^]$/.test(v)) v += " ";
    input.value = v + symbol;
    input.focus();
    renderCalcResult(input.value);
    toast("inserted  " + symbol);
  }

  // ---------------------------------------------------------------- helpers
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    buildRuler();
    wireSpectral();
    wireCalc();
    wirePower();
    wireConstants();

    // initial state
    setSpectral("wavelengthNm", 1550, null);
    setPower("mW", 1, null);
    $("r-ratio").value = "2"; setRatioFrom("ratio");
    $("calc-input").value = "h c / 1064nm in eV";
    renderCalcResult($("calc-input").value);

    $("foot-counts").textContent =
      U.unitNames().length + " units · " + U.constantList().length +
      " constants · " + U.funcNames().length + " functions";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
