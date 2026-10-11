(function () {
  'use strict';

  const count = 160;
  const states = Array.from({ length: count }, (_, g) => ({
    g, m: (2 / 3) * Math.pow(1 / 3, g), q: Math.pow(0.5, g + 1), r: 1.5 * Math.pow(0.5, g)
  }));
  const dot = fn => states.reduce((sum, state) => sum + fn(state), 0);
  const law = (state, alternate) => alternate && state.g < 3 ? [17 / 32, 5 / 32, 3 / 16][state.g] : state.q;

  function losses(w, alternate) {
    let growth = 0, kl = 0, kl2 = 0, quadratic = 0;
    for (const state of states) {
      const q = law(state, alternate);
      const wealth = (1 - w) + w * state.r;
      if (wealth <= 0) return { growth: -Infinity, kl: Infinity, kl2: Infinity, quadratic: Infinity };
      const error = q * wealth - state.m;
      growth += state.m * Math.log(wealth);
      kl += state.m * (Math.log(state.m) - Math.log(q) - Math.log(wealth));
      kl2 += 0.5 * error * error / state.m;
      quadratic += 0.5 * error * error / q;
    }
    return { growth, kl, kl2, quadratic };
  }

  function optimizers(alternate) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k++) {
      const w = (lo + hi) / 2;
      const score = dot(s => s.m * (s.r - 1) / ((1 - w) + w * s.r));
      if (score > 0) lo = w; else hi = w;
    }
    const quadratic = dot(s => s.m * (s.r - 1)) / dot(s => law(s, alternate) * (s.r - 1) ** 2);
    const numerator = dot(s => {
      const q = law(s, alternate);
      return q * (s.r - 1) * (1 - q / s.m);
    });
    const denominator = dot(s => law(s, alternate) ** 2 / s.m * (s.r - 1) ** 2);
    return { kl: (lo + hi) / 2, kl2: numerator / denominator, quadratic };
  }

  // The same calculation functions are exposed for numerical verification, without a DOM dependency.
  const api = Object.freeze({ losses, optimizers });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const colors = { kl: '#176074', kl2: '#95570c', quadratic: '#77589e' };
  const names = { kl: 'Exact KL', kl2: 'KL2', quadratic: 'Half squared error' };
  const decimals = x => Number(x).toFixed(7);
  let serial = 0;

  function initialize(host) {
    if (host.dataset.ready) return;
    host.dataset.ready = 'true';
    host.classList.add('hc-lab');
    const id = 'hc-' + (++serial);
    host.innerHTML = `
      <div class="hc-controls">
        <label class="hc-field" for="${id}-law">Pricing probabilities
          <select id="${id}-law"><option value="original">Original binary-tree law</option><option value="alternate">Alternative terminal pricing law</option></select>
        </label>
        <div class="hc-field"><label for="${id}-weight">Stock fraction w <output id="${id}-weight-value" for="${id}-weight">0.745331</output></label>
          <input id="${id}-weight" type="range" min="0" max="1" step="0.000001" value="0.745331" aria-describedby="${id}-range-note">
        </div>
      </div>
      <div class="hc-actions" role="group" aria-label="Choose a portfolio">
        <button type="button" data-weight="binary">Binary 2/3</button>
        <button type="button" data-weight="quadratic">Quadratic optimum</button>
        <button type="button" data-weight="kl">Exact KL optimum</button>
        <button type="button" data-weight="kl2">KL2 optimum</button>
      </div>
      <label class="hc-zoom" for="${id}-zoom"><input id="${id}-zoom" type="checkbox" checked> Focus on the minima (w = 0.55 to 0.90)</label>
      <p class="hc-range-note" id="${id}-range-note">Arrow keys adjust the stock fraction. The graph follows your selection; readouts give the exact calculated value.</p>
      <div class="hc-legend" aria-hidden="true">${Object.keys(colors).map(k => `<span><i style="border-color:${colors[k]};${k === 'kl2' ? 'border-top-style:dashed;' : k === 'quadratic' ? 'border-top-style:dotted;' : ''}"></i>${names[k]}</span>`).join('')}</div>
      <div class="hc-plot"></div>
      <div class="hc-readouts" role="status" aria-live="polite" aria-atomic="true"></div>
      <p class="hc-explanation"></p>`;

    const slider = host.querySelector('input[type=range]');
    const select = host.querySelector('select');
    const zoom = host.querySelector('input[type=checkbox]');
    let weight = optimizers(false).kl;

    function chart(alternate, optima, values) {
      const narrow = host.clientWidth < 520;
      const W = narrow ? 410 : 700, H = narrow ? 340 : 340;
      const left = narrow ? 57 : 68, right = W - 18, top = 21, bottom = H - 47;
      const xMin = zoom.checked ? 0.55 : 0, xMax = zoom.checked ? 0.90 : 1;
      const data = Array.from({ length: 181 }, (_, i) => {
        const w = xMin + (xMax - xMin) * i / 180;
        return { w, ...losses(w, alternate) };
      });
      const allValues = data.flatMap(d => [d.kl, d.kl2, d.quadratic]);
      const yMin = zoom.checked ? Math.max(0, Math.min(...allValues) * 0.8) : 0;
      const yMax = Math.max(...allValues) * 1.06;
      const x = w => left + (w - xMin) / (xMax - xMin) * (right - left);
      const y = loss => bottom - (loss - yMin) / (yMax - yMin) * (bottom - top);
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-chart-title ${id}-chart-description"><title id="${id}-chart-title">Three mismatch losses by stock fraction</title><desc id="${id}-chart-description">${alternate ? 'Alternative' : 'Original'} pricing law. Exact KL is minimized at ${optima.kl.toFixed(6)}, KL2 at ${optima.kl2.toFixed(6)}, and squared error at ${optima.quadratic.toFixed(6)}. The selected stock fraction is ${weight.toFixed(6)}.</desc>`;
      for (let i = 0; i <= 4; i++) {
        const value = yMin + (yMax - yMin) * i / 4, py = y(value);
        svg += `<line class="hc-grid" x1="${left}" y1="${py}" x2="${right}" y2="${py}"/><text x="${left - 9}" y="${py + 4}" text-anchor="end">${value.toFixed(3)}</text>`;
        const w = xMin + (xMax - xMin) * i / 4;
        svg += `<text x="${x(w)}" y="${bottom + 22}" text-anchor="middle">${w.toFixed(2)}</text>`;
      }
      svg += `<text x="${(left + right) / 2}" y="${H - 5}" text-anchor="middle">Stock fraction w</text><text x="${left}" y="13">Loss value</text>`;
      for (const key of Object.keys(colors)) {
        const dash = key === 'kl2' ? 'stroke-dasharray="8 5"' : key === 'quadratic' ? 'stroke-dasharray="2 5" stroke-linecap="round"' : '';
        const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.w).toFixed(2)},${y(d[key]).toFixed(2)}`).join(' ');
        svg += `<path d="${path}" fill="none" stroke="${colors[key]}" stroke-width="2.6" ${dash}/>`;
        const minimum = losses(optima[key], alternate)[key];
        if (optima[key] >= xMin && optima[key] <= xMax) svg += `<circle cx="${x(optima[key])}" cy="${y(minimum)}" r="4.5" fill="${colors[key]}"><title>${names[key]} minimum: w = ${optima[key].toFixed(6)}</title></circle>`;
      }
      if (weight >= xMin && weight <= xMax) {
        svg += `<line x1="${x(weight)}" y1="${top}" x2="${x(weight)}" y2="${bottom}" stroke="currentColor" opacity="0.45" stroke-dasharray="4 5"/>`;
        for (const key of Object.keys(colors)) svg += `<circle cx="${x(weight)}" cy="${y(values[key])}" r="4" fill="var(--bs-body-bg, #ffffff)" stroke="${colors[key]}" stroke-width="2"/>`;
      }
      svg += '</svg>';
      host.querySelector('.hc-plot').innerHTML = svg;
    }

    function render() {
      const alternate = select.value === 'alternate';
      const optima = optimizers(alternate), values = losses(weight, alternate);
      slider.value = String(weight);
      slider.setAttribute('aria-valuetext', weight.toFixed(6) + ' stock fraction');
      host.querySelector('output').textContent = weight.toFixed(6);
      host.querySelector('.hc-readouts').innerHTML = [
        ['Log growth (nats)', values.growth], ['Exact KL gap (nats)', values.kl],
        ['KL2', values.kl2], ['Half squared error', values.quadratic]
      ].map(([label, value]) => `<div><span>${label}</span><strong>${decimals(value)}</strong></div>`).join('');
      host.querySelector('.hc-explanation').textContent = `Optimal fractions: exact KL ${optima.kl.toFixed(6)}; quadratic ${optima.quadratic.toFixed(6)}; KL2 ${optima.kl2.toFixed(6)}. ${alternate ? 'Changing the pricing law leaves log growth and its maximizing fraction unchanged; the benchmark and loss values change.' : 'Growth plus exact KL gap equals 0.0849495 nats for every selected portfolio.'}`;
      chart(alternate, optima, values);
    }
    slider.addEventListener('input', () => {
      weight = Number(slider.value);
      if (zoom.checked && (weight < 0.55 || weight > 0.90)) zoom.checked = false;
      render();
    });
    select.addEventListener('change', render);
    zoom.addEventListener('change', render);
    host.querySelectorAll('button[data-weight]').forEach(button => button.addEventListener('click', () => {
      weight = button.dataset.weight === 'binary' ? 2 / 3 : optimizers(select.value === 'alternate')[button.dataset.weight];
      render();
    }));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(host);
    render();
  }

  const start = () => document.querySelectorAll('[data-hedging-comparison]').forEach(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
