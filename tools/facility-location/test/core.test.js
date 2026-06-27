/* =============================================================================
 * Facility-Location Playground — core.test.js
 * Golden cases (hand-computed optima) + property tests over random instances.
 * Zero dependencies:  node test/core.test.js
 * ===========================================================================*/
'use strict';
var FL = require('../src/fl-core.js');

var passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }
function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }

// ---- independent re-implementations (to validate the core, not echo it) -----
function euclid(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function mclpObj(sel, demand, sites, w, R) {
  var tot = 0;
  for (var i = 0; i < demand.length; i++) {
    for (var s = 0; s < sel.length; s++) { if (euclid(demand[i], sites[sel[s]]) <= R) { tot += w[i]; break; } }
  }
  return tot;
}
function pmedObj(sel, demand, sites, w) {
  var tot = 0;
  for (var i = 0; i < demand.length; i++) {
    var best = Infinity;
    for (var s = 0; s < sel.length; s++) best = Math.min(best, euclid(demand[i], sites[sel[s]]));
    tot += w[i] * best;
  }
  return tot;
}

// =========================================================== golden: MCLP =====
(function () {
  var demand = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
  var sites = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 5, y: 5 }];
  var w = [1, 1, 1, 1];

  // R=7.5, k=1: only the centre (idx 4, dist 7.07 to every corner) covers all four.
  var r1 = FL.solve({ demand: demand, sites: sites }, { problem: 'mclp', k: 1, R: 7.5 });
  ok(r1.optimal === true, 'MCLP golden: exact ran (small instance)');
  ok(approx(r1.objective, 4), 'MCLP golden k=1 R=7.5: optimum covers all 4 (got ' + r1.objective + ')');
  ok(r1.selected.length === 1 && r1.selected[0] === 4, 'MCLP golden k=1: picks the centre site');
  ok(approx(r1.ceiling, 4), 'MCLP golden: build-everywhere ceiling = 4');

  // R=5, k=2: corners only cover themselves; centre covers none → best = 2.
  var r2 = FL.solve({ demand: demand, sites: sites }, { problem: 'mclp', k: 2, R: 5 });
  ok(approx(r2.objective, 2), 'MCLP golden k=2 R=5: optimum = 2 (got ' + r2.objective + ')');
  ok(approx(r2.ceiling, 4), 'MCLP golden R=5: ceiling (all sites) = 4');

  // weighted: heavy demand should be preferred when only one can be covered
  var dW = [{ x: 0, y: 0, w: 5 }, { x: 100, y: 0, w: 1 }];
  var sW = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  var rW = FL.solve({ demand: dW, sites: sW }, { problem: 'mclp', k: 1, R: 1 });
  ok(approx(rW.objective, 5) && rW.selected[0] === 0, 'MCLP golden weighted: covers the weight-5 point');
})();

// ======================================================== golden: p-median ====
(function () {
  var demand = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
  var sites = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 5, y: 5 }];

  // k=1: centre minimises total distance (4 × 7.0711 = 28.284) vs any corner (34.14).
  var r1 = FL.solve({ demand: demand, sites: sites }, { problem: 'pmedian', k: 1 });
  ok(r1.optimal === true, 'p-median golden: exact ran');
  ok(r1.selected.length === 1 && r1.selected[0] === 4, 'p-median golden k=1: picks the centre');
  ok(approx(r1.objective, 4 * Math.SQRT2 * 5, 1e-6), 'p-median golden k=1: objective = 28.284 (got ' + r1.objective.toFixed(4) + ')');

  // k=2: two opposite corners give 0 for two points and 10 for the other two → 20; better than centre-based.
  var r2 = FL.solve({ demand: demand, sites: sites }, { problem: 'pmedian', k: 2 });
  ok(r2.objective <= 20 + 1e-9, 'p-median golden k=2: optimum ≤ 20 (got ' + r2.objective.toFixed(4) + ')');

  // demand exactly on a site → zero distance achievable
  var r0 = FL.solve({ demand: [{ x: 3, y: 4 }], sites: [{ x: 3, y: 4 }, { x: 0, y: 0 }] }, { problem: 'pmedian', k: 1 });
  ok(approx(r0.objective, 0) && r0.selected[0] === 0, 'p-median golden: demand on a site → objective 0');
})();

