/* =============================================================================
 * Facility-Location Playground — app.js
 * Canvas placement + rendering + controls. The maths lives in fl-core.js;
 * this file only draws and wires the UI. Points live in normalised [0,1]
 * world coordinates rendered inside a centred square field, so resizing and
 * coverage circles stay geometrically honest.
 * ===========================================================================*/
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('map'), ctx = canvas.getContext('2d');

  var state = {
    demand: [], sites: [],
    tool: 'demand', problem: 'mclp', metric: 'euclidean',
    k: 2, R: 0.22, weight: 1,
    result: null, drag: null
  };

  // ---- coordinate system: square field centred in the canvas ----------------
  var view = { cw: 0, ch: 0, field: 0, ox: 0, oy: 0, dpr: 1 };
  function layout() {
    var rect = canvas.getBoundingClientRect();
    view.cw = rect.width; view.ch = rect.height;
    view.field = Math.min(rect.width, rect.height);
    view.ox = (rect.width - view.field) / 2;
    view.oy = (rect.height - view.field) / 2;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }
  function w2s(p) { return { x: view.ox + p.x * view.field, y: view.oy + p.y * view.field }; }
  function s2w(sx, sy) {
    return { x: clamp01((sx - view.ox) / view.field), y: clamp01((sy - view.oy) / view.field) };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---- hit testing -----------------------------------------------------------
  function pick(sx, sy) {
    var r = 13;
    var hit = null, bestd = r * r;
    function scan(arr, kind) {
      for (var i = 0; i < arr.length; i++) {
        var s = w2s(arr[i]); var dx = s.x - sx, dy = s.y - sy, d = dx * dx + dy * dy;
        if (d <= bestd) { bestd = d; hit = { kind: kind, i: i }; }
      }
    }
    scan(state.sites, 'site'); scan(state.demand, 'demand');
    return hit;
  }

  // ---- pointer interaction ---------------------------------------------------
  function evtPos(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function onDown(e) {
    e.preventDefault();
    var p = evtPos(e); var hit = pick(p.x, p.y);
    if (state.tool === 'erase') {
      if (hit) { remove(hit); invalidate(); render(); }
      return;
    }
    if (state.tool === 'move') {
      if (hit) state.drag = hit;
      return;
    }
    // add tool: if clicking an existing point, start dragging it; else add new
    if (hit && ((state.tool === 'demand' && hit.kind === 'demand') || (state.tool === 'site' && hit.kind === 'site'))) {
      state.drag = hit; return;
    }
    var wld = s2w(p.x, p.y);
    if (state.tool === 'demand') state.demand.push({ x: wld.x, y: wld.y, w: state.weight });
    else if (state.tool === 'site') state.sites.push({ x: wld.x, y: wld.y });
    invalidate(); refreshCounts(); clampK(); render();
  }
  function onMove(e) {
    if (!state.drag) return;
    e.preventDefault();
    var p = evtPos(e); var wld = s2w(p.x, p.y);
    var arr = state.drag.kind === 'site' ? state.sites : state.demand;
    arr[state.drag.i].x = wld.x; arr[state.drag.i].y = wld.y;
    invalidate(); render();
  }
  function onUp() { state.drag = null; }
  function remove(hit) {
    (hit.kind === 'site' ? state.sites : state.demand).splice(hit.i, 1);
    refreshCounts(); clampK();
  }
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var p = evtPos(e); var hit = pick(p.x, p.y);
    if (hit) { remove(hit); invalidate(); render(); }
  });

  // editing invalidates the last solution
  function invalidate() { if (state.result) { state.result = null; showResult(null); } }

  // ---- rendering -------------------------------------------------------------
  function facilityColor(idx) { return 'hsl(' + ((idx * 67) % 360) + ', 70%, 62%)'; }

  function render() {
    ctx.clearRect(0, 0, view.cw, view.ch);
    drawGrid();

    var res = state.result;
    var selSet = {};
    if (res) for (var s = 0; s < res.selected.length; s++) selSet[res.selected[s]] = s;

    // coverage circles (MCLP) or assignment lines (p-median) beneath the points
    if (res && res.problem === 'mclp') {
      var Rpx = state.R * view.field;
      for (var c = 0; c < res.selected.length; c++) {
        var sp = w2s(state.sites[res.selected[c]]);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, Rpx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(87,210,232,0.07)'; ctx.fill();
        ctx.strokeStyle = 'rgba(87,210,232,0.30)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (res && res.problem === 'pmedian') {
      for (var i = 0; i < state.demand.length; i++) {
        var a = res.assignment[i]; if (a == null || a < 0) continue;
        var dp = w2s(state.demand[i]), fp = w2s(state.sites[a]);
        ctx.beginPath(); ctx.moveTo(dp.x, dp.y); ctx.lineTo(fp.x, fp.y);
        ctx.strokeStyle = withAlpha(facilityColor(selSet[a]), 0.35); ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // sites
    for (var j = 0; j < state.sites.length; j++) {
      var p = w2s(state.sites[j]); var sel = res && (j in selSet);
      var size = sel ? 9 : 6;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      if (sel) {
        var col = res.problem === 'pmedian' ? facilityColor(selSet[j]) : '#57d2e8';
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      } else {
        ctx.strokeStyle = 'rgba(154,167,186,0.55)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();
    }

    // demand
    for (var d = 0; d < state.demand.length; d++) {
      var dp2 = w2s(state.demand[d]); var dem = state.demand[d];
      var rad = 4 + (dem.w - 1) * 1.1;
      var fill = 'rgba(154,167,186,0.85)';
      if (res && res.problem === 'mclp') {
        fill = res.assignment[d] >= 0 ? '#5ad6a0' : '#f06a6a';
      } else if (res && res.problem === 'pmedian') {
        var aa = res.assignment[d]; fill = aa >= 0 ? facilityColor(selSet[aa]) : 'rgba(154,167,186,0.85)';
      }
      ctx.beginPath(); ctx.arc(dp2.x, dp2.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    var step = view.field / 10;
    for (var g = 0; g <= 10; g++) {
      var x = view.ox + g * step, y = view.oy + g * step;
      ctx.beginPath(); ctx.moveTo(x, view.oy); ctx.lineTo(x, view.oy + view.field); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(view.ox, y); ctx.lineTo(view.ox + view.field, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.strokeRect(view.ox, view.oy, view.field, view.field);
  }
  function withAlpha(hsl, a) { return hsl.replace('hsl(', 'hsla(').replace(')', ', ' + a + ')'); }

  // ---- solve -----------------------------------------------------------------
  function solve() {
    var res = window.FL.solve(
      { demand: state.demand, sites: state.sites },
      { problem: state.problem, k: state.k, R: state.R, metric: state.metric, restarts: 8, seed: 1234 }
    );
    if (!res.ok) { state.result = null; showResult(null, res.message); render(); return; }
    state.result = res; showResult(res); render();
  }

  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(); }
  function pct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

  function showResult(res, msg) {
    var empty = $('resultEmpty'), body = $('resultBody');
    if (!res) {
      empty.hidden = false; body.hidden = true;
      empty.innerHTML = msg ? '⚠ ' + msg : 'Place points and press <b>Solve</b>.';
      return;
    }
    empty.hidden = true; body.hidden = false;

    var baseImp = res.baseline.improvementPct;
    if (res.problem === 'mclp') {
      $('roObj').textContent = fmt(res.objective, 2) + ' / ' + fmt(res.totalWeight, 2) + ' demand';
      $('roSecondLabel').textContent = 'coverage';
      $('roSecond').textContent = (res.coveredFraction * 100).toFixed(1) + '%';
      $('roCeilLabel').textContent = 'build-everywhere ceiling';
      $('roCeil').textContent = fmt(res.ceiling, 2) + ' (' + (res.totalWeight ? (res.ceiling / res.totalWeight * 100).toFixed(0) : 0) + '%)';
      $('headline').innerHTML = baseImp == null ? 'Solution found.'
        : 'Optimised siting covers <b>' + pct(baseImp) + '</b> more demand than the naive "' + res.baseline.name + '" pick.';
    } else {
      $('roObj').textContent = fmt(res.objective, 3) + ' field-units';
      $('roSecondLabel').textContent = 'mean distance';
      $('roSecond').textContent = fmt(res.meanDistance, 4);
      $('roCeilLabel').textContent = 'all-sites-open bound';
      $('roCeil').textContent = fmt(res.ceiling, 3);
      $('headline').innerHTML = baseImp == null ? 'Solution found.'
        : 'Optimised siting cuts travel by <b>' + pct(baseImp) + '</b> vs the naive "' + res.baseline.name + '".';
    }

    if (res.optimal) {
      $('roSolver').innerHTML = '<span style="color:#5ad6a0">optimal</span> — exhaustive over C(n,k)=' + res.combos.toLocaleString();
      $('gapRow').hidden = false;
      $('roGap').textContent = 'within ' + res.optimalityGapPct.toFixed(2) + '%';
      $('roGap').className = res.optimalityGapPct < 1e-6 ? 'cyan' : '';
    } else {
      $('roSolver').innerHTML = '<span style="color:#f0b454">best found</span> — greedy + swap (C(n,k)=' + res.combos.toLocaleString() + ' too large for exact)';
      $('gapRow').hidden = true;
    }
    $('roTime').textContent = res.elapsedMs + ' ms';
  }

  // ---- controls --------------------------------------------------------------
  function refreshCounts() { $('counts').textContent = state.demand.length + ' demand · ' + state.sites.length + ' sites'; }
  function clampK() {
    var maxK = Math.max(1, state.sites.length);
    var slider = $('k'); slider.max = Math.min(8, maxK);
    if (state.k > +slider.max) { state.k = +slider.max; slider.value = state.k; $('kVal').textContent = state.k; }
  }
  function segWire(id, key, after) {
    var seg = $(id);
    seg.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        state[key] = b.dataset[Object.keys(b.dataset)[0]];
        if (after) after();
      };
    });
  }
  segWire('toolSeg', 'tool', updateStageLabel);
  segWire('probSeg', 'prob', function () { state.problem = $('probSeg').querySelector('.active').dataset.prob; toggleRadius(); invalidate(); render(); });
  segWire('metricSeg', 'metric', function () { state.metric = $('metricSeg').querySelector('.active').dataset.metric; invalidate(); render(); });
  // fix: prob/metric keys
  state.problem = 'mclp'; state.metric = 'euclidean';

  function toggleRadius() { $('radiusRow').style.display = state.problem === 'mclp' ? '' : 'none'; }
  function updateStageLabel() {
    var t = { demand: 'click to place demand', site: 'click to place a candidate site', move: 'drag points to move', erase: 'click a point to remove' }[state.tool];
    $('stageLabel').textContent = 'field · ' + t;
  }

  $('weight').oninput = function () { state.weight = +this.value; $('wVal').textContent = this.value; };
  $('k').oninput = function () { state.k = +this.value; $('kVal').textContent = this.value; invalidate(); render(); };
  $('radius').oninput = function () { state.R = +this.value; $('rVal').textContent = (+this.value).toFixed(2); invalidate(); render(); };
  $('solveBtn').onclick = solve;
  $('clearBtn').onclick = function () { state.demand = []; state.sites = []; invalidate(); refreshCounts(); clampK(); render(); };
  $('exportBtn').onclick = exportJSON;

  $('resultPanel'); // ensure present
  document.querySelectorAll('.chip[data-preset]').forEach(function (b) {
    b.onclick = function () { loadPreset(b.dataset.preset); };
  });

  // ---- presets ---------------------------------------------------------------
  function loadPreset(name) {
    var rand = window.FL.rng(name === 'random' ? (Date.now() & 0xffff) : 7);
    var demand = [], sites = [];
    function jitter(x, y, s) { return { x: clamp01(x + (rand() - 0.5) * s), y: clamp01(y + (rand() - 0.5) * s) }; }
    if (name === 'city') {
      var hubs = [[0.25, 0.30], [0.70, 0.25], [0.55, 0.70], [0.30, 0.75]];
      hubs.forEach(function (h) { for (var i = 0; i < 6; i++) { var p = jitter(h[0], h[1], 0.18); demand.push({ x: p.x, y: p.y, w: 1 + Math.floor(rand() * 4) }); } });
      for (var s = 0; s < 10; s++) { var ps = jitter(rand(), rand(), 0); sites.push({ x: ps.x, y: ps.y }); }
    } else if (name === 'grid') {
      for (var gx = 0; gx < 5; gx++) for (var gy = 0; gy < 5; gy++) demand.push({ x: 0.12 + gx * 0.19, y: 0.12 + gy * 0.19, w: 1 });
      for (var sx = 0; sx < 3; sx++) for (var sy = 0; sy < 3; sy++) sites.push({ x: 0.2 + sx * 0.3, y: 0.2 + sy * 0.3 });
    } else if (name === 'corridors') {
      for (var i2 = 0; i2 < 12; i2++) { demand.push({ x: 0.08 + i2 * 0.075, y: clamp01(0.3 + (rand() - 0.5) * 0.06), w: 1 }); demand.push({ x: clamp01(0.3 + (rand() - 0.5) * 0.06), y: 0.08 + i2 * 0.07, w: 1 }); }
      for (var s2 = 0; s2 < 9; s2++) sites.push({ x: rand(), y: rand() });
    } else { // random
      var nd = 14 + Math.floor(rand() * 8);
      for (var i3 = 0; i3 < nd; i3++) demand.push({ x: rand(), y: rand(), w: 1 + Math.floor(rand() * 4) });
      for (var s3 = 0; s3 < 10; s3++) sites.push({ x: rand(), y: rand() });
    }
    state.demand = demand; state.sites = sites;
    invalidate(); refreshCounts(); clampK(); render();
  }

  // ---- JSON export -----------------------------------------------------------
  function exportJSON() {
    var r = state.result;
    var payload = {
      problem: state.problem, k: state.k, metric: state.metric,
      R: state.problem === 'mclp' ? state.R : undefined,
      demand: state.demand, sites: state.sites,
      solution: r ? {
        selected: r.selected, objective: r.objective, solver: r.solver,
        optimal: r.optimal, optimalityGapPct: r.optimalityGapPct,
        baseline: r.baseline, ceiling: r.ceiling, elapsedMs: r.elapsedMs
      } : null
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'facility-location.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- boot ------------------------------------------------------------------
  $('methodNote').innerHTML = 'Exact = exhaustive search over every C(n,k) selection (runs when there are few enough combinations). Otherwise a multi-start greedy + swap local search reports the best found. The <b>optimality gap is shown only when the exact optimum was computed</b>; the baseline improvement is a separate figure against a deterministic naive policy.';
  function boot() {
    layout(); toggleRadius(); updateStageLabel(); refreshCounts();
    loadPreset('city'); clampK(); solve();
  }
  window.addEventListener('resize', function () { layout(); render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
