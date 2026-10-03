/* Relative entropy, from two outcomes. No external dependencies. */
(function (root) {
  'use strict';
  function kl(P, Q) {
    var sum = 0;
    for (var i = 0; i < P.length; i++) {
      if (P[i] === 0) continue;
      if (Q[i] === 0) return Infinity;
      sum += P[i] * Math.log(P[i] / Q[i]);
    }
    return Math.abs(sum) < 1e-12 ? 0 : Math.max(0, sum);
  }
  function evaluate(p, q) {
    if (!(p >= 0 && p <= 1 && q > 0 && q < 1)) throw new RangeError('Use 0 ≤ p ≤ 1 and 0 < q < 1.');
    var P = [p, 1 - p], Q = [q, 1 - q];
    var ratios = P.map(function (v, i) { return v / Q[i]; });
    var logs = ratios.map(function (r) { return r === 0 ? -Infinity : Math.log(r); });
    var contributions = P.map(function (v, i) { return v === 0 ? 0 : v * logs[i]; });
    var forward = kl(P, Q), reverse = kl(Q, P);
    return {P: P, Q: Q, ratios: ratios, logs: logs, contributions: contributions,
      forward: forward, reverse: reverse, marketLog: reverse === 0 ? 0 : -reverse,
      marketGross: Q.reduce(function (s, v, i) { return s + v * ratios[i]; }, 0),
      assetGross: P.reduce(function (s, v, i) { return s + v * ratios[i]; }, 0)};
  }
  var api = {kl: kl, evaluate: evaluate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.EntropyLab = api;
  var counter = 0;
  function fmt(v, digits) {
    if (!Number.isFinite(v)) return v < 0 ? '−∞' : '∞';
    return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(digits === undefined ? 4 : digits).replace('-', '−');
  }
  function mount(host) {
    var id = 'entropy-' + (++counter), state = {p: 0.6, q: 0.5};
    host.classList.add('entropy-lab');
    host.innerHTML = '<div class="entropy-controls">' +
      '<label class="entropy-control" for="' + id + '-p"><span>Asset: P<sup>X</sup>(success)</span><output data-value="p">0.60</output><input id="' + id + '-p" data-prob="p" type="range" min="0" max="1" step="0.01" value="0.60"></label>' +
      '<label class="entropy-control entropy-market" for="' + id + '-q"><span>Market: P<sup>Y</sup>(success)</span><output data-value="q">0.50</output><input id="' + id + '-q" data-prob="q" type="range" min="0.01" max="0.99" step="0.01" value="0.50"></label></div>' +
      '<div class="entropy-presets" aria-label="Example probability models"><button type="button" data-preset="same">Same model</button><button type="button" data-preset="small">Small difference</button><button type="button" data-preset="strong">Stronger disagreement</button><button type="button" data-preset="swap">Swap the models</button></div>' +
      '<p class="entropy-hint">Each failure probability is one minus its success probability. The market gives both outcomes a positive price.</p>' +
      '<div class="entropy-key"><span class="entropy-key-x">Asset measure P<sup>X</sup></span><span class="entropy-key-y">Market measure P<sup>Y</sup></span></div>' +
      '<div class="entropy-chart"></div><div class="entropy-calculation"></div>' +
      '<div class="entropy-result" role="status" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="entropy-contributions"></div><div class="entropy-comparison"></div>';
    var controls = host.querySelectorAll('input[data-prob]');
    controls.forEach(function (input) {
      input.addEventListener('input', function () { state[input.dataset.prob] = Number(input.value); render(); });
    });
    host.querySelectorAll('button[data-preset]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.preset === 'same') state = {p: 0.5, q: 0.5};
        if (button.dataset.preset === 'small') state = {p: 0.6, q: 0.5};
        if (button.dataset.preset === 'strong') state = {p: 0.8, q: 0.3};
        if (button.dataset.preset === 'swap' && state.p > 0 && state.p < 1) state = {p: state.q, q: state.p};
        render();
      });
    });
    function chart(result) {
      var element = host.querySelector('.entropy-chart');
      var w = Math.max(240, element.clientWidth), h = 215;
      var left = 39, right = w - 10, top = 16, bottom = 169;
      var plotW = right - left, centers = [left + plotW * 0.26, left + plotW * 0.74];
      var bw = Math.min(39, plotW * 0.115);
      var out = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Success and failure probabilities under the asset and market measures. Exact probabilities appear in the table below.">';
      [0, 0.5, 1].forEach(function (v) {
        var y = bottom - v * (bottom - top);
        out += '<line class="entropy-grid" x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"></line><text x="' + (left - 9) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>';
      });
      centers.forEach(function (x, i) {
        [result.P[i], result.Q[i]].forEach(function (v, j) {
          var bh = v * (bottom - top), bx = j === 0 ? x - bw - 2 : x + 2;
          out += '<rect class="' + (j === 0 ? 'entropy-bar-x' : 'entropy-bar-y') + '" x="' + bx + '" y="' + (bottom - bh) + '" width="' + bw + '" height="' + bh + '"></rect>';
        });
        out += '<text x="' + x + '" y="195" text-anchor="middle">' + (i === 0 ? 'Success' : 'Failure') + '</text>';
      });
      element.innerHTML = out + '</svg>';
    }
    function render() {
      var r = evaluate(state.p, state.q);
      controls.forEach(function (input) { input.value = state[input.dataset.prob]; input.setAttribute('aria-valuetext', fmt(state[input.dataset.prob], 2)); });
      host.querySelector('[data-value="p"]').textContent = fmt(state.p, 2);
      host.querySelector('[data-value="q"]').textContent = fmt(state.q, 2);
      var swap = host.querySelector('[data-preset="swap"]');
      swap.disabled = state.p === 0 || state.p === 1;
      swap.title = swap.disabled ? 'To swap the models, give both asset outcomes a positive probability.' : 'Reverse the two probability models.';
      chart(r);
      var rows = [
        ['Asset probability', r.P, 2], ['Market probability', r.Q, 2],
        ['Price multiplier', r.ratios, 4], ['Log performance', r.logs, 4],
        ['Asset-weighted log', r.contributions, 4]
      ];
      host.querySelector('.entropy-calculation').innerHTML = '<table><caption>Calculate the expectation under the asset measure</caption><thead><tr><th scope="col">For each outcome</th><th scope="col">Success</th><th scope="col">Failure</th></tr></thead><tbody>' + rows.map(function (row) {
        return '<tr><th scope="row">' + row[0] + '</th><td>' + fmt(row[1][0], row[2]) + '</td><td>' + fmt(row[1][1], row[2]) + '</td></tr>';
      }).join('') + '</tbody></table>';
      host.querySelector('.entropy-result').innerHTML = '<span>Relative entropy D<sub>KL</sub>(P<sup>X</sup> ‖ P<sup>Y</sup>)</span><strong data-metric="forward">' + fmt(r.forward) + ' <small>nats</small></strong><span>' + fmt(r.contributions[0]) + ' + (' + fmt(r.contributions[1]) + ') = ' + fmt(r.forward) + '</span>';
      var contributions = host.querySelector('.entropy-contributions');
      if (r.forward === 0) contributions.innerHTML = '<p>The models agree. Every price multiplier is one, and every log performance is zero.</p>';
      else if (state.p === 0 || state.p === 1) contributions.innerHTML = '<p>One payoff is zero, so its log performance is −∞. Its asset probability is also zero: the contribution to this expectation is zero, by the convention 0 log 0 = 0. Under the market measure that outcome has positive probability, so expected log performance is −∞. Swapping is unavailable here because the market model must price both outcomes positively.</p>';
      else contributions.innerHTML = '<p>One log performance is negative. The asset-weighted contributions add to a positive number: relative entropy measures the average under P<sup>X</sup>, not the result of every outcome.</p>';
      host.querySelector('.entropy-comparison').innerHTML = '<div><span>Reverse comparison<br>D<sub>KL</sub>(P<sup>Y</sup> ‖ P<sup>X</sup>)</span><strong data-metric="reverse">' + fmt(r.reverse) + ' nats</strong></div><div><span>Expected log performance<br>under the market P<sup>Y</sup></span><strong data-metric="market-log">' + fmt(r.marketLog) + '</strong></div>';
    }
    render();
    if (root.ResizeObserver) {
      var previousWidth = host.clientWidth;
      new root.ResizeObserver(function () {
        var currentWidth = host.clientWidth;
        if (Math.abs(currentWidth - previousWidth) > 1) { previousWidth = currentWidth; chart(evaluate(state.p, state.q)); }
      }).observe(host);
    }
  }
  function initialize() { root.document.querySelectorAll('[data-entropy-lab]').forEach(mount); }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})(typeof window === 'undefined' ? null : window);
