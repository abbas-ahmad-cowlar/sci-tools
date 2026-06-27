/* ============================================================
   PROPAGATE, core engine
   A small, safe (no eval) math expression parser + evaluator,
   plus first-order uncertainty propagation with an error budget.

   Works both as a classic <script> (attaches window.Propagate)
   and as a Node module (module.exports) so it can be unit-tested.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- constants & functions available in expressions ----------
     Only pure-math constants are hard-wired (nobody measures π). Physical
     constants like c, h, g, e collide with common variable names (local
     gravity g, charge e, concentration c…), so they are NOT reserved here,
     instead PHYS gives the UI default values to pre-fill an editable row,
     which the user can override or attach an uncertainty to. */
  const CONST = { pi: Math.PI, PI: Math.PI, tau: 2 * Math.PI };
  const PHYS = {
    c:    [299792458,        "m/s"],   // speed of light
    h:    [6.62607015e-34,   "J·s"],   // Planck
    hbar: [1.054571817e-34,  "J·s"],
    kB:   [1.380649e-23,     "J/K"],   // Boltzmann
    NA:   [6.02214076e23,    "1/mol"], // Avogadro
    qe:   [1.602176634e-19,  "C"],     // elementary charge
    eps0: [8.8541878128e-12, "F/m"],
    mu0:  [1.25663706212e-6, "H/m"],
    me:   [9.1093837015e-31, "kg"],    // electron mass
    g:    [9.80665,          "m/s²"],  // standard gravity
  };
  const FN = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    pow: Math.pow, min: Math.min, max: Math.max, hypot: Math.hypot,
  };
  const FN_ARITY = { atan2: 2, pow: 2, log: [1, 2] }; // others: any/one

  /* ---------- tokenizer ---------- */
  function tokenize(src) {
    const toks = [];
    let i = 0;
    const isDigit = (c) => c >= "0" && c <= "9";
    const isIdStart = (c) => /[A-Za-z_]/.test(c);
    const isId = (c) => /[A-Za-z0-9_]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
        let j = i + 1;
        while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
        // exponent
        if (src[j] === "e" || src[j] === "E") {
          let k = j + 1;
          if (src[k] === "+" || src[k] === "-") k++;
          if (isDigit(src[k])) { k++; while (isDigit(src[k])) k++; j = k; }
        }
        const text = src.slice(i, j);
        const val = Number(text);
        if (!isFinite(val)) throw new ParseError(`bad number "${text}"`, i);
        toks.push({ t: "num", v: val, pos: i });
        i = j; continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        while (j < src.length && isId(src[j])) j++;
        toks.push({ t: "id", v: src.slice(i, j), pos: i });
        i = j; continue;
      }
      if ("+-*/^(),".includes(c)) { toks.push({ t: c, pos: i }); i++; continue; }
      throw new ParseError(`unexpected character "${c}"`, i);
    }
    toks.push({ t: "eof", pos: src.length });
    return toks;
  }

  function ParseError(msg, pos) { this.name = "ParseError"; this.message = msg; this.pos = pos; }
  ParseError.prototype = Object.create(Error.prototype);

  /* ---------- parser (precedence climbing) ----------
     AST nodes:
       { k:'num', v }
       { k:'var', name }
       { k:'const', name, v }
       { k:'neg', a }
       { k:'bin', op, a, b }
       { k:'call', name, args:[...] }
  */
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const vars = new Set();

    // Only +,-,*,/ go through precedence climbing. Exponentiation is handled
    // separately so it binds tighter than unary minus on the base but accepts
    // a unary exponent, i.e. -2^2 = -(2^2) = -4 and 2^-3 = 1/8, matching
    // Python/NumPy, and 2^3^2 = 2^9 (right associative).
    const BIN = { "+": 1, "-": 1, "*": 2, "/": 2 };

    function parseExpr(minPrec) {
      let left = parseUnary();
      while (true) {
        const tk = peek();
        const prec = BIN[tk.t];
        if (prec == null || prec < minPrec) break;
        next();
        const right = parseExpr(prec + 1);
        left = { k: "bin", op: tk.t, a: left, b: right };
      }
      return left;
    }

    function parseUnary() {
      const tk = peek();
      if (tk.t === "-") { next(); return { k: "neg", a: parseUnary() }; }
      if (tk.t === "+") { next(); return parseUnary(); }
      return parsePow();
    }

    function parsePow() {
      const base = parsePrimary();
      if (peek().t === "^") { next(); return { k: "bin", op: "^", a: base, b: parseUnary() }; }
      return base;
    }

    function parsePrimary() {
      const tk = next();
      if (tk.t === "num") return { k: "num", v: tk.v };
      if (tk.t === "(") {
        const e = parseExpr(1);
        expect(")");
        return e;
      }
      if (tk.t === "id") {
        if (peek().t === "(") {
          // function call
          next();
          const args = [];
          if (peek().t !== ")") {
            args.push(parseExpr(1));
            while (peek().t === ",") { next(); args.push(parseExpr(1)); }
          }
          expect(")");
          if (!FN[tk.v]) throw new ParseError(`unknown function "${tk.v}"`, tk.pos);
          checkArity(tk.v, args.length, tk.pos);
          return { k: "call", name: tk.v, args };
        }
        if (tk.v in CONST) return { k: "const", name: tk.v, v: CONST[tk.v] };
        vars.add(tk.v);
        return { k: "var", name: tk.v };
      }
      throw new ParseError(`unexpected ${tk.t === "eof" ? "end of expression" : '"' + (tk.v ?? tk.t) + '"'}`, tk.pos);
    }

    function expect(t) {
      const tk = next();
      if (tk.t !== t) throw new ParseError(`expected "${t}"`, tk.pos);
    }
    function checkArity(name, n, pos) {
      const a = FN_ARITY[name];
      if (a == null) { if (n < 1) throw new ParseError(`${name}() needs an argument`, pos); return; }
      if (Array.isArray(a)) { if (!a.includes(n)) throw new ParseError(`${name}() takes ${a.join(" or ")} args`, pos); }
      else if (n !== a) throw new ParseError(`${name}() takes ${a} arg(s)`, pos);
    }

    const ast = parseExpr(1);
    if (peek().t !== "eof") throw new ParseError(`unexpected "${peek().v ?? peek().t}"`, peek().pos);
    return { ast, vars: [...vars] };
  }

  /* ---------- evaluator ---------- */
  function evalNode(n, scope) {
    switch (n.k) {
      case "num": return n.v;
      case "const": return n.v;
      case "var": {
        const v = scope[n.name];
        if (v == null || !isFinite(v)) return NaN;
        return v;
      }
      case "neg": return -evalNode(n.a, scope);
      case "bin": {
        const a = evalNode(n.a, scope), b = evalNode(n.b, scope);
        switch (n.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return a / b;
          case "^": return Math.pow(a, b);
        }
        return NaN;
      }
      case "call": {
        const args = n.args.map((x) => evalNode(x, scope));
        return FN[n.name].apply(null, args);
      }
    }
    return NaN;
  }

  /* ---------- public: compile / evaluate ---------- */
  function compile(src) {
    const { ast, vars } = parse(src);
    return {
      vars,
      eval: (scope) => evalNode(ast, scope || {}),
      ast,
    };
  }

  /* ---------- uncertainty propagation ----------
     vars: { name: { value:Number, sigma:Number } }
     Method: first-order, assuming independent variables.
       contribution_i = [ f(x_i + σ_i) - f(x_i - σ_i) ] / 2
     (symmetric difference, exact for linear & quadratic forms),
       σ_f = sqrt( Σ contribution_i² )
     The squared contributions form the error budget.
  */
  function propagate(src, vars) {
    const prog = compile(src);
    const scope = {};
    for (const name of prog.vars) {
      const v = vars && vars[name];
      scope[name] = v ? Number(v.value) : NaN;
    }
    const value = prog.eval(scope);

    const terms = [];
    let varSum = 0;
    for (const name of prog.vars) {
      const v = vars && vars[name];
      const x = v ? Number(v.value) : NaN;
      let sigma = v && v.sigma != null ? Math.abs(Number(v.sigma)) : 0;
      let contribution = 0, slope = 0;
      if (sigma > 0 && isFinite(x)) {
        const up = Object.assign({}, scope); up[name] = x + sigma;
        const dn = Object.assign({}, scope); dn[name] = x - sigma;
        const fu = prog.eval(up), fd = prog.eval(dn);
        contribution = (fu - fd) / 2;
        slope = contribution / sigma; // local ∂f/∂x
        if (!isFinite(contribution)) {
          // fall back to one-sided small step if symmetric hit a domain edge
          const h = Math.max(Math.abs(x) * 1e-6, 1e-9);
          const f2 = prog.eval(Object.assign({}, scope, { [name]: x + h }));
          slope = (f2 - value) / h;
          contribution = slope * sigma;
        }
      }
      const c2 = isFinite(contribution) ? contribution * contribution : 0;
      varSum += c2;
      terms.push({ name, value: x, sigma, slope, contribution, c2 });
    }

    const sigmaF = Math.sqrt(varSum);
    for (const t of terms) t.percent = varSum > 0 ? (t.c2 / varSum) * 100 : 0;
    terms.sort((a, b) => b.c2 - a.c2);

    return {
      value,
      sigma: sigmaF,
      relative: value !== 0 && isFinite(value) ? Math.abs(sigmaF / value) : Infinity,
      vars: prog.vars,
      terms,
      ok: isFinite(value),
    };
  }

  /* ---------- significant-figure formatting (metrology style) ----------
     Uncertainty to `sig` significant figures; value rounded to the same
     decimal place. Returns { value, sigma, exp } strings.
  */
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const sup = (n) => String(n).split("").map((c) => SUP[c] || c).join("");

  function format(value, sigma, sig) {
    sig = sig || 2;
    if (!isFinite(value)) return { value: "–", sigma: "–", exp: null, combined: "–" };
    if (!(sigma > 0) || !isFinite(sigma)) {
      const s = trimNum(value);
      return { value: s, sigma: "0", exp: null, combined: s };
    }
    // round both value and uncertainty to the decimal place of σ's sig-th figure
    const mag = Math.floor(Math.log10(sigma));
    const place = mag - (sig - 1);
    const factor = Math.pow(10, place);
    const rSigma = Math.round(sigma / factor) * factor;
    const rValue = Math.round(value / factor) * factor;

    const vexp = rValue !== 0 ? Math.floor(Math.log10(Math.abs(rValue))) : mag;
    const useSci = vexp < -4 || vexp >= 6;
    if (useSci) {
      const E = vexp;
      const scale = Math.pow(10, E);
      const dec = Math.max(0, E - place);
      const vStr = (rValue / scale).toFixed(dec);
      const sStr = (rSigma / scale).toFixed(dec);
      return { value: vStr, sigma: sStr, exp: E, combined: `(${vStr} ± ${sStr})×10${sup(E)}` };
    }
    const decimals = place < 0 ? -place : 0;
    const vStr = rValue.toFixed(decimals);
    const sStr = rSigma.toFixed(decimals);
    return { value: vStr, sigma: sStr, exp: null, combined: `${vStr} ± ${sStr}` };
  }
  function trimNum(x) {
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e6 || a < 1e-4) return x.toExponential(4).replace(/\.?0+e/, "e");
    return String(Number(x.toPrecision(6)));
  }

  const API = { compile, parse, tokenize, evalNode, propagate, format, CONST, PHYS, FN, ParseError };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Propagate = API;
})(typeof window !== "undefined" ? window : globalThis);