// ===================================================== property tests =========
(function () {
  var rand = FL.rng(20260627);
  var trials = 200;
  for (var t = 0; t < trials; t++) {
    var n = 4 + Math.floor(rand() * 5);   // 4..8 demand
    var m = 4 + Math.floor(rand() * 4);   // 4..7 sites
    var k = 1 + Math.floor(rand() * Math.min(3, m)); // 1..3
    var demand = [], sites = [], w = [];
    for (var i = 0; i < n; i++) { demand.push({ x: rand() * 100, y: rand() * 100, w: 1 + Math.floor(rand() * 5) }); w.push(demand[i].w); }
    for (var j = 0; j < m; j++) sites.push({ x: rand() * 100, y: rand() * 100 });
    var R = 20 + rand() * 40;

    // --- MCLP ---
    var rm = FL.solve({ demand: demand, sites: sites }, { problem: 'mclp', k: k, R: R, seed: t + 1 });
    if (rm.optimal) {
      // independent recompute of the optimum's objective
      ok(approx(mclpObj(rm.selected, demand, sites, w, R), rm.objective, 1e-6), 'MCLP[' + t + ']: objective recomputes');
      // ordering: naive ≤ heuristic ≤ exact
      ok(rm.baseline.objective <= rm.heuristic.objective + 1e-9, 'MCLP[' + t + ']: naive ≤ heuristic');
      ok(rm.heuristic.objective <= rm.objective + 1e-9, 'MCLP[' + t + ']: heuristic ≤ exact');
      ok(rm.optimalityGapPct >= -1e-9, 'MCLP[' + t + ']: gap ≥ 0');
      ok(rm.objective <= rm.ceiling + 1e-9, 'MCLP[' + t + ']: optimum ≤ ceiling');
    }
    // LS never worse than greedy
    var cov = FL.coverageMatrix(FL.distanceMatrix(demand, sites, 'euclidean'), R);
    var gM = FL.mclpObjective(FL.greedyMCLP(cov, w, k), cov, w);
    var lsM = FL.localSearchMCLP(cov, w, k, { seed: t + 1 }).objective;
    ok(lsM >= gM - 1e-9, 'MCLP[' + t + ']: local search ≥ greedy');

    // --- p-median ---
    var rp = FL.solve({ demand: demand, sites: sites }, { problem: 'pmedian', k: k, seed: t + 1 });
    if (rp.optimal) {
      ok(approx(pmedObj(rp.selected, demand, sites, w), rp.objective, 1e-6), 'pmed[' + t + ']: objective recomputes');
      // ordering: naive ≥ heuristic ≥ exact
      ok(rp.baseline.objective >= rp.heuristic.objective - 1e-9, 'pmed[' + t + ']: naive ≥ heuristic');
      ok(rp.heuristic.objective >= rp.objective - 1e-9, 'pmed[' + t + ']: heuristic ≥ exact');
      ok(rp.optimalityGapPct >= -1e-9, 'pmed[' + t + ']: gap ≥ 0');
      ok(rp.objective >= rp.ceiling - 1e-9, 'pmed[' + t + ']: optimum ≥ all-open ceiling/bound');
      // assignment is truly nearest among selected
      var good = true;
      for (var ii = 0; ii < demand.length; ii++) {
        var amin = Infinity;
        for (var ss = 0; ss < rp.selected.length; ss++) amin = Math.min(amin, euclid(demand[ii], sites[rp.selected[ss]]));
        if (!approx(euclid(demand[ii], sites[rp.assignment[ii]]), amin, 1e-9)) good = false;
      }
      ok(good, 'pmed[' + t + ']: assignment is nearest-open');
    }
    var D = FL.distanceMatrix(demand, sites, 'euclidean');
    var gP = FL.pmedianAssign(FL.greedyPmedian(D, w, k), D, w).objective;
    var swP = FL.swapPmedian(D, w, k, { seed: t + 1 }).objective;
    ok(swP <= gP + 1e-9, 'pmed[' + t + ']: swap ≤ greedy');
  }
})();

// ===================================================== combinatorics ==========
(function () {
  ok(FL.nCk(7, 3) === 35, 'nCk(7,3) = 35');
  ok(FL.nCk(10, 0) === 1 && FL.nCk(5, 5) === 1, 'nCk edge cases');
  var count = 0; FL.forEachCombination(6, 3, function () { count++; });
  ok(count === FL.nCk(6, 3), 'forEachCombination enumerates C(6,3)=' + FL.nCk(6, 3) + ' (got ' + count + ')');
})();

// ----------------------------------------------------------------- summary ----
console.log('\nFacility-Location core tests: ' + passed + ' passed, ' + failed + ' failed.');
if (failed === 0) console.log('✓ MCLP & p-median solvers, baselines, ceilings and gaps all correct.');
process.exit(failed === 0 ? 0 : 1);
