/* =============================================================================
 * FITBENCH, fit.js
 * The numerical core: data statistics, linear least squares (normal equations),
 * Levenberg–Marquardt nonlinear least squares with a numeric Jacobian, and a
 * small, safe recursive-descent parser that turns a custom formula string into
 * a function plus its auto-detected parameter list.
 *
 * Parameter uncertainties follow SciPy's curve_fit default (absolute_sigma=
 * False): cov = (JᵀWJ)⁻¹ · χ²/(n−m), so standard errors are meaningful whether
 * or not the user supplied y-errors.
 * ===========================================================================*/
(function (FB) {
  'use strict';

  const linalg = FB.linalg;

  // ---- data statistics -----------------------------------------------------
  function dataStats(xs, ys) {
    const n = xs.length;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, sy = 0;
    let xAtYmax = xs[0], xAtYmin = xs[0];
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) { ymin = y; xAtYmin = x; }
      if (y > ymax) { ymax = y; xAtYmax = x; }
      sy += y;
    }
    return {
      n, xmin, xmax, xspan: xmax - xmin, xmid: (xmin + xmax) / 2,
      ymin, ymax, yspan: ymax - ymin, ymean: sy / n,
      xAtYmax, xAtYmin, yFirst: ys[0], yLast: ys[n - 1],
    };
  }

  // ---- goodness-of-fit metrics --------------------------------------------
  function metrics(xs, ys, predict, m, weights) {
    const n = xs.length;
    let rss = 0, sstot = 0, chi2 = 0, sy = 0;
    for (let i = 0; i < n; i++) sy += ys[i];
    const ymean = sy / n;
    for (let i = 0; i < n; i++) {
      const f = predict(xs[i]);
      const r = ys[i] - f;
      rss += r * r;
      sstot += (ys[i] - ymean) * (ys[i] - ymean);
      chi2 += (weights ? weights[i] : 1) * r * r;
    }
    const dof = n - m;
    const r2 = sstot > 0 ? 1 - rss / sstot : 1;
    return {
      n, dof, rss, r2,
      adjR2: dof > 0 ? 1 - (1 - r2) * (n - 1) / dof : NaN,
      rmse: Math.sqrt(rss / n),
      chi2, chi2red: dof > 0 ? chi2 / dof : NaN,
    };
  }

  // ---- linear least squares (linear-in-parameters models) ------------------
  function fitLinear(basisOf, xs, ys, weights) {
    const n = xs.length;
    const p = basisOf(xs[0]).length;
    const A = linalg.zeros(p, p);
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const b = basisOf(xs[i]);
      const w = weights ? weights[i] : 1;
      for (let j = 0; j < p; j++) {
        g[j] += w * b[j] * ys[i];
        for (let k = 0; k < p; k++) A[j][k] += w * b[j] * b[k];
      }
    }

    // Jacobi (diagonal) preconditioning: solve the column-scaled system
    // (DAD) y = D g with D = diag(1/√Aⱼⱼ), then recover β = D y. This is
    // mathematically identical to solving A β = g, but sharply lowers the
    // condition number of high-degree polynomial (Vandermonde) systems, so
    // the coefficients and their errors stay trustworthy at higher degree.
    const d = new Array(p);
    for (let j = 0; j < p; j++) d[j] = A[j][j] > 0 ? 1 / Math.sqrt(A[j][j]) : 1;
    const As = linalg.zeros(p, p);
    const gs = new Array(p);
    for (let j = 0; j < p; j++) {
      gs[j] = g[j] * d[j];
      for (let k = 0; k < p; k++) As[j][k] = A[j][k] * d[j] * d[k];
    }
    const y = linalg.solve(As, gs);
    if (!y) return { ok: false, message: 'Singular system, try a lower degree or more data.' };
    const beta = new Array(p);
    for (let j = 0; j < p; j++) beta[j] = y[j] * d[j];

    const predict = (x) => { const b = basisOf(x); let s = 0; for (let j = 0; j < p; j++) s += beta[j] * b[j]; return s; };
    const met = metrics(xs, ys, predict, p, weights);
    const invAs = linalg.invert(As);            // cov = D · inv(As) · D
    const errors = new Array(p).fill(NaN);
    if (invAs) {
      const scale = met.dof > 0 ? met.chi2 / met.dof : 1;
      for (let j = 0; j < p; j++) errors[j] = Math.sqrt(Math.max(0, invAs[j][j] * d[j] * d[j] * scale));
    }
    return { ok: true, params: beta, errors, predict, metrics: met, iterations: 1, converged: true };
  }

  // ---- Levenberg–Marquardt nonlinear least squares -------------------------
  function fitLM(f, p0, xs, ys, weights, opts) {
    opts = opts || {};
    const maxIter = opts.maxIter || 300;
    const tol = opts.tol || 1e-10;
    const n = xs.length, m = p0.length;
    let p = p0.slice();

    const cost = (pp) => {
      let c = 0;
      for (let i = 0; i < n; i++) {
        const r = ys[i] - f(pp, xs[i]);
        if (!isFinite(r)) return Infinity;
        c += (weights ? weights[i] : 1) * r * r;
      }
      return c;
    };

    let curCost = cost(p);
    if (!isFinite(curCost)) return { ok: false, message: 'Initial guess gives non-finite values, check the model fits the data range.' };

    let lambda = 1e-3;
    let iter = 0, converged = false;
    const A = linalg.zeros(m, m);
    const g = new Array(m);

    for (; iter < maxIter; iter++) {
      // numeric Jacobian (central differences) + normal equations JᵀWJ, JᵀWr
      for (let j = 0; j < m; j++) { g[j] = 0; for (let k = 0; k < m; k++) A[j][k] = 0; }
      const fp = new Array(n);
      for (let i = 0; i < n; i++) fp[i] = f(p, xs[i]);
      const jac = new Array(m);
      for (let j = 0; j < m; j++) {
        const dp = Math.max(1e-8, 1e-7 * Math.abs(p[j]));
        const pa = p.slice(); pa[j] += dp;
        const pb = p.slice(); pb[j] -= dp;
        const col = new Array(n);
        for (let i = 0; i < n; i++) col[i] = (f(pa, xs[i]) - f(pb, xs[i])) / (2 * dp);
        jac[j] = col;
      }
      for (let i = 0; i < n; i++) {
        const w = weights ? weights[i] : 1;
        const r = ys[i] - fp[i];
        for (let j = 0; j < m; j++) {
          g[j] += w * jac[j][i] * r;
          for (let k = j; k < m; k++) A[j][k] += w * jac[j][i] * jac[k][i];
        }
      }
      for (let j = 0; j < m; j++) for (let k = 0; k < j; k++) A[j][k] = A[k][j];

      // try damped steps, growing lambda until one improves the cost
      let stepped = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const Aug = linalg.zeros(m, m);
        for (let j = 0; j < m; j++) for (let k = 0; k < m; k++) Aug[j][k] = A[j][k];
        for (let j = 0; j < m; j++) Aug[j][j] = A[j][j] * (1 + lambda) + 1e-12;
        const delta = linalg.solve(Aug, g);
        if (delta) {
          const pn = new Array(m);
          for (let j = 0; j < m; j++) pn[j] = p[j] + delta[j];
          const nc = cost(pn);
          if (nc < curCost) {
            const rel = (curCost - nc) / (curCost || 1);
            p = pn; curCost = nc;
            lambda = Math.max(lambda * 0.4, 1e-12);
            stepped = true;
            if (rel < tol) converged = true;
            break;
          }
        }
        lambda = Math.min(lambda * 4, 1e12);
      }
      if (converged) break;
      if (!stepped) break; // can't improve further
    }

    const predict = (x) => f(p, x);
    const met = metrics(xs, ys, predict, m, weights);
    // covariance from the final JᵀWJ
    const inv = linalg.invert(A);
    const errors = new Array(m).fill(NaN);
    if (inv) {
      const scale = met.dof > 0 ? met.chi2 / met.dof : 1;
      for (let j = 0; j < m; j++) errors[j] = Math.sqrt(Math.max(0, inv[j][j] * scale));
    }
    return { ok: true, params: p, errors, predict, metrics: met, iterations: iter + 1, converged };
  }

  // ===========================================================================
  // custom formula parser , turns "a*exp(-b*x)+c" into {fn, params:['a','b','c']}
  // ===========================================================================
  const FN = {
    exp: Math.exp, ln: Math.log, log: Math.log,
    log10: Math.log10 || ((v) => Math.log(v) / Math.LN10),
    log2: Math.log2 || ((v) => Math.log(v) / Math.LN2),
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    pow: Math.pow, min: Math.min, max: Math.max,
    erf: erf, gauss: (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s)),
  };
  const CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

  function erf(x) {
    // Abramowitz & Stegun 7.1.26
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  function parseFormula(src) {
    const tokens = tokenize(src);
    let pos = 0;
    const params = [];
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    function emitExpr() {
      let s = emitTerm();
      while (peek() && (peek().v === '+' || peek().v === '-')) { const op = next().v; s = '(' + s + op + emitTerm() + ')'; }
      return s;
    }
    function emitTerm() {
      let s = emitPow();
      while (peek() && (peek().v === '*' || peek().v === '/')) { const op = next().v; s = '(' + s + op + emitPow() + ')'; }
      return s;
    }
    function emitPow() {
      const base = emitUnary();
      if (peek() && peek().v === '^') { next(); return 'Math.pow(' + base + ',' + emitPow() + ')'; }
      return base;
    }
    function emitUnary() {
      if (peek() && (peek().v === '-' || peek().v === '+')) { const op = next().v; return '(' + op + emitUnary() + ')'; }
      return emitPrimary();
    }
    function emitPrimary() {
      const t = next();
      if (!t) throw new Error('Unexpected end of formula');
      if (t.t === 'num') return t.v;
      if (t.t === 'op' && t.v === '(') { const s = emitExpr(); const c = next(); if (!c || c.v !== ')') throw new Error('Missing )'); return '(' + s + ')'; }
      if (t.t === 'id') {
        if (peek() && peek().v === '(') {
          next();
          if (!FN[t.v]) throw new Error('Unknown function "' + t.v + '"');
          const args = [emitExpr()];
          while (peek() && peek().v === ',') { next(); args.push(emitExpr()); }
          const c = next(); if (!c || c.v !== ')') throw new Error('Missing )');
          return 'FN.' + t.v + '(' + args.join(',') + ')';
        }
        if (t.v === 'x') return 'x';
        if (CONST[t.v] !== undefined) return 'C.' + t.v;
        if (!params.includes(t.v)) params.push(t.v);
        return 'p[' + params.indexOf(t.v) + ']';
      }
      throw new Error('Unexpected "' + t.v + '"');
    }

    const js = emitExpr();
    if (pos < tokens.length) throw new Error('Unexpected "' + tokens[pos].v + '"');
    if (!params.length) throw new Error('No parameters found, use single letters (other than x) like a, b, c.');
    const raw = new Function('p', 'x', 'FN', 'C', 'return (' + js + ');');
    const fn = (p, x) => raw(p, x, FN, CONST);
    return { fn, params, js };
  }

  function tokenize(src) {
    const out = [];
    let i = 0;
    const isDigit = (c) => c >= '0' && c <= '9';
    const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i + 1;
        while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
        if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < src.length && isDigit(src[j])) j++; }
        out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
      }
      if (isAlpha(c)) {
        let j = i + 1;
        while (j < src.length && (isAlpha(src[j]) || isDigit(src[j]))) j++;
        out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('Unexpected character "' + c + '"');
    }
    return out;
  }

  FB.fit = { dataStats, fitLinear, fitLM, parseFormula, metrics };
})(window.FB = window.FB || {});
