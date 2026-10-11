/* Standalone trinomial and negative-binomial labs; no dependencies. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var PM = [0.5, 1 / 6, 1 / 3];
  var R = [1.5, 1, 0.5];

  function kl(p, q) {
    var total = 0;
    for (var i = 0; i < p.length; i++) {
      if (p[i] > 0) {
        if (!(q[i] > 0)) return Infinity;
        total += p[i] * Math.log(p[i] / q[i]);
      }
    }
    return Math.max(0, total);
  }
  function tri(t, w) {
    var q = [t, 1 - 2 * t, t];
    var p = R.map(function (r, i) { return r * q[i]; });
    var returns = R.map(function (r) { return 1 + w * (r - 1); });
    var v = returns.map(function (r, i) { return r * q[i]; });
    var g = returns.some(function (r) { return !(r > 0); }) ? -Infinity :
      returns.reduce(function (s, r, i) { return s + PM[i] * Math.log(r); }, 0);
    return { q: q, p: p, v: v, returns: returns, growth: g, information: kl(PM, q), mismatch: kl(PM, v) };
  }
  function rate(p, q) {
    return Math.max(0, p / (1 - p) * Math.log(p / q) + Math.log((1 - p) / (1 - q)));
  }
  function nb(n, p, tolerance) {
    // P(k+1)/P(k) = p(n+k)/(k+1). Bounds in the UI avoid underflow.
    var values = [Math.pow(1 - p, n)], sum = values[0], k = 0;
    var tol = tolerance || 1e-8;
    while (sum < 1 - tol && k < 4000) {
      values.push(values[k] * p * (n + k) / (k + 1));
      k++; sum += values[k];
    }
    return { values: values, total: sum, tail: Math.max(0, 1 - sum) };
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function geometric(u, p) { return Math.floor(Math.log1p(-u) / Math.log(p)); }
  function logPath(draws, p, q, samplingProbability, n) {
    var a = Math.log(p / q), b = Math.log((1 - p) / (1 - q));
    var logs = [0], count = 0;
    for (var t = 1; t <= n; t++) {
      count += geometric(draws[t - 1], samplingProbability);
      logs.push(a * count + b * t);
    }
    return logs;
  }
  var PRICE_CAP = 1e12;
  function priceScale(logs) {
    var largest = logs.reduce(function (best, v) { return Math.max(best, v); }, 0);
    var clipped = largest > Math.log(PRICE_CAP);
    return { max: clipped ? PRICE_CAP : Math.max(1, Math.exp(largest)) * 1.08, clipped: clipped };
  }
  function plotPrice(logPrice) {
    // Values above the visible cap remain above the plotting rectangle. SVG
    // clipping hides them without flattening paths onto a false price plateau.
    return Math.exp(Math.min(logPrice, Math.log(PRICE_CAP) + 2));
  }
  function logMeanPriceX(n, p, q) {
    if (p * p >= q) return Infinity;
    return n * (2 * Math.log1p(-p) - Math.log1p(-q) - Math.log1p(-p * p / q));
  }
  var math = { kl: kl, tri: tri, rate: rate, nb: nb, rng: rng, geometric: geometric,
    logPath: logPath, priceScale: priceScale, plotPrice: plotPrice, logMeanPriceX: logMeanPriceX };
  if (typeof module !== 'undefined' && module.exports) module.exports = math;
  if (typeof document === 'undefined') return;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'html') node.innerHTML = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }
  function sv(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    if (parent) parent.appendChild(node);
    return node;
  }
  function clear(node) { node.replaceChildren(); }
  function fmt(x, digits) {
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '−∞';
    if (!Number.isFinite(x)) return '—';
    return x.toFixed(digits == null ? 3 : digits).replace(/^-0\.0+$/, (0).toFixed(digits == null ? 3 : digits)).replace('-', '−');
  }
  function label(x) {
    if (Math.abs(x) < 1e-12) return '0';
    if (Math.abs(x) < .001) return x.toExponential(1).replace('-', '−');
    if (Math.abs(x) >= 1e6) return x.toExponential(1).replace('-', '−');
    if (Math.abs(x) >= 1000) return fmt(x / 1000, 1) + 'k';
    return Number(x.toPrecision(3)).toString().replace('-', '−');
  }
  function control(name, key, value, min, max, step, tone, changed, format) {
    var output = el('output', { text: (format || fmt)(value) });
    var input = el('input', { type: 'range', min: min, max: max, step: step, value: value, 'data-control': key });
    var node = el('label', { class: 'dm-control dm-' + tone }, [el('span', { text: name }), output, input]);
    input.addEventListener('input', function () { output.textContent = (format || fmt)(+input.value); changed(+input.value); });
    return { node: node, input: input, set: function (v) { input.value = v; output.textContent = (format || fmt)(v); } };
  }
  function button(text, action) { var b = el('button', { type: 'button', class: 'dm-button', text: text }); b.addEventListener('click', action); return b; }
  function plot(title) {
    var chart = el('div', { class: 'dm-chart' });
    return { node: el('section', { class: 'dm-plot' }, [el('h3', { text: title }), chart]), chart: chart };
  }
  function legend(items) {
    return el('div', { class: 'dm-legend' }, items.map(function (item) {
      return el('span', { class: 'dm-key-' + item[0] }, [el('i', { 'aria-hidden': 'true' }), document.createTextNode(item[1])]);
    }));
  }
  function metric(value, name, tone) {
    return el('div', { class: 'dm-metric dm-' + tone }, [el('strong', { text: value }), el('span', { text: name })]);
  }
  function startSvg(target, height, name) {
    clear(target);
    var width = Math.max(1, target.getBoundingClientRect().width || 600);
    var svg = sv('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': name }, target);
    sv('title', { text: name }, svg);
    return { svg: svg, width: width, height: height };
  }
  function watch(root, fn) {
    if (typeof ResizeObserver === 'undefined') return;
    var last = 0, frame = 0;
    new ResizeObserver(function () {
      var next = root.getBoundingClientRect().width;
      if (Math.abs(last - next) < .5) return;
      last = next;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(fn);
    }).observe(root);
  }
  function axes(target, height, name, xMax, yMin, yMax, xTitle, yTitle, discrete) {
    var out = startSvg(target, height, name), svg = out.svg, width = out.width;
    if (Math.abs(yMax - yMin) < 1e-12) { yMin -= 1; yMax += 1; }
    var f = { left: 60, right: Math.max(76, width - 13), top: 30, bottom: height - 51 };
    f.X = function (x) { return f.left + x / Math.max(1, xMax) * (f.right - f.left); };
    f.Y = function (y) { return f.bottom - (y - yMin) / (yMax - yMin) * (f.bottom - f.top); };
    var ticks = width < 360 ? 3 : 4;
    for (var i = 0; i <= 3; i++) {
      var v = yMin + (yMax - yMin) * i / 3, yy = f.Y(v);
      sv('line', { x1: f.left, x2: f.right, y1: yy, y2: yy, class: 'dm-grid' }, svg);
      sv('text', { x: f.left - 7, y: yy + 4, 'text-anchor': 'end', class: 'dm-tick', text: label(v) }, svg);
    }
    var seen = {};
    for (var j = 0; j <= ticks; j++) {
      var xx = xMax * j / ticks;
      if (discrete) xx = Math.round(xx);
      if (seen[xx]) continue; seen[xx] = true;
      sv('text', { x: f.X(xx), y: f.bottom + 21, 'text-anchor': j === ticks ? 'end' : j === 0 ? 'start' : 'middle', class: 'dm-tick', text: label(xx) }, svg);
    }
    sv('line', { x1: f.left, x2: f.right, y1: f.bottom, y2: f.bottom, class: 'dm-axis' }, svg);
    sv('text', { x: f.left, y: 17, class: 'dm-title', text: yTitle }, svg);
    sv('text', { x: (f.left + f.right) / 2, y: height - 7, 'text-anchor': 'middle', class: 'dm-title', text: xTitle }, svg);
    return { svg: svg, f: f, width: width };
  }
  function line(svg, points, color, width, dashed, opacity) {
    return sv('polyline', { points: points.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: color, 'stroke-width': width || 2, 'stroke-dasharray': dashed || '', opacity: opacity == null ? 1 : opacity }, svg);
  }
  var plotId = 0;
  function priceClip(view) {
    var id = 'dm-price-clip-' + (++plotId), f = view.f;
    var defs = sv('defs', {}, view.svg), clip = sv('clipPath', { id: id }, defs);
    sv('rect', { x: f.left, y: f.top, width: f.right - f.left, height: f.bottom - f.top }, clip);
    return sv('g', { 'clip-path': 'url(#' + id + ')' }, view.svg);
  }
  function drawPrices(view, logs, color, opacity, group, xValues) {
    var points = logs.map(function (v, i) { return [view.f.X(xValues ? xValues[i] : i), view.f.Y(plotPrice(v))]; });
    line(group, points, color, 1.6, '', opacity);
    for (var i = 1; i < logs.length; i++) {
      if (logs[i] > Math.log(PRICE_CAP) && logs[i - 1] <= Math.log(PRICE_CAP)) {
        var x = view.f.X(xValues ? xValues[i] : i), y = view.f.top;
        sv('path', { d: 'M' + (x - 4) + ',' + (y + 8) + 'L' + x + ',' + (y + 1) + 'L' + (x + 4) + ',' + (y + 8), fill: 'none', stroke: color, 'stroke-width': 2 }, view.svg);
      }
    }
  }
  function triangle(target, name) {
    var width = target.getBoundingClientRect().width || 600;
    var height = Math.min(330, Math.max(230, width * .85));
    var view = startSvg(target, height, name), svg = view.svg;
    var a = [30, height - 36], b = [width / 2, 30], c = [width - 30, height - 36];
    function point(p) { return [p[0] * a[0] + p[1] * b[0] + p[2] * c[0], p[0] * a[1] + p[1] * b[1] + p[2] * c[1]]; }
    sv('polygon', { points: [a, b, c].map(function (p) { return p.join(','); }).join(' '), class: 'dm-simplex' }, svg);
    [[a, 'Up', 'start'], [b, 'Middle', 'middle'], [c, 'Down', 'end']].forEach(function (v, i) {
      sv('text', { x: v[0][0], y: v[0][1] + (i === 1 ? -14 : 24), 'text-anchor': v[2], text: v[1] }, svg);
    });
    function segment(p, q, css) { var s = point(p), t = point(q); sv('line', { x1: s[0], y1: s[1], x2: t[0], y2: t[1], class: css }, svg); }
    function dot(p, tone, shape) {
      var pos = point(p);
      if (shape === 'diamond') sv('path', { d: 'M' + pos[0] + ',' + (pos[1] - 8) + 'l8,8 l-8,8 l-8,-8 Z', class: 'dm-dot-' + tone + ' dm-point' }, svg);
      else sv('circle', { cx: pos[0], cy: pos[1], r: shape === 'large' ? 7 : 5.5, class: 'dm-dot-' + tone + ' dm-point' }, svg);
    }
    return { point: point, segment: segment, dot: dot, svg: svg };
  }

  function trinomial(root) {
    clear(root); root.classList.add('dm-widget');
    var t = 1 / 3, w = .4, extended = false;
    var tCtl = control('Pricing parameter t', 't', t, .02, .48, 'any', 'market', function (v) { t = v; render(); }, function (v) { return fmt(v, 4); });
    var wCtl = control('Cost weight in stock, w', 'w', w, 0, 1, .01, 'payoff', function (v) { w = v; render(); }, function (v) { return fmt(v, 2); });
    var check = el('input', { type: 'checkbox', 'data-control': 'extended' });
    check.addEventListener('change', function () {
      extended = check.checked; wCtl.input.min = extended ? -2 : 0; wCtl.input.max = extended ? 2 : 1;
      w = Math.max(extended ? -2 : 0, Math.min(extended ? 2 : 1, w)); wCtl.set(w); render();
    });
    var family = plot('1. Which pricing measure?'), portfolio = plot('2. Which portfolio?');
    family.node.appendChild(legend([['market', 'Pʸ: pricing measures'], ['asset', 'Pˣ: selected stock measure']]));
    portfolio.node.appendChild(legend([['market', 'Pʸ'], ['asset', 'Pˣ'], ['payoff', 'Pⱽ'], ['belief', 'Pᴹ (diamond)']]));
    var metrics = el('div', { class: 'dm-metrics' });
    var table = el('div');
    var readout = el('div', { class: 'dm-readout', 'aria-live': 'polite' });
    root.appendChild(el('div', { class: 'dm-controls' }, [tCtl.node, wCtl.node]));
    root.appendChild(el('label', { class: 'dm-check' }, [check, document.createTextNode('Allow borrowing and short selling, keeping terminal wealth nonnegative.')]));
    root.appendChild(el('div', { class: 'dm-actions' }, [button('Restore book example', function () { t = 1 / 3; w = .4; tCtl.set(t); wCtl.set(w); render(); }), button('Best attainable portfolio', function () { w = .4; wCtl.set(w); render(); })]));
    root.appendChild(el('div', { class: 'dm-plots' }, [family.node, portfolio.node]));
    root.appendChild(table); root.appendChild(metrics); root.appendChild(readout);

    function render() {
      var z = tri(t, w), best = tri(t, .4);
      var left = triangle(family.chart, 'The family of pricing measures for stock returns 1.5, 1 and 0.5');
      left.segment([0, 1, 0], [.5, 0, .5], 'dm-family');
      left.dot(z.q, 'market', 'large'); left.dot(z.p, 'asset');
      var right = triangle(portfolio.chart, 'Attainable stock-and-cash portfolio densities for the selected pricing measure');
      right.segment(tri(t, -2).v, tri(t, 2).v, 'dm-extended');
      right.segment(tri(t, extended ? -2 : 0).v, tri(t, extended ? 2 : 1).v, 'dm-attainable');
      right.dot(z.q, 'market'); right.dot(z.p, 'asset'); right.dot(z.v, 'payoff', 'large'); right.dot(PM, 'belief', 'diamond');
      table.innerHTML = '<table class="dm-table"><caption>Probabilities in the selected market</caption><thead><tr><th scope="col">Measure</th><th scope="col">Up</th><th scope="col">Middle</th><th scope="col">Down</th></tr></thead><tbody>' +
        [['Pʸ', z.q, 'market'], ['Pˣ', z.p, 'asset'], ['Pⱽ', z.v, 'payoff'], ['Pᴹ', PM, 'belief']].map(function (row) {
          return '<tr><th scope="row" class="dm-' + row[2] + '-text">' + row[0] + '</th>' + row[1].map(function (v) { return '<td>' + fmt(v, 3) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
      var eq = z.q.reduce(function (s, v, i) { return s + v * R[i]; }, 0);
      var ep = z.p.reduce(function (s, v, i) { return s + v / R[i]; }, 0);
      metrics.replaceChildren(metric(fmt(eq, 3), 'Eʸ[Rˣ]: stock in Y units', 'market'), metric(fmt(ep, 3), 'Eˣ[1/Rˣ]: Y in stock units', 'asset'), metric(fmt(z.q[1], 3), 'Price of a middle-state claim', 'market'));
      readout.innerHTML = '<p><strong>Expected log growth under Pᴹ: ' + fmt(z.growth, 4) + ' nats.</strong> Information ' + fmt(z.information, 4) + ' minus mismatch ' + fmt(z.mismatch, 4) + ' gives this return.</p>' +
        '<p>The best attainable weight is w = 0.40, with growth ' + fmt(best.growth, 4) + ' and remaining mismatch ' + fmt(best.mismatch, 4) + '. Every attainable density has middle-state weight ' + fmt(z.q[1], 3) + '.</p>' +
        '<p class="dm-small">' + (extended ? 'Purple: the full line segment with nonnegative terminal payoffs (−2 ≤ w ≤ 2).' : 'Purple: no-short portfolios (0 ≤ w ≤ 1). Dashed: the extension allowed by borrowing and short selling, up to nonnegative terminal wealth.') + ' The endpoints of the blue pricing-family line are limiting measures; the slider stays inside the full-support region.</p>';
    }
    render(); watch(root, render);
  }

  function negativeBinomial(root) {
    clear(root); root.classList.add('dm-widget');
    var p = .25, q = .5, m = 1 / 3, n = 1, seed = 20261003;
    var N = 30, NSHOW = 6, uniform = null;
    function generate() {
      var random = rng(seed); uniform = { X: [], Y: [] };
      ['X', 'Y'].forEach(function (key) {
        for (var j = 0; j < NSHOW; j++) {
          var values = [];
          for (var i = 0; i < N; i++) values.push(random());
          uniform[key].push(values);
        }
      });
    }
    generate();
    var cp = control('Stock counted-trial probability aˣ', 'p', p, .05, .90, .01, 'asset', function (v) { p = v; render(); }, function (v) { return fmt(v, 2); });
    var cq = control('Market counted-trial probability aʸ', 'q', q, .05, .90, .01, 'market', function (v) { q = v; render(); }, function (v) { return fmt(v, 2); });
    var cm = control('Belief counted-trial probability aᴹ', 'm', m, .05, .90, 'any', 'payoff', function (v) { m = v; render(); }, function (v) { return fmt(v, 4); });
    var cn = control('Completed shocks n', 'n', n, 1, N, 1, 'asset', function (v) { n = Math.round(v); render(); }, String);
    var laws = plot('Three laws after n shocks'), likelihood = plot('Count → price');
    var countMode = el('select', { 'data-control': 'count-scale', 'aria-label': 'Count-to-price display' }, [el('option', { value: 'price', text: 'Price X(n)/X(0)' }), el('option', { value: 'log', text: 'Log price' })]);
    countMode.addEventListener('change', render);
    likelihood.node.insertBefore(el('label', { class: 'dm-mode' }, [document.createTextNode('Show '), countMode]), likelihood.chart);
    var countNote = el('p', { class: 'dm-small' }); likelihood.node.appendChild(countNote);
    var pricePaths = plot('Price paths, starting from one'); pricePaths.node.classList.add('dm-full-plot');
    var paths = plot('The same paths on a log scale'); paths.node.classList.add('dm-full-plot');
    laws.node.appendChild(legend([['asset', 'Stock Pˣ'], ['market', 'Market Pʸ'], ['belief', 'Belief Pᴹ']]));
    var tail = el('p', { class: 'dm-small' }); laws.node.appendChild(tail);
    var pathNote = el('p', { class: 'dm-small', text: 'Six paths under each measure. Dashed lines: expected log price. Parameters reuse the same random draws; “Draw new paths” changes them.' });
    paths.node.appendChild(legend([['asset', 'Under Pˣ'], ['market', 'Under Pʸ']])); paths.node.appendChild(pathNote);
    var priceNote = el('p', { class: 'dm-small' });
    pricePaths.node.appendChild(legend([['asset', 'Under Pˣ'], ['market', 'Under Pʸ']])); pricePaths.node.appendChild(priceNote);
    var metrics = el('div', { class: 'dm-metrics' }), readout = el('div', { class: 'dm-readout', 'aria-live': 'polite' });
    root.appendChild(el('div', { class: 'dm-controls' }, [cp.node, cq.node, cm.node, cn.node]));
    root.appendChild(metrics);
    root.appendChild(el('div', { class: 'dm-plots' }, [laws.node, likelihood.node]));
    root.appendChild(el('div', { class: 'dm-actions' }, [button('Draw new paths', function () { seed = (seed + 104729) >>> 0; generate(); render(); }), button('Match stock and market', function () { p = q; cp.set(p); render(); }), button('Restore Columbia example', function () { p = .25; q = .5; m = 1 / 3; n = 1; cp.set(p); cq.set(q); cm.set(m); cn.set(n); render(); })]));
    root.appendChild(pricePaths.node); root.appendChild(paths.node); root.appendChild(readout);

    function render() {
      var px = nb(n, p, 1e-4), py = nb(n, q, 1e-4), pm = nb(n, m, 1e-4);
      var kMax = Math.max(px.values.length, py.values.length, pm.values.length) - 1;
      var a = Math.log(p / q), b = Math.log((1 - p) / (1 - q));
      var ix = rate(p, q), iy = rate(q, p), im = rate(m, q);
      metrics.replaceChildren(metric(fmt(im, 7), 'Ideal information per shock, I(aᴹ,aʸ)', 'payoff'), metric(fmt(n * im, 5), 'Ideal information after n shocks', 'payoff'), metric(fmt(n / (1 - m), 3), 'Expected total trials under Pᴹ', 'market'));
      var maxProb = Math.max.apply(null, px.values.concat(py.values, pm.values));
      var lawPlot = axes(laws.chart, 265, 'Negative-binomial count probabilities under the stock, market, and belief laws', kMax, 0, maxProb * 1.1, 'Counted trials Z(n)', 'Probability', true);
      var f = lawPlot.f;
      // Show the actual point masses with stems at short horizons; a connected
      // probability-mass profile avoids subpixel bars at long horizons.
      [[py.values, 'var(--lrw-market)'], [px.values, 'var(--lrw-asset)'], [pm.values, 'var(--lrw-belief)']].forEach(function (spec) {
        var points = spec[0].map(function (v, k) { return [f.X(k), f.Y(v)]; });
        if (kMax <= 50) points.forEach(function (v) { sv('line', { x1: v[0], x2: v[0], y1: f.Y(0), y2: v[1], stroke: spec[1], 'stroke-width': 2.5, opacity: .7 }, lawPlot.svg); });
        else {
          var poly = [[f.X(0), f.Y(0)]].concat(points, [[f.X(spec[0].length - 1), f.Y(0)]]);
          sv('polygon', { points: poly.map(function (x) { return x.join(','); }).join(' '), fill: spec[1], opacity: .14 }, lawPlot.svg);
        }
        line(lawPlot.svg, points, spec[1], 2);
      });
      tail.textContent = 'Integer counts 0–' + kMax + '. At least 99.99% of each law is displayed; the omitted tail is below 0.01%. ' + (kMax > 50 ? 'Lines connect probability masses; the distribution remains discrete.' : 'Stems mark the discrete probability masses.');

      var start = n * b, end = a * kMax + n * b;
      if (countMode.value === 'log') {
        likelihood.node.querySelector('h3').textContent = 'Count → log price';
        var low = Math.min(0, start, end), high = Math.max(0, start, end), padding = .07 * (high - low || 1);
        var lr = axes(likelihood.chart, 265, 'The affine log-likelihood ratio as a function of counted trials', kMax, low - padding, high + padding, 'Counted trials Z(n)', 'log X(n)/X(0)', true);
        line(lr.svg, [[lr.f.X(0), lr.f.Y(start)], [lr.f.X(kMax), lr.f.Y(end)]], 'var(--lrw-asset)', 2.5);
        if (low < 0 && high > 0) line(lr.svg, [[lr.f.X(0), lr.f.Y(0)], [lr.f.X(kMax), lr.f.Y(0)]], 'var(--lrw-muted)', 1, '4 4');
        countNote.textContent = 'The log price is affine in the counted trials. Switch to price to see the corresponding payoff.';
      } else {
        likelihood.node.querySelector('h3').textContent = 'Count → price';
        var countLogs = [], countXs = [];
        for (var k = 0; k <= kMax; k++) { countLogs.push(a * k + n * b); countXs.push(k); }
        var countScale = priceScale(countLogs);
        var cpPlot = axes(likelihood.chart, 265, 'Asset price as a function of counted trials, in reference-asset units', kMax, 0, countScale.max, 'Counted trials Z(n)', 'X(n)/X(0)', true);
        drawPrices(cpPlot, countLogs, 'var(--lrw-asset)', 1, priceClip(cpPlot), countXs);
        countNote.textContent = 'Prices at integer counts; the line connects those values.' + (countScale.clipped ? ' Prices above 10¹² are off scale. Switch to log price to see the full range.' : ' The vertical axis is an ordinary price scale.');
      }

      var all = { X: [], Y: [] }, minLog = Math.min(0, -n * iy), maxLog = Math.max(0, n * ix);
      ['X', 'Y'].forEach(function (key) {
        var prob = key === 'X' ? p : q;
        for (var j = 0; j < NSHOW; j++) {
          var logs = logPath(uniform[key][j], p, q, prob, n);
          logs.forEach(function (v) { minLog = Math.min(minLog, v); maxLog = Math.max(maxLog, v); });
          all[key].push(logs);
        }
      });
      var everyLog = all.X.concat(all.Y).reduce(function (values, logs) { return values.concat(logs); }, []);
      var priceRange = priceScale(everyLog);
      var priceView = axes(pricePaths.chart, 310, 'Simulated asset price paths over successive completed shocks', n, 0, priceRange.max, 'Completed shocks', 'X(t)/X(0)', true);
      var priceGroup = priceClip(priceView), offScalePaths = 0;
      ['Y', 'X'].forEach(function (key) {
        var color = key === 'X' ? 'var(--lrw-asset)' : 'var(--lrw-market)';
        all[key].forEach(function (logs) {
          if (logs.some(function (v) { return v > Math.log(PRICE_CAP); })) offScalePaths++;
          drawPrices(priceView, logs, color, .66, priceGroup);
        });
      });
      line(priceView.svg, [[priceView.f.X(0), priceView.f.Y(1)], [priceView.f.X(n), priceView.f.Y(1)]], 'var(--lrw-market)', 2, '7 5');
      priceNote.textContent = 'Ordinary price scale. Dashed blue: expected price under Pʸ is one at every shock; this is not a sample average. ' +
        (priceRange.clipped ? offScalePaths + ' of the 12 paths exceed 10¹². Upward marks indicate exits above the chart; no flat cap is substituted. The log chart below shows the full paths.' : 'The log chart below uses exactly these same paths. Rare high prices can make the mean very different from the paths in a small sample.');
      if (Math.abs(maxLog - minLog) < 1e-10) { minLog = -1; maxLog = 1; }
      var pad = .06 * (maxLog - minLog);
      var pp = axes(paths.chart, 310, 'Simulated log-price paths over successive completed shocks', n, minLog - pad, maxLog + pad, 'Completed shocks', 'log X(t)/X(0)', true);
      ['Y', 'X'].forEach(function (key) {
        var color = key === 'X' ? 'var(--lrw-asset)' : 'var(--lrw-market)';
        all[key].forEach(function (logs) { line(pp.svg, logs.map(function (v, i) { return [pp.f.X(i), pp.f.Y(v)]; }), color, 1.35, '', .58); });
        line(pp.svg, [[pp.f.X(0), pp.f.Y(0)], [pp.f.X(n), pp.f.Y(key === 'X' ? n * ix : -n * iy)]], color, 2.6, '7 5');
      });
      var bern = kl([m, 1 - m], [q, 1 - q]);
      var investorStockGrowth = n * (im - rate(m, p));
      readout.innerHTML = '<p><strong>log X(n)/X(0) = ' + fmt(a, 4) + ' × Z(n) ' + (b < 0 ? '− ' : '+ ') + fmt(Math.abs(b), 4) + ' × n.</strong></p>' +
        '<p>Belief information: ' + fmt(n / (1 - m), 3) + ' expected binary trials × ' + fmt(bern, 7) + ' nats per trial = ' + fmt(n * im, 7) + ' nats over ' + n + ' completed shock(s). This is the ideal likelihood payoff, not necessarily attainable with shock-level stock/cash trading.</p>' +
        '<p>The stock itself has expected log return ' + fmt(n * ix, 5) + ' under Pˣ, ' + fmt(-n * iy, 5) + ' under Pʸ, and ' + fmt(investorStockGrowth, 5) + ' under investor beliefs Pᴹ.</p>' +
        (logMeanPriceX(n, p, q) === Infinity ? '<p>At these settings (aˣ)² ≥ aʸ: the mean price under Pˣ is infinite, although the expected log price is finite. Under Pʸ the mean price remains exactly one. Twelve simulated paths cannot reveal an infinite mean.</p>' : '') +
        (p === q ? '<p>The stock and market laws agree: the likelihood ratio equals one for every count and every path. All log-price paths coincide at zero.</p>' : '<p>' + (p < q ? 'The counted trials are down moves; each shock ends at the first up move.' : 'At aˣ > aʸ the counted trials raise price and the terminating trial lowers it. The geometric formulas still hold.') + ' Total binary trial time is random.</p>');
    }
    render(); watch(root, render);
  }

  function mount() {
    document.querySelectorAll('[data-discrete-model]').forEach(function (node) {
      if (node.dataset.discreteMounted) return;
      var type = node.dataset.discreteModel;
      if (type === 'trinomial') trinomial(node);
      else if (type === 'negative-binomial') negativeBinomial(node);
      else return;
      node.dataset.discreteMounted = 'true';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
