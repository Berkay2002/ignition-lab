const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  process.env.EXHAUST_WORKLET_PATH ||
    path.join(__dirname, "../dist/js/exhaust-worklet.js"),
  "utf8",
);

function createProcessor(sampleRate = 48000) {
  let Processor;
  vm.runInNewContext(source, {
    sampleRate,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {};
      }
    },
    registerProcessor: (name, type) => {
      assert.equal(name, "v8-exhaust");
      Processor = type;
    },
  });
  return new Processor();
}

function configure(processor, rpm, amplitude, running = true) {
  processor.port.onmessage({ data: { rpm, amplitude, running } });
}

function render(processor, samples, channelCount = 2) {
  const result = Array.from(
    { length: channelCount },
    () => new Float32Array(samples),
  );
  for (let offset = 0; offset < samples; offset += 128) {
    const size = Math.min(128, samples - offset);
    const block = Array.from(
      { length: channelCount },
      () => new Float32Array(size),
    );
    assert.equal(processor.process([], [block]), true);
    block.forEach((channel, index) => result[index].set(channel, offset));
  }
  return result;
}

function statistics(channels) {
  let peak = 0,
    energy = 0,
    derivative = 0,
    sum = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      assert.ok(Number.isFinite(sample), "Audio samples must remain finite");
      peak = Math.max(peak, Math.abs(sample));
      sum += sample;
      energy += sample * sample;
      if (i) derivative += (sample - channel[i - 1]) ** 2;
    }
  }
  const count = channels.length * channels[0].length;
  return {
    peak,
    rms: Math.sqrt(energy / count),
    mean: sum / count,
    brightness: derivative / Math.max(energy, 1e-20),
  };
}

function powerAt(channel, frequency, sampleRate) {
  let real = 0,
    imaginary = 0;
  for (let i = 0; i < channel.length; i++) {
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    const window =
      0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (channel.length - 1));
    real += channel[i] * window * Math.cos(phase);
    imaginary += channel[i] * window * Math.sin(phase);
  }
  return real * real + imaginary * imaginary;
}

function runTests() {
  let maximumPeak = 0;
  for (const rate of [44100, 48000, 96000]) {
    for (const rpm of [600, 900, 2400, 4500, 7000]) {
      for (const load of [0.03, 0.5, 1]) {
        const processor = createProcessor(rate);
        configure(processor, rpm, load);
        const output = render(processor, rate);
        const stats = statistics(output);
        assert.ok(
          stats.peak > 0.005 && stats.peak <= 0.820001,
          JSON.stringify({ rate, rpm, load, ...stats }),
        );
        assert.ok(Math.abs(stats.mean) < 0.06, "DC offset must remain small");
        maximumPeak = Math.max(maximumPeak, stats.peak);
        configure(processor, rpm, load, false);
        render(processor, Math.round(rate * 0.6));
        assert.ok(
          statistics(render(processor, 256)).peak < 1e-7,
          "Stopping must decay to silence",
        );
      }
    }
  }
  console.log(
    JSON.stringify({
      stabilityCases: 45,
      sampleRates: [44100, 48000, 96000],
      maximumPeak,
      stoppedCleanly: true,
    }),
  );

  for (const rpm of [900, 2400, 6000]) {
    const processor = createProcessor();
    configure(processor, rpm, 0.65);
    render(processor, 24000);
    const [left, right] = render(processor, 48000);
    const mono = left.map((sample, index) => (sample + right[index]) * 0.5);
    const firingFrequency = rpm / 15;
    const line = powerAt(mono, firingFrequency, 48000);
    const adjacent = Math.max(
      powerAt(mono, firingFrequency - 7, 48000),
      powerAt(mono, firingFrequency + 7, 48000),
    );
    assert.ok(line > adjacent * 25, "Firing frequency must track RPM");
    const bankDifference = left.reduce(
      (sum, value, i) => sum + (value - right[i]) ** 2,
      0,
    );
    assert.ok(bankDifference > 1, "Banks must have distinct exhaust rhythms");
    console.log(
      JSON.stringify({
        rpm,
        firingFrequency,
        lineToAdjacentPower: line / adjacent,
      }),
    );
  }

  const loadStats = [0.15, 0.9].map((load) => {
    const processor = createProcessor();
    configure(processor, 2400, load);
    render(processor, 12000);
    return statistics(render(processor, 48000));
  });
  assert.ok(
    loadStats[1].rms > loadStats[0].rms * 2,
    "Load must increase exhaust energy",
  );
  assert.ok(
    loadStats[1].brightness > loadStats[0].brightness * 1.5,
    "Load must brighten the growl",
  );
  console.log(JSON.stringify({ loadResponse: loadStats }));

  const baseline = createProcessor(),
    transition = createProcessor();
  for (const processor of [baseline, transition]) {
    configure(processor, 900, 0.15);
    render(processor, 24000);
  }
  configure(transition, 7000, 1);
  const unchanged = render(baseline, 128),
    changed = render(transition, 128);
  assert.ok(
    Math.abs(unchanged[0][0] - changed[0][0]) < 0.001,
    "Parameter changes must not introduce a sample discontinuity",
  );
  assert.ok(statistics(render(transition, 96000)).peak <= 0.820001);
  configure(transition, 600, 0.03);
  assert.ok(statistics(render(transition, 96000)).peak <= 0.820001);

  const silent = createProcessor();
  assert.equal(
    statistics(render(silent, 1024)).peak,
    0,
    "No sound before parameters arrive",
  );
  configure(silent, 2400, 0);
  assert.equal(
    statistics(render(silent, 48000)).peak,
    0,
    "Zero amplitude must stay silent",
  );
  configure(silent, 2400, 0.5);
  assert.ok(
    statistics(render(silent, 48000, 1)).peak > 0.01,
    "Mono output must work",
  );
  const repeatA = createProcessor(),
    repeatB = createProcessor();
  configure(repeatA, 2400, 0.5);
  configure(repeatB, 2400, 0.5);
  assert.deepEqual(
    render(repeatA, 4096),
    render(repeatB, 4096),
    "Offline synthesis must be reproducible",
  );

  const boundary = createProcessor();
  configure(boundary, 3200, 0.4, false);
  for (const data of [
    null,
    {},
    { rpm: NaN, amplitude: 1, running: true },
    { rpm: 2400, amplitude: 2, running: true },
    { rpm: 2400, amplitude: 0.5, running: "yes" },
    { rpm: 599, amplitude: 0.5, running: true },
    { rpm: 7001, amplitude: 0.5, running: true },
  ])
    boundary.port.onmessage({ data });
  assert.equal(boundary.rpm, 3200);
  assert.equal(boundary.amplitude, 0.4);
  assert.equal(boundary.running, false);
  assert.equal(boundary.process([], []), true);
  assert.equal(boundary.process([], [[]]), true);
  console.log(
    "Audio transitions, load response, stereo/mono, silence, reproducibility and message validation passed.",
  );
}

module.exports = { createProcessor, configure, render, statistics };
if (require.main === module) runTests();
