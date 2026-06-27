/* =============================================================================
 * Facility-Location Playground — fl-core.js
 *
 * The DOM-free solver core. Two classic facility-location problems on a plane:
 *
 *   MCLP (Maximum Covering Location Problem)
 *       choose k sites to MAXIMISE the demand weight within radius R of an open site.
 *   p-median
 *       choose k sites to MINIMISE the demand-weighted distance to the nearest open site.
 *
 * For each problem we provide a greedy baseline, a multi-start swap local search
 * (Teitz–Bart vertex substitution for p-median; remove-one/add-one for MCLP), and an
 * exhaustive exact solver used when C(n,k) is small enough to enumerate.
 *
 * Two comparison figures are computed and kept strictly separate:
 *   - optimalityGapPct : how far the heuristic is from the proven optimum.
 *                        Present ONLY when the exact optimum was computed.
 *   - baseline         : a DETERMINISTIC naive policy (no RNG), reported as the
 *                        improvement of the optimised solution over it.
 * "Build-everywhere" is reported separately as a ceiling/bound reference only.
 *
 * Pure logic, no DOM — runnable headless under Node (see test/core.test.js).
 * ===========================================================================*/
(function (root, factory) {
  'use strict';
  var FL = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = FL;
  if (typeof window !== 'undefined') window.FL = FL;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- small deterministic RNG (mulberry32) so runs are reproducible ---------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- geometry --------------------------------------------------------------
  function distance(a, b, metric) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return metric === 'manhattan' ? Math.abs(dx) + Math.abs(dy) : Math.sqrt(dx * dx + dy * dy);
  }

  // D[i][j] = distance from demand i to site j
  function distanceMatrix(demand, sites, metric) {
    var D = new Array(demand.length);
    for (var i = 0; i < demand.length; i++) {
      D[i] = new Array(sites.length);
      for (var j = 0; j < sites.length; j++) D[i][j] = distance(demand[i], sites[j], metric);
    }
    return D;
  }

  // covers[i][j] = (D[i][j] <= R)
  function coverageMatrix(D, R) {
    var C = new Array(D.length);
    for (var i = 0; i < D.length; i++) {
      C[i] = new Array(D[i].length);
      for (var j = 0; j < D[i].length; j++) C[i][j] = D[i][j] <= R;
    }
    return C;
  }

  // ---- combinatorics ---------------------------------------------------------
  function nCk(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var r = 1;
    for (var i = 0; i < k; i++) { r = r * (n - i) / (i + 1); }
    return Math.round(r);
  }

  // iterate every k-subset of {0..n-1}; cb receives a reused array (don't retain it)
  function forEachCombination(n, k, cb) {
    var idx = new Array(k);
    for (var i = 0; i < k; i++) idx[i] = i;
    if (k === 0) { cb([]); return; }
    while (true) {
      cb(idx);
      // advance to next combination
      var p = k - 1;
      while (p >= 0 && idx[p] === n - k + p) p--;
      if (p < 0) break;
      idx[p]++;
      for (var q = p + 1; q < k; q++) idx[q] = idx[q - 1] + 1;
    }
  }

  // ============================================================ MCLP ==========
  // Objective: total weight of demand covered by AT LEAST ONE selected site.
  function mclpObjective(selected, covers, weights) {
    var total = 0;
    for (var i = 0; i < covers.length; i++) {
      for (var s = 0; s < selected.length; s++) {
        if (covers[i][selected[s]]) { total += weights[i]; break; }
      }
    }
    return total;
  }

  // greedy-add: repeatedly open the site covering the most still-uncovered weight.
  function greedyMCLP(covers, weights, k) {
    var n = covers.length, m = covers[0] ? covers[0].length : 0;
    var coveredBy = new Array(n).fill(false);
    var selected = [];
    var open = new Array(m).fill(false);
    for (var step = 0; step < k && selected.length < m; step++) {
      var bestSite = -1, bestGain = -1;
      for (var j = 0; j < m; j++) {
        if (open[j]) continue;
        var gain = 0;
        for (var i = 0; i < n; i++) if (!coveredBy[i] && covers[i][j]) gain += weights[i];
        if (gain > bestGain) { bestGain = gain; bestSite = j; }
      }
      if (bestSite < 0 || bestGain <= 0) break;
      open[bestSite] = true; selected.push(bestSite);
      for (var ii = 0; ii < n; ii++) if (covers[ii][bestSite]) coveredBy[ii] = true;
    }
    // pad with arbitrary unopened sites if fewer than k contributed (keeps |S| meaningful)
    for (var j2 = 0; selected.length < Math.min(k, m); j2++) if (!open[j2]) { open[j2] = true; selected.push(j2); }
    return selected;
  }

  // multi-start swap local search (remove-one / add-one), seeded starts + greedy start.
  function localSearchMCLP(covers, weights, k, opts) {
    opts = opts || {};
    var m = covers[0] ? covers[0].length : 0;
    var restarts = opts.restarts || 6;
    var rand = rng(opts.seed || 12345);
    var best = null, bestObj = -Infinity;

    function improveFrom(start) {
      var sel = start.slice();
      var inSet = new Array(m).fill(false);
      for (var a = 0; a < sel.length; a++) inSet[sel[a]] = true;
      var obj = mclpObjective(sel, covers, weights);
      var improved = true;
      while (improved) {
        improved = false;
        for (var r = 0; r < sel.length; r++) {
          for (var t = 0; t < m; t++) {
            if (inSet[t]) continue;
            var removed = sel[r];
            sel[r] = t; inSet[removed] = false; inSet[t] = true;
            var o = mclpObjective(sel, covers, weights);
            if (o > obj + 1e-12) { obj = o; improved = true; }
            else { sel[r] = removed; inSet[t] = false; inSet[removed] = true; }
          }
        }
      }
      return { sel: sel, obj: obj };
    }

    var starts = [greedyMCLP(covers, weights, k)];
    for (var s = 0; s < restarts; s++) {
      // random k-subset start
      var pool = []; for (var j = 0; j < m; j++) pool.push(j);
      for (var p = pool.length - 1; p > 0; p--) { var q = Math.floor(rand() * (p + 1)); var tmp = pool[p]; pool[p] = pool[q]; pool[q] = tmp; }
      starts.push(pool.slice(0, Math.min(k, m)));
    }
    for (var si = 0; si < starts.length; si++) {
      var res = improveFrom(starts[si]);
      if (res.obj > bestObj) { bestObj = res.obj; best = res.sel.slice(); }
    }
    return { selected: best, objective: bestObj };
  }

  function exactMCLP(covers, weights, k) {
    var m = covers[0] ? covers[0].length : 0;
    var best = null, bestObj = -Infinity;
    forEachCombination(m, Math.min(k, m), function (idx) {
      var o = mclpObjective(idx, covers, weights);
      if (o > bestObj) { bestObj = o; best = idx.slice(); }
    });
    return { selected: best, objective: bestObj };
  }

  // deterministic naive: the k sites with the highest INDIVIDUAL coverage (ignores overlap).
  function naiveMCLP(covers, weights, k) {
    var m = covers[0] ? covers[0].length : 0, n = covers.length;
    var score = [];
    for (var j = 0; j < m; j++) {
      var w = 0; for (var i = 0; i < n; i++) if (covers[i][j]) w += weights[i];
      score.push({ j: j, w: w });
    }
    score.sort(function (a, b) { return b.w - a.w || a.j - b.j; }); // deterministic tie-break
    var sel = []; for (var t = 0; t < Math.min(k, m); t++) sel.push(score[t].j);
    return sel;
  }

  // ceiling: demand coverable with EVERY site open.
  function ceilingMCLP(covers, weights) {
    var allSites = []; for (var j = 0; j < (covers[0] ? covers[0].length : 0); j++) allSites.push(j);
    return mclpObjective(allSites, covers, weights);
  }

  // ============================================================ p-median ======
  // assign each demand to its nearest OPEN site; return objective + assignment.
  function pmedianAssign(selected, D, weights) {
    var n = D.length, obj = 0, assignment = new Array(n);
    for (var i = 0; i < n; i++) {
      var bestJ = selected[0], bestD = D[i][selected[0]];
      for (var s = 1; s < selected.length; s++) {
        var d = D[i][selected[s]];
        if (d < bestD) { bestD = d; bestJ = selected[s]; }
      }
      assignment[i] = bestJ; obj += weights[i] * bestD;
    }
    return { objective: obj, assignment: assignment };
  }

  // greedy-add: each step open the site giving the largest objective decrease.
  function greedyPmedian(D, weights, k) {
    var m = D[0] ? D[0].length : 0;
    var selected = [], open = new Array(m).fill(false);
    while (selected.length < Math.min(k, m)) {
      var bestJ = -1, bestObj = Infinity;
      for (var j = 0; j < m; j++) {
        if (open[j]) continue;
        var trial = selected.concat(j);
        var o = pmedianAssign(trial, D, weights).objective;
        if (o < bestObj) { bestObj = o; bestJ = j; }
      }
      if (bestJ < 0) break;
      open[bestJ] = true; selected.push(bestJ);
    }
    return selected;
  }

  // Teitz–Bart vertex substitution (swap) local search, multi-start.
  function swapPmedian(D, weights, k, opts) {
    opts = opts || {};
    var m = D[0] ? D[0].length : 0;
    var restarts = opts.restarts || 6;
    var rand = rng(opts.seed || 67890);
    var best = null, bestObj = Infinity;

    function improveFrom(start) {
      var sel = start.slice();
      var inSet = new Array(m).fill(false);
      for (var a = 0; a < sel.length; a++) inSet[sel[a]] = true;
      var obj = pmedianAssign(sel, D, weights).objective;
      var improved = true;
      while (improved) {
        improved = false;
        for (var r = 0; r < sel.length; r++) {
          for (var t = 0; t < m; t++) {
            if (inSet[t]) continue;
            var removed = sel[r];
            sel[r] = t; inSet[removed] = false; inSet[t] = true;
            var o = pmedianAssign(sel, D, weights).objective;
            if (o < obj - 1e-9) { obj = o; improved = true; }
            else { sel[r] = removed; inSet[t] = false; inSet[removed] = true; }
          }
        }
      }
      return { sel: sel, obj: obj };
    }

    var starts = [greedyPmedian(D, weights, k)];
    for (var s = 0; s < restarts; s++) {
      var pool = []; for (var j = 0; j < m; j++) pool.push(j);
      for (var p = pool.length - 1; p > 0; p--) { var q = Math.floor(rand() * (p + 1)); var tmp = pool[p]; pool[p] = pool[q]; pool[q] = tmp; }
      starts.push(pool.slice(0, Math.min(k, m)));
    }
    for (var si = 0; si < starts.length; si++) {
      var res = improveFrom(starts[si]);
      if (res.obj < bestObj) { bestObj = res.obj; best = res.sel.slice(); }
    }
    return { selected: best, objective: bestObj };
  }

  function exactPmedian(D, weights, k) {
    var m = D[0] ? D[0].length : 0;
    var best = null, bestObj = Infinity;
    forEachCombination(m, Math.min(k, m), function (idx) {
      var o = pmedianAssign(idx, D, weights).objective;
      if (o < bestObj) { bestObj = o; best = idx.slice(); }
    });
    return { selected: best, objective: bestObj };
  }

  // deterministic naive: the k sites nearest the weighted demand centroid.
  function naivePmedian(demand, sites, weights, D, k, metric) {
    var sw = 0, cx = 0, cy = 0;
    for (var i = 0; i < demand.length; i++) { sw += weights[i]; cx += weights[i] * demand[i].x; cy += weights[i] * demand[i].y; }
    if (sw > 0) { cx /= sw; cy /= sw; }
    var centroid = { x: cx, y: cy };
    var score = [];
    for (var j = 0; j < sites.length; j++) score.push({ j: j, d: distance(sites[j], centroid, metric) });
    score.sort(function (a, b) { return a.d - b.d || a.j - b.j; });
    var sel = []; for (var t = 0; t < Math.min(k, sites.length); t++) sel.push(score[t].j);
    return sel;
  }

  // ceiling: every site open → each demand uses its globally-nearest site.
  function ceilingPmedian(D, weights) {
    var allSites = []; for (var j = 0; j < (D[0] ? D[0].length : 0); j++) allSites.push(j);
    return pmedianAssign(allSites, D, weights).objective;
  }

  // ============================================================ orchestrator ==
  // opts: { problem:'mclp'|'pmedian', k, R, metric, exactCap, restarts, seed }
  function solve(instance, opts) {
    opts = opts || {};
    var problem = opts.problem || 'mclp';
    var metric = opts.metric || 'euclidean';
    var demand = instance.demand || [];
    var sites = instance.sites || [];
    var weights = demand.map(function (d) { return (typeof d.w === 'number' && d.w > 0) ? d.w : 1; });
    var m = sites.length;
    var k = Math.max(1, Math.min(opts.k || 1, m));
    var exactCap = opts.exactCap || 200000;
    var combos = nCk(m, k);
    var canExact = m > 0 && combos > 0 && combos <= exactCap;

    if (m === 0 || demand.length === 0) {
      return { ok: false, message: 'Add at least one demand point and one candidate site.' };
    }

    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var D = distanceMatrix(demand, sites, metric);
    var out = { ok: true, problem: problem, k: k, metric: metric, totalWeight: weights.reduce(function (a, b) { return a + b; }, 0) };

    if (problem === 'mclp') {
      var covers = coverageMatrix(D, opts.R != null ? opts.R : 1);
      var heur = localSearchMCLP(covers, weights, k, { restarts: opts.restarts, seed: opts.seed });
      var naiveSel = naiveMCLP(covers, weights, k);
      var naiveObj = mclpObjective(naiveSel, covers, weights);
      out.ceiling = ceilingMCLP(covers, weights);
      out.baseline = { name: 'top-k individual coverage', selected: naiveSel, objective: naiveObj };

      var selected = heur.selected, objective = heur.objective, optimal = false, gap;
      if (canExact) {
        var ex = exactMCLP(covers, weights, k);
        selected = ex.selected; objective = ex.objective; optimal = true;
        gap = objective > 0 ? (objective - heur.objective) / objective : 0; // heuristic's distance from optimum
        out.heuristic = { selected: heur.selected, objective: heur.objective };
      }
      out.selected = selected;
      out.objective = objective;                       // covered demand weight
      out.assignment = mclpAssignment(selected, covers); // which (if any) site covers each demand
      out.solver = optimal ? 'exact' : 'heuristic';
      out.optimal = optimal;
      if (optimal) out.optimalityGapPct = 100 * gap;
      out.coveredFraction = out.totalWeight > 0 ? objective / out.totalWeight : 0;
      out.baseline.improvementPct = naiveObj > 0 ? 100 * (objective - naiveObj) / naiveObj : null;
    } else {
      var heurP = swapPmedian(D, weights, k, { restarts: opts.restarts, seed: opts.seed });
      var naiveSelP = naivePmedian(demand, sites, weights, D, k, metric);
      var naiveResP = pmedianAssign(naiveSelP, D, weights);
      out.ceiling = ceilingPmedian(D, weights);
      out.baseline = { name: 'k nearest the demand centroid', selected: naiveSelP, objective: naiveResP.objective };

      var selP = heurP.selected, objP = heurP.objective, optimalP = false, gapP;
      if (canExact) {
        var exP = exactPmedian(D, weights, k);
        selP = exP.selected; objP = exP.objective; optimalP = true;
        gapP = objP > 0 ? (heurP.objective - objP) / objP : 0; // heuristic's distance from optimum
        out.heuristic = { selected: heurP.selected, objective: heurP.objective };
      }
      var fin = pmedianAssign(selP, D, weights);
      out.selected = selP;
      out.objective = fin.objective;                   // total weighted distance
      out.assignment = fin.assignment;                 // nearest open site per demand
      out.solver = optimalP ? 'exact' : 'heuristic';
      out.optimal = optimalP;
      if (optimalP) out.optimalityGapPct = 100 * gapP;
      out.meanDistance = out.totalWeight > 0 ? fin.objective / out.totalWeight : 0;
      out.baseline.improvementPct = naiveResP.objective > 0 ? 100 * (naiveResP.objective - fin.objective) / naiveResP.objective : null;
    }

    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    out.elapsedMs = +(t1 - t0).toFixed(2);
    out.combos = combos;
    out.exactCap = exactCap;
    return out;
  }

  // for MCLP rendering: assignment[i] = a covering selected site, or -1 if uncovered
  function mclpAssignment(selected, covers) {
    var assignment = new Array(covers.length).fill(-1);
    for (var i = 0; i < covers.length; i++) {
      for (var s = 0; s < selected.length; s++) { if (covers[i][selected[s]]) { assignment[i] = selected[s]; break; } }
    }
    return assignment;
  }

  return {
    // orchestrator
    solve: solve,
    // geometry / helpers
    distance: distance, distanceMatrix: distanceMatrix, coverageMatrix: coverageMatrix,
    nCk: nCk, forEachCombination: forEachCombination, rng: rng,
    // MCLP
    mclpObjective: mclpObjective, greedyMCLP: greedyMCLP, localSearchMCLP: localSearchMCLP,
    exactMCLP: exactMCLP, naiveMCLP: naiveMCLP, ceilingMCLP: ceilingMCLP, mclpAssignment: mclpAssignment,
    // p-median
    pmedianAssign: pmedianAssign, greedyPmedian: greedyPmedian, swapPmedian: swapPmedian,
    exactPmedian: exactPmedian, naivePmedian: naivePmedian, ceilingPmedian: ceilingPmedian
  };
}));
