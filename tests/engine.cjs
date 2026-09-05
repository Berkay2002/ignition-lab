const assert = require('node:assert/strict');
const E = require('../engine.js');
for (const cr of [6, 10, 14]) {
  assert.ok(Math.abs(E.volume(180, cr) / E.volume(0, cr) - cr) < 1e-12);
  for (let angle = 0; angle <= 720; angle += 3) {
    const delta = 0.0001;
    const numeric = (E.volume(angle + delta, cr) - E.volume(angle - delta, cr)) / (2 * delta);
    assert.ok(Math.abs(numeric - E.dVolume(angle)) < 1e-12);
    for (let id = 1; id <= 8; id++) {
      const k = E.piston(angle, id);
      assert.ok(Math.abs(Math.hypot(...k.center.map((v, i) => v - k.pin[i])) - E.rod) < 1e-12);
      if (id % 2) {
        const other = E.piston(angle, id + 1);
        assert.ok(Math.hypot(k.pin[0] - other.pin[0], k.pin[1] - other.pin[1]) < 1e-12, 'paired rods share crank pin');
      }
    }
  }
}
const reference = E.cycle(), finer = E.cycle(E.defaults, 0.25);
assert.ok(Math.abs(reference.work - finer.work) / finer.work < 0.001);
assert.ok(Math.abs(reference.energyResidual) / reference.heat < 0.0001);
assert.ok(E.cycle({ throttle: 1 }).work > E.cycle({ throttle: 0 }).work);
assert.equal(reference.power, reference.work * 8 * reference.cfg.rpm / 120);
let cases = 0, maxResidual = 0;
for (const rpm of [600, 2400, 7000]) for (const throttle of [0, 0.65, 1]) for (const compression of [6, 10, 14]) for (const advance of [-10, 18, 45]) {
  const m = E.cycle({ rpm, throttle, compression, advance });
  for (const s of m.samples) assert.ok(Number.isFinite(s.p) && s.p > 0 && s.v > 0 && Number.isFinite(s.work));
  assert.ok(Math.abs(m.energyResidual) / m.heat < 0.001);
  maxResidual = Math.max(maxResidual, Math.abs(m.energyResidual) / m.heat);
  cases++;
}
console.log(JSON.stringify({ cases, reference: { workJ: reference.work, powerKW: reference.power / 1000, peakBar: reference.peak / 1e5, energyResidualJ: reference.energyResidual }, workStepDifferenceJ: reference.work - finer.work, maxRelativeEnergyResidual: maxResidual }, null, 2));
