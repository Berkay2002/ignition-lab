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

function configure(processor, rpm, amplitude, running = true, tone) {
  processor.port.onmessage({ data: { rpm, amplitude, running, tone } });
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
    { rpm: 10001, amplitude: 0.5, running: true },
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
  runToneTests();
}

const toneDefaults = {
  exhaust: "sport",
  listening: "tailpipe",
  crank: "cross-plane",
  resonance: 1,
  roughness: 1,
  overrun: false,
  disabledCylinder: null,
  timingRetard: 0,
  speedMS: 0,
  distanceM: 0,
};

function toneRender(changes = {}, rpm = 2400, sampleRate = 48000) {
  const processor = createProcessor(sampleRate);
  configure(processor, rpm, 0.65, true, { ...toneDefaults, ...changes });
  render(processor, sampleRate / 2);
  return render(processor, sampleRate);
}

function runToneTests() {
  const baseline = toneRender();
  const modes = Object.fromEntries(
    ["stock", "sport", "open"].map((exhaust) => [
      exhaust,
      statistics(toneRender({ exhaust })),
    ]),
  );
  assert.ok(
    modes.stock.rms < modes.sport.rms && modes.sport.rms < modes.open.rms,
    "Exhaust restriction must change energy",
  );
  assert.ok(
    modes.stock.brightness < modes.sport.brightness &&
      modes.sport.brightness < modes.open.brightness,
    "Exhaust restriction must change bandwidth",
  );
  const cabin = statistics(toneRender({ listening: "cabin" }));
  assert.ok(
    cabin.rms < modes.sport.rms * 0.6 &&
      cabin.brightness < modes.sport.brightness * 0.5,
    "Cabin must attenuate and low-pass the exhaust",
  );
  for (const option of [
    { listening: "engine" },
    { resonance: 0.65 },
    { roughness: 1.8 },
    { timingRetard: 30 },
  ]) {
    const output = toneRender(option);
    const difference = output[0].reduce(
      (sum, v, i) => sum + (v - baseline[0][i]) ** 2,
      0,
    );
    assert.ok(
      difference > 0.1,
      `Tone setting must change waveform: ${JSON.stringify(option)}`,
    );
  }
  const flat = toneRender({ crank: "flat-plane" });
  // At 2400 RPM, each even-spaced flat-plane bank fires at 80 Hz.
  // Cross-plane bank irregularity creates a substantial 20 Hz cycle-order component.
  const crossCycle = powerAt(baseline[0], 20, 48000),
    flatCycle = powerAt(flat[0], 20, 48000);
  assert.ok(
    crossCycle > flatCycle * 8,
    "Crank layout must change each bank's firing spectrum",
  );
  for (let cylinder = 1; cylinder <= 8; cylinder++) {
    const faulty = toneRender({
      crank: "flat-plane",
      disabledCylinder: cylinder,
    });
    const affected = cylinder % 2 ? 0 : 1;
    assert.ok(
      powerAt(faulty[affected], 20, 48000) >
        powerAt(flat[affected], 20, 48000) * 8,
      "Missing firing event must add the cycle-order component to the affected bank",
    );
  }
  const nearby = statistics(
    toneRender({ listening: "roadside", distanceM: 5 }),
  );
  const distant = statistics(
    toneRender({ listening: "roadside", distanceM: 100 }),
  );
  assert.ok(
    distant.rms < nearby.rms / 8,
    "Roadside spreading must attenuate with distance",
  );
  const observed = [];
  for (const distanceM of [-100, 100]) {
    const [left, right] = toneRender({
      listening: "roadside",
      speedMS: 30,
      distanceM,
    });
    const mono = left.map((v, i) => (v + right[i]) / 2);
    const frequency =
      (160 * 343) / (343 + (30 * distanceM) / Math.hypot(5, distanceM));
    assert.ok(
      powerAt(mono, frequency, 48000) > powerAt(mono, 160, 48000) * 20,
      "Doppler must follow radial velocity, including its sign",
    );
    const l = statistics([left]).rms,
      r = statistics([right]).rms;
    assert.ok(
      distanceM < 0 ? l > r : r > l,
      "Roadside stereo direction must follow observer-relative position",
    );
    observed.push(frequency);
  }
  const overrun = [false, true].map((enabled) => {
    const processor = createProcessor();
    const tone = { ...toneDefaults, overrun: enabled };
    configure(processor, 4000, 0.9, true, tone);
    render(processor, 48000);
    configure(processor, 4000, 0.02, true, tone);
    return render(processor, 24000);
  });
  assert.ok(
    statistics(overrun[1]).rms > statistics(overrun[0]).rms,
    "Optional afterfire must only add energy after closure",
  );
  assert.deepEqual(
    toneRender({ overrun: true }),
    baseline,
    "Overrun switch must not generate pops at steady throttle",
  );
  const changing = createProcessor(),
    unchanged = createProcessor();
  for (const p of [changing, unchanged]) {
    configure(p, 2400, 0.65);
    render(p, 24000);
  }
  configure(changing, 2400, 0.65, true, {
    ...toneDefaults,
    exhaust: "open",
    listening: "engine",
    resonance: 1.5,
    roughness: 1.8,
    timingRetard: 30,
  });
  assert.ok(
    Math.abs(render(changing, 128)[0][0] - render(unchanged, 128)[0][0]) <
      0.002,
    "Tone changes must ramp without a hard sample jump",
  );
  let extendedCases = 0;
  for (const rate of [44100, 48000, 96000])
    for (const rpm of [600, 10000])
      for (const listening of ["tailpipe", "engine", "cabin", "roadside"]) {
        const tone = {
          ...toneDefaults,
          exhaust: "open",
          crank: "flat-plane",
          listening,
          resonance: 1.5,
          roughness: 1.8,
          timingRetard: 30,
          disabledCylinder: 8,
          speedMS: 120,
          distanceM: -1000,
        };
        const p = createProcessor(rate);
        configure(p, rpm, 1, true, tone);
        assert.ok(statistics(render(p, rate)).peak <= 0.820001);
        configure(p, rpm, 1, false, tone);
        render(p, rate);
        assert.ok(statistics(render(p, 256)).peak < 1e-7);
        extendedCases++;
      }
  for (const bad of [
    { resonance: NaN },
    { resonance: 0.64 },
    { roughness: 1.81 },
    { exhaust: "invalid" },
    { listening: "invalid" },
    { crank: "invalid" },
    { disabledCylinder: 1.5 },
    { disabledCylinder: 9 },
    { timingRetard: 31 },
    { speedMS: -1 },
    { distanceM: 10001 },
    { overrun: 1 },
  ]) {
    const p = createProcessor();
    configure(p, 3200, 0.4, false);
    configure(p, 9000, 1, true, { ...toneDefaults, ...bad });
    assert.equal(
      p.rpm,
      3200,
      "Malformed tone must reject the message atomically",
    );
  }
  console.log(
    JSON.stringify({
      exhaustModes: modes,
      cabin,
      crossCycleToFlat: crossCycle / flatCycle,
      roadsideFiringHz: observed,
      extendedCases,
    }),
  );
}

module.exports = { createProcessor, configure, render, statistics };
if (require.main === module) runTests();
