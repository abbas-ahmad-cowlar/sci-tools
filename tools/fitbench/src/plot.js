/* =============================================================================
 * FITBENCH, plot.js
 * A small dependency-free plotter. Draws the data (with optional y-error bars),
 * the fitted curve, and a residuals strip that shares the x-axis, all on one
 * DPR-aware canvas. Supports log x/y axes. Colors are read from CSS custom
 * properties so the plot tracks the page theme.
 * ===========================================================================*/
(function (FB) {
  'use strict';

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // 1-2-5 "nice" ticks for a linear axis
  function niceTicks(min, max, target) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const raw = span / (target || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { ticks, step };
  }

  function fmt(v, step) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
    const dec = step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : step < 10 ? 1 : 0;
    return v.toFixed(dec);
  }

  function logTicks(min, max) {
    const ticks = [];
    const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
    for (let e = lo; e <= hi; e++) ticks.push(Math.pow(10, e));
    return ticks;
  }

  class Plotter {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.last = null;
    }

    draw(data, predict, opts) {
      opts = opts || {};
      this.last = { data, predict, opts };
      const c = this.canvas, ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth, H = c.clientHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const COL = {
        ink: css('--ink', '#1a1c1f'),
        dim: css('--ink-dim', '#6b7079'),
        grid: css('--grid', '#e4e0d6'),
        axis: css('--line', '#cfcabd'),
        data: css('--accent', '#2b4c7e'),
        fit: css('--accent-2', '#d2603a'),
        panel: css('--panel', '#fbfaf6'),
      };
      ctx.font = '11px ' + css('--mono', 'monospace');

      const xs = data.xs, ys = data.ys, yerr = data.yerr;
      const n = xs.length;
      const logx = !!opts.logx, logy = !!opts.logy;

      // ---- ranges ----
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (let i = 0; i < n; i++) {
        if (logx && xs[i] <= 0) continue;
        xmin = Math.min(xmin, xs[i]); xmax = Math.max(xmax, xs[i]);
        let ylo = ys[i], yhi = ys[i];
        if (yerr) { ylo -= yerr[i]; yhi += yerr[i]; }
        ymin = Math.min(ymin, ylo); ymax = Math.max(ymax, yhi);
      }
      // include fit curve in y-range
      const SAMPLES = 220;
      const fitPts = [];
      if (predict) {
        for (let s = 0; s <= SAMPLES; s++) {
          let x;
          if (logx) { const t = s / SAMPLES; x = xmin * Math.pow(xmax / xmin, t); }
          else x = xmin + (xmax - xmin) * s / SAMPLES;
          const y = predict(x);
          if (isFinite(y)) { fitPts.push([x, y]); if (!logy || y > 0) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); } }
        }
      }
      if (logy && ymin <= 0) ymin = Math.max(1e-9, ymax * 1e-6);
      const xpad = (xmax - xmin) * 0.04 || 1;
      const ypad = (ymax - ymin) * 0.08 || 1;
      if (!logx) { xmin -= xpad; xmax += xpad; }
      if (!logy) { ymin -= ypad; ymax += ypad; }

      // ---- layout ----
      const mL = 56, mR = 14, mT = 14, mB = 30;
      const gap = 12, residH = 78;
      const plotTop = mT, plotBot = H - mB - residH - gap;
      const plotH = plotBot - plotTop;
      const residTop = plotBot + gap, residBot = H - mB;
      const left = mL, right = W - mR, plotW = right - left;

      const sx = (x) => logx ? left + (Math.log10(x) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) * plotW
                             : left + (x - xmin) / (xmax - xmin) * plotW;
      const syTop = plotTop, syBot = plotBot;
      const sy = (y) => logy ? syBot - (Math.log10(y) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) * plotH
                             : syBot - (y - ymin) / (ymax - ymin) * plotH;

      // ---- grid + ticks ----
      const xt = logx ? logTicks(xmin, xmax) : niceTicks(xmin, xmax, 6).ticks;
      const xstep = logx ? 1 : niceTicks(xmin, xmax, 6).step;
      const yt = logy ? logTicks(ymin, ymax) : niceTicks(ymin, ymax, 5).ticks;
      const ystep = logy ? 1 : niceTicks(ymin, ymax, 5).step;

      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      ctx.fillStyle = COL.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const xv of xt) {
        if (xv < xmin || xv > xmax) continue;
        const px = Math.round(sx(xv)) + 0.5;
        ctx.beginPath(); ctx.moveTo(px, plotTop); ctx.lineTo(px, residBot); ctx.stroke();
        ctx.fillText(logx ? xv.toExponential(0) : fmt(xv, xstep), px, residBot + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const yv of yt) {
        if (yv < ymin || yv > ymax) continue;
        const py = Math.round(sy(yv)) + 0.5;
        ctx.strokeStyle = COL.grid;
        ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
        ctx.fillStyle = COL.dim;
        ctx.fillText(logy ? yv.toExponential(0) : fmt(yv, ystep), left - 8, py);
      }

      // plot frame
      ctx.strokeStyle = COL.axis; ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, plotTop + 0.5, plotW, plotH);

      // ---- fit curve ----
      if (fitPts.length) {
        ctx.strokeStyle = COL.fit; ctx.lineWidth = 2; ctx.beginPath();
        let started = false;
        for (const [x, y] of fitPts) {
          if (logy && y <= 0) { started = false; continue; }
          const px = sx(x), py = sy(y);
          if (py < plotTop - 50 || py > plotBot + 50) { started = false; continue; }
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // ---- data points + error bars ----
      ctx.strokeStyle = COL.data; ctx.fillStyle = COL.data; ctx.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        if (logx && xs[i] <= 0) continue;
        if (logy && ys[i] <= 0) continue;
        const px = sx(xs[i]), py = sy(ys[i]);
        if (yerr && yerr[i] > 0) {
          const p1 = sy(ys[i] + yerr[i]), p2 = sy(ys[i] - yerr[i]);
          ctx.beginPath(); ctx.moveTo(px, p1); ctx.lineTo(px, p2);
          ctx.moveTo(px - 3, p1); ctx.lineTo(px + 3, p1);
          ctx.moveTo(px - 3, p2); ctx.lineTo(px + 3, p2); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
      }

      // ---- residuals strip ----
      let rmax = 0;
      const resid = new Array(n);
      for (let i = 0; i < n; i++) { resid[i] = ys[i] - (predict ? predict(xs[i]) : 0); rmax = Math.max(rmax, Math.abs(resid[i])); }
      rmax = rmax || 1;
      const rMid = (residTop + residBot) / 2;
      const rScale = (residBot - residTop) / 2 / (rmax * 1.15);
      ctx.strokeStyle = COL.axis;
      ctx.strokeRect(left + 0.5, residTop + 0.5, plotW, residBot - residTop);
      ctx.strokeStyle = COL.grid; ctx.beginPath();
      ctx.moveTo(left, Math.round(rMid) + 0.5); ctx.lineTo(right, Math.round(rMid) + 0.5); ctx.stroke();
      ctx.strokeStyle = COL.data; ctx.fillStyle = COL.data;
      for (let i = 0; i < n; i++) {
        if (logx && xs[i] <= 0) continue;
        const px = sx(xs[i]); const py = rMid - resid[i] * rScale;
        ctx.beginPath(); ctx.moveTo(px, rMid); ctx.lineTo(px, py); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, 7); ctx.fill();
      }
      ctx.fillStyle = COL.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('residuals', left + 4, residTop + 3);

      // axis labels
      ctx.fillStyle = COL.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.xlabel || 'x', (left + right) / 2, H - 2);
      ctx.save();
      ctx.translate(12, (plotTop + plotBot) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'top';
      ctx.fillText(opts.ylabel || 'y', 0, 0);
      ctx.restore();
    }

    redraw() { if (this.last) this.draw(this.last.data, this.last.predict, this.last.opts); }

    toPNG() { return this.canvas.toDataURL('image/png'); }
  }

  FB.Plotter = Plotter;
})(window.FB = window.FB || {});
