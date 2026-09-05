/* SI units internally. Zero degrees is intake TDC; firing TDC is 360 degrees. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const order = [1, 8, 4, 3, 6, 5, 7, 2];
  const defaults = { rpm: 2400, throttle: 0.65, compression: 10, advance: 18 };
  const bore = 0.086, stroke = 0.086, rod = 0.143, r = stroke / 2;
  const area = Math.PI * bore * bore / 4, swept = area * stroke;
  const gamma = 1.35, gasR = 287, inletT = 310, wallT = 450, heatTransfer = 130;
  function mod(n, d) { return ((n % d) + d) % d; }
  function volume(deg, compression) {
    const a = deg * RAD;
    return swept / (compression - 1) + area * (r * (1 - Math.cos(a)) + rod - Math.sqrt(rod * rod - r * r * Math.sin(a) ** 2));
  }
  function dVolume(deg) {
    const a = deg * RAD;
    return area * (r * Math.sin(a) + r * r * Math.sin(a) * Math.cos(a) / Math.sqrt(rod * rod - r * r * Math.sin(a) ** 2)) * RAD;
  }
  function cycle(input = defaults, step = 0.5) {
    const cfg = { ...defaults, ...input };
    if (!(step > 0) || Math.abs(180 / step - Math.round(180 / step)) > 1e-8) throw new Error('Step must divide 180 degrees.');
    const pIn = 30000 + 70000 * cfg.throttle, pEx = 106000;
    const vMax = volume(180, cfg.compression), mass = pIn * vMax / (gasR * inletT);
    const fuel = mass / 14.7, heat = fuel * 44e6 * 0.93;
    const start = 360 - cfg.advance, duration = 55 + cfg.rpm * 0.002;
    const secondsPerDegree = 1 / (cfg.rpm * 6);
    function burned(deg) {
      const x = Math.max(0, Math.min(1, (deg - start) / duration));
      return (1 - Math.exp(-6.9 * x ** 3)) / (1 - Math.exp(-6.9));
    }
    function heatRate(deg) {
      const x = (deg - start) / duration;
      return x <= 0 || x >= 1 ? 0 : heat * 20.7 * x * x * Math.exp(-6.9 * x ** 3) / (duration * (1 - Math.exp(-6.9)));
    }
    function derivative(deg, energy) {
      const v = volume(deg, cfg.compression), p = (gamma - 1) * energy / v;
      const temp = p * v / (mass * gasR);
      const exposed = 2 * area + 4 * v / bore;
      const wall = heatTransfer * exposed * (temp - wallT) * secondsPerDegree;
      return { energy: heatRate(deg) - p * dVolume(deg) - wall, wall };
    }
    const count = Math.round(720 / step), samples = [], path = [];
    let energy = pIn * vMax / (gamma - 1), work = 0, closedWork = 0, wallHeat = 0;
    const initialEnergy = energy;
    let peak = 0, endEnergy = energy, exhaustPressure = pEx;
    function point(deg, p) {
      const v = volume(deg, cfg.compression);
      return { deg, p, v, work, burned: burned(deg), temp: deg >= 180 && deg < 540 ? p * v / (mass * gasR) : (deg < 180 ? inletT : 700) };
    }
    samples.push(point(0, pIn)); path.push(samples[0]);
    for (let i = 1; i <= count; i++) {
      const a = (i - 1) * step, b = i * step;
      const va = volume(a, cfg.compression), vb = volume(b, cfg.compression);
      let p;
      if (a < 180) { p = pIn; work += p * (vb - va); }
      else if (a < 540) {
        const pa = (gamma - 1) * energy / va;
        const k1 = derivative(a, energy);
        const k2 = derivative(a + step / 2, energy + k1.energy * step / 2);
        const k3 = derivative(a + step / 2, energy + k2.energy * step / 2);
        const k4 = derivative(b, energy + k3.energy * step);
        energy += step * (k1.energy + 2 * k2.energy + 2 * k3.energy + k4.energy) / 6;
        wallHeat += step * (k1.wall + 2 * k2.wall + 2 * k3.wall + k4.wall) / 6;
        p = (gamma - 1) * energy / vb;
        const dw = (pa + p) * 0.5 * (vb - va);
        work += dw; closedWork += dw; endEnergy = energy;
        if (b === 540) {
          exhaustPressure = p;
          path.push(point(b, p)); // Ideal valve opening: pressure drop at constant volume.
          p = pEx;
        }
      } else { p = pEx; work += p * (vb - va); }
      peak = Math.max(peak, p);
      const sample = point(b, p); samples.push(sample); path.push(sample);
    }
    path.push({ ...samples[0], deg: 720, work });
    return { cfg, step, samples, path, work, peak, fuel, heat, mass, wallHeat,
      exhaustPressure, duration, start, swept, displacement: swept * 8,
      power: work * 8 * cfg.rpm / 120, torque: work * 8 / (4 * Math.PI),
      energyResidual: endEnergy - initialEnergy - heat + closedWork + wallHeat };
  }
  function sampleAt(model, deg) {
    deg = mod(deg, 720);
    const index = deg / model.step, i = Math.floor(index), f = index - i;
    const a = model.samples[i], b = model.samples[i + 1];
    const s = { deg };
    for (const key of ['p', 'v', 'work', 'burned', 'temp']) s[key] = a[key] + (b[key] - a[key]) * f;
    return s;
  }
  function phase(crank, cylinder) { return mod(crank - order.indexOf(cylinder) * 90 + 360, 720); }
  function piston(crank, cylinder) {
    const bank = cylinder % 2 ? -Math.PI / 4 : Math.PI / 4;
    const a = phase(crank, cylinder) * RAD;
    const u = [Math.sin(bank), Math.cos(bank), 0], n = [Math.cos(bank), -Math.sin(bank), 0];
    const axial = (Math.floor((cylinder - 1) / 2) - 1.5) * 0.11 + (cylinder % 2 ? -0.007 : 0.007);
    const pin = [r * (u[0] * Math.cos(a) - n[0] * Math.sin(a)), r * (u[1] * Math.cos(a) - n[1] * Math.sin(a)), axial];
    const distance = r * Math.cos(a) + Math.sqrt(rod ** 2 - r ** 2 * Math.sin(a) ** 2);
    return { u, n, pin, center: [u[0] * distance, u[1] * distance, axial], axial, distance, bank };
  }
  const api = { cycle, sampleAt, phase, piston, volume, dVolume, order, defaults, bore, stroke, rod, r, swept, area, gamma, mod };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Engine = api;
})(globalThis);
