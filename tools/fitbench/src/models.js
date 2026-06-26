/* =============================================================================
 * FITBENCH — models.js
 * The library of fittable models. Each entry knows how to evaluate itself, how
 * to guess sensible starting parameters from the data, and how to render itself
 * as a formula and as a Python/SciPy snippet.
 *
 * `linear: true` models are linear in their parameters (Linear, Polynomial) and
 * are solved directly by least squares via a basis(); everything else is fit by
 * Levenberg–Marquardt and needs a guess().
 *
 * guess() receives a stats object describing the data:
 *   { n, xmin, xmax, xspan, xmid, ymin, ymax, yspan, ymean,
 *     xAtYmax, xAtYmin, yFirst, yLast }
 * ===========================================================================*/
(function (FB) {
  'use strict';

  const exp = Math.exp, PI = Math.PI;

  const MODELS = {
    linear: {
      name: 'Linear',
      linear: true,
      paramNames: () => ['a', 'b'],
      basis: (x) => [x, 1],
      formula: 'y = a·x + b',
      py: () => 'a*x + b',
    },

    poly: {
      name: 'Polynomial',
      linear: true,
      hasDegree: true,
      paramNames: (deg) => Array.from({ length: deg + 1 }, (_, k) => 'c' + k),
      basis: (x, deg) => {
        const b = new Array(deg + 1);
        let xp = 1;
        for (let k = 0; k <= deg; k++) { b[k] = xp; xp *= x; }
        return b;
      },
      formula: 'y = c₀ + c₁x + c₂x² + …',
      py: (names) => names.map((c, k) => k === 0 ? c : `${c}*x**${k}`).join(' + '),
    },

    gaussian: {
      name: 'Gaussian peak',
      params: ['a', 'mu', 'sigma', 'c'],
      f: (p, x) => p[0] * exp(-((x - p[1]) * (x - p[1])) / (2 * p[2] * p[2])) + p[3],
      guess: (s) => [s.yspan || 1, s.xAtYmax, (s.xspan || 1) / 6 || 1, s.ymin],
      formula: 'y = a·exp(−(x−μ)² / 2σ²) + c',
      py: () => 'a*np.exp(-(x-mu)**2/(2*sigma**2)) + c',
      note: 'FWHM = 2.3548·σ',
    },

    lorentzian: {
      name: 'Lorentzian peak',
      params: ['a', 'mu', 'gamma', 'c'],
      f: (p, x) => p[0] * (p[2] * p[2]) / ((x - p[1]) * (x - p[1]) + p[2] * p[2]) + p[3],
      guess: (s) => [s.yspan || 1, s.xAtYmax, (s.xspan || 1) / 10 || 1, s.ymin],
      formula: 'y = a·γ² / ((x−μ)² + γ²) + c',
      py: () => 'a*gamma**2/((x-mu)**2 + gamma**2) + c',
      note: 'FWHM = 2·γ',
    },

    gaussian2: {
      name: 'Two Gaussians',
      params: ['a1', 'mu1', 's1', 'a2', 'mu2', 's2', 'c'],
      f: (p, x) =>
        p[0] * exp(-((x - p[1]) ** 2) / (2 * p[2] * p[2])) +
        p[3] * exp(-((x - p[4]) ** 2) / (2 * p[5] * p[5])) + p[6],
      guess: (s) => {
        const w = (s.xspan || 1) / 8 || 1;
        return [s.yspan || 1, s.xmin + (s.xspan) * 0.33, w,
                s.yspan || 1, s.xmin + (s.xspan) * 0.66, w, s.ymin];
      },
      formula: 'sum of two Gaussians + c',
      py: () => 'a1*np.exp(-(x-mu1)**2/(2*s1**2)) + a2*np.exp(-(x-mu2)**2/(2*s2**2)) + c',
    },

    expdecay: {
      name: 'Exponential decay',
      params: ['a', 'tau', 'c'],
      f: (p, x) => p[0] * exp(-x / p[1]) + p[2],
      guess: (s) => [s.yFirst - s.yLast || s.yspan || 1, (s.xspan || 1) / 3 || 1, s.yLast],
      formula: 'y = a·exp(−x/τ) + c',
      py: () => 'a*np.exp(-x/tau) + c',
      note: 'τ = lifetime / 1-e folding',
    },

    expgrow: {
      name: 'Exponential a·eᵇˣ+c',
      params: ['a', 'b', 'c'],
      f: (p, x) => p[0] * exp(p[1] * x) + p[2],
      guess: (s) => {
        const dir = s.yLast >= s.yFirst ? 1 : -1;
        return [(s.yFirst - s.ymin) || 1, dir / (s.xspan || 1), s.ymin];
      },
      formula: 'y = a·exp(b·x) + c',
      py: () => 'a*np.exp(b*x) + c',
    },

    power: {
      name: 'Power law',
      params: ['a', 'b', 'c'],
      f: (p, x) => p[0] * Math.pow(x, p[1]) + p[2],
      guess: (s) => [s.yspan || 1, 1, s.ymin],
      formula: 'y = a·xᵇ + c',
      py: () => 'a*x**b + c',
      note: 'needs x > 0',
    },

    logistic: {
      name: 'Logistic (sigmoid)',
      params: ['L', 'k', 'x0', 'c'],
      f: (p, x) => p[0] / (1 + exp(-p[1] * (x - p[2]))) + p[3],
      guess: (s) => [s.yspan || 1, 4 / (s.xspan || 1), s.xmid, s.ymin],
      formula: 'y = L / (1 + exp(−k(x−x₀))) + c',
      py: () => 'L/(1 + np.exp(-k*(x-x0))) + c',
    },

    sine: {
      name: 'Sine wave',
      params: ['a', 'f', 'phi', 'c'],
      f: (p, x) => p[0] * Math.sin(2 * PI * p[1] * x + p[2]) + p[3],
      guess: (s) => [(s.yspan || 1) / 2, 1 / (s.xspan || 1), 0, s.ymean],
      formula: 'y = a·sin(2π·f·x + φ) + c',
      py: () => 'a*np.sin(2*np.pi*f*x + phi) + c',
    },

    custom: {
      name: 'Custom formula…',
      custom: true,
      formula: 'type any f(x) with single-letter parameters',
    },
  };

  // ordered list for the dropdown
  const ORDER = ['linear', 'poly', 'gaussian', 'lorentzian', 'gaussian2',
                 'expdecay', 'expgrow', 'power', 'logistic', 'sine', 'custom'];

  FB.MODELS = MODELS;
  FB.MODEL_ORDER = ORDER;
})(window.FB = window.FB || {});
