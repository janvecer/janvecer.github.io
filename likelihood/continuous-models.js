/* Exact-increment likelihood models. No network requests or dependencies. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MODELS = {
    normal: { title: 'Normal', statistic: 'Return driver R(T)', activity: null },
    poisson: { title: 'Poisson', statistic: 'Event count N(T)', activity: ['Pricing intensity λY', 1, 8, .5, 3] },
    gamma: { title: 'Gamma', statistic: 'Activity G(T)', activity: ['Common shape rate α', 2, 6, .5, 3] },
    'inverse-gaussian': { title: 'Inverse Gaussian', statistic: 'Operational time I(T)', activity: ['Common scale δ', 1, 4, .25, 2] }
  };
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function uniform(random) { return (random() * 4294967296 + .5) / 4294967296; }
  function normal(random) { return Math.sqrt(-2 * Math.log(uniform(random))) * Math.cos(2 * Math.PI * uniform(random)); }
  // Marsaglia–Tsang with the standard shape-boost transformation below one.
  function gamma(shape, rate, random) {
    if (!(shape > 0 && rate > 0)) throw new RangeError('Gamma parameters must be positive.');
    if (shape < 1) return gamma(shape + 1, rate, random) * Math.pow(uniform(random), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = normal(random), v0 = 1 + c * x;
      if (v0 <= 0) continue;
      const v = v0 * v0 * v0, u = uniform(random);
      if (u < 1 - .0331 * Math.pow(x, 4) || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v / rate;
    }
  }
  // Stable Michael–Schucany–Haas: rationalize the smaller quadratic root.
  function inverseGaussian(scale, tail, random) {
    const mu = scale / tail, lambda = scale * scale, z = normal(random);
    const h = mu * z * z / (2 * lambda);
    const x = mu / (1 + h + Math.sqrt(h * (h + 2)));
    return uniform(random) <= mu / (mu + x) ? x : mu * mu / x;
  }
  function poisson(mean, random) {
    if (mean === 0) return 0;
    // Used only at bounded grid means; event-time simulation is used in plots.
    const limit = Math.exp(-mean);
    let n = 0, p = 1;
    do { n++; p *= uniform(random); } while (p > limit);
    return n - 1;
  }
  function logGamma(z) {
    const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = .9999999999998099;
    for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
    const t = z + 7.5;
    return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  function bisect(fn, lo, hi, target) {
    const ascending = fn(hi) > fn(lo);
    for (let i = 0; i < 72; i++) {
      const mid = (lo + hi) / 2;
      if ((fn(mid) < target) === ascending) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function parameters(kind, k, activity, direction) {
    if (!(k >= 0 && k <= .15)) throw new RangeError('Information rate must lie between 0 and .15.');
    const down = direction !== 'up';
    let a, b, x, y, rateY;
    if (kind === 'normal') {
      x = Math.sqrt(2 * k); y = 0; a = x; b = -k; rateY = k;
      return { kind, k, a, b, x, y, rateY, activity: 1, description: `μY = 0 · μX = ${fmt(x)} · driver variance rate = 1 · price volatility = ${fmt(x)}` };
    }
    if (kind === 'poisson') {
      y = activity;
      const f = theta => Math.exp(theta) * theta - Math.expm1(theta);
      const theta = k === 0 ? 0 : bisect(f, down ? -12 : 0, down ? 0 : 3, k / y);
      x = y * Math.exp(theta); a = theta; b = y - x;
      rateY = -y * theta + x - y;
      return { kind, k, a, b, x, y, rateY, activity, description: `λY = ${fmt(y)} · λX = ${fmt(x)} · jump multiplier λX/λY = ${fmt(x / y)}` };
    }
    if (kind === 'gamma') {
      y = 2;
      const f = theta => theta + Math.expm1(-theta);
      const theta = k === 0 ? 0 : bisect(f, down ? 0 : -3, down ? 3 : 0, k / activity);
      x = y * Math.exp(theta); a = y - x; b = activity * theta;
      rateY = activity * (-theta + Math.expm1(theta));
      return { kind, k, a, b, x, y, rateY, activity, description: `α = ${fmt(activity)} · βY = 2 · βX = ${fmt(x)} · rates, not scales` };
    }
    if (kind === 'inverse-gaussian') {
      y = 2;
      const h = k / (activity * y), upper = 1 + h + Math.sqrt(h * (h + 2));
      x = y * (down ? upper : 1 / upper);
      a = -.5 * (x * x - y * y); b = activity * (x - y);
      rateY = activity * (x - y) * (x - y) / (2 * y);
      return { kind, k, a, b, x, y, rateY, activity, description: `δ = ${fmt(activity)} · γY = 2 · γX = ${fmt(x)} · IG(δt, γ) convention` };
    }
    throw new Error('Unknown continuous model.');
  }
  function moments(p, t, measure) {
    const v = measure === 'X' ? p.x : p.y;
    if (p.kind === 'normal') return { mean: v * t, variance: t };
    if (p.kind === 'poisson') return { mean: v * t, variance: v * t };
    if (p.kind === 'gamma') return { mean: p.activity * t / v, variance: p.activity * t / (v * v) };
    return { mean: p.activity * t / v, variance: p.activity * t / Math.pow(v, 3) };
  }
  function logDensity(p, t, z, measure) {
    const v = measure === 'X' ? p.x : p.y;
    if (p.kind === 'normal') return -.5 * Math.log(2 * Math.PI * t) - (z - v * t) * (z - v * t) / (2 * t);
    if (p.kind === 'poisson') return z < 0 || z !== Math.floor(z) ? -Infinity : -v * t + z * Math.log(v * t) - logGamma(z + 1);
    if (p.kind === 'gamma') {
      const s = p.activity * t;
      if (z < 0) return -Infinity;
      if (z === 0) return s === 1 ? Math.log(v) : (s > 1 ? -Infinity : Infinity);
      return s * Math.log(v) - logGamma(s) + (s - 1) * Math.log(z) - v * z;
    }
    if (z <= 0) return -Infinity;
    const d = p.activity * t;
    return Math.log(d) - .5 * Math.log(2 * Math.PI) - 1.5 * Math.log(z) + d * v - d * d / (2 * z) - v * v * z / 2;
  }
  function increment(p, dt, measure, random) {
    const v = measure === 'X' ? p.x : p.y;
    if (p.kind === 'normal') return v * dt + Math.sqrt(dt) * normal(random);
    if (p.kind === 'poisson') return poisson(v * dt, random);
    if (p.kind === 'gamma') return gamma(p.activity * dt, v, random);
    return inverseGaussian(p.activity * dt, v, random);
  }
  function simulate(p, horizon, measure, seed, count = 6, steps = 96) {
    const random = rng(seed), paths = [];
    for (let j = 0; j < count; j++) {
      const points = [[0, 0]];
      if (p.kind === 'poisson') {
        const rate = measure === 'X' ? p.x : p.y;
        let time = 0, n = 0;
        for (;;) {
          time += -Math.log(uniform(random)) / rate;
          if (time >= horizon) break;
          points.push([time, p.a * n + p.b * time]);
          n++;
          points.push([time, p.a * n + p.b * time]);
        }
        points.push([horizon, p.a * n + p.b * horizon]);
      } else {
        const dt = horizon / steps;
        let z = 0;
        for (let i = 1; i <= steps; i++) {
          z += increment(p, dt, measure, random);
          points.push([i * dt, p.a * z + p.b * i * dt]);
        }
      }
      paths.push(points);
    }
    return paths;
  }
  function fmt(x, digits = 3) {
    if (Math.abs(x) < 1e-10) return '0';
    return Number(x.toFixed(digits)).toString();
  }
  function axisFmt(x) {
    if (Math.abs(x) < 1e-9) return '0';
    if (Math.abs(x) >= 1000 || Math.abs(x) < .001) return x.toExponential(1);
    return fmt(x, Math.abs(x) < 1 ? 2 : 1);
  }
  function node(name, attrs, parent, text) {
    const e = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs || {})) e.setAttribute(key, value);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function chart(host, xDomain, yDomain, xlabel, ylabel, description) {
    host.textContent = '';
    const width = Math.max(220, Math.round(host.getBoundingClientRect().width || 320));
    const height = 272, margin = { left: 52, right: 16, top: 28, bottom: 48 };
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': description }, host);
    node('title', {}, svg, description);
    const x = v => margin.left + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * (width - margin.left - margin.right);
    const y = v => height - margin.bottom - (v - yDomain[0]) / (yDomain[1] - yDomain[0]) * (height - margin.top - margin.bottom);
    for (let i = 0; i <= 4; i++) {
      const v = yDomain[0] + (yDomain[1] - yDomain[0]) * i / 4;
      node('line', { x1: margin.left, x2: width - margin.right, y1: y(v), y2: y(v), class: 'cm-grid' }, svg);
      node('text', { x: margin.left - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg, axisFmt(v));
    }
    for (let i = 0; i <= 3; i++) {
      const v = xDomain[0] + (xDomain[1] - xDomain[0]) * i / 3;
      node('text', { x: x(v), y: height - margin.bottom + 21, 'text-anchor': 'middle' }, svg, axisFmt(v));
    }
    node('line', { x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom, class: 'cm-axis' }, svg);
    node('text', { x: margin.left, y: 15, class: 'cm-axis-title' }, svg, ylabel);
    node('text', { x: (margin.left + width - margin.right) / 2, y: height - 7, 'text-anchor': 'middle', class: 'cm-axis-title' }, svg, xlabel);
    return { svg, x, y, width, height };
  }
  function line(c, values, classes, extra = {}) {
    const d = values.map((p, i) => `${i ? 'L' : 'M'}${c.x(p[0]).toFixed(2)},${c.y(p[1]).toFixed(2)}`).join(' ');
    return node('path', { d, class: classes, ...extra }, c.svg);
  }
  function padded(values, includeZero = true) {
    let lo = Math.min(...values), hi = Math.max(...values);
    if (includeZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (lo === hi) return [lo - .1, hi + .1];
    const span = Math.max(.1, hi - lo);
    return [lo - .09 * span, hi + .09 * span];
  }
  function support(p, t) {
    const mx = moments(p, t, 'X'), my = moments(p, t, 'Y');
    if (p.kind === 'normal') return [Math.min(mx.mean, my.mean) - 4 * Math.sqrt(t), Math.max(mx.mean, my.mean) + 4 * Math.sqrt(t)];
    const hi = Math.max(mx.mean + 7 * Math.sqrt(mx.variance), my.mean + 7 * Math.sqrt(my.variance));
    return [0, p.kind === 'poisson' ? Math.ceil(hi + 3) : hi];
  }
  function mount(host) {
    const kind = host.dataset.continuousModel, spec = MODELS[kind];
    if (!spec) return;
    host.classList.add('cmodel');
    let seed = 17021, width = 0;
    const control = (key, label, min, max, step, value) => `<label class="cm-control"><span>${label}</span><output data-value="${key}"></output><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    host.innerHTML = `<div class="cm-controls">${control('k', 'Information rate k', 0, .15, .0025, .05)}${control('t', 'Horizon T', .5, 5, .25, 2)}${spec.activity ? control('activity', ...spec.activity) : ''}${kind !== 'normal' ? '<label class="cm-control"><span>Price response to a jump</span><select data-key="direction"><option value="down">Downward price jumps</option><option value="up">Upward price jumps</option></select></label>' : ''}</div>
      <p class="cm-hint" data-role="constraint"></p>
      <div class="cm-metrics"><div class="cm-metric"><strong data-role="info"></strong><span>D(Pˣ ∥ Pʸ) at T<br>nats</span></div><div class="cm-metric"><strong data-role="reverse"></strong><span>D(Pʸ ∥ Pˣ) at T<br>nats</span></div><div class="cm-metric"><strong data-role="sensitivity"></strong><span data-role="sensitivity-label"></span></div></div>
      <div class="cm-parameters" data-role="parameters"></div>
      <div class="cm-legend"><span class="cm-key">Asset measure Pˣ</span><span class="cm-key cm-key-y">Pricing measure Pʸ</span></div>
      <div class="cm-charts"><section class="cm-chart"><h4>Two laws of the same observation</h4><div data-chart="density"></div><p data-role="density-note"></p></section><section class="cm-chart"><h4>Observation → log price</h4><div data-chart="likelihood"></div><p>The straight line is ℓ(z, T) = az + bT. The price multiplier is exp(ℓ).</p></section></div>
      <div class="cm-toolbar"><h4>Six possible paths under each measure</h4><button type="button" class="cm-button">Generate new paths</button><span class="cm-seed" data-role="seed"></span></div>
      <div class="cm-charts"><section class="cm-chart"><h4>Paths sampled under Pˣ</h4><div data-chart="paths-x"></div><p data-role="mean-x"></p></section><section class="cm-chart"><h4>Paths sampled under Pʸ</h4><div data-chart="paths-y"></div><p data-role="mean-y"></p></section></div>
      <p class="cm-hint" data-role="path-note"></p><p class="cm-hint" data-role="zero"></p>`;
    const role = key => host.querySelector(`[data-role="${key}"]`);
    const value = key => host.querySelector(`[data-key="${key}"]`);
    const canvas = key => host.querySelector(`[data-chart="${key}"]`);
    function render() {
      const k = +value('k').value, t = +value('t').value;
      const activity = value('activity') ? +value('activity').value : 1;
      const direction = value('direction') ? value('direction').value : 'up';
      const p = parameters(kind, k, activity, direction);
      host.querySelectorAll('output').forEach(e => {
        const key = e.dataset.value;
        e.textContent = fmt(+value(key).value, key === 'k' ? 4 : 2);
      });
      role('info').textContent = fmt(k * t, 4);
      role('reverse').textContent = fmt(p.rateY * t, 4);
      role('sensitivity').textContent = fmt(kind === 'normal' ? Math.sqrt(2 * k) : p.a, 4);
      role('sensitivity-label').textContent = kind === 'normal' ? 'Price volatility per √time' : 'Log-price sensitivity a';
      role('parameters').textContent = `${p.description}. Log price: ℓ(z,t) = (${fmt(p.a, 4)})z + (${fmt(p.b, 4)})t.`;
      const specific = kind === 'normal' ? 'The driver has variance rate 1. Its mean separation is derived as √(2k); this is also the resulting price volatility in this normalization.' : kind === 'poisson' ? 'Fix the pricing intensity λY and choose a jump direction. The asset intensity λX is solved from the selected KL rate; jump size is then λX/λY.' : kind === 'gamma' ? 'The common shape rate is α ≥ 2 and βY = 2. The rate βX is solved from k and the jump direction. With T ≥ 0.5, the displayed horizon density is finite at zero.' : 'The common scale is δ and γY = 2. The parameter γX is solved from k and the jump direction. Both IG laws retain the same additive scale.';
      role('constraint').textContent = 'Exploration range: 0 ≤ k ≤ 0.15 nats per time unit and 0.5 ≤ T ≤ 5. ' + specific;
      const domain = support(p, t), discrete = kind === 'poisson';
      const points = discrete ? Array.from({ length: domain[1] + 1 }, (_, i) => i) : Array.from({ length: 321 }, (_, i) => domain[0] + (domain[1] - domain[0]) * i / 320);
      const dx = points.map(z => [z, Math.exp(logDensity(p, t, z, 'X'))]);
      const dy = points.map(z => [z, Math.exp(logDensity(p, t, z, 'Y'))]);
      const maxDensity = Math.max(...dx.map(v => v[1]), ...dy.map(v => v[1])) * 1.1;
      const dc = chart(canvas('density'), domain, [0, maxDensity], spec.statistic, discrete ? 'Probability mass' : 'Density', `${spec.title} laws under the asset and pricing measures at time ${t}`);
      if (discrete) {
        for (const [values, cls, shift] of [[dy, 'cm-line-y', -2], [dx, 'cm-line-x', 2]]) {
          for (const pair of values) node('line', { x1: dc.x(pair[0]) + shift, x2: dc.x(pair[0]) + shift, y1: dc.y(0), y2: dc.y(pair[1]), class: `cm-curve ${cls}`, 'stroke-width': 2 }, dc.svg);
        }
      } else {
        for (const [values, cls] of [[dy, 'y'], [dx, 'x']]) {
          line(dc, [[domain[0], 0], ...values, [domain[1], 0]], `cm-density-${cls}`, { stroke: 'none' });
          line(dc, values, `cm-curve cm-line-${cls}`);
        }
      }
      role('density-note').textContent = discrete ? 'Paired stems are exact Poisson masses. The displayed window includes the central mass; unbounded tails continue beyond it.' : 'Curves are analytic densities on a finite plotting window. Their tails extend beyond the window.';
      const ll = domain.map(z => [z, p.a * z + p.b * t]);
      const lc = chart(canvas('likelihood'), domain, padded(ll.map(v => v[1])), spec.statistic, 'Log price ℓ(z,T)', 'The log-likelihood ratio is affine in the observed driver');
      line(lc, ll, 'cm-curve cm-line-x');
      const pathsX = simulate(p, t, 'X', seed), pathsY = simulate(p, t, 'Y', seed + 99173);
      const allY = [k * t, -p.rateY * t];
      pathsX.concat(pathsY).forEach(path => path.forEach(v => allY.push(v[1])));
      const pathDomain = padded(allY);
      for (const [measure, paths, mean, target, cls] of [['X', pathsX, k, 'paths-x', 'x'], ['Y', pathsY, -p.rateY, 'paths-y', 'y']]) {
        const pc = chart(canvas(target), [0, t], pathDomain, 'Time t', 'Log price log(X(t)/X(0))', `Six ${spec.title} log-price paths sampled under P${measure}, with the exact expected log-price line`);
        paths.forEach(path => line(pc, path, `cm-sample cm-line-${cls}`));
        line(pc, [[0, 0], [t, mean * t]], `cm-expected cm-line-${cls}`);
      }
      role('mean-x').textContent = `Dashed line: exact Eˣ[log(X(t)/X(0))] = ${fmt(k, 4)}t. At T: ${fmt(k * t, 4)}.`;
      role('mean-y').textContent = `Dashed line: exact Eʸ[log(X(t)/X(0))] = ${fmt(-p.rateY, 4)}t. At T: ${fmt(-p.rateY * t, 4)}.`;
      role('seed').textContent = `Draw ${seed}`;
      role('path-note').textContent = (kind === 'poisson' ? 'Poisson event times are sampled exactly, including the linear drift between jumps. ' : kind === 'normal' ? 'Normal increments are sampled from their exact distribution at 96 grid steps. Straight connecting segments are a visual interpolation of a continuous Brownian path. ' : 'Gamma and inverse Gaussian increments are sampled from their exact distributions at 96 grid steps. These processes have infinitely many jumps: connecting segments show grid observations, not a full microscopic jump realization. ') + 'The panels share a vertical scale. Dashed lines are analytic expected log prices, not averages of the six paths. The martingale identity Eʸ[X(t)/X(0)] = 1 is theoretical; a small sample need not average to one.';
      role('zero').textContent = k === 0 ? 'At k = 0 the two laws coincide. Every likelihood ratio is 1, every log-price path is 0, and both information rates vanish; the driver itself can still fluctuate.' : 'The asset measure Pˣ is not automatically the investor’s belief Pᴹ. Growth under Pˣ is the investor’s expected growth only when those measures agree.';
    }
    host.addEventListener('input', e => { if (e.target.matches('input,select')) render(); });
    host.addEventListener('change', e => { if (e.target.matches('select')) render(); });
    host.querySelector('button').addEventListener('click', () => { seed += 104729; render(); });
    render();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(entries => {
      const next = Math.round(entries[0].contentRect.width);
      if (Math.abs(next - width) > 1) { width = next; render(); }
    }).observe(host);
  }
  const api = { parameters, moments, logDensity, increment, simulate, normal, gamma, inverseGaussian, poisson, rng, logGamma };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    const start = () => document.querySelectorAll('[data-continuous-model]').forEach(mount);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof globalThis === 'undefined' ? this : globalThis);
