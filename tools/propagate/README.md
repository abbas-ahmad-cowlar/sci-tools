<div align="center">

# σ Propagate

### Uncertainty propagation & error budget — in one offline page

Type a formula and your measured values with their **±1σ** uncertainties.
Propagate gives you the result with its propagated uncertainty **and** an
*error budget* showing which measurement dominates — so you know what to
measure better next time.

No install, no network, no dependencies. **Open `index.html`.**

</div>

---

## Why

Every experimentalist does this calculation constantly and usually by hand or
in a throwaway script: "I measured I = 0.50 ± 0.01 A and R = 100 ± 2 Ω, so what
is P = I²R, and what's its uncertainty?" Propagate answers that — and then tells
you the part people usually skip: **of the final error, how much comes from each
input?** For P = I²R it's *80% from the current, 20% from the resistance* — so
buy a better ammeter, not a better ohmmeter.

That ranking is the **error budget**, and it's the whole point.

---

## What it does

- **Safe expression evaluator** — a real parser (no `eval`), with the operator
  precedence a scientist expects: `-2^2 = -4`, `2^3^2 = 512`, `2^-2 = 0.25`.
- **First-order propagation**, assuming independent inputs:

  ```
  σ_f = √( Σ (∂f/∂xᵢ · σᵢ)² )
  ```

  Partial slopes are computed numerically with a **symmetric difference at ±σ**
  — exact for linear and quadratic forms, accurate otherwise, and free of
  symbolic-differentiation fragility.
- **Error budget** — each input's share of the total variance, ranked, with a
  bar that turns red as a term comes to dominate, plus its local slope ∂f/∂xᵢ
  and absolute contribution.
- **Metrology-style formatting** — uncertainty to 1–3 sig figs (your choice),
  value rounded to match, automatic scientific notation:
  `(3.138 ± 0.005)×10⁻¹⁹`.
- **Physical constants that don't bite you** — `c, h, hbar, kB, NA, qe, eps0,
  mu0, me, g` appear as **editable, pre-filled rows**. So a *measured* local `g`
  can carry its own uncertainty instead of being silently overwritten by 9.80665
  — a trap most calculators fall into. Math constants `pi, tau` are built in.
- **Worked examples** — resistor power, density, kinetic energy, thin lens,
  pendulum period, photon energy `hc/λ`, Snell's law, Gaussian beam waist.

Everything recomputes live as you type. **Copy** exports a clean text report.

---

## Examples of the kind of question it answers

| Expression | You learn |
|---|---|
| `I^2 * R` | Power and which meter limits your precision |
| `h*c / lam` | Photon energy from a wavelength measurement |
| `2*pi*sqrt(L/g)` | Pendulum period — and whether length or g matters more |
| `(u*v)/(u+v)` | Thin-lens focal length from two distances |
| `lam / (pi*na)` | Diffraction-limited beam waist |

---

## Running it

Double-click **`index.html`**. It is three files (`index.html`, `propagate.js`,
`app.js`), all loaded as plain `<script>` tags, so it runs straight from
`file://` with no server and no build step. Nothing leaves your machine.

---

## Under the hood

```
propagate/
├── index.html       # UI (inline CSS)
├── propagate.js     # engine: tokenizer → parser → evaluator → propagation → formatting
├── app.js           # DOM wiring: live table, result, error-budget bars
└── test/
    └── engine.test.js   # 57 assertions: parser, evaluator, propagation vs. analytic, formatting
```

`propagate.js` is written to load both as a browser `<script>` (exposing
`window.Propagate`) and as a Node module (`module.exports`), so the math is
unit-tested directly:

```bash
node test/engine.test.js
```

The propagation is checked against closed forms — e.g. for a product the test
asserts `σ = √((y·σx)² + (x·σy)²)` exactly, and for nonlinear cases (`x/y`,
`exp x`) it agrees with the analytic first-order result to within 1%.

---

## The method, honestly stated

This is **first-order** propagation and assumes the inputs are **independent**
(no covariance) and that `f` is smooth near the operating point — the standard
assumptions of the GUM "law of propagation of uncertainty." For strongly
nonlinear functions near a stationary point, or correlated inputs, a Monte-Carlo
treatment is the right tool. For the overwhelming majority of lab calculations,
this is exactly what you want, and the error budget is what makes it actionable.

<div align="center">

*A small, sharp tool. Built to be useful at 2 a.m. in a lab.* σ

</div>
