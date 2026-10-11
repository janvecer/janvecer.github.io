/* lr-widgets.js
 * Interactive figures for the "Prices as likelihood ratios" pages.
 * No dependencies. Every element with a data-lrw="<name>" attribute is
 * replaced by the corresponding widget once the page has loaded.
 *
 * Notation follows Principles of Portfolio Choice: P^Y pricing measure,
 * P^M the investor's model, P^V the measure implied by a payoff V,
 * P^X the measure of a traded asset X. All values are in units of Y.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var MINUS = '\u2212';
  var uid = 0;

  /* ------------------------------------------------------------ math */

  // Relative entropy D(P||Q) in nats; +Infinity if P charges a zero of Q.
  function kl(P, Q) {
    var s = 0;
    for (var i = 0; i < P.length; i++) {
      if (P[i] > 0) {
        if (!(Q[i] > 0)) return Infinity;
        s += P[i] * Math.log(P[i] / Q[i]);
      }
    }
    return s < 1e-12 ? 0 : s;
  }
  function klB(p, q) { return kl([p, 1 - p], [q, 1 - q]); }

  // Expected log gross return under R of a payoff whose implied measure is PV.
  function expLogReturn(R, PV, PY) {
    var s = 0;
    for (var i = 0; i < R.length; i++) {
      if (R[i] > 0) {
        if (!(PV[i] > 0)) return -Infinity;
        s += R[i] * Math.log(PV[i] / PY[i]);
      }
    }
    return Math.abs(s) < 1e-12 ? 0 : s;
  }

  var logFact = (function () {
    var a = [0];
    for (var i = 1; i <= 4000; i++) a[i] = a[i - 1] + Math.log(i);
    return a;
  })();

  function binomPMF(n, p) {
    var out = new Array(n + 1);
    for (var k = 0; k <= n; k++) {
      var lp = logFact[n] - logFact[k] - logFact[n - k];
      if (k > 0) lp += k * Math.log(p);
      if (n - k > 0) lp += (n - k) * Math.log(1 - p);
      out[k] = Math.exp(lp);
    }
    return out;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Set component i of a probability vector to x and rescale the others
  // proportionally; every component stays >= min.
  function setSimplex(vec, i, x, min) {
    var k = vec.length, j;
    x = Math.min(Math.max(x, min), 1 - (k - 1) * min);
    var rest = 0;
    for (j = 0; j < k; j++) if (j !== i) rest += vec[j];
    var out = vec.slice();
    out[i] = x;
    for (j = 0; j < k; j++) {
      if (j === i) continue;
      out[j] = rest > 1e-12 ? vec[j] * (1 - x) / rest : (1 - x) / (k - 1);
    }
    if (min > 0) {
      var deficit = 0, jmax = -1;
      for (j = 0; j < k; j++) {
        if (j !== i && out[j] < min) { deficit += min - out[j]; out[j] = min; }
      }
      if (deficit > 0) {
        for (j = 0; j < k; j++) if (j !== i && (jmax < 0 || out[j] > out[jmax])) jmax = j;
        out[jmax] -= deficit;
      }
    }
    return out;
  }

  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (!(span > 0)) return [lo];
    var step0 = span / (count || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(step0)));
    var err = step0 / mag;
    var step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    var out = [];
    for (var v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * span; v += step) {
      out.push(Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(12));
    }
    return out;
  }

  /* ------------------------------------------------------ formatting */

  function fmt(x, d) {
    if (d == null) d = 3;
    if (x === Infinity) return '\u221e';
    if (x === -Infinity) return MINUS + '\u221e';
    if (x !== x) return '\u2014';
    // A valid tiny probability or divergence should not be displayed as zero.
    if (x !== 0 && Math.abs(x) < 0.5 * Math.pow(10, -d)) return x.toExponential(2).replace('-', MINUS);
    var s = x.toFixed(d);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    return s.replace('-', MINUS);
  }
  function fmtTick(x) {
    var s = String(+x.toPrecision(6));
    return s.replace('-', MINUS);
  }
  function fmtMoney(x) { return Math.round(x).toLocaleString('en-US').replace('-', MINUS); }
  function pct(x) { return (100 * x).toFixed(1) + '%'; }
  function fmtProbability(x) {
    var onGrid = Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
    return fmt(x, onGrid ? 2 : 3);
  }

  // Notation as HTML fragments.
  function Pm(m) { return '\u2119<sup>' + m + '</sup>'; }
  function Em(m) { return '\ud835\udd3c<sup>' + m + '</sup>'; }
  function Dkl(a, b) { return 'D(' + Pm(a) + '\u2016' + Pm(b) + ')'; }
  function num(x, tone, d) {
    return '<span class="lrw-num' + (tone ? ' lrw-c-' + tone : '') + '">' + fmt(x, d) + '</span>';
  }

  /* ------------------------------------------------------ DOM helpers */

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      }
    }
    if (kids) {
      kids = [].concat(kids);
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] == null) continue;
        if (k === 'text') e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function newSvg(w, hgt, label) {
    return sv('svg', { viewBox: '0 0 ' + w + ' ' + hgt, role: 'img', 'aria-label': label || null,
                       preserveAspectRatio: 'xMidYMid meet', class: w < 600 ? 'lrw-narrow' : null });
  }

  // Charts are laid out in one of two coordinate widths so that text stays
  // legible on phones: 640 units on wide containers, 440 on narrow ones.
  function widthOf(root) {
    var cw = root.clientWidth;
    return cw && cw < 560 ? 440 : 640;
  }
  function watchWidth(root, redraw) {
    if (typeof ResizeObserver === 'undefined') return;
    var last = widthOf(root);
    new ResizeObserver(function () {
      var now = widthOf(root);
      if (now !== last) { last = now; redraw(); }
    }).observe(root);
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function slider(o) {
    var id = 'lrw-control-' + (++uid);
    // Derived values need not lie on the user-input step grid. Keep the thumb
    // at the actual value; apply the intended step only to user interaction.
    var input = h('input', { id: id, type: 'range', min: o.min, max: o.max, step: 'any', value: o.value });
    var out = h('output', { 'for': id });
    var lab = h('div', { class: 'lrw-ctl' + (o.tone ? ' lrw-tone-' + o.tone : '') },
      [h('label', { 'for': id, class: 'lrw-ctl-name', html: o.label }), input, out]);
    var format = o.format || (o.min >= 0 && o.max <= 1 ? fmtProbability : function (v) { return fmt(v, 2); });
    function show(v) { out.textContent = format(v); input.setAttribute('aria-valuetext', format(v)); }
    function update(v) {
      v = Math.max(+input.min, Math.min(+input.max, +v.toPrecision(12)));
      input.value = v; show(v); o.onInput(v);
    }
    input.addEventListener('input', function () {
      update(o.min + Math.round((+input.value - o.min) / o.step) * o.step);
    });
    input.addEventListener('keydown', function (event) {
      var direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      update(+input.value + direction * o.step);
    });
    show(+o.value);
    return {
      node: lab,
      input: input,
      set: function (v) {
        // The inverse map may produce valid probabilities or multipliers
        // beyond the starting slider range. Never silently clamp them.
        input.min = Math.min(o.min, v); input.max = Math.max(o.max, v);
        input.value = v; show(v);
      },
      setMax: function (m) { input.max = m; }
    };
  }

  function group(titleHtml, tone, kids) {
    var id = 'lrw-group-' + (++uid);
    return h('div', { class: 'lrw-group', role: 'group', 'aria-labelledby': id },
      [h('div', { id: id, class: 'lrw-group-title', html: (tone ? '<span class="lrw-swatch lrw-bg-' + tone + '"></span>' : '') + titleHtml })]
        .concat(kids));
  }

  function legend(items) {
    return h('div', { class: 'lrw-legend' }, items.map(function (it) {
      return h('span', { class: 'lrw-legend-item', html:
        '<span class="lrw-swatch lrw-bg-' + it[0] + (it[2] ? ' lrw-swatch-' + it[2] : '') + '"></span>' + it[1] });
    }));
  }

  function button(text, onClick, extra) {
    var b = h('button', { type: 'button', class: 'lrw-btn', onclick: onClick }, [text]);
    if (extra) for (var k in extra) b.setAttribute(k, extra[k]);
    return b;
  }

  /* ------------------------------------------------------ chart helpers */

  function frame(o) {
    var f = Object.assign({}, o);
    f.X = function (v) { return o.x + (v - o.xlo) / (o.xhi - o.xlo) * o.w; };
    f.Y = function (v) { return o.y + o.h - (v - o.ylo) / (o.yhi - o.ylo) * o.h; };
    return f;
  }

  function yAxis(svg, f, ticks, format, title) {
    var g = sv('g', { class: 'lrw-axis' }, svg);
    ticks.forEach(function (t) {
      var y = f.Y(t);
      sv('line', { x1: f.x, x2: f.x + f.w, y1: y, y2: y, class: t === 0 ? 'lrw-zero' : 'lrw-grid' }, g);
      sv('text', { x: f.x - 6, y: y + 4, 'text-anchor': 'end', text: (format || fmtTick)(t) }, g);
    });
    if (title) {
      var titleOffset = svg.getAttribute('class') === 'lrw-narrow' ? 64 : 38;
      sv('text', { x: 0, y: 0, transform: 'translate(' + (f.x - titleOffset) + ',' + (f.y + f.h / 2) + ') rotate(-90)',
                   'text-anchor': 'middle', class: 'lrw-axis-title', text: title }, g);
    }
  }

  function xAxis(svg, f, ticks, format, title) {
    var g = sv('g', { class: 'lrw-axis' }, svg);
    var y0 = f.y + f.h;
    sv('line', { x1: f.x, x2: f.x + f.w, y1: y0, y2: y0, class: 'lrw-baseline' }, g);
    ticks.forEach(function (t) {
      var x = f.X(t);
      sv('line', { x1: x, x2: x, y1: y0, y2: y0 + 4, class: 'lrw-tick' }, g);
      sv('text', { x: x, y: y0 + 16, 'text-anchor': 'middle', text: (format || fmtTick)(t) }, g);
    });
    if (title) {
      sv('text', { x: f.x + f.w / 2, y: y0 + 32, 'text-anchor': 'middle', class: 'lrw-axis-title', text: title }, g);
    }
  }

  function clipTo(svg, f) {
    var id = 'lrw-clip-' + (++uid);
    var cp = sv('clipPath', { id: id }, sv('defs', null, svg));
    sv('rect', { x: f.x, y: f.y, width: f.w, height: f.h }, cp);
    return 'url(#' + id + ')';
  }

  function polyline(points, attrs, parent) {
    var d = '';
    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (!isFinite(pt[1])) continue;
      d += (d ? 'L' : 'M') + pt[0].toFixed(2) + ',' + pt[1].toFixed(2);
    }
    attrs = Object.assign({ d: d, fill: 'none' }, attrs);
    return sv('path', attrs, parent);
  }

  // Grouped probability bars: groups = outcome names, series = [{tone, values}].
  function probBars(svg, f, names, series) {
    var nG = names.length, nS = series.length;
    var gw = f.w / nG, bw = Math.min(46, gw * 0.7 / nS);
    names.forEach(function (name, i) {
      var cx = f.x + gw * (i + 0.5);
      series.forEach(function (s, j) {
        var v = s.values[i];
        var x = cx - (nS * bw) / 2 + j * bw;
        var y = f.Y(Math.max(v, 0));
        var rect = sv('rect', { x: x + 1, y: y, width: bw - 2, height: Math.max(f.Y(0) - y, 0), class: 'lrw-fill-' + s.tone }, svg);
        sv('title', { text: name + ': ' + fmtProbability(v) }, rect);
        if (svg.getAttribute('class') !== 'lrw-narrow' && bw >= 30) {
          sv('text', { x: x + bw / 2, y: y - 4, 'text-anchor': 'middle', class: 'lrw-bar-label', text: fmt(v, 2) }, svg);
        }
      });
      sv('text', { x: cx, y: f.y + f.h + 18, 'text-anchor': 'middle', class: 'lrw-cat', text: name }, svg);
    });
    sv('line', { x1: f.x, x2: f.x + f.w, y1: f.Y(0), y2: f.Y(0), class: 'lrw-baseline' }, svg);
  }

  /* ------------------------------------------------------ shared state */

  function makeStore(init) {
    var state = Object.assign({}, init), subs = [];
    return {
      get: function () { return state; },
      set: function (patch, source) {
        state = Object.assign({}, state, patch);
        subs.forEach(function (fn) { fn(state, source); });
      },
      sub: function (fn) { subs.push(fn); }
    };
  }

  var STORES = {
    three: makeStore({ pm: [0.6, 0.3, 0.1], py: [0.5, 0.3, 0.2] }),
    binom: makeStore({ p: 0.75, q: 0.5, pm: 2 / 3 })
  };

  var OUTCOMES = ['Win', 'Draw', 'Loss'];

  /* =============================================================
   * Framework page, figure 1: a model determines a payoff.
   * ============================================================= */
  function threeState(root) {
    var store = STORES.three, M0 = 1000;
    var sM = [], sY = [];
    OUTCOMES.forEach(function (name, i) {
      sM.push(slider({ label: name, min: 0, max: 1, step: 0.01, value: store.get().pm[i], tone: 'belief',
        format: function (v) { return fmt(v, 3); },
        onInput: function (v) { store.set({ pm: setSimplex(store.get().pm, i, v, 0) }); } }));
      sY.push(slider({ label: name, min: 0.01, max: 0.98, step: 0.01, value: store.get().py[i], tone: 'market',
        format: function (v) { return fmt(v, 3); },
        onInput: function (v) { store.set({ py: setSimplex(store.get().py, i, v, 0.01) }); } }));
    });
    var reset = button('Restore the Chapter 1 example', function () {
      store.set({ pm: [0.6, 0.3, 0.1], py: [0.5, 0.3, 0.2] });
    });

    var controls = h('div', { class: 'lrw-controls' }, [
      group('Your model ' + Pm('M'), 'belief', sM.map(function (s) { return s.node; })),
      group('Market state prices ' + Pm('Y'), 'market', sY.map(function (s) { return s.node; }))
    ]);
    var svgWrap = h('div', { class: 'lrw-chart' });
    var table = h('table', { class: 'lrw-table' });
    var tableWrap = h('div', { class: 'lrw-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'State claims and payoffs; scroll horizontally if needed' }, [table]);
    var readout = h('div', { class: 'lrw-readout' });

    root.appendChild(h('div', { class: 'lrw' }, [
      controls,
      h('div', { class: 'lrw-actions' }, [reset]),
      svgWrap, tableWrap, readout
    ]));

    function render(st) {
      st.pm.forEach(function (v, i) { sM[i].set(v); });
      st.py.forEach(function (v, i) { sY[i].set(v); });

      clear(svgWrap);
      var W = widthOf(root);
      var svg = newSvg(W, 210, 'Probabilities of the three outcomes under your model and under market prices');
      var left = W < 600 ? 80 : 48;
      var f = frame({ x: left, y: 22, w: W - left - 16, h: 150, xlo: 0, xhi: 1, ylo: 0, yhi: 1 });
      yAxis(svg, f, [0, 0.25, 0.5, 0.75, 1], null, 'probability');
      probBars(svg, f, OUTCOMES, [{ tone: 'belief', values: st.pm }, { tone: 'market', values: st.py }]);
      svgWrap.appendChild(svg);

      var R = st.pm.map(function (m, i) { return m / st.py[i]; });
      var rows = OUTCOMES.map(function (name, i) {
        return '<tr><th scope="row">' + name + '</th>' +
          '<td class="lrw-c-belief">' + fmt(st.pm[i], 3) + '</td>' +
          '<td class="lrw-c-market">' + fmt(st.py[i], 3) + '</td>' +
          '<td>' + fmtMoney(M0 * st.pm[i]) + '</td>' +
          '<td>' + fmt(1 / st.py[i], 2) + '</td>' +
          '<td><strong>' + fmtMoney(M0 * R[i]) + '</strong></td>' +
          '<td>' + fmt(R[i], 3) + '</td></tr>';
      }).join('');
      table.innerHTML =
        '<thead><tr><th scope="col">Outcome</th><th scope="col">' + Pm('M') + '(\u03c9)</th>' +
        '<th scope="col">' + Pm('Y') + '(\u03c9)</th><th scope="col">Stake</th>' +
        '<th scope="col">Payout per unit staked</th><th scope="col">Payoff M(1,\u03c9)</th>' +
        '<th scope="col">Gross return</th></tr></thead><tbody>' + rows + '</tbody>';

      var dMY = kl(st.pm, st.py), dYM = kl(st.py, st.pm);
      readout.innerHTML =
        '<p>Stake = M(0)\u2009' + Pm('M') + '(\u03c9) with M(0) = 1,000; payout per unit staked = 1/' + Pm('Y') + '(\u03c9). ' +
        'The gross return in each outcome is the likelihood ratio ' + Pm('M') + '(\u03c9)/' + Pm('Y') + '(\u03c9).</p>' +
        '<p>Expected log return under your model: ' + Em('M') + ' log(M(1)/M(0)) = ' + Dkl('M', 'Y') + ' = ' + num(dMY, 'belief', 4) + '</p>' +
        '<p>The same position under the market\u2019s model: ' + Em('Y') + ' log(M(1)/M(0)) = ' + MINUS + Dkl('Y', 'M') + ' = ' + num(-dYM, 'market', 4) + '</p>';
    }
    store.sub(render);
    watchWidth(root, function () { render(store.get()); });
    render(store.get());
  }

  /* =============================================================
   * Framework page, figure 2: a payoff determines a model.
   * ============================================================= */
  function payoffFirst(root) {
    var store = STORES.three;
    var V = [1400, 900, 400];
    var sV = OUTCOMES.map(function (name, i) {
      return slider({ label: name, min: 0, max: 3000, step: 10, value: V[i], tone: 'payoff',
        format: function (v) { return fmtMoney(v); },
        onInput: function (v) { V[i] = v; render(store.get()); } });
    });
    var bLR = button('Set V to the likelihood-ratio payoff', function () {
      var st = store.get();
      var R = st.pm.map(function (m, i) { return m / st.py[i]; });
      var mx = Math.max.apply(null, R);
      var scale = Math.min(1000, 3000 / mx);
      V = R.map(function (r) { return scale * r; });
      render(st);
    });
    var bY = button('Set V to the reference asset', function () { V = [1000, 1000, 1000]; render(store.get()); });

    var context = h('p', { class: 'lrw-context' });
    var svgWrap = h('div', { class: 'lrw-chart' });
    var decomp = h('div', { class: 'lrw-chart' });
    var readout = h('div', { class: 'lrw-readout' });

    root.appendChild(h('div', { class: 'lrw' }, [
      h('div', { class: 'lrw-controls' }, [group('Payoff V(1,\u03c9), in units of Y', 'payoff', sV.map(function (s) { return s.node; }))]),
      h('div', { class: 'lrw-actions' }, [bLR, bY]),
      context,
      legend([['belief', 'Your model ' + Pm('M')], ['market', 'Market ' + Pm('Y')], ['payoff', 'Implied by V: ' + Pm('V')]]),
      svgWrap, decomp, readout
    ]));

    function render(st) {
      V.forEach(function (v, i) { sV[i].set(v); });
      context.innerHTML = 'Using ' + Pm('M') + ' = (' + st.pm.map(function (x) { return fmt(x, 3); }).join(', ') +
        ') and ' + Pm('Y') + ' = (' + st.py.map(function (x) { return fmt(x, 3); }).join(', ') + ') from the figure above.';

      var V0 = 0;
      for (var i = 0; i < 3; i++) V0 += st.py[i] * V[i];
      clear(svgWrap); clear(decomp);
      if (!(V0 > 0)) {
        readout.innerHTML = '<p class="lrw-warn">V pays nothing in any outcome, so its price is zero and it implies no distribution. Raise one of the payoffs.</p>';
        return;
      }
      var PV = V.map(function (v, i) { return v * st.py[i] / V0; });

      var W = widthOf(root);
      var svg = newSvg(W, 210, 'Your model, market prices, and the distribution implied by the payoff V');
      var left = W < 600 ? 80 : 48;
      var f = frame({ x: left, y: 22, w: W - left - 16, h: 150, xlo: 0, xhi: 1, ylo: 0, yhi: 1 });
      yAxis(svg, f, [0, 0.25, 0.5, 0.75, 1], null, 'probability');
      probBars(svg, f, OUTCOMES, [{ tone: 'belief', values: st.pm }, { tone: 'market', values: st.py }, { tone: 'payoff', values: PV }]);
      svgWrap.appendChild(svg);

      var d1 = kl(st.pm, st.py), d2 = kl(st.pm, PV), g = expLogReturn(st.pm, PV, st.py);
      drawDecomposition(decomp, d1, d2, g, W);

      readout.innerHTML =
        '<p>Price: V(0) = ' + Em('Y') + '[V(1)] = ' + fmtMoney(V0) + '. Implied distribution: ' + Pm('V') + ' = (' +
        PV.map(function (x) { return '<span class="lrw-c-payoff">' + fmt(x, 3) + '</span>'; }).join(', ') + ').</p>' +
        '<p>' + Em('M') + ' log(V(1)/V(0)) = ' + Dkl('M', 'Y') + ' ' + MINUS + ' ' + Dkl('M', 'V') + ' = ' +
        num(d1, 'belief', 4) + ' ' + MINUS + ' ' + num(d2, 'loss', 4) + ' = ' + num(g, 'payoff', 4) + '</p>' +
        (g === -Infinity ? '<p class="lrw-warn">Your model gives positive probability to an outcome in which V pays nothing, so the expected log return is ' + MINUS + '\u221e.</p>' : '');
    }
    store.sub(render);
    watchWidth(root, function () { render(store.get()); });
    render(store.get());
  }

  function drawDecomposition(wrap, d1, d2, g, W) {
    // Wide: bars on the left, labels on the right. Narrow: labels above bars.
    var wide = W >= 600;
    var svg = newSvg(W, wide ? 118 : 192, 'Expected log return as information minus mismatch');
    var finite = isFinite(g);
    var lo = Math.min(0, finite ? g : 0), hi = Math.max(d1, finite ? g : 0, 1e-6);
    var pad = 0.08 * (hi - lo || 1);
    var f = frame({ x: 16, y: 6, w: wide ? 300 : W - 32, h: 100, xlo: lo - (finite ? pad : 0), xhi: hi + pad, ylo: 0, yhi: 1 });
    var X = f.X, rowH = wide ? 22 : 18, ys = wide ? [10, 44, 78] : [30, 92, 154];
    sv('line', { x1: X(0), x2: X(0), y1: wide ? 4 : 26, y2: wide ? 106 : 176, class: 'lrw-zero' }, svg);

    function bar(y, a, b, tone) {
      var x1 = X(Math.min(a, b)), x2 = X(Math.max(a, b));
      sv('rect', { x: x1, y: y, width: Math.max(x2 - x1, 1), height: rowH, class: 'lrw-fill-' + tone }, svg);
    }
    function label(y, text, value, tone) {
      if (wide) {
        var t = sv('text', { x: 332, y: y + 15 }, svg);
        sv('tspan', { text: text + '  ' }, t);
        sv('tspan', { class: 'lrw-tfill-' + tone + ' lrw-strong', text: value }, t);
      } else {
        sv('text', { x: 16, y: y - 6, text: text }, svg);
        sv('text', { x: W - 16, y: y - 6, 'text-anchor': 'end', class: 'lrw-tfill-' + tone + ' lrw-strong', text: value }, svg);
      }
    }
    bar(ys[0], 0, d1, 'belief');
    label(ys[0], wide ? 'information relative to prices' : 'information', fmt(d1, 4), 'belief');
    if (isFinite(d2)) bar(ys[1], d1 - d2, d1, 'loss');
    else bar(ys[1], f.xlo, d1, 'loss');
    label(ys[1], wide ? 'mismatch with your model' : 'mismatch', MINUS + fmt(d2, 4), 'loss');
    if (finite) bar(ys[2], 0, g, 'payoff');
    label(ys[2], wide ? 'expected log return of V' : 'expected log return', fmt(g, 4), 'payoff');
    wrap.appendChild(svg);
  }

  /* =============================================================
   * Binomial page, figure 1: two probabilities, two multipliers.
   * ============================================================= */
  function binomialStep(root) {
    var store = STORES.binom;
    var mode = 'prob';
    var st0 = store.get();
    var u = st0.p / st0.q, d = (1 - st0.p) / (1 - st0.q);

    var sp = slider({ label: Pm('X') + '(H) = p', min: 0.01, max: 0.99, step: 0.01, value: st0.p, tone: 'asset',
      onInput: function (v) { store.set({ p: v }); } });
    var sq = slider({ label: Pm('Y') + '(H) = q', min: 0.01, max: 0.99, step: 0.01, value: st0.q, tone: 'market',
      onInput: function (v) { store.set({ q: v }); } });
    var su = slider({ label: 'H multiplier u', min: 0.01, max: 3, step: 0.01, value: u, tone: 'asset',
      format: function (v) { return fmt(v, 3); }, onInput: function (v) { u = v; fromMultipliers(); } });
    var sd = slider({ label: 'T multiplier d', min: 0.01, max: 3, step: 0.01, value: d, tone: 'asset',
      format: function (v) { return fmt(v, 3); }, onInput: function (v) { d = v; fromMultipliers(); } });

    var bProb = button('Start from probabilities', function () { setMode('prob'); }, { 'aria-pressed': 'true' });
    var bMult = button('Start from multipliers', function () { setMode('mult'); }, { 'aria-pressed': 'false' });
    var probGroup = group('Probabilities', null, [sp.node, sq.node]);
    var multGroup = group('Multipliers', null, [su.node, sd.node]);
    var controls = h('div', { class: 'lrw-controls' }, [probGroup, multGroup]);
    var modeNote = h('p', { class: 'lrw-context lrw-mode-note', role: 'status' });
    modeNote.hidden = true;
    var svgWrap = h('div', { class: 'lrw-chart' });
    var readout = h('div', { class: 'lrw-readout' });
    var invalid = null;

    root.appendChild(h('div', { class: 'lrw' }, [
      h('div', { class: 'lrw-actions lrw-toggle', role: 'group', 'aria-label': 'Choose the primitive inputs' }, [bProb, bMult]),
      modeNote,
      controls,
      legend([['asset', 'Asset ' + Pm('X')], ['market', 'Market ' + Pm('Y')]]),
      svgWrap, readout
    ]));

    function setMode(m, note) {
      mode = m;
      modeNote.textContent = note || '';
      modeNote.hidden = !note;
      bProb.setAttribute('aria-pressed', m === 'prob');
      bMult.setAttribute('aria-pressed', m === 'mult');
      probGroup.hidden = m !== 'prob';
      multGroup.hidden = m !== 'mult';
      if (m === 'mult') {
        var st = store.get();
        u = st.p / st.q; d = (1 - st.p) / (1 - st.q);
        su.set(u); sd.set(d);
      }
      invalid = null;
      render(store.get());
    }

    function fromMultipliers() {
      if (u === d) {
        if (u === 1) { invalid = null; store.set({ p: store.get().q }); }
        else { invalid = 'deterministic-arb'; render(store.get()); }
        return;
      }
      var q = (1 - d) / (u - d), p = u * q;
      if (q > 0 && q < 1 && p > 0 && p < 1) { invalid = null; store.set({ p: p, q: q }); }
      else { invalid = 'arb'; render(store.get()); }
    }

    function render(st) {
      sp.set(st.p); sq.set(st.q);
      var uu = mode === 'mult' ? u : st.p / st.q;
      var dd = mode === 'mult' ? d : (1 - st.p) / (1 - st.q);

      clear(svgWrap);
      var W = widthOf(root), wide = W >= 600;
      var svg = newSvg(W, wide ? 230 : 300, 'One-period binomial tree and the two probability measures');
      // tree: node labels carry the multiplier, the scenario, and both probabilities
      var n0 = wide ? [70, 110] : [84, 142];
      var nu = wide ? [250, 30] : [216, 26], nd = wide ? [250, 158] : [216, 178];
      sv('line', { x1: n0[0], y1: n0[1], x2: nu[0], y2: nu[1], class: 'lrw-edge' }, svg);
      sv('line', { x1: n0[0], y1: n0[1], x2: nd[0], y2: nd[1], class: 'lrw-edge' }, svg);
      [n0, nu, nd].forEach(function (n) { sv('circle', { cx: n[0], cy: n[1], r: 4, class: 'lrw-node' }, svg); });
      sv('text', { x: wide ? n0[0] - 10 : n0[0], y: wide ? n0[1] + 4 : n0[1] - 20,
                   'text-anchor': wide ? 'end' : 'middle', text: 'X(0) = 1' }, svg);
      function nodeLabels(n, mult, scen, px, py) {
        var x = n[0] + 12;
        sv('text', { x: x, y: n[1] + 4, class: 'lrw-strong', text: mult }, svg);
        sv('text', { x: x, y: n[1] + (wide ? 20 : 30), class: 'lrw-muted', text: scen }, svg);
        if (px) {
          sv('text', { x: x, y: n[1] + (wide ? 38 : 56), class: 'lrw-tfill-asset', text: px }, svg);
          sv('text', { x: x, y: n[1] + (wide ? 54 : 82), class: 'lrw-tfill-market', text: py }, svg);
        }
      }
      var ok = !invalid;
      nodeLabels(nu, 'u = ' + fmt(uu, 3), 'H', ok && ('p = ' + fmt(st.p, 3)), ok && ('q = ' + fmt(st.q, 3)));
      nodeLabels(nd, 'd = ' + fmt(dd, 3), 'T', ok && ('1' + MINUS + 'p = ' + fmt(1 - st.p, 3)), ok && ('1' + MINUS + 'q = ' + fmt(1 - st.q, 3)));
      if (ok && wide) {
        var f = frame({ x: 430, y: 16, w: 190, h: 170, xlo: 0, xhi: 1, ylo: 0, yhi: 1 });
        yAxis(svg, f, [0, 0.5, 1], null, 'probability');
        probBars(svg, f, ['H', 'T'], [{ tone: 'asset', values: [st.p, 1 - st.p] }, { tone: 'market', values: [st.q, 1 - st.q] }]);
      }
      svgWrap.appendChild(svg);

      if (invalid === 'deterministic-arb') {
        readout.innerHTML = '<p class="lrw-warn">With u = d = ' + fmt(uu, 3) +
          ', the asset has a certain return different from 1 in units of Y. This is an arbitrage: ' +
          'a riskless asset can be fairly priced here only when u = d = 1. Other figures retain the last valid probabilities.</p>';
        return;
      }
      if (invalid === 'arb') {
        readout.innerHTML = '<p class="lrw-warn">No full-support pricing probabilities produce these multipliers: ' +
          'they do not lie strictly on opposite sides of 1. One asset weakly dominates the other in both states and strictly in at least one, ' +
          'so this is an arbitrage when both states are possible. Here q = (1' + MINUS + 'd)/(u' + MINUS + 'd) ' +
          'is outside (0, 1). Other figures retain the last valid probabilities.</p>';
        return;
      }
      var dXY = klB(st.p, st.q), dYX = klB(st.q, st.p);
      var mart = st.q * uu + (1 - st.q) * dd;
      var reciprocalMart = st.p / uu + (1 - st.p) / dd;
      readout.innerHTML =
        '<p>u = p/q = ' + num(uu, 'asset', 3) + ', d = (1' + MINUS + 'p)/(1' + MINUS + 'q) = ' + num(dd, 'asset', 3) +
        '.</p><p>Martingale check under ' + Pm('Y') + ': q\u2009u + (1' + MINUS + 'q)\u2009d = ' + fmt(mart, 3) + '.</p>' +
        '<p>Reciprocal martingale under ' + Pm('X') + ': p/u + (1' + MINUS + 'p)/d = ' + fmt(reciprocalMart, 3) + '.</p>' +
        (st.p === st.q ? '<p>With p = q, both multipliers are 1 and X is the reference asset. ' +
          'The inverse formula is undefined (0/0): these multipliers do not identify q. Any common p = q in (0, 1) gives this same payoff.</p>' :
          '<p>Recovering the inputs: q = (1' + MINUS + 'd)/(u' + MINUS + 'd) = ' + num(st.q, 'market', 3) +
          ' and p = u\u2009q = ' + num(st.p, 'asset', 3) + '.</p>') +
        '<p>' + Em('X') + ' log(X(1)/X(0)) = ' + Dkl('X', 'Y') + ' = ' + num(dXY, 'asset', 4) + '; ' +
        Em('Y') + ' log(X(1)/X(0)) = ' + MINUS + Dkl('Y', 'X') + ' = ' + num(-dYX, 'market', 4) + '.</p>';
    }

    probGroup.hidden = false; multGroup.hidden = true;
    store.sub(function (st, source) {
      if (mode === 'mult' && (source === 'growth-probability' || source === 'time-probability')) {
        setMode('prob', 'A probability was changed in a later figure. This figure has switched to probability mode so the current p and q remain the inputs.');
        return;
      }
      if (mode === 'mult' && !invalid) { u = st.p / st.q; d = (1 - st.p) / (1 - st.q); su.set(u); sd.set(d); }
      render(st);
    });
    watchWidth(root, function () { render(store.get()); });
    render(store.get());
  }

  /* =============================================================
   * Binomial page, figure 2: growth of every two-state position.
   * ============================================================= */
  function binomialGrowth(root) {
    var store = STORES.binom;
    var v = 2 / 3, gamma = 2;

    function g(pm, q, x) {
      var s = 0;
      if (pm > 0) s += pm * Math.log(x / q);
      if (pm < 1) s += (1 - pm) * Math.log((1 - x) / (1 - q));
      return s;
    }
    function crra(pm, q, a) {
      var up = Math.pow(pm, a) * Math.pow(q, 1 - a), dn = Math.pow(1 - pm, a) * Math.pow(1 - q, 1 - a);
      return up / (up + dn);
    }

    var spm = slider({ label: Pm('M') + '(H)', min: 0, max: 1, step: 0.01, value: store.get().pm, tone: 'belief',
      onInput: function (x) { store.set({ pm: x }); } });
    var sq = slider({ label: Pm('Y') + '(H) = q', min: 0.01, max: 0.99, step: 0.01, value: store.get().q, tone: 'market',
      onInput: function (x) { store.set({ q: x }, 'growth-probability'); } });
    var sv_ = slider({ label: Pm('V') + '(H) = v', min: 0.01, max: 0.99, step: 0.01, value: v, tone: 'payoff',
      onInput: function (x) { v = x; render(store.get()); } });
    var sg = slider({ label: 'risk aversion \u03b3', min: 1, max: 10, step: 0.1, value: gamma,
      format: function (x) { return fmt(x, 1); }, onInput: function (x) { gamma = x; render(store.get()); } });

    var svgWrap = h('div', { class: 'lrw-chart' });
    var markerKey = h('div', { class: 'lrw-marker-key', 'aria-label': 'All six positions and their expected log returns' });
    var readout = h('div', { class: 'lrw-readout' });
    root.appendChild(h('div', { class: 'lrw' }, [
      h('div', { class: 'lrw-controls' }, [
        group('Beliefs and prices', null, [spm.node, sq.node]),
        group('Your position', null, [sv_.node, sg.node])
      ]),
      h('div', { class: 'lrw-actions' }, [
        button('Match the belief target', function () { v = store.get().pm; render(store.get()); }),
        button('Restore Columbia example', function () { v = 2 / 3; gamma = 2; store.set({ p: .75, q: .5, pm: 2 / 3 }, 'growth-probability'); })
      ]),
      svgWrap, markerKey, readout
    ]));

    function render(st) {
      spm.set(st.pm); sq.set(st.q); sv_.set(v); sg.set(gamma);
      var pm = st.pm, q = st.q, p = st.p;
      var peak = klB(pm, q);
      var a = 1 / gamma;
      var vf = (1 - a) * q + a * pm, vc = crra(pm, q, a);
      var lowest = Math.min(0, g(pm, q, v), g(pm, q, p), g(pm, q, vf), g(pm, q, vc));
      var span = peak - lowest;
      if (!(span > 1e-6)) span = 0.02;
      var yhi = peak + 0.18 * span, ylo = lowest - 0.12 * span;
      var W = widthOf(root);
      var left = W < 600 ? 80 : 64;
      var f = frame({ x: left, y: 18, w: W - left - 24, h: 210, xlo: 0, xhi: 1, ylo: ylo, yhi: yhi });

      clear(svgWrap);
      var svg = newSvg(W, 522, 'Expected log return curve with a separate marker lane for each of the six positions');
      yAxis(svg, f, niceTicks(ylo, yhi, W < 600 ? 4 : 6), null, 'expected log return');
      xAxis(svg, f, [0, 0.2, 0.4, 0.6, 0.8, 1], null, W >= 600 ? 'fraction of wealth on the H claim, v = \u2119\u2c7d(H)' : 'v = \u2119\u2c7d(H)');
      var clip = clipTo(svg, f);
      var pts = [];
      for (var i = 1; i < 600; i++) { var x = i / 600; pts.push([f.X(x), f.Y(Math.max(g(pm, q, x), ylo - 10))]); }
      polyline(pts, { class: 'lrw-curve', 'clip-path': clip }, svg);

      var gv = g(pm, q, v);
      var cl = function (y) { return Math.max(Math.min(y, yhi), ylo); };
      // shortfall segment from g(v) up to the peak level
      sv('line', { x1: f.X(v), x2: f.X(v), y1: f.Y(cl(gv)), y2: f.Y(peak), class: 'lrw-shortfall' }, svg);
      sv('line', { x1: f.X(Math.min(v, pm)), x2: f.X(Math.max(v, pm)), y1: f.Y(peak), y2: f.Y(peak), class: 'lrw-peakline' }, svg);

      // Each position has its own lane. Coincident curve points keep the
      // same x coordinate, while their glyphs and labels remain separate.
      var markers = [
        { label: 'Y', name: 'reference asset', x: q, tone: 'market' },
        { label: 'X', name: 'traded asset', x: p, tone: 'asset' },
        { label: 'M', name: 'model-optimal', x: pm, tone: 'belief' },
        { label: 'v', name: 'your position', x: v, tone: 'payoff' },
        { label: 'FK', name: 'fractional Kelly', x: vf, tone: 'ink', shape: 'ring' },
        { label: 'CRRA', name: 'utility-optimal', x: vc, tone: 'ink', shape: 'diamond' }
      ];
      markers.forEach(function (m, i) {
        sv('line', { x1: f.X(m.x), x2: f.X(m.x), y1: f.Y(cl(g(pm, q, m.x))), y2: 310 + 36 * i,
                     class: 'lrw-marker-leader' }, svg);
      });
      sv('text', { x: left, y: 287, text: 'Position markers', class: 'lrw-muted' }, svg);
      function glyph(m, y, radius, parent) {
        var x = f.X(m.x);
        if (m.shape === 'diamond') {
          sv('path', { d: 'M' + x + ',' + (y - radius) + 'L' + (x + radius) + ',' + y +
                        'L' + x + ',' + (y + radius) + 'L' + (x - radius) + ',' + y + 'Z', class: 'lrw-diamond' }, parent);
        } else {
          sv('circle', { cx: x, cy: y, r: radius, class: m.shape === 'ring' ? 'lrw-ring' : 'lrw-fill-' + m.tone + ' lrw-dot' }, parent);
        }
      }
      clear(markerKey);
      markers.forEach(function (m, i) {
        var y = 310 + 36 * i;
        var lane = sv('g', { class: 'lrw-marker-lane', 'aria-label': m.label + ': v=' + fmtProbability(m.x) }, svg);
        sv('line', { x1: f.x, x2: f.x + f.w, y1: y, y2: y, class: 'lrw-grid' }, lane);
        sv('text', { x: 12, y: y + 6, class: 'lrw-strong' + (m.tone === 'ink' ? '' : ' lrw-tfill-' + m.tone), text: m.label }, lane);
        glyph(m, f.Y(cl(g(pm, q, m.x))), m.shape ? 7 : 4, svg);
        glyph(m, y, m.shape ? 8 : 6, lane);
        markerKey.appendChild(h('div', { class: 'lrw-marker-key-item', html:
          '<span class="lrw-swatch lrw-bg-' + m.tone + (m.shape ? ' lrw-swatch-' + m.shape : '') + '"></span>' +
          '<strong>' + m.label + '</strong> · ' + m.name +
          '<span>v = ' + fmtProbability(m.x) + ' · g = ' + fmt(g(pm, q, m.x), 4) + '</span>' }));
      });
      svgWrap.appendChild(svg);

      var d2 = klB(pm, v);
      readout.innerHTML =
        '<p>Your position: ' + Em('M') + ' log(V(1)/V(0)) = ' + Dkl('M', 'Y') + ' ' + MINUS + ' ' + Dkl('M', 'V') + ' = ' +
        num(peak, 'belief', 4) + ' ' + MINUS + ' ' + num(d2, 'loss', 4) + ' = ' + num(gv, 'payoff', 4) + '.</p>' +
        '<p>Holding the asset X (v = p = ' + fmtProbability(p) + ') earns ' + num(g(pm, q, p), 'asset', 4) +
        ' under your model; it is log-optimal for you only if ' + Pm('M') + ' = ' + Pm('X') + '.</p>' +
        '<p>With \u03b3 = ' + fmt(gamma, 1) + ': fractional Kelly (f = 1/\u03b3) gives v = ' + fmt(vf, 3) + ' and ' +
        num(g(pm, q, vf), null, 4) + '; CRRA gives v = ' + fmt(vc, 3) + ' and ' + num(g(pm, q, vc), null, 4) + '.</p>';
    }
    store.sub(render);
    watchWidth(root, function () { render(store.get()); });
    render(store.get());
  }

  /* =============================================================
   * Binomial page, figure 3: many periods and sequential evidence.
   * ============================================================= */
  function binomialTime(root) {
    var store = STORES.binom;
    var NMAX = 250, NPATH = 2000, NSHOW = 8;
    var n = 60, alpha = 0.05, seed = 20260929;
    var U = null, logX = { X: null, Y: null }, simKey = '';

    function simulate(p, q) {
      var key = p + '|' + q + '|' + seed;
      if (key === simKey) return;
      simKey = key;
      if (!U || U.seed !== seed) {
        var rng = mulberry32(seed);
        U = { seed: seed, X: new Float32Array(NPATH * NMAX), Y: new Float32Array(NPATH * NMAX) };
        for (var i = 0; i < NPATH * NMAX; i++) { U.X[i] = rng(); U.Y[i] = rng(); }
      }
      var lu = Math.log(p / q), ld = Math.log((1 - p) / (1 - q));
      ['X', 'Y'].forEach(function (m) {
        var prob = m === 'X' ? p : q, uu = U[m];
        var out = new Float32Array(NPATH * (NMAX + 1));
        for (var j = 0; j < NPATH; j++) {
          var acc = 0, base = j * (NMAX + 1), ub = j * NMAX;
          out[base] = 0;
          for (var t = 0; t < NMAX; t++) { acc += uu[ub + t] < prob ? lu : ld; out[base + t + 1] = acc; }
        }
        logX[m] = out;
      });
    }
    function crossShare(m, level) {
      var arr = logX[m], c = 0;
      for (var j = 0; j < NPATH; j++) {
        var base = j * (NMAX + 1);
        for (var t = 1; t <= n; t++) if (arr[base + t] >= level) { c++; break; }
      }
      return c / NPATH;
    }

    var sn = slider({ label: 'periods n', min: 1, max: NMAX, step: 1, value: n,
      format: function (x) { return String(Math.round(x)); }, onInput: function (x) { n = Math.round(x); render(store.get()); } });
    var sa = slider({ label: 'test level \u03b1', min: 0.01, max: 0.2, step: 0.01, value: alpha, tone: 'loss',
      onInput: function (x) { alpha = x; render(store.get()); } });
    var sp = slider({ label: Pm('X') + '(H) = p', min: 0.01, max: 0.99, step: 0.01, value: store.get().p, tone: 'asset',
      onInput: function (x) { store.set({ p: x }, 'time-probability'); } });
    var sq = slider({ label: Pm('Y') + '(H) = q', min: 0.01, max: 0.99, step: 0.01, value: store.get().q, tone: 'market',
      onInput: function (x) { store.set({ q: x }, 'time-probability'); } });
    var bNew = button('Draw new paths', function () { seed = (seed * 1103515245 + 12345) >>> 0; simKey = ''; render(store.get()); });

    var lawWrap = h('div', { class: 'lrw-chart' });
    var pathWrap = h('div', { class: 'lrw-chart' });
    var readout1 = h('div', { class: 'lrw-readout' });
    var readout2 = h('div', { class: 'lrw-readout' });

    root.appendChild(h('div', { class: 'lrw' }, [
      h('div', { class: 'lrw-controls' }, [group('Model', null, [sp.node, sq.node]), group('Horizon and test', null, [sn.node, sa.node])]),
      legend([['asset', 'filled: under ' + Pm('X')], ['market', 'outline: under ' + Pm('Y'), 'outline'], ['loss', 'threshold log(1/\u03b1)']]),
      lawWrap, readout1,
      h('div', { class: 'lrw-actions' }, [bNew]),
      pathWrap, readout2
    ]));

    function render(st) {
      sp.set(st.p); sq.set(st.q); sn.set(n); sa.set(alpha);
      var p = st.p, q = st.q;
      var a = Math.log(p * (1 - q) / (q * (1 - p))), b = Math.log((1 - p) / (1 - q));
      var dXY = klB(p, q), dYX = klB(q, p);

      // ---- terminal laws and the price as a function of S(n)
      clear(lawWrap);
      var W = widthOf(root);
      var left = W < 600 ? 80 : 64;
      var svg = newSvg(W, 330, 'Laws of the number of H outcomes and the log price as a function of it');
      var pX = binomPMF(n, p), pY = binomPMF(n, q);
      var pmax = Math.max(Math.max.apply(null, pX), Math.max.apply(null, pY));
      var f1 = frame({ x: left, y: 16, w: W - left - 24, h: 124, xlo: -0.5, xhi: n + 0.5, ylo: 0, yhi: pmax * 1.1 });
      yAxis(svg, f1, niceTicks(0, pmax * 1.1, 3), null, 'probability');
      var bw = Math.max(f1.w / (n + 1) * 0.8, 1);
      for (var k = 0; k <= n; k++) {
        var x = f1.X(k) - bw / 2;
        sv('rect', { x: x, y: f1.Y(pX[k]), width: bw, height: f1.Y(0) - f1.Y(pX[k]), class: 'lrw-hist-asset' }, svg);
        sv('rect', { x: x, y: f1.Y(pY[k]), width: bw, height: f1.Y(0) - f1.Y(pY[k]), class: 'lrw-hist-market' }, svg);
      }
      sv('line', { x1: f1.x, x2: f1.x + f1.w, y1: f1.Y(0), y2: f1.Y(0), class: 'lrw-baseline' }, svg);

      var lp0 = b * n, lpn = a * n + b * n;
      var lo2 = Math.min(lp0, lpn, 0), hi2 = Math.max(lp0, lpn, 0);
      if (hi2 - lo2 < 1e-9) { lo2 = -1; hi2 = 1; }
      var f2 = frame({ x: left, y: 172, w: W - left - 24, h: 110, xlo: -0.5, xhi: n + 0.5, ylo: lo2, yhi: hi2 });
      yAxis(svg, f2, niceTicks(lo2, hi2, 4), null, 'log X(n)/X(0)');
      xAxis(svg, f2, niceTicks(0, n, W < 600 ? 4 : 6).filter(function (t) { return t === Math.round(t); }), null, 'number of H outcomes S(n)');
      polyline([[f2.X(0), f2.Y(lp0)], [f2.X(n), f2.Y(lpn)]], { class: 'lrw-stroke-asset lrw-line' }, svg);
      if (Math.abs(a) > 1e-12) {
        var kstar = -b * n / a;
        if (kstar >= 0 && kstar <= n) {
          sv('circle', { cx: f2.X(kstar), cy: f2.Y(0), r: 4, class: 'lrw-node' }, svg);
          var right = f2.X(kstar) < f2.x + f2.w * 0.6;
          sv('text', { x: f2.X(kstar) + (right ? 10 : -10), y: f2.Y(0) + 18, 'text-anchor': right ? 'start' : 'end',
                       class: 'lrw-muted', text: (W < 600 ? 'S(n) = ' : 'X(n) = X(0) at S(n) = ') + fmt(kstar, 1) }, svg);
        }
      }
      lawWrap.appendChild(svg);

      readout1.innerHTML =
        '<p>log(X(n)/X(0)) = a\u2009S(n) + b\u2009n with a = log(u/d) = ' + num(a, 'asset', 4) + ' and b = log d = ' + num(b, 'asset', 4) +
        '. The binomial coefficient cancels, so the price depends on the path only through (n, S(n)).</p>' +
        '<p>' + Dkl('X', 'Y') + ' at n = ' + n + ': ' + n + ' \u00d7 ' + num(dXY, 'asset', 4) + ' = ' + num(n * dXY, 'asset', 3) + '.</p>' +
        '<p>' + Dkl('Y', 'X') + ' at n = ' + n + ': ' + n + ' \u00d7 ' + num(dYX, 'market', 4) + ' = ' + num(n * dYX, 'market', 3) + '.</p>';

      // ---- simulated paths and Ville's inequality
      simulate(p, q);
      clear(pathWrap);
      var svg2 = newSvg(W, 290, 'Simulated log price paths under the two measures');
      var level = Math.log(1 / alpha);
      var ylo = Math.min(-n * dYX, 0), yhi = Math.max(n * dXY, level);
      for (var m = 0; m < 2; m++) {
        var arr = logX[m ? 'Y' : 'X'];
        for (var j = 0; j < NSHOW; j++) {
          var base = j * (NMAX + 1);
          for (var t = 0; t <= n; t++) { var val = arr[base + t]; if (val < ylo) ylo = val; if (val > yhi) yhi = val; }
        }
      }
      var padY = 0.06 * (yhi - ylo || 1);
      var f3 = frame({ x: left, y: 16, w: W - left - 24, h: 224, xlo: 0, xhi: n, ylo: ylo - padY, yhi: yhi + padY });
      yAxis(svg2, f3, niceTicks(f3.ylo, f3.yhi, W < 600 ? 4 : 6), null, 'log X(t)/X(0)');
      xAxis(svg2, f3, niceTicks(0, n, W < 600 ? 4 : 6).filter(function (t) { return t === Math.round(t); }), null, 'period t');
      var clip = clipTo(svg2, f3);
      ['Y', 'X'].forEach(function (mm) {
        var arr = logX[mm];
        for (var j = 0; j < NSHOW; j++) {
          var base = j * (NMAX + 1), pts = [];
          for (var t = 0; t <= n; t++) pts.push([f3.X(t), f3.Y(arr[base + t])]);
          polyline(pts, { class: 'lrw-path lrw-stroke-' + (mm === 'X' ? 'asset' : 'market'), 'clip-path': clip }, svg2);
        }
      });
      polyline([[f3.X(0), f3.Y(0)], [f3.X(n), f3.Y(n * dXY)]], { class: 'lrw-mean lrw-stroke-asset', 'clip-path': clip }, svg2);
      polyline([[f3.X(0), f3.Y(0)], [f3.X(n), f3.Y(-n * dYX)]], { class: 'lrw-mean lrw-stroke-market', 'clip-path': clip }, svg2);
      sv('line', { x1: f3.x, x2: f3.x + f3.w, y1: f3.Y(level), y2: f3.Y(level), class: 'lrw-threshold' }, svg2);
      sv('text', { x: f3.x + 6, y: f3.Y(level) - 6, class: 'lrw-tfill-loss', text: 'X(t)/X(0) = 1/\u03b1 = ' + fmt(1 / alpha, 0) }, svg2);
      pathWrap.appendChild(svg2);

      var shY = crossShare('Y', level), shX = crossShare('X', level);
      readout2.innerHTML =
        '<p>Dashed lines: t\u2009' + Dkl('X', 'Y') + ' and ' + MINUS + 't\u2009' + Dkl('Y', 'X') +
        ', the expected log price under each measure.</p>' +
        '<p>Of ' + NPATH.toLocaleString('en-US') + ' paths simulated under ' + Pm('Y') + ', ' + num(shY * 100, 'market', 1) +
        '% reached X(t)/X(0) \u2265 1/\u03b1 by t = ' + n + '. Ville\u2019s inequality bounds the true crossing probability by \u03b1 = ' + pct(alpha) +
        ' at every horizon; a simulated fraction can fluctuate above this bound. Under ' + Pm('X') + ', ' + num(shX * 100, 'asset', 1) + '% did.</p>';
    }
    store.sub(render);
    watchWidth(root, function () { render(store.get()); });
    render(store.get());
  }

  /* ------------------------------------------------------------ mount */

  var WIDGETS = {
    'three-state': threeState,
    'payoff-first': payoffFirst,
    'binomial-step': binomialStep,
    'binomial-growth': binomialGrowth,
    'binomial-time': binomialTime
  };

  function mountAll() {
    var nodes = document.querySelectorAll('[data-lrw]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], name = node.getAttribute('data-lrw'), fn = WIDGETS[name];
      if (!fn || node.getAttribute('data-lrw-mounted')) continue;
      clear(node);
      node.setAttribute('data-lrw-mounted', '1');
      try { fn(node); } catch (err) {
        node.textContent = 'This figure could not be drawn (' + err.message + ').';
        if (window.console) console.error(err);
      }
    }
  }

  window.LRW = { mountAll: mountAll, _test: { kl: kl, klB: klB, expLogReturn: expLogReturn, binomPMF: binomPMF, setSimplex: setSimplex, niceTicks: niceTicks } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
