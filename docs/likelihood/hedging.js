(function (root) {
  'use strict';
  var normal = typeof module === 'object' && module.exports ? require('./normal-options.js') : root.NormalOptionsMath;
  if (!normal) return;
  var phi = normal.normalPDF, call = normal.callPrice, delta = normal.callDelta;
  var fractions = [1 / 252, 1 / 52, 1 / 12, .25, .5, 1];
  var intervalLabels = ['τ / 252', 'τ / 52', 'τ / 12', 'τ / 4', 'τ / 2', 'τ'];
  function defaults() { return { spot: 100, strike: 110, sigma: .30, tau: 1, reserve: 110, step: 5, w: .7 }; }
  function interval(p) { return p.h === undefined ? p.tau * fractions[p.step] : p.h; }
  function stockRatio(z, sigma, h) { return Math.exp(sigma * Math.sqrt(h) * z - .5 * sigma * sigma * h); }
  function targetPrice(p) { return call(p.spot, p.strike, p.tau, p.sigma) + p.reserve; }
  function point(p, z, w, h) {
    h = h === undefined ? interval(p) : h;
    var q = phi(z), r = stockRatio(z, p.sigma, h), H = targetPrice(p);
    var g = (call(p.spot * r, p.strike, Math.max(0, p.tau - h), p.sigma) + p.reserve) / H;
    var v = 1 - w + w * r;
    return { z: z, q: q, r: r, g: g, market: q, stock: q * r, target: q * g, hedge: q * v };
  }
  function buildProblem(p, h) {
    h = h === undefined ? interval(p) : h;
    var H = targetPrice(p), nodes = [], bounds = [-11, 11], sig = p.sigma * Math.sqrt(h);
    if (h === p.tau && sig > 0) {
      var strikeZ = (Math.log(p.strike / p.spot) + .5 * p.sigma * p.sigma * h) / sig;
      if (strikeZ > -11 && strikeZ < 11) bounds.splice(1, 0, strikeZ);
    }
    for (var b = 0; b < bounds.length - 1; b++) {
      var left = bounds[b], right = bounds[b + 1];
      // At expiry the call is zero up to the strike. On the upper interval
      // z = strikeZ + u^2 smooths the g log(g) endpoint in forward KL.
      var squareMap = h === p.tau && bounds.length === 3 && b === 1;
      var span = squareMap ? Math.sqrt(right - left) : right - left;
      var n = Math.max(80, 2 * Math.ceil(span / (squareMap ? .00625 : .0125) / 2)), dz = span / n;
      for (var j = 0; j <= n; j++) {
        var u = j * dz, z = left + (squareMap ? u * u : u), r = stockRatio(z, p.sigma, h);
        var g = (call(p.spot * r, p.strike, Math.max(0, p.tau - h), p.sigma) + p.reserve) / H;
        var weight = phi(z) * dz / 3 * (squareMap ? 2 * u : 1) * (j === 0 || j === n ? 1 : j % 2 ? 4 : 2);
        nodes.push({ weight: weight, r: r, g: g });
      }
    }
    return { nodes: nodes, H: H, h: h, params: p };
  }
  function objective(problem, w) {
    if (w < 0 || w > 1) return Infinity;
    var s = 0;
    for (var i = 0; i < problem.nodes.length; i++) {
      var n = problem.nodes[i], v = 1 - w + w * n.r, g = n.g;
      // The generalized form has nonnegative integrand and equals KL when
      // both densities integrate to one. It avoids mass-error cancellation.
      var term;
      if (g === 0) term = v;
      else {
        var e = (g - v) / v;
        if (Math.abs(e) < 1e-4) {
          term = v * e * e * (.5 + e * (-1 / 6 + e * (1 / 12 - e / 20)));
        } else term = g * Math.log(g / v) - g + v;
      }
      s += n.weight * Math.max(0, term);
    }
    return Math.max(0, s);
  }
  function derivative(problem, w) {
    var s = 0;
    for (var i = 0; i < problem.nodes.length; i++) {
      var n = problem.nodes[i], difference = n.r - 1;
      s -= n.weight * n.g * difference / (1 + w * difference);
    }
    return s;
  }
  function optimize(problem) {
    if (problem.h === 0) return { w: 0, kl: 0 };
    if (derivative(problem, 0) >= 0) return { w: 0, kl: objective(problem, 0) };
    if (derivative(problem, 1) <= 0) return { w: 1, kl: objective(problem, 1) };
    var lo = 0, hi = 1;
    for (var i = 0; i < 48; i++) {
      var mid = (lo + hi) / 2;
      if (derivative(problem, mid) < 0) lo = mid; else hi = mid;
    }
    var w = (lo + hi) / 2;
    return { w: w, kl: objective(problem, w) };
  }
  function masses(problem, w) {
    var out = { market: 0, stock: 0, target: 0, hedge: 0 };
    problem.nodes.forEach(function (n) {
      out.market += n.weight; out.stock += n.weight * n.r;
      out.target += n.weight * n.g; out.hedge += n.weight * (1 - w + w * n.r);
    });
    return out;
  }
  var api = { defaults: defaults, fractions: fractions, interval: interval, stockRatio: stockRatio, targetPrice: targetPrice, point: point, buildProblem: buildProblem, objective: objective, derivative: derivative, optimize: optimize, masses: masses };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.HedgingMath = api;
  if (typeof document === 'undefined') return;
  var counter = 0;
  function fmt(x, digits) { return x.toFixed(digits === undefined ? 3 : digits); }
  function klfmt(x) { return x === 0 ? '0' : x < .0001 ? x.toExponential(2) : x.toFixed(5); }
  function slider(id, name, title, min, max, step, value) {
    return '<div class="hd-control"><label for="' + id + '-' + name + '">' + title + '</label><input id="' + id + '-' + name + '" data-name="' + name + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"><output for="' + id + '-' + name + '" data-output="' + name + '"></output></div>';
  }
  function legend(items) {
    return '<div class="hd-legend">' + items.map(function (item) {
      return '<span><i' + (item.dash ? ' class="hd-dashed"' : '') + ' style="--hd-color:' + item.color + '"></i>' + item.label + '</span>';
    }).join('') + '</div>';
  }
  var colors = { market: '#3a64a0', stock: '#2b7a55', target: '#7b4a95', hedge: '#ac751e' };
  function drawChart(host, lines, options) {
    var W = Math.max(280, Math.round(host.getBoundingClientRect().width)), H = 290;
    var left = 61, right = 18, top = 22, bottom = 53, width = W - left - right, height = H - top - bottom;
    var maxY = options.maxY || Math.max.apply(null, lines.flatMap(function (line) { return line.points.map(function (p) { return p[1]; }); })) * 1.12;
    if (!(maxY > 0)) maxY = .001;
    var x = function (v) { return left + (options.logX ? (Math.log(v) - Math.log(options.minX)) / (Math.log(options.maxX) - Math.log(options.minX)) : (v - options.minX) / (options.maxX - options.minX)) * width; };
    var y = function (v) { return top + height - v / maxY * height; };
    var grid = '', texts = '';
    for (var j = 0; j <= 4; j++) {
      var v = maxY * j / 4, yy = y(v);
      grid += '<line class="hd-grid" x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '"/>';
      texts += '<text x="' + (left - 7) + '" y="' + (yy + 4) + '" text-anchor="end">' + (v === 0 ? '0' : maxY < .01 ? v.toExponential(1) : v.toFixed(maxY < .1 ? 3 : 2)) + '</text>';
    }
    options.ticks.forEach(function (tick) {
      var xx = x(tick[0]);
      texts += '<text x="' + xx + '" y="' + (H - 31) + '" text-anchor="middle">' + tick[1] + '</text>';
    });
    var paths = lines.map(function (line) {
      var path = line.points.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(2) + ',' + y(p[1]).toFixed(2); }).join(' ');
      return '<path d="' + path + '" stroke="' + line.color + '" stroke-width="' + (line.width || 2.5) + '" fill="none"' + (line.dash ? ' stroke-dasharray="7 5"' : '') + '/>';
    }).join('');
    host.innerHTML = '<svg class="hd-chart" role="img" aria-label="' + options.label + '" viewBox="0 0 ' + W + ' ' + H + '"><title>' + options.label + '</title>' + grid + paths + texts + '<text x="' + left + '" y="13">' + options.yTitle + '</text><text x="' + (left + width / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + options.xTitle + '</text></svg>';
  }
  function mount(el) {
    if (el.dataset.hedgingMounted) return;
    el.dataset.hedgingMounted = 'true';
    el.classList.add('hd-lab');
    var p = defaults(), id = 'hd-' + (++counter), autoFit = false, cached = null;
    el.innerHTML = '<div class="hd-controls">' +
      slider(id, 'strike', 'Strike K · stock price fixed at 100', 80, 120, 1, p.strike) +
      slider(id, 'sigma', 'Annual price volatility', .15, .45, .01, p.sigma) +
      slider(id, 'tau', 'Time to expiry · years', .25, 2, .25, p.tau) +
      slider(id, 'step', 'Time to next rebalance · fraction of τ', 0, 5, 1, p.step) +
      slider(id, 'reserve', 'Reserve B included in the target · Y units', 0, 150, 1, p.reserve) +
      slider(id, 'w', 'Chosen hedge · fraction of cost in stock', 0, 1, .001, p.w) +
      '</div><div class="hd-actions"><button type="button" data-action="fit">Fit the density</button><button type="button" data-action="protected">Call + strike reserve</button><button type="button" data-action="call">Call only</button><button type="button" data-action="reset">Reset</button></div>' +
      '<p class="hd-detail" data-description></p>' +
      '<h3>Four densities over the next interval</h3>' +
      legend([{ label: 'Reference q', color: colors.market }, { label: 'Stock p', color: colors.stock }, { label: 'Target H', color: colors.target }, { label: 'Chosen hedge v', color: colors.hedge, dash: true }]) +
      '<div data-chart="densities"></div><div class="hd-results" aria-live="polite" aria-atomic="true"><div class="hd-result"><span>Chosen hedge: KL mismatch</span><strong data-result="kl"></strong></div><div class="hd-result"><span>Best admissible KL mismatch</span><strong data-result="best"></strong></div></div>' +
      '<p class="hd-detail" data-holdings></p><p class="hd-note" data-status aria-live="polite"></p>' +
      '<h3>How the trading interval changes the mismatch</h3>' +
      legend([{ label: 'Current fraction held fixed', color: colors.hedge, dash: true }, { label: 'Best fit for each interval', color: colors.target }]) +
      '<div data-chart="intervals"></div><p class="hd-detail">Each point solves one interval from the same current stock price and remaining maturity. The horizontal scale is logarithmic. These are local mismatches, not cumulative terminal hedge errors.</p>';
    function readouts() {
      ['strike', 'sigma', 'tau', 'step', 'reserve', 'w'].forEach(function (name) {
        var input = el.querySelector('[data-name="' + name + '"]');
        input.value = p[name];
        var value = name === 'sigma' || name === 'w' ? fmt(p[name] * 100, 1) + '%' : name === 'step' ? intervalLabels[p.step] : fmt(p[name], name === 'tau' ? 2 : 0);
        el.querySelector('[data-output="' + name + '"]').textContent = value;
        if (name === 'step') input.setAttribute('aria-valuetext', intervalLabels[p.step] + ', ' + fmt(interval(p), 4) + ' years');
        else input.setAttribute('aria-valuetext', value);
      });
    }
    function compute() {
      var problem = buildProblem(p), best = optimize(problem);
      if (autoFit) p.w = best.w;
      var rows = fractions.map(function (f) { var local = buildProblem(p, p.tau * f); return { f: f, best: optimize(local), problem: local }; });
      cached = { problem: problem, best: best, rows: rows };
    }
    function paint() {
      if (!cached) compute();
      readouts();
      var H = cached.problem.H, C = H - p.reserve, bs = delta(p.spot, p.strike, p.tau, p.sigma), bsWeight = bs * p.spot / H;
      var chosenKL = objective(cached.problem, p.w), shares = H * p.w / p.spot, cash = H * (1 - p.w);
      el.querySelector('[data-description]').textContent = 'Target: one call + ' + fmt(p.reserve, 0) + ' reference units. Current call price ' + fmt(C, 2) + '; total target and hedge budget ' + fmt(H, 2) + '. Next rebalance in ' + fmt(interval(p), 4) + ' years.';
      el.querySelector('[data-result="kl"]').textContent = klfmt(chosenKL) + ' nats';
      el.querySelector('[data-result="best"]').textContent = klfmt(cached.best.kl) + ' nats';
      el.querySelector('[data-holdings]').textContent = 'Chosen hedge: ' + fmt(shares, 4) + ' shares + ' + fmt(cash, 2) + ' reference units. Best stock cost fraction: ' + fmt(cached.best.w * 100, 2) + '%. Black–Scholes delta benchmark: ' + fmt(bs, 4) + ' shares (cost fraction ' + fmt(bsWeight * 100, 2) + '%).';
      var status = autoFit ? 'The hedge follows the best admissible fit when controls change. ' : 'The stock fraction is set manually; press Fit the density to minimize KL. ';
      if (bsWeight > 1 + 1e-8) status += 'The delta benchmark needs borrowing and is outside this finite-interval positive-density family. The stock/cash fit is constrained to 0–100% stock.';
      else status += 'The delta benchmark is admissible here. As the interval shrinks, the best-fit share holding approaches delta.';
      if (p.reserve === 0) status += ' A call alone reaches the all-stock boundary; this is a positivity constraint, not a solver failure.';
      el.querySelector('[data-status]').textContent = status;
      var lines = ['market', 'stock', 'target', 'hedge'].map(function (name) { return { color: colors[name], dash: name === 'hedge', points: [], width: name === 'target' ? 3 : 2.5 }; });
      for (var j = 0; j <= 220; j++) {
        var z = -4.5 + 10.5 * j / 220, v = point(p, z, p.w);
        ['market', 'stock', 'target', 'hedge'].forEach(function (name, i) { lines[i].points.push([z, v[name]]); });
      }
      drawChart(el.querySelector('[data-chart="densities"]'), lines, { minX: -4.5, maxX: 6, ticks: [[-4, '−4'], [-2, '−2'], [0, '0'], [2, '2'], [4, '4'], [6, '6']], xTitle: 'Standardized normal shock z', yTitle: 'Density', label: 'Conditional reference, stock, target and hedge densities over a common standard normal shock.' });
      var intervalLines = [
        { color: colors.hedge, dash: true, points: cached.rows.map(function (row) { return [row.f, objective(row.problem, p.w)]; }) },
        { color: colors.target, points: cached.rows.map(function (row) { return [row.f, row.best.kl]; }) }
      ];
      drawChart(el.querySelector('[data-chart="intervals"]'), intervalLines, { minX: fractions[0], maxX: 1, logX: true, ticks: [[1 / 252, 'τ/252'], [1 / 12, 'τ/12'], [1, 'τ']], xTitle: 'Time to next rebalance h', yTitle: 'KL · nats', label: 'Local KL mismatch versus the rebalancing interval: current fixed stock fraction and independently optimized stock fraction.' });
    }
    el.addEventListener('input', function (event) {
      var name = event.target.dataset.name;
      if (!name) return;
      p[name] = Number(event.target.value);
      if (name === 'w') autoFit = false; else cached = null;
      paint();
    });
    el.addEventListener('click', function (event) {
      var action = event.target.dataset.action;
      if (!action) return;
      if (action === 'reset') { p = defaults(); autoFit = false; }
      else { autoFit = true; if (action === 'call') p.reserve = 0; if (action === 'protected') p.reserve = p.strike; }
      cached = null; paint();
    });
    paint();
    if (typeof ResizeObserver !== 'undefined') {
      var lastWidth = el.getBoundingClientRect().width;
      new ResizeObserver(function () {
        var width = el.getBoundingClientRect().width;
        if (Math.abs(width - lastWidth) > 1) { lastWidth = width; paint(); }
      }).observe(el);
    }
  }
  function init() { document.querySelectorAll('[data-hedging-lab]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
