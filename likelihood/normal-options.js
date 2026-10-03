/* Normal-driver option densities and Black–Scholes prices. No dependencies. */
(function (root) {
  'use strict';
  var SQRT2PI = Math.sqrt(2 * Math.PI);
  function normalPdf(z) { return Math.exp(-0.5 * z * z) / SQRT2PI; }
  // Integrate the Gaussian series near zero; use Laplace's continued fraction
  // for the survival probability in the tails, avoiding 1 - CDF cancellation.
  function positiveTail(z) {
    if (!Number.isFinite(z)) return z === Infinity ? 0 : NaN;
    if (z <= 2) {
      var term = z, sum = z;
      for (var n = 1; n < 80; n++) {
        term *= -z * z / (2 * n);
        var add = term / (2 * n + 1); sum += add;
        if (Math.abs(add) < 1e-18) break;
      }
      return 0.5 - sum / SQRT2PI;
    }
    var fraction = 0;
    for (var j = 160; j >= 1; j--) fraction = j / (z + fraction);
    return normalPdf(z) / (z + fraction);
  }
  function normalCdf(z) { return z <= 0 ? positiveTail(-z) : 1 - positiveTail(z); }
  function normalSurvival(z) { return z >= 0 ? positiveTail(z) : 1 - positiveTail(-z); }
  function payoff(x, strike, type) {
    if (type === 'put') return Math.max(0, strike - x);
    if (type === 'digital') return x > strike ? 1 : 0;
    if (type === 'straddle') return Math.abs(x - strike);
    return Math.max(0, x - strike);
  }
  function blackScholes(config) {
    var x = config.spot, k = config.strike, sigma = config.sigma, time = config.time;
    var type = config.type || 'call';
    if (!(x > 0 && k > 0 && sigma >= 0 && time >= 0) || ![x, k, sigma, time].every(Number.isFinite)) throw new RangeError('Use positive prices and nonnegative finite volatility and time.');
    if (!['call', 'put', 'digital', 'straddle'].includes(type)) throw new RangeError('Unknown option type.');
    var a = sigma * Math.sqrt(time);
    if (a === 0) {
      var step = x > k ? 1 : x < k ? 0 : 0.5;
      var delta0 = type === 'call' ? step : type === 'put' ? step - 1 : type === 'straddle' ? 2 * step - 1 : 0;
      return {price: payoff(x, k, type), delta: delta0, d1: x === k ? 0 : x > k ? Infinity : -Infinity, d2: x === k ? 0 : x > k ? Infinity : -Infinity, a: 0};
    }
    var d1 = Math.log(x / k) / a + a / 2, d2 = d1 - a;
    var call, put;
    if (x >= k) {
      put = Math.max(0, k * normalCdf(-d2) - x * normalCdf(-d1));
      call = x - k + put;
    } else {
      call = Math.max(0, x * normalCdf(d1) - k * normalCdf(d2));
      put = k - x + call;
    }
    var delta = normalCdf(d1);
    return {price: type === 'call' ? call : type === 'put' ? put : type === 'digital' ? normalCdf(d2) : call + put,
      delta: type === 'call' ? delta : type === 'put' ? delta - 1 : type === 'digital' ? normalPdf(d2) / (x * a) : 2 * delta - 1,
      d1: d1, d2: d2, a: a};
  }
  function densityAt(z, config, priced) {
    var bs = priced || blackScholes(config), a = bs.a;
    var market = normalPdf(z), asset = normalPdf(z - a);
    var terminal = config.spot * Math.exp(a * z - a * a / 2);
    // This expression stays finite even when the raw terminal payoff is large.
    var weightedCall = Math.max(0, config.spot * asset - config.strike * market);
    var weightedPut = Math.max(0, config.strike * market - config.spot * asset);
    var weighted = config.type === 'put' ? weightedPut : config.type === 'digital' ? (terminal > config.strike ? market : 0) : config.type === 'straddle' ? weightedCall + weightedPut : weightedCall;
    var option = bs.price > 0 ? weighted / bs.price : 0;
    var reserve = config.reserve || 0;
    return {market: market, asset: asset, option: option, mixture: reserve * market + (1 - reserve) * option, terminal: terminal};
  }
  var api = {normalPdf: normalPdf, normalCdf: normalCdf, normalSurvival: normalSurvival,
    normalPDF: normalPdf, normalCDF: normalCdf, blackScholes: blackScholes, payoff: payoff, densityAt: densityAt,
    callPrice: function (x, k, tau, sigma) { return blackScholes({spot: x, strike: k, time: tau, sigma: sigma, type: 'call'}).price; },
    callDelta: function (x, k, tau, sigma) { return blackScholes({spot: x, strike: k, time: tau, sigma: sigma, type: 'call'}).delta; }};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.NormalOptionsMath = api;
  function fmt(x, places) { return Math.abs(x) < 1e-12 ? (0).toFixed(places) : x.toFixed(places); }
  var count = 0;
  function mount(host) {
    if (host.dataset.normalOptionsMounted) return;
    host.dataset.normalOptionsMounted = 'true'; host.classList.add('normal-options');
    var id = 'normal-options-' + (++count);
    var state = {spot: 100, strike: 100, sigma: 0.25, time: 1, type: 'call', reserve: 0};
    function slider(key, title, min, max, step) {
      return '<label class="no-control" for="' + id + '-' + key + '"><span>' + title + '</span><output data-read="' + key + '"></output><input id="' + id + '-' + key + '" type="range" data-input="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + state[key] + '"></label>';
    }
    host.innerHTML = '<div class="no-controls"><label class="no-control no-select" for="' + id + '-type"><span>Contract</span><select id="' + id + '-type" data-input="type"><option value="call">Call</option><option value="put">Put</option><option value="digital">Digital call</option><option value="straddle">Straddle</option></select></label>' +
      slider('strike', 'Strike K', 70, 130, 1) + slider('sigma', 'Annual volatility σ', .15, .45, .01) + slider('time', 'Horizon T (years)', .5, 3, .25) + slider('reserve', 'Budget held in Y', 0, .8, .05) + '</div>' +
      '<p class="no-assumption">Initial underlying X(0) = 100. All amounts are in units of Y. The reserve is a fraction of the initial portfolio budget.</p>' +
      '<div class="no-metrics" role="status" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="no-key"><span class="no-key-y">Market P<sup>Y</sup></span><span class="no-key-x">Asset P<sup>X</sup></span><span class="no-key-c">Option P<sup>C</sup></span><span class="no-key-v" data-mixture-key hidden>Option + reserve P<sup>V</sup></span></div>' +
      '<h3 class="no-chart-title">Distributions over the same observation</h3><div class="no-density"></div><p class="no-density-note"></p>' +
      '<h3 class="no-chart-title">The contract payoff</h3><div class="no-payoff"></div><p class="no-explanation"></p>';
    host.querySelectorAll('[data-input]').forEach(function (input) {
      input.addEventListener('input', function () { state[input.dataset.input] = input.dataset.input === 'type' ? input.value : Number(input.value); render(); });
    });
    function startSvg(width, height, label) { return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + label + '">'; }
    function densityChart(bs) {
      var box = host.querySelector('.no-density'), w = Math.max(240, box.clientWidth), h = 278;
      var left = 43, right = w - 13, top = 18, bottom = 229, low = -4.5, high = 4.5 + bs.a;
      var threshold = -bs.d2, points = [];
      for (var i = 0; i <= 320; i++) { var z = low + (high - low) * i / 320; points.push({z: z, r: densityAt(z, state, bs)}); }
      // Include both sides of the digital discontinuity; curves must not bridge it.
      if (threshold > low && threshold < high) {
        [threshold - 1e-8, threshold, threshold + 1e-8].forEach(function (z) { points.push({z: z, r: densityAt(z, state, bs)}); });
        points.sort(function (a, b) { return a.z - b.z; });
      }
      var ymax = 0;
      points.forEach(function (p) { ymax = Math.max(ymax, p.r.market, p.r.asset, p.r.option); });
      ymax *= 1.1;
      var px = function (z) { return left + (z - low) / (high - low) * (right - left); };
      var py = function (v) { return bottom - v / ymax * (bottom - top); };
      var svg = startSvg(w, h, 'Continuous densities of the normal observation under the market, asset and chosen option measures. Each full density integrates to one.');
      [0, .5, 1].forEach(function (ratio) { var y = py(ymax * ratio); svg += '<line class="no-grid" x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"></line><text x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(ymax * ratio, 2) + '</text>'; });
      [-4, -2, 0, 2, 4].forEach(function (z) { svg += '<text x="' + px(z) + '" y="' + (bottom + 22) + '" text-anchor="middle">' + z + '</text>'; });
      var curves = [['market', 'y'], ['asset', 'x'], ['option', 'c']];
      if (state.reserve > 0) curves.push(['mixture', 'v']);
      curves.forEach(function (curve) {
        var path = points.map(function (p, index) { return (index ? 'L' : 'M') + px(p.z).toFixed(2) + ',' + py(p.r[curve[0]]).toFixed(2); }).join(' ');
        svg += '<path class="no-line no-line-' + curve[1] + '" d="' + path + '"></path>';
      });
      if (threshold > low && threshold < high) {
        svg += '<line class="no-strike" x1="' + px(threshold) + '" y1="' + top + '" x2="' + px(threshold) + '" y2="' + bottom + '"></line>';
        svg += '<text class="no-threshold" x="' + (px(threshold) + 6) + '" y="' + (top + 12) + '">strike</text>';
      }
      svg += '<text x="' + ((left + right) / 2) + '" y="273" text-anchor="middle">Normal observation z</text></svg>';
      box.innerHTML = svg;
    }
    function payoffChart() {
      var box = host.querySelector('.no-payoff'), w = Math.max(240, box.clientWidth), h = 240;
      var left = 43, right = w - 13, top = 16, bottom = 192, xmin = 30, xmax = 190;
      var px = function (x) { return left + (x - xmin) / (xmax - xmin) * (right - left); };
      var ymax = state.type === 'digital' ? 1.2 : Math.max(payoff(xmin, state.strike, state.type), payoff(xmax, state.strike, state.type)) * 1.1;
      var py = function (v) { return bottom - v / ymax * (bottom - top); };
      var svg = startSvg(w, h, 'The option terminal payoff in units of Y as a function of terminal underlying price.');
      [0, .5, 1].forEach(function (ratio) { var y = py(ymax * ratio); svg += '<line class="no-grid" x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"></line><text x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(ymax * ratio, state.type === 'digital' ? 1 : 0) + '</text>'; });
      [40, 80, 120, 160].forEach(function (x) { svg += '<text x="' + px(x) + '" y="' + (bottom + 22) + '" text-anchor="middle">' + x + '</text>'; });
      var xs = [xmin, state.strike, state.strike + 1e-8, xmax];
      svg += '<path class="no-line no-line-c" d="' + xs.map(function (x, i) { return (i ? 'L' : 'M') + px(x) + ',' + py(payoff(x, state.strike, state.type)); }).join(' ') + '"></path>';
      svg += '<line class="no-strike" x1="' + px(state.strike) + '" y1="' + top + '" x2="' + px(state.strike) + '" y2="' + bottom + '"></line><text x="' + ((left + right) / 2) + '" y="235" text-anchor="middle">Terminal price X(T)</text></svg>';
      box.innerHTML = svg;
    }
    function render() {
      var bs = blackScholes(state);
      ['strike', 'sigma', 'time', 'reserve'].forEach(function (key) {
        var label = key === 'sigma' || key === 'reserve' ? fmt(state[key] * 100, 0) + '%' : fmt(state[key], key === 'time' ? 2 : 0);
        host.querySelector('[data-read="' + key + '"]').textContent = label;
        host.querySelector('[data-input="' + key + '"]').setAttribute('aria-valuetext', label);
      });
      var priceText = bs.price < .001 && bs.price > 0 ? bs.price.toExponential(3) : fmt(bs.price, 3);
      host.querySelector('.no-metrics').innerHTML = '<div><span>Option price C(0)</span><strong data-metric="price">' + priceText + '</strong></div><div><span>Information D(P<sup>X</sup> ‖ P<sup>Y</sup>)</span><strong>' + fmt(bs.a * bs.a / 2, 4) + ' <small>nats</small></strong></div><div><span>P<sup>Y</sup>(above strike)</span><strong>' + fmt(normalCdf(bs.d2), 4) + '</strong></div><div><span>P<sup>X</sup>(above strike)</span><strong>' + fmt(normalCdf(bs.d1), 4) + '</strong></div>';
      host.querySelector('[data-mixture-key]').hidden = state.reserve === 0;
      if (!(bs.price > 0)) {
        host.querySelector('.no-density').innerHTML = '<p class="no-warning">The option price is zero, so no normalized option density is defined.</p>';
      } else densityChart(bs);
      payoffChart();
      host.querySelector('.no-density-note').textContent = 'All density curves use the same z axis and have total area one over the full real line. The displayed window omits small tails. The vertical line marks X(T) = K.';
      var explanation = state.type === 'call' ? 'The call removes all observations below the strike and weights the remaining market density by the upside payoff.' : state.type === 'put' ? 'The put removes observations above the strike and gives more weight to larger shortfalls below it.' : state.type === 'digital' ? 'The digital pays one unit above the strike. Its density is the market normal density conditioned on that event.' : 'The straddle combines the call and put densities in proportion to their prices. It gives no weight to the strike itself.';
      if (state.reserve > 0) explanation += ' With ' + fmt(state.reserve * 100, 0) + '% in the reference asset, the gold density is ' + fmt(state.reserve, 2) + ' × market + ' + fmt(1 - state.reserve, 2) + ' × option. The portfolio gross payoff is at least ' + fmt(state.reserve, 2) + '.';
      host.querySelector('.no-explanation').textContent = explanation;
    }
    render();
    if (root.ResizeObserver) new root.ResizeObserver(function () { densityChart(blackScholes(state)); payoffChart(); }).observe(host);
  }
  function boot() { root.document.querySelectorAll('[data-normal-options]').forEach(mount); }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : null);
