# PhotonBench, a photonics &amp; units workbench

A fast, offline desk tool for anyone working in optics/photonics. Convert
between the ways we describe light, do dimensional arithmetic, juggle optical
power in dB, and grab physical constants, all in one local page.

Open `index.html`. No build, no dependencies, no network, fonts are bundled
locally with the suite. Everything runs in the browser.

## What's inside

**Spectral converter.** Type into any one of these and the rest update live
(vacuum): wavelength λ (nm), frequency ν (THz), photon energy E (eV),
wavenumber ν̃ (cm⁻¹), angular frequency ω (rad/s), period T (fs). A
visible-spectrum ruler shows where your wavelength sits and names the band
(violet → red → near-IR → SWIR/telecom → mid-IR…). A refractive-index field
gives the in-medium wavelength, and the photon flux per watt is shown for
quick detector/photon-counting estimates. One-click laser presets: 405, 488,
532, 632.8 (He-Ne), 800 (Ti:Sapph), 1064 (Nd:YAG), 1550 (telecom C), 10.6 µm
(CO₂).

**Units calculator.** A real dimensional-analysis evaluator. Write expressions
with units, constants and functions and convert with `to` / `in`:

```
h c / 1064nm in eV      → 1.165265 eV
kB * 300K in eV         → 0.025852 eV      (thermal energy at 300 K)
5 V / 2 kohm in mA      → 2.5 mA
1 / sqrt(eps0 mu0)      → 2.997925e8 m/s   (recovers c)
2 pi / 800nm            → 7.853982e6 m⁻¹   (free-space wavevector)
1 atm in Torr           → 760 Torr
```

It understands SI prefixes (`nm`, `THz`, `µW`, `pF`, …), implicit
multiplication (`h c / L`), `^` powers, parentheses, and the usual functions
(`sin`, `sqrt`, `ln`, `exp`, …). It refuses to add meters to seconds, and it
won't silently "convert" incompatible dimensions, if you ask for
`1550 nm to THz` it tells you that's a length↔frequency mismatch (use the
spectral converter, which knows the *c* relation).

**Optical power · dB.** Linked power fields (mW ↔ dBm ↔ W ↔ dBW) plus a
ratio↔dB helper with a power (×10) / field-amplitude (×20) toggle.

**Physical constants.** CODATA 2018 values, searchable; click one to drop its
symbol straight into the calculator.

## Layout

```
index.html
css/style.css
js/
  units.js    dimensional-analysis expression evaluator (DOM-free, tested)
  optics.js   exact spectral + power/dB conversions, spectrum color (DOM-free, tested)
  app.js      UI wiring
```

`units.js` and `optics.js` are pure logic and can be exercised headless:

```js
global.window = undefined;
(0,eval)(require('fs').readFileSync('js/units.js','utf8'));
(0,eval)(require('fs').readFileSync('js/optics.js','utf8'));
console.log(PB.units.evaluate('h c / 1550nm in eV').display);   // 0.7998981 eV
console.log(PB.optics.spectral('wavelengthNm', 532).energyEV);  // 2.33053
```

## Notes & conventions

- Wavelengths are **vacuum** wavelengths; use the refractive-index field for
  in-medium values.
- Wavenumber is spectroscopic, ν̃ = 1/λ.
- dBm is referenced to 1 mW, dBW to 1 W; ratio→dB uses 10·log₁₀ for power and
  20·log₁₀ for field amplitude.
- Constants are CODATA 2018. The elementary charge is `qe` (since `e` is
  Euler's number) and standard gravity is `g0` (since `g` is gram).

*Part of the [Sci-Tools](../../) suite, offline calculators for the lab.*
