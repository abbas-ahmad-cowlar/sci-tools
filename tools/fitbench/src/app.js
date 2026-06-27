/* =============================================================================
 * FITBENCH, app.js
 * Glue: parse pasted/loaded data, pick a model, run the fit, render the
 * parameter table + goodness-of-fit, drive the plot, and export results
 * (fit curve CSV, plot PNG, and a runnable SciPy snippet).
 * ===========================================================================*/
(function (FB) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MODELS = FB.MODELS, ORDER = FB.MODEL_ORDER, fit = FB.fit;
  let plotter, lastFit = null, lastData = null, lastNames = null, lastModelKey = null;

  // ---- number formatting ---------------------------------------------------
  function sig(v, n) {
    n = n || 6;
    if (v === null || v === undefined || !isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.min(n - 1, 4));
    return String(parseFloat(v.toPrecision(n)));
  }

  // ---- data parsing --------------------------------------------------------
  function parseData(text) {
    const xs = [], ys = [], errs = [];
    let hasErr = true, any = false;
    for (let raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === '#' || line.startsWith('//')) continue;
      const parts = line.split(/[\s,;\t]+/).map(Number);
      if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) continue;
      xs.push(parts[0]); ys.push(parts[1]);
      if (parts.length >= 3 && isFinite(parts[2]) && parts[2] > 0) errs.push(parts[2]);
      else { errs.push(0); hasErr = false; }
      any = true;
    }
    if (!any) return null;
    return { xs, ys, yerr: hasErr ? errs : null };
  }

  // ---- run a fit -----------------------------------------------------------
  function runFit() {
    const key = $('model').value;
    const data = parseData($('data').value);
    const status = $('status');
    if (!data) { showError('No numeric x,y rows found. Paste two columns of numbers.'); return; }
    if (data.xs.length < 2) { showError('Need at least 2 data points.'); return; }

    const useErr = $('useErr').checked && data.yerr;
    const weights = useErr ? data.yerr.map((e) => 1 / (e * e)) : null;
    const stats = fit.dataStats(data.xs, data.ys);
    const model = MODELS[key];
    let result, names, py, formula = model.formula;

    try {
      if (model.linear) {
        const deg = key === 'poly' ? Math.max(1, Math.min(10, +$('degree').value || 2)) : 1;
        names = model.paramNames(deg);
        if (data.xs.length <= names.length) { showError('Need more data points than parameters (' + names.length + ').'); return; }
        result = fit.fitLinear((x) => model.basis(x, deg), data.xs, data.ys, weights);
        py = model.py(names);
      } else if (model.custom) {
        const parsed = fit.parseFormula($('formula').value);
        names = parsed.params;
        if (data.xs.length <= names.length) { showError('Need more data points than parameters (' + names.length + ').'); return; }
        const p0 = names.map(() => 1);
        result = fit.fitLM(parsed.fn, p0, data.xs, data.ys, weights);
        py = $('formula').value;
        formula = 'y = ' + $('formula').value;
      } else {
        names = model.params;
        if (data.xs.length <= names.length) { showError('Need more data points than parameters (' + names.length + ').'); return; }
        const p0 = model.guess(stats);
        result = fit.fitLM(model.f, p0, data.xs, data.ys, weights);
        py = model.py(names);
      }
    } catch (e) {
      showError(String(e.message || e)); return;
    }

    if (!result.ok) { showError(result.message || 'Fit failed.'); return; }

    lastFit = result; lastData = data; lastNames = names; lastModelKey = key;
    lastFit._py = py; lastFit._formula = formula; lastFit._weights = weights;

    renderResults(model, names, result, data, useErr);
    plotter.draw(
      { xs: data.xs, ys: data.ys, yerr: data.yerr },
      result.predict,
      { logx: $('logx').checked, logy: $('logy').checked }
    );
    status.className = 'status ok';
    status.textContent = (model.custom ? 'Custom' : model.name) +
      ' · ' + (result.converged ? 'converged' : 'stopped') +
      ' in ' + result.iterations + ' iter · R² = ' + sig(result.metrics.r2, 5);
  }

  function showError(msg) {
    const s = $('status'); s.className = 'status err'; s.textContent = msg;
    $('params').innerHTML = ''; $('gof').innerHTML = '';
  }

  // ---- results rendering ---------------------------------------------------
  function renderResults(model, names, result, data, useErr) {
    const formula = result._formula;
    let html = '<div class="formula">' + escapeHtml(formula) + '</div>';
    html += '<table class="ptab"><thead><tr><th>param</th><th>value</th><th>± std. err</th><th>rel.</th></tr></thead><tbody>';
    for (let i = 0; i < names.length; i++) {
      const v = result.params[i], e = result.errors[i];
      const rel = isFinite(e) && v !== 0 ? (Math.abs(e / v) * 100) : NaN;
      html += '<tr><td class="pname">' + escapeHtml(names[i]) + '</td><td class="pval">' + sig(v) +
        '</td><td class="perr">' + (isFinite(e) ? '± ' + sig(e, 3) : '–') +
        '</td><td class="prel">' + (isFinite(rel) ? rel.toFixed(1) + '%' : '–') + '</td></tr>';
    }
    html += '</tbody></table>';
    if (model.note) html += '<div class="mnote">' + escapeHtml(model.note) + '</div>';
    $('params').innerHTML = html;

    const m = result.metrics;
    const rows = [
      ['R²', sig(m.r2, 5)],
      ['adjusted R²', sig(m.adjR2, 5)],
      ['RMSE', sig(m.rmse, 4)],
      ['residual SS', sig(m.rss, 4)],
      ['data points', m.n],
      ['degrees of freedom', m.dof],
    ];
    if (useErr) { rows.push(['χ²', sig(m.chi2, 4)]); rows.push(['reduced χ²', sig(m.chi2red, 4)]); }
    $('gof').innerHTML = '<table class="gtab"><tbody>' +
      rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // ---- exports -------------------------------------------------------------
  function exportCurveCSV() {
    if (!lastFit) return;
    const d = lastData; let xmin = Infinity, xmax = -Infinity;
    for (const x of d.xs) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    let csv = 'x,y_fit\n';
    const N = 400;
    for (let i = 0; i <= N; i++) { const x = xmin + (xmax - xmin) * i / N; csv += x + ',' + lastFit.predict(x) + '\n'; }
    download('fitbench-curve.csv', csv, 'text/csv');
  }

  function exportPNG() {
    if (!plotter) return;
    const a = document.createElement('a');
    a.href = plotter.toPNG(); a.download = 'fitbench-plot.png'; a.click();
  }

  function pythonSnippet() {
    if (!lastFit) return '';
    const names = lastNames, d = lastData;
    const arr = (a) => '[' + a.map((v) => +v.toPrecision(8)).join(', ') + ']';
    let s = '# Reproduce this fit with NumPy + SciPy\n';
    s += 'import numpy as np\nfrom scipy.optimize import curve_fit\n\n';
    s += 'x = np.array(' + arr(d.xs) + ')\n';
    s += 'y = np.array(' + arr(d.ys) + ')\n';
    if (d.yerr && lastFit._weights) s += 'sigma = np.array(' + arr(d.yerr) + ')\n';
    s += '\ndef model(x, ' + names.join(', ') + '):\n    return ' + lastFit._py + '\n\n';
    s += 'p0 = ' + arr(lastFit.params) + '\n';
    s += 'popt, pcov = curve_fit(model, x, y, p0=p0' + (d.yerr && lastFit._weights ? ', sigma=sigma' : '') + ')\n';
    s += 'perr = np.sqrt(np.diag(pcov))\n';
    s += 'for name, v, e in zip("' + names.join(' ') + '".split(), popt, perr):\n';
    s += '    print(f"{name} = {v:.6g} ± {e:.3g}")\n';
    return s;
  }

  function copyParams() {
    if (!lastFit) return;
    let t = lastFit._formula + '\n\n';
    for (let i = 0; i < lastNames.length; i++) t += lastNames[i] + ' = ' + sig(lastFit.params[i]) + ' ± ' + sig(lastFit.errors[i], 3) + '\n';
    const m = lastFit.metrics;
    t += '\nR2 = ' + sig(m.r2, 5) + '   RMSE = ' + sig(m.rmse, 4) + '   n = ' + m.n;
    copyText(t, 'params');
  }

  function copyText(t, what) {
    navigator.clipboard.writeText(t).then(() => toast('Copied ' + what)).catch(() => toast('Copy failed'));
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1500);
  }

  // ---- example data --------------------------------------------------------
  const EXAMPLES = {
    gaussian: () => {
      // a noisy emission peak
      const rows = [];
      const a = 4.2, mu = 532, sig0 = 8, c = 0.3;
      let seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
      for (let x = 500; x <= 565; x += 1.5) {
        const y = a * Math.exp(-((x - mu) ** 2) / (2 * sig0 * sig0)) + c + rnd() * 0.35;
        rows.push(x.toFixed(1) + '  ' + y.toFixed(4));
      }
      return { model: 'gaussian', text: '# wavelength(nm)  intensity\n' + rows.join('\n') };
    },
    decay: () => {
      const rows = [];
      const a = 1000, tau = 2.4, c = 12;
      let seed = 21;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
      for (let t = 0; t <= 12; t += 0.4) {
        const y = a * Math.exp(-t / tau) + c + rnd() * 18;
        rows.push(t.toFixed(1) + '  ' + Math.max(0, y).toFixed(2));
      }
      return { model: 'expdecay', text: '# time(us)  counts\n' + rows.join('\n') };
    },
  };

  function loadExample(which) {
    const ex = EXAMPLES[which]();
    $('data').value = ex.text;
    $('model').value = ex.model;
    syncModelOptions();
    runFit();
  }

  // ---- model options visibility -------------------------------------------
  function syncModelOptions() {
    const key = $('model').value;
    $('degreeRow').style.display = key === 'poly' ? '' : 'none';
    $('formulaRow').style.display = key === 'custom' ? '' : 'none';
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    plotter = new FB.Plotter($('plot'));

    const sel = $('model');
    for (const k of ORDER) {
      const o = document.createElement('option');
      o.value = k; o.textContent = MODELS[k].name; sel.appendChild(o);
    }
    sel.value = 'gaussian';

    sel.addEventListener('change', () => { syncModelOptions(); });
    $('degree').addEventListener('change', () => { if (lastFit) runFit(); });
    $('fitBtn').addEventListener('click', runFit);
    $('logx').addEventListener('change', () => plotter.redraw());
    $('logy').addEventListener('change', () => plotter.redraw());
    $('useErr').addEventListener('change', () => { if (lastFit) runFit(); });

    $('ex1').addEventListener('click', () => loadExample('gaussian'));
    $('ex2').addEventListener('click', () => loadExample('decay'));

    $('copyParams').addEventListener('click', copyParams);
    $('copyPy').addEventListener('click', () => copyText(pythonSnippet(), 'Python'));
    $('expCsv').addEventListener('click', exportCurveCSV);
    $('expPng').addEventListener('click', exportPNG);

    $('fileIn').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { $('data').value = r.result; runFit(); };
      r.readAsText(f);
    });

    // keyboard: Ctrl/Cmd+Enter fits
    $('data').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runFit(); }
    });

    window.addEventListener('resize', () => plotter.redraw());

    syncModelOptions();
    loadExample('gaussian'); // start with something on screen
    FB.app = { runFit, pythonSnippet };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.FB = window.FB || {});
