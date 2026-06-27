# Facility Location

An offline **facility-siting playground**. Drop demand points and candidate sites on a field,
pick an objective, and solve it, then see, in one number, **how much optimizing actually
buys you** versus a naive policy. Built to make a real operations-research problem tangible,
not to draw pretty dots.

Open `index.html`, no build, no dependencies, no network. Part of the
[Sci-Tools](../../) suite.

## The two problems

| Problem | You choose | It optimizes |
|---|---|---|
| **MCLP** (Maximum Covering Location) | *k* facilities, coverage radius *R* | **maximize** the demand weight within *R* of an open facility |
| **p-median** | *k* facilities | **minimize** the demand-weighted distance to the nearest open facility |

## How it solves, and how it's honest about it

- **Exact**: an exhaustive search over *every* C(*n*, *k*) selection runs whenever there are
  few enough combinations (≤ 200,000). When it runs, the result is **provably optimal**.
- **Heuristic**: otherwise, a **multi-start greedy + swap local search** (remove-one/add-one
  for MCLP; Teitz–Bart vertex substitution for p-median) reports the **best found**.
- **Optimality gap** is shown **only when the exact optimum was computed**: it tells you how
  close the fast heuristic got. It is never confused with…
- **Improvement vs a deterministic naive baseline**: a *separate* figure, always shown: for
  MCLP, the *k* sites with the highest individual coverage (ignores overlap); for p-median, the
  *k* sites nearest the demand centroid.
- **Build-everywhere** is reported purely as a **ceiling/bound** reference, never as the
  comparison baseline.

This mirrors how these problems are reported in real work, exact vs heuristic, optimality gap,
and the value of optimizing over a do-nothing policy.

## Use it

- **Place** demand / sites (toggle the tool), drag to **Move**, **Erase** to delete
  (or right-click). Set a demand **weight** before placing.
- Pick **MCLP** or **p-median**, set **k** (and **R** for MCLP), choose Euclidean or Manhattan
  distance, and press **Solve**.
- **Presets** (city cluster, uniform grid, corridors, random) give you an instant instance.
- **Export JSON** saves the instance and the solution.

## Layout

```
index.html        markup + dark "lab instrument" theme
styles.css        the look
src/fl-core.js    DOM-free solver core (MCLP + p-median: greedy, swap LS, exact) , Node-testable
src/app.js        canvas rendering, input, controls, metrics, presets, JSON export
test/core.test.js golden + property tests:  node test/core.test.js
```

The solver core is pure logic and is exercised headless:

```bash
node test/core.test.js     # golden optima + naive ≤ heuristic ≤ exact ordering, etc.
```

## Notes & limits

- Coordinates are an **abstract plane** (normalized field), not geographic, distances are
  Euclidean/Manhattan on that plane, not road networks.
- v1 covers **MCLP** and **p-median**. Capacities / fixed costs (CFLP) and set-cover are natural
  next steps.

*The siting problems behind my MCLP optimization framework, CFLP substation siting, and
gas-detector-placement work, made interactive.*
