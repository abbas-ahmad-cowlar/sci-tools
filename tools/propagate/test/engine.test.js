/* Unit tests for the Propagate engine: parser/evaluator correctness and
   uncertainty propagation checked against closed-form formulas.
   Run:  node test/engine.test.js
*/
"use strict";
const P = require("../propagate.js");

let pass = 0, fail = 0;
const fails = [];
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * (1 + Math.abs(b)); }
function ok(name, cond) { if (cond) pass++; else { fail++; fails.push(name); } }
function evalEq(expr, expected, tol) {
  let got;
  try { got = P.compile(expr).eval({}); } catch (e) { got = "THREW:" + e.message; }
  ok(`eval  ${expr} = ${expected}`, typeof got === "number" && approx(got, expected, tol));
}
function throws(expr) {
  let threw = false;
  try { P.compile(expr).eval({}); } catch (e) { threw = true; }
  ok(`error ${expr}`, threw);
}

/* ---------------- evaluator ---------------- */
evalEq("2+3*4", 14);
evalEq("(2+3)*4", 20);
evalEq("3 + 4 - 5", 2);
evalEq("100/10/2", 5);
evalEq("2^3^2", 512);          // right associative
evalEq("-2^2", -4);            // unary minus looser than ^
evalEq("2^-2", 0.25);          // unary exponent
evalEq("2*-3", -6);
evalEq("sqrt(16)", 4);
evalEq("sin(pi/2)", 1, 1e-12);
evalEq("cos(0)", 1);
evalEq("exp(0)", 1);
evalEq("ln(exp(1))", 1, 1e-12);   // e is a variable, not a constant (collision-safe)
evalEq("log10(1000)", 3, 1e-12);
evalEq("log2(8)", 3, 1e-12);
evalEq("abs(-5)", 5);
evalEq("atan2(1,1)", Math.PI / 4, 1e-12);
evalEq("pow(2,10)", 1024);
evalEq("hypot(3,4)", 5);
evalEq("min(3, 1, 2)", 1);
evalEq("max(3, 1, 2)", 3);
evalEq("1.5e-3 * 1000", 1.5);
evalEq("2*pi", 2 * Math.PI, 1e-12);
evalEq("tau", 2 * Math.PI, 1e-12);
// physical constants are NOT reserved words (so g, c, e can be variables);
// they live in PHYS as editable UI defaults instead.
ok("PHYS table has c & g", P.PHYS.c[0] === 299792458 && P.PHYS.g[0] === 9.80665);
ok("g is a free variable, not a constant", P.compile("L/g").vars.sort().join() === "L,g");

/* variable scope */
ok("scope x*y", approx(P.compile("x*y").eval({ x: 6, y: 7 }), 42));
ok("vars detected", JSON.stringify(P.compile("a + b*sin(t)").vars.sort()) === JSON.stringify(["a", "b", "t"]));
ok("const not a var", P.compile("pi*r^2").vars.length === 1 && P.compile("pi*r^2").vars[0] === "r");

/* ---------------- parse errors ---------------- */
throws("2 +");
throws("2 ** 3");
throws("(2+3");
throws("2 3");
throws("foo(2)");
throws("sin()");
throws("*5");

/* ---------------- propagation vs analytic ---------------- */
function prop(expr, vars) { return P.propagate(expr, vars); }

// product:  σ_f = sqrt( (y σx)^2 + (x σy)^2 )
{
  const r = prop("x*y", { x: { value: 2, sigma: 0.1 }, y: { value: 3, sigma: 0.2 } });
  ok("product value", approx(r.value, 6));
  ok("product sigma", approx(r.sigma, 0.5, 1e-9));
  ok("product budget: y dominates", r.terms[0].name === "y" && approx(r.terms[0].percent, 64, 1e-6));
}
// sum:  σ_f = sqrt(σx^2 + σy^2)
{
  const r = prop("x+y", { x: { value: 10, sigma: 3 }, y: { value: 20, sigma: 4 } });
  ok("sum value", approx(r.value, 30));
  ok("sum sigma", approx(r.sigma, 5, 1e-9));
}
// power:  σ_f = 2x σx   (symmetric diff exact for quadratics)
{
  const r = prop("x^2", { x: { value: 5, sigma: 0.1 } });
  ok("power value", approx(r.value, 25));
  ok("power sigma", approx(r.sigma, 1.0, 1e-9));
}
// quotient (mildly nonlinear): compare to analytic within 1%
{
  const r = prop("x/y", { x: { value: 10, sigma: 0.1 }, y: { value: 2, sigma: 0.05 } });
  const analytic = Math.hypot(0.1 / 2, (10 / 4) * 0.05);
  ok("quotient value", approx(r.value, 5));
  ok("quotient sigma ~analytic", approx(r.sigma, analytic, 1e-2));
}
// exponential nonlinear: σ ≈ exp(x) σx
{
  const r = prop("exp(x)", { x: { value: 0, sigma: 0.1 } });
  ok("exp sigma ~0.1", approx(r.sigma, 0.1, 1e-2));
}
// zero-uncertainty variable contributes nothing
{
  const r = prop("a*b", { a: { value: 4, sigma: 0 }, b: { value: 5, sigma: 0.5 } });
  ok("zero-sigma term is 0%", r.terms.find((t) => t.name === "a").percent === 0);
  ok("single sigma value", approx(r.value, 20) && approx(r.sigma, 2.0));
}
// realistic: resistor power P = I^2 R
{
  const r = prop("I^2*R", { I: { value: 0.5, sigma: 0.01 }, R: { value: 100, sigma: 2 } });
  // dP = sqrt((2 I R σI)^2 + (I^2 σR)^2) = sqrt((2*0.5*100*0.01)^2 + (0.25*2)^2)= sqrt(1^2+0.5^2)=1.118
  ok("power-law value", approx(r.value, 25));
  ok("power-law sigma", approx(r.sigma, Math.hypot(1, 0.5), 1e-3));
}

/* ---------------- formatting ---------------- */
function fmtEq(v, s, sig, exp) {
  const f = P.format(v, s, sig);
  ok(`format ${v}±${s} -> ${exp}`, f.combined === exp);
}
fmtEq(6, 0.5, 2, "6.00 ± 0.50");
fmtEq(123.456, 1.2, 2, "123.5 ± 1.2");
fmtEq(9.81, 0.025, 2, "9.810 ± 0.025");
fmtEq(3.138e-19, 4.96e-22, 2, "(3.1380 ± 0.0050)×10⁻¹⁹"); // small -> scientific
fmtEq(1.234e7, 5e4, 2, "(1.2340 ± 0.0050)×10⁷");           // large -> scientific
ok("format exp field set for sci", P.format(3.138e-19, 5e-22, 2).exp === -19);
ok("format sigma=0", P.format(42, 0).combined === "42");

/* ---------------- report ---------------- */
console.log(`Propagate engine tests: ${pass} passed, ${fail} failed`);
if (fail) { console.log("FAILED:\n  - " + fails.join("\n  - ")); process.exit(1); }
else { console.log("✓ parser, evaluator, propagation, and formatting all correct."); process.exit(0); }
