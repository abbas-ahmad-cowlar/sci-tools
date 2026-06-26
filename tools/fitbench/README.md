# FitBench

A least-squares **curve-fitting workbench** that runs entirely in your browser.
Paste two columns of numbers, pick a model, and get fitted parameters **with
uncertainties**, goodness-of-fit statistics, a residual plot, and ready-to-run
SciPy code. No install, no build step, no internet, nothing uploaded anywhere.

Built for the everyday lab task of pulling numbers out of data — fluorescence
lifetimes, spectral peak centres and widths, calibration slopes, dose-response
curves.

## Run it

- **Double-click `index.html`** (works straight from the filesystem), or
- serve the folder: `python -m http.server` and open the printed URL.

It opens on a worked example (a noisy Gaussian emission peak) so you can see the
whole flow immediately.

## What it does

- **Models**
  - Linear and **Polynomial** (degree 1–10) — solved directly by linear least squares.
  - **Gaussian** and **Lorentzian** peaks (single and **two-peak**).
  - **Exponential decay** `a·e^(−x/τ)+c` and general `a·e^(b·x)+c`.
  - **Power law**, **Logistic/sigmoid**, **Sine**.
  - **Custom formula** — type any `f(x)` (e.g. `a*exp(-b*x)*cos(c*x)+d`); the
    parameters are detected automatically. Functions available: `exp, ln, log,
    log10, sin, cos, tan, sqrt, abs, erf, gauss(x,μ,σ)`, etc.
- **Parameter uncertainties** — standard errors from the covariance matrix
  (`(JᵀWJ)⁻¹·χ²/dof`, matching SciPy's `curve_fit` default), plus relative error.
- **Goodness of fit** — R², adjusted R², RMSE, residual sum of squares, and (when
  you provide y-errors) χ² and reduced χ².
- **Weighted fits** — add a third column of y-errors and they're used as weights.
- **Plot** — data with error bars, the fitted curve, and a shared-axis residuals
  strip. Log-x / log-y toggles.
- **Export** — copy the parameters, copy a runnable **NumPy + SciPy** snippet that
  reproduces the fit, download the fitted curve as **CSV**, or save the plot as
  **PNG**.

## Data format

```
# any header lines starting with # are ignored
532.0   4.18
533.5   4.96      0.2     <- optional third column = y error
535.0   5.51      0.2
```

Columns are split on spaces, commas, tabs or semicolons. `Ctrl/Cmd+Enter` in the
data box runs the fit; you can also load a `.csv`/`.txt`/`.dat` file.

## How the fitting works

- **Linear-in-parameter models** (Linear, Polynomial) are solved exactly via the
  normal equations `(XᵀWX)β = XᵀWy` with Gaussian elimination.
- **Everything else** is fit by **Levenberg–Marquardt**: a numeric (central-
  difference) Jacobian feeds the damped normal equations
  `(JᵀWJ + λ·diag) δ = JᵀWr`, with λ adapted up/down as steps are rejected/accepted.
  Starting values are estimated from the data (peak position from the maximum,
  decay scale from the data range, baseline from the minimum, …).
- Standard errors come from the inverse of `JᵀWJ` at the solution, scaled by the
  reduced χ².

It's validated against known inputs: feeding clean data from each model back in
recovers the generating parameters to machine precision (R² = 1).

```
index.html       layout + script order
styles.css       light "graph-paper" theme
src/linalg.js    dense solve / invert (Gaussian elimination)
src/models.js    model library: eval, initial-guess heuristics, formula + Python
src/fit.js       data stats, linear LSQ, Levenberg–Marquardt, custom-formula parser
src/plot.js      data + fit + residuals plotter (log axes, error bars)
src/app.js       parsing, fit orchestration, results, exports, examples
```

Zero dependencies. Fork it and add your own model in `models.js`.
