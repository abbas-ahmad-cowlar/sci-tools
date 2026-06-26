/* =============================================================================
 * FITBENCH — linalg.js
 * Minimal dense linear algebra: Gaussian elimination with partial pivoting for
 * solving systems and inverting small matrices. Used for the normal equations
 * of linear fits and for the covariance matrix (JᵀJ)⁻¹ of nonlinear fits.
 * Matrices are arrays-of-arrays (row-major); vectors are plain arrays.
 * ===========================================================================*/
(function (FB) {
  'use strict';

  function zeros(r, c) {
    const m = new Array(r);
    for (let i = 0; i < r; i++) m[i] = new Array(c).fill(0);
    return m;
  }

  function identity(n) {
    const m = zeros(n, n);
    for (let i = 0; i < n; i++) m[i][i] = 1;
    return m;
  }

  // Solve A x = b (A is n×n). Returns x, or null if (near-)singular.
  function solve(A, b) {
    const n = A.length;
    // augmented copy
    const M = new Array(n);
    for (let i = 0; i < n; i++) M[i] = A[i].slice().concat(b[i]);

    for (let col = 0; col < n; col++) {
      // partial pivot
      let piv = col, best = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > best) { best = v; piv = r; }
      }
      if (best < 1e-14) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }

      const pv = M[col][col];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / pv;
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n);
    for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
    return x;
  }

  // Invert an n×n matrix via Gauss-Jordan. Returns null if singular.
  function invert(A) {
    const n = A.length;
    const M = new Array(n);
    for (let i = 0; i < n; i++) M[i] = A[i].slice().concat(identity(n)[i]);

    for (let col = 0; col < n; col++) {
      let piv = col, best = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > best) { best = v; piv = r; }
      }
      if (best < 1e-14) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }

      const pv = M[col][col];
      for (let c = 0; c < 2 * n; c++) M[col][c] /= pv;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (f === 0) continue;
        for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const inv = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inv[i][j] = M[i][n + j];
    return inv;
  }

  FB.linalg = { zeros, identity, solve, invert };
})(window.FB = window.FB || {});
