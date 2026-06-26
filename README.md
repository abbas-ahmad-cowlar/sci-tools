# Sci-Tools — offline calculators for the lab

A small suite of **offline, zero-dependency science &amp; engineering calculators** that run
entirely in your browser. No install, no build step, no network calls — open them and use them.
Nothing you type ever leaves your machine.

Built by **Syed Abbas Ahmad** — physicist &amp; ML engineer.

🔗 **Live:** https://abbas-ahmad-cowlar.github.io/sci-tools/

---

## The tools

| | Tool | What it does |
|---|---|---|
| **bitforge** | register &amp; bitfield workbench | 64-bit-exact (BigInt) bit math, named bitfields, IEEE-754 half/single/double, copy-ready C macros. |
| **propagate** | uncertainty &amp; error budget | Propagate ±1σ uncertainties through a formula and rank which input dominates the error. *57/57 engine tests pass.* |
| **photonbench** | photonics &amp; units workbench | Spectral converter (λ ↔ ν ↔ E ↔ ν̃), a real dimensional-analysis evaluator, dB power math, CODATA 2018 constants. |
| **fitbench** | least-squares curve fitting | Paste data → fitted parameters **with uncertainties**, goodness-of-fit, residual plot, and runnable SciPy export. |
| **regex-lab** | regex tester &amp; explainer | Live matching, a plain-English explanation, and an SVG railroad diagram of any pattern. |

## The demos

Three interactive physics simulations — the numerical methods behind my paid work, made
clickable:

| Demo | Method | Tied to |
|---|---|---|
| **Optimizer Arena** | PSO · DE · SA · GA on Rastrigin/Ackley/Schwefel | surrogate-assisted CMA-ES / BBOB benchmark &amp; facility-location optimization |
| **Soliton Lab** | split-step Fourier solver of the NLSE | nonlinear fiber-optics &amp; pulse propagation |
| **Quantum Optics** | Wigner phase-space functions of light | quantum-states-of-light simulation |

---

## Running it

Everything is static HTML/CSS/JS. Two ways to use it:

- **Open in a browser.** Each tool/demo works straight from `file://` — open
  `tools/<name>/index.html` (or `demos/<name>/index.html`) and go.
- **Serve the folder** (only if your browser is fussy about `file://`):

  ```bash
  cd sci-tools
  python -m http.server 8000   # then visit http://localhost:8000
  ```

The landing page (`index.html`) links to every tool and demo.

## Layout

```
sci-tools/
├── index.html            # the suite landing page
├── assets/site.css       # shared design system
├── tools/
│   ├── bitforge/         # register & bitfield workbench
│   ├── propagate/        # uncertainty propagation  (node test/engine.test.js)
│   ├── photonbench/      # photonics & units workbench
│   ├── fitbench/         # least-squares curve fitting
│   └── regex-lab/        # regex tester & explainer
└── demos/
    ├── optimizer/        # metaheuristics arena
    ├── soliton/          # nonlinear Schrödinger (split-step Fourier)
    └── wigner/           # Wigner functions of light
```

Each tool has its own `README.md` with the details and conventions.

## License

[MIT](LICENSE) © 2026 Abbas Ahmad. Fork it, change a constant, break something.
