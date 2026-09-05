const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../dist/js/exhaust-worklet.js"),
  "utf8",
);
let Processor;
vm.runInNewContext(source, {
  sampleRate: 48000,
  AudioWorkletProcessor: class {
    constructor() {
      this.port = {};
    }
  },
  registerProcessor: (name, type) => (Processor = type),
});
for (const rpm of [600, 2400, 7000]) {
  const processor = new Processor();
  processor.rpm = rpm;
  let peak = 0,
    energy = 0;
  for (let block = 0; block < 375; block++) {
    const channels = [new Float32Array(128), new Float32Array(128)];
    assert.equal(processor.process([], [channels]), true);
    for (const channel of channels)
      for (const sample of channel) {
        assert.ok(Number.isFinite(sample));
        peak = Math.max(peak, Math.abs(sample));
        energy += sample * sample;
      }
  }
  assert.ok(peak > 0.01 && peak <= 0.65);
  assert.ok(Math.abs(processor.phase - rpm * 6) < 0.01);
  processor.running = false;
  for (let block = 0; block < 50; block++)
    processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
  assert.equal(processor.impulses.length, 0);
  console.log(
    JSON.stringify({
      rpm,
      peak,
      rms: Math.sqrt(energy / 96000),
      stoppedCleanly: true,
    }),
  );
}

const boundary = new Processor();
boundary.port.onmessage({
  data: { rpm: 3200, amplitude: 0.4, running: false },
});
assert.equal(boundary.rpm, 3200);
assert.equal(boundary.amplitude, 0.4);
assert.equal(boundary.running, false);
for (const data of [
  null,
  {},
  { rpm: NaN, amplitude: 1, running: true },
  { rpm: 2400, amplitude: 2, running: true },
  { rpm: 2400, amplitude: 0.5, running: "yes" },
])
  boundary.port.onmessage({ data });
assert.equal(boundary.rpm, 3200);
assert.equal(boundary.amplitude, 0.4);
assert.equal(boundary.running, false);
assert.equal(boundary.process([], []), true);
console.log(
  "Worklet message boundary rejects invalid data and handles absent output.",
);
