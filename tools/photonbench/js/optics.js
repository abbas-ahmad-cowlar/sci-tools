/* =========================================================================
   PhotonBench, exact optics conversions (DOM-free, testable).
   - spectral(): wavelength ↔ frequency ↔ angular ω ↔ photon energy ↔
     wavenumber ↔ period, all derived from one canonical frequency.
   - power/dB helpers.
   - wavelengthToRGB(): approximate visible color for the spectrum ruler.
   ========================================================================= */
(function () {
  "use strict";
  const PB = (typeof window !== "undefined" ? (window.PB = window.PB || {})
                                             : (global.PB = global.PB || {}));
  const C = PB.units.CONSTANTS;
  const c = C.c.v, h = C.h.v, qe = C.qe.v;

  // canonical: everything derives from frequency ν (Hz) -----------------------
  function deriveFromFreq(nu) {
    const E_J = h * nu;
    return {
      freqHz: nu,
      wavelengthM: c / nu,             // vacuum
      angularRadS: 2 * Math.PI * nu,
      energyJ: E_J,
      energyEV: E_J / qe,
      wavenumberM: nu / c,             // ν̃ = 1/λ  [m⁻¹]
      wavenumberCm: nu / c / 100,      // [cm⁻¹]
      periodS: 1 / nu,
      photonsPerSecPerWatt: 1 / E_J    // photon flux per watt of optical power
    };
  }

  // turn any input field (SI-ish) into a frequency, then derive the rest -------
  const TO_FREQ = {
    wavelengthNm: (v) => c / (v * 1e-9),
    wavelengthUm: (v) => c / (v * 1e-6),
    wavelengthM:  (v) => c / v,
    freqHz:  (v) => v,
    freqTHz: (v) => v * 1e12,
    angularRadS: (v) => v / (2 * Math.PI),
    energyJ:  (v) => v / h,
    energyEV: (v) => (v * qe) / h,
    wavenumberCm: (v) => v * 100 * c,  // cm⁻¹ → m⁻¹ → ν
    wavenumberM:  (v) => v * c,
    periodS: (v) => 1 / v,
    periodFs: (v) => 1 / (v * 1e-15)
  };

  function spectral(field, value) {
    const conv = TO_FREQ[field];
    if (!conv) throw new Error("unknown spectral field: " + field);
    if (!(value > 0)) return null;       // must be positive & finite
    const nu = conv(value);
    if (!(nu > 0) || !isFinite(nu)) return null;
    return deriveFromFreq(nu);
  }

  // wavelength in a medium of refractive index n (vacuum λ in, medium λ out)
  function wavelengthInMedium(lambdaVacM, n) { return lambdaVacM / n; }

  // --- optical power / decibels ---------------------------------------------
  const power = {
    mwToDbm: (mw) => 10 * Math.log10(mw),
    dbmToMw: (dbm) => Math.pow(10, dbm / 10),
    wToDbw: (w) => 10 * Math.log10(w),
    dbwToW: (dbw) => Math.pow(10, dbw / 10),
    ratioToDb: (r) => 10 * Math.log10(r),       // power ratio
    dbToRatio: (db) => Math.pow(10, db / 10),
    ampRatioToDb: (r) => 20 * Math.log10(r),     // field/amplitude ratio
    dbToAmpRatio: (db) => Math.pow(10, db / 20),
    // derive every representation from a power in watts
    fromWatts: (w) => ({
      watt: w, mW: w * 1e3, dBm: 10 * Math.log10(w * 1e3), dBW: 10 * Math.log10(w)
    })
  };

  function powerFrom(field, value) {
    let watts;
    if (field === "watt") watts = value;
    else if (field === "mW") watts = value * 1e-3;
    else if (field === "dBm") watts = Math.pow(10, value / 10) * 1e-3;
    else if (field === "dBW") watts = Math.pow(10, value / 10);
    else throw new Error("unknown power field: " + field);
    if (!(watts > 0) || !isFinite(watts)) return null;
    return power.fromWatts(watts);
  }

  // --- visible-spectrum color (≈ Bruton's algorithm) -----------------------
  function wavelengthToRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm <= 750) { r = 1; }
    // intensity falloff near the limits of vision
    let f = 1;
    if (nm >= 380 && nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm > 700 && nm <= 750) f = 0.3 + 0.7 * (750 - nm) / 50;
    else if (nm < 380 || nm > 750) f = 0;
    const g2 = 0.8;
    const ch = (x) => Math.round(255 * Math.pow(Math.max(0, x * f), g2));
    return [ch(r), ch(g), ch(b)];
  }

  // band label for a vacuum wavelength in nm
  function bandName(nm) {
    if (nm < 10) return "X-ray";
    if (nm < 100) return "extreme UV";
    if (nm < 280) return "UV-C";
    if (nm < 315) return "UV-B";
    if (nm < 380) return "UV-A";
    if (nm < 450) return "violet";
    if (nm < 485) return "blue";
    if (nm < 500) return "cyan";
    if (nm < 565) return "green";
    if (nm < 590) return "yellow";
    if (nm < 625) return "orange";
    if (nm <= 750) return "red";
    if (nm < 1260) return "near-IR";
    if (nm < 1675) return "SWIR · fiber telecom";
    if (nm < 3000) return "short-wave IR";
    if (nm < 8000) return "mid-IR";
    if (nm < 1e6) return "far-IR / THz";
    return "microwave+";
  }

  PB.optics = {
    deriveFromFreq, spectral, TO_FREQ, wavelengthInMedium,
    power, powerFrom, wavelengthToRGB, bandName,
    c, h, qe
  };
})();
