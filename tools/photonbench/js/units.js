/* =========================================================================
   PhotonBench — units-aware expression evaluator with dimensional analysis.
   DOM-free so it can be unit-tested under Node. Attaches to window.PB.units.

   A quantity is { v: <SI value>, d: [m,kg,s,A,K,mol,cd] } (dimension vector).
   Supports + - * / ^, implicit multiplication ("5 nm", "h c / L"), parentheses,
   functions, physical constants, and "<expr> to <unit>" conversion.
   ========================================================================= */
(function () {
  "use strict";
  const PB = (typeof window !== "undefined" ? (window.PB = window.PB || {})
                                             : (global.PB = global.PB || {}));

  const DIMS = ["m", "kg", "s", "A", "K", "mol", "cd"];
  const Z = () => [0, 0, 0, 0, 0, 0, 0];
  const dadd = (a, b) => a.map((x, i) => x + b[i]);
  const dsub = (a, b) => a.map((x, i) => x - b[i]);
  const dscale = (a, k) => a.map((x) => x * k);
  const deq = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  const isZero = (a) => a.every((x) => Math.abs(x) < 1e-9);

  // base dimension vectors -------------------------------------------------
  const L = [1,0,0,0,0,0,0], M = [0,1,0,0,0,0,0], T = [0,0,1,0,0,0,0],
        I = [0,0,0,1,0,0,0], K = [0,0,0,0,1,0,0], MOL = [0,0,0,0,0,1,0],
        CD = [0,0,0,0,0,0,1];
  const FREQ = [0,0,-1,0,0,0,0];
  const FORCE = [1,1,-2,0,0,0,0];
  const ENERGY = [2,1,-2,0,0,0,0];
  const POWER = [2,1,-3,0,0,0,0];
  const PRESSURE = [-1,1,-2,0,0,0,0];
  const CHARGE = [0,0,1,1,0,0,0];
  const VOLT = [2,1,-3,-1,0,0,0];
  const RES = [2,1,-3,-2,0,0,0];
  const COND = [-2,-1,3,2,0,0,0];
  const CAP = [-2,-1,4,2,0,0,0];
  const IND = [2,1,-2,-2,0,0,0];
  const FLUX = [2,1,-2,-1,0,0,0];        // weber
  const BFIELD = [0,1,-2,-1,0,0,0];      // tesla
  const VEL = [1,0,-1,0,0,0,0];
  const ACC = [1,0,-2,0,0,0,0];
  const AREA = [2,0,0,0,0,0,0];
  const VOLUME = [3,0,0,0,0,0,0];

  // SI prefixes (case-sensitive) -------------------------------------------
  const PREFIX = {
    Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3,
    h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, "µ": 1e-6, "μ": 1e-6,
    n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24
  };

  const UNITS = {};
  function reg(names, v, d) {
    names.split(/\s+/).forEach((n) => { UNITS[n] = { v, d }; });
  }
  // register one or more names, applying the prefix family to the first (canonical) symbol
  function regP(names, v, d, prefixes) {
    const list = names.split(/\s+/);
    list.forEach((n) => { UNITS[n] = { v, d }; });
    const base = list[0];
    (prefixes || "Y Z E P T G M k m u µ n p f a").split(/\s+/).forEach((p) => {
      UNITS[p + base] = { v: v * PREFIX[p], d };
    });
  }

  // --- length ---
  regP("m", 1, L, "k c m u µ n p f");
  reg("km", 1e3, L); reg("cm", 1e-2, L);
  reg("angstrom Å ang", 1e-10, L);
  reg("inch", 0.0254, L); reg("ft", 0.3048, L); reg("mi mile", 1609.344, L);
  reg("um", 1e-6, L); reg("nm", 1e-9, L);   // explicit friendly aliases

  // --- mass (SI base is kg; gram carries the prefixes) ---
  regP("g", 1e-3, M, "k M m u µ n p");
  reg("t tonne", 1e3, M); reg("lb", 0.45359237, M);
  reg("amu u Da", 1.66053906660e-27, M);

  // --- time ---
  regP("s sec", 1, T, "m u µ n p f a");
  reg("min", 60, T); reg("hr hour", 3600, T); reg("day", 86400, T);
  reg("yr year", 3.15576e7, T);

  // --- current, temperature, amount, luminous ---
  regP("A amp", 1, I, "k m u µ n p");
  regP("K", 1, K, "m u µ n");
  regP("mol", 1, MOL, "k m u µ n");
  reg("cd", 1, CD);

  // --- angle (dimensionless) ---
  reg("rad", 1, Z()); reg("mrad", 1e-3, Z()); reg("urad µrad", 1e-6, Z());
  reg("deg °", Math.PI / 180, Z());
  reg("arcmin", Math.PI / 180 / 60, Z()); reg("arcsec", Math.PI / 180 / 3600, Z());
  reg("sr", 1, Z());

  // --- frequency ---
  regP("Hz", 1, FREQ, "k M G T P");

  // --- force, energy, power, pressure ---
  regP("N", 1, FORCE, "k M m u µ n p");
  regP("J", 1, ENERGY, "k M G m u µ n p f");
  reg("eV", 1.602176634e-19, ENERGY);
  reg("meV", 1.602176634e-22, ENERGY); reg("keV", 1.602176634e-16, ENERGY);
  reg("MeV", 1.602176634e-13, ENERGY); reg("GeV", 1.602176634e-10, ENERGY);
  reg("cal", 4.184, ENERGY); reg("kcal", 4184, ENERGY);
  reg("Wh", 3600, ENERGY); reg("kWh", 3.6e6, ENERGY); reg("erg", 1e-7, ENERGY);
  regP("W", 1, POWER, "k M G T m u µ n p f");
  regP("Pa", 1, PRESSURE, "k M G h");
  reg("bar", 1e5, PRESSURE); reg("mbar", 1e2, PRESSURE);
  reg("atm", 101325, PRESSURE); reg("Torr", 101325 / 760, PRESSURE);
  reg("mmHg", 133.322387415, PRESSURE); reg("psi", 6894.757293168, PRESSURE);

  // --- electromagnetism ---
  regP("C", 1, CHARGE, "k m u µ n p f");
  regP("V volt", 1, VOLT, "k M m u µ n");
  regP("ohm Ω", 1, RES, "k M G m");
  regP("S siemens", 1, COND, "m u µ n");
  regP("F farad", 1, CAP, "m u µ n p f");
  regP("H henry", 1, IND, "m u µ n p");
  reg("Wb", 1, FLUX);
  regP("T tesla", 1, BFIELD, "k m u µ n");   // standalone T = tesla
  reg("gauss", 1e-4, BFIELD); reg("mT", 1e-3, BFIELD);

  // --- area / volume ---
  reg("ha", 1e4, AREA); reg("barn", 1e-28, AREA);
  regP("L liter litre", 1e-3, VOLUME, "m u µ n");

  PB.units = PB.units || {};

  // physical constants (CODATA 2018) ---------------------------------------
  const CONSTANTS = {
    pi:   { v: Math.PI, d: Z(), about: "π" },
    e:    { v: Math.E,  d: Z(), about: "Euler's number" },
    c:    { v: 299792458, d: VEL, about: "speed of light in vacuum" },
    c0:   { v: 299792458, d: VEL, about: "speed of light in vacuum" },
    h:    { v: 6.62607015e-34, d: [2,1,-1,0,0,0,0], about: "Planck constant" },
    hbar: { v: 1.054571817e-34, d: [2,1,-1,0,0,0,0], about: "reduced Planck constant" },
    kB:   { v: 1.380649e-23, d: [2,1,-2,0,-1,0,0], about: "Boltzmann constant" },
    NA:   { v: 6.02214076e23, d: [0,0,0,0,0,-1,0], about: "Avogadro constant" },
    R:    { v: 8.314462618, d: [2,1,-2,0,-1,-1,0], about: "molar gas constant" },
    qe:   { v: 1.602176634e-19, d: CHARGE, about: "elementary charge" },
    me:   { v: 9.1093837015e-31, d: M, about: "electron mass" },
    mp:   { v: 1.67262192369e-27, d: M, about: "proton mass" },
    mn:   { v: 1.67492749804e-27, d: M, about: "neutron mass" },
    eps0: { v: 8.8541878128e-12, d: CAP, about: "vacuum permittivity (F/m)" },
    mu0:  { v: 1.25663706212e-6, d: IND, about: "vacuum permeability (H/m)" },
    g0:   { v: 9.80665, d: ACC, about: "standard gravity" },
    G:    { v: 6.67430e-11, d: [3,-1,-2,0,0,0,0], about: "gravitational constant" },
    sigma:{ v: 5.670374419e-8, d: [0,1,-3,0,-4,0,0], about: "Stefan–Boltzmann constant" },
    alpha:{ v: 7.2973525693e-3, d: Z(), about: "fine-structure constant" },
    Ry:   { v: 2.1798723611035e-18, d: ENERGY, about: "Rydberg energy" },
    a0:   { v: 5.29177210903e-11, d: L, about: "Bohr radius" }
  };
  // eps0 is F/m, mu0 is H/m (both per-metre) — correct the stored dimensions
  CONSTANTS.eps0.d = dsub(CAP, L);
  CONSTANTS.mu0.d = dsub(IND, L);

  // functions (operate on quantities) --------------------------------------
  const reqDimless = (q, name) => {
    if (!isZero(q.d)) throw "the argument of " + name + "() must be dimensionless";
  };
  const FUNCS = {
    sin:  (q) => (reqDimless(q, "sin"), { v: Math.sin(q.v), d: Z() }),
    cos:  (q) => (reqDimless(q, "cos"), { v: Math.cos(q.v), d: Z() }),
    tan:  (q) => (reqDimless(q, "tan"), { v: Math.tan(q.v), d: Z() }),
    asin: (q) => (reqDimless(q, "asin"), { v: Math.asin(q.v), d: Z() }),
    acos: (q) => (reqDimless(q, "acos"), { v: Math.acos(q.v), d: Z() }),
    atan: (q) => (reqDimless(q, "atan"), { v: Math.atan(q.v), d: Z() }),
    sinh: (q) => (reqDimless(q, "sinh"), { v: Math.sinh(q.v), d: Z() }),
    cosh: (q) => (reqDimless(q, "cosh"), { v: Math.cosh(q.v), d: Z() }),
    tanh: (q) => (reqDimless(q, "tanh"), { v: Math.tanh(q.v), d: Z() }),
    exp:  (q) => (reqDimless(q, "exp"), { v: Math.exp(q.v), d: Z() }),
    ln:   (q) => (reqDimless(q, "ln"),  { v: Math.log(q.v), d: Z() }),
    log:  (q) => (reqDimless(q, "log"), { v: Math.log10(q.v), d: Z() }),
    log10:(q) => (reqDimless(q, "log10"), { v: Math.log10(q.v), d: Z() }),
    log2: (q) => (reqDimless(q, "log2"), { v: Math.log2(q.v), d: Z() }),
    abs:  (q) => ({ v: Math.abs(q.v), d: q.d }),
    sqrt: (q) => ({ v: Math.sqrt(q.v), d: dscale(q.d, 0.5) }),
    cbrt: (q) => ({ v: Math.cbrt(q.v), d: dscale(q.d, 1 / 3) })
  };

  // ---- tokenizer ----------------------------------------------------------
  function tokenize(str) {
    const toks = [];
    let i = 0;
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/;
    const id = /^[A-Za-zµμΩÅ°_][A-Za-z0-9µμΩÅ°_]*/;
    while (i < str.length) {
      const ch = str[i];
      if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }
      const rest = str.slice(i);
      let m;
      if ((m = rest.match(num))) {
        toks.push({ type: "num", v: parseFloat(m[0]), start: i }); i += m[0].length;
      } else if ((m = rest.match(id))) {
        toks.push({ type: "ident", name: m[0], raw: m[0], start: i }); i += m[0].length;
      } else if ("+-*/^".includes(ch)) {
        toks.push({ type: "op", v: ch, start: i }); i++;
      } else if (ch === "(" || ch === ")") {
        toks.push({ type: "paren", v: ch, start: i }); i++;
      } else if (rest.startsWith("→") || rest.startsWith("->")) {
        const len = rest.startsWith("->") ? 2 : 1;
        toks.push({ type: "ident", name: "to", raw: "→", start: i }); i += len;
      } else {
        throw "unexpected character '" + ch + "'";
      }
    }
    return toks;
  }

  function resolveIdent(name) {
    if (CONSTANTS[name]) return { v: CONSTANTS[name].v, d: CONSTANTS[name].d.slice() };
    if (UNITS[name]) return { v: UNITS[name].v, d: UNITS[name].d.slice() };
    // prefix split fallback (longest prefix first; "da" before single letters)
    const order = ["da", "Y","Z","E","P","T","G","M","k","h","d","c","m","u","µ","μ","n","p","f","a","z","y"];
    for (const p of order) {
      if (name.length > p.length && name.startsWith(p)) {
        const baseName = name.slice(p.length);
        if (UNITS[baseName]) return { v: UNITS[baseName].v * PREFIX[p], d: UNITS[baseName].d.slice() };
      }
    }
    throw "unknown unit or symbol '" + name + "'";
  }

  // ---- parser (precedence climbing) --------------------------------------
  function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    function applyOp(op, l, r) {
      if (op === "+" || op === "-") {
        if (!deq(l.d, r.d)) throw "cannot add/subtract incompatible quantities";
        return { v: op === "+" ? l.v + r.v : l.v - r.v, d: l.d.slice() };
      }
      if (op === "*") return { v: l.v * r.v, d: dadd(l.d, r.d) };
      if (op === "/") return { v: l.v / r.v, d: dsub(l.d, r.d) };
      if (op === "^") {
        if (!isZero(r.d)) throw "exponent must be dimensionless";
        return { v: Math.pow(l.v, r.v), d: dscale(l.d, r.v) };
      }
      throw "bad operator";
    }

    function parsePrimary() {
      const t = next();
      if (!t) throw "unexpected end of expression";
      if (t.type === "num") return { v: t.v, d: Z() };
      if (t.type === "paren" && t.v === "(") {
        const e = parseExpr(0);
        const c = next();
        if (!c || c.v !== ")") throw "missing ')'";
        return e;
      }
      if (t.type === "ident") {
        if (FUNCS[t.name] && peek() && peek().type === "paren" && peek().v === "(") {
          next();
          const arg = parseExpr(0);
          const c = next();
          if (!c || c.v !== ")") throw "missing ')'";
          return FUNCS[t.name](arg);
        }
        return resolveIdent(t.name);
      }
      throw "unexpected '" + (t.raw || t.v) + "'";
    }

    function parseUnary() {
      const t = peek();
      if (t && t.type === "op" && (t.v === "-" || t.v === "+")) {
        next();
        const x = parseUnary();
        return t.v === "-" ? { v: -x.v, d: x.d } : x;
      }
      return parsePrimary();
    }

    function startsPrimary(t) {
      return t && (t.type === "num" ||
        (t.type === "ident" && t.name !== "to" && t.name !== "in") ||
        (t.type === "paren" && t.v === "("));
    }

    function parseExpr(minPrec) {
      let left = parseUnary();
      while (true) {
        const t = peek();
        if (!t) break;
        let op = null, prec = 0, rightAssoc = false, implicit = false;
        if (t.type === "op") {
          if (t.v === "+" || t.v === "-") { op = t.v; prec = 1; }
          else if (t.v === "*" || t.v === "/") { op = t.v; prec = 2; }
          else if (t.v === "^") { op = "^"; prec = 4; rightAssoc = true; }
          else break;
        } else if (startsPrimary(t)) {
          op = "*"; prec = 3; implicit = true;     // implicit mult binds tighter than * /
        } else break;
        if (prec < minPrec) break;
        if (!implicit) next();
        const right = parseExpr(rightAssoc ? prec : prec + 1);
        left = applyOp(op, left, right);
      }
      return left;
    }

    const r = parseExpr(0);
    if (i < tokens.length) throw "unexpected '" + (tokens[i].raw || tokens[i].v) + "'";
    return r;
  }

  // ---- number / unit formatting ------------------------------------------
  function fmtNum(x) {
    if (x === 0) return "0";
    if (!isFinite(x)) return x > 0 ? "∞" : (x < 0 ? "−∞" : "NaN");
    const ax = Math.abs(x);
    if (ax >= 1e-4 && ax < 1e7) {
      let s = parseFloat(x.toPrecision(7)).toString();
      return s;
    }
    // scientific
    let [mant, exp] = x.toExponential(6).split("e");
    mant = parseFloat(mant).toString();
    return mant + "e" + exp.replace("+", "");
  }

  // named SI units for auto-display (dim → symbol)
  const DISPLAY = [
    { d: FREQ, s: "Hz" }, { d: FORCE, s: "N" }, { d: ENERGY, s: "J" },
    { d: POWER, s: "W" }, { d: PRESSURE, s: "Pa" }, { d: CHARGE, s: "C" },
    { d: VOLT, s: "V" }, { d: RES, s: "Ω" }, { d: COND, s: "S" },
    { d: CAP, s: "F" }, { d: IND, s: "H" }, { d: FLUX, s: "Wb" },
    { d: BFIELD, s: "T" }, { d: VEL, s: "m/s" }, { d: ACC, s: "m/s²" },
    { d: AREA, s: "m²" }, { d: VOLUME, s: "m³" },
    { d: L, s: "m" }, { d: M, s: "kg" }, { d: T, s: "s" }, { d: I, s: "A" },
    { d: K, s: "K" }, { d: MOL, s: "mol" }, { d: CD, s: "cd" }
  ];
  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", ".": "·" };
  const sup = (n) => String(n).split("").map((c) => SUP[c] || c).join("");

  function baseUnitString(d) {
    const parts = [];
    d.forEach((e, idx) => {
      if (Math.abs(e) < 1e-9) return;
      const rounded = Math.abs(e - Math.round(e)) < 1e-6 ? Math.round(e) : +e.toFixed(3);
      parts.push(DIMS[idx] + (rounded === 1 ? "" : sup(rounded)));
    });
    return parts.length ? parts.join("·") : "";
  }

  function unitFor(d) {
    if (isZero(d)) return "";
    for (const u of DISPLAY) if (deq(u.d, d)) return u.s;
    return baseUnitString(d);
  }

  // ---- public evaluate ----------------------------------------------------
  function evaluate(str) {
    str = (str || "").trim();
    if (!str) return { ok: true, empty: true };
    try {
      const toks = tokenize(str);
      // find top-level conversion keyword (to / in / →)
      let depth = 0, ci = -1;
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.type === "paren") depth += t.v === "(" ? 1 : -1;
        else if (depth === 0 && t.type === "ident" && (t.name === "to" || t.name === "in")) { ci = k; break; }
      }

      if (ci >= 0) {
        const lhsToks = toks.slice(0, ci);
        const rhsToks = toks.slice(ci + 1);
        if (!lhsToks.length || !rhsToks.length) throw "incomplete conversion";
        const lhs = parse(lhsToks);
        const rhs = parse(rhsToks);
        if (!deq(lhs.d, rhs.d))
          throw "cannot convert " + (unitFor(lhs.d) || "dimensionless") +
                " to " + (unitFor(rhs.d) || "dimensionless");
        const label = str.slice(rhsToks[0].start).trim();
        return { ok: true, mode: "convert", value: lhs.v / rhs.v,
                 unit: label, display: fmtNum(lhs.v / rhs.v) + " " + label };
      }

      const q = parse(toks);
      const u = unitFor(q.d);
      return { ok: true, mode: "eval", value: q.v, dim: q.d, unit: u,
               display: fmtNum(q.v) + (u ? " " + u : "") };
    } catch (err) {
      return { ok: false, error: typeof err === "string" ? err : (err.message || "error") };
    }
  }

  PB.units = Object.assign(PB.units, {
    evaluate, tokenize, UNITS, CONSTANTS, FUNCS, DIMS,
    unitNames: () => Object.keys(UNITS),
    constantList: () => Object.keys(CONSTANTS).map((k) => ({
      name: k, about: CONSTANTS[k].about,
      value: fmtNum(CONSTANTS[k].v), unit: unitFor(CONSTANTS[k].d)
    })),
    funcNames: () => Object.keys(FUNCS),
    fmtNum, unitFor
  });
})();
