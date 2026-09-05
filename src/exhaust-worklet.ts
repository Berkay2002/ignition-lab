type WorkletParameters = import("./types.js").AudioParameters;
type WorkletTone = import("./types.js").AudioTone;

const defaultTone: WorkletTone = {
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

function inRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isWorkletTone(value: unknown): value is WorkletTone {
  return (
    typeof value === "object" &&
    value !== null &&
    "exhaust" in value &&
    ["stock", "sport", "open"].some((v) => v === value.exhaust) &&
    "listening" in value &&
    ["tailpipe", "engine", "cabin", "roadside"].some(
      (v) => v === value.listening,
    ) &&
    "crank" in value &&
    (value.crank === "cross-plane" || value.crank === "flat-plane") &&
    "resonance" in value &&
    inRange(value.resonance, 0.65, 1.5) &&
    "roughness" in value &&
    inRange(value.roughness, 0.5, 1.8) &&
    "overrun" in value &&
    typeof value.overrun === "boolean" &&
    "disabledCylinder" in value &&
    (value.disabledCylinder === null ||
      (inRange(value.disabledCylinder, 1, 8) &&
        Number.isInteger(value.disabledCylinder))) &&
    "timingRetard" in value &&
    inRange(value.timingRetard, 0, 30) &&
    "speedMS" in value &&
    inRange(value.speedMS, 0, 120) &&
    "distanceM" in value &&
    inRange(value.distanceM, -1000, 10000)
  );
}

function isWorkletParameters(value: unknown): value is WorkletParameters {
  return (
    typeof value === "object" &&
    value !== null &&
    "rpm" in value &&
    typeof value.rpm === "number" &&
    Number.isFinite(value.rpm) &&
    value.rpm >= 600 &&
    value.rpm <= 10000 &&
    "amplitude" in value &&
    typeof value.amplitude === "number" &&
    Number.isFinite(value.amplitude) &&
    value.amplitude >= 0 &&
    value.amplitude <= 1 &&
    "running" in value &&
    typeof value.running === "boolean" &&
    (!("tone" in value) ||
      value.tone === undefined ||
      isWorkletTone(value.tone))
  );
}

/** A damped pipe mode, normalized so its gain does not depend on sample rate. */
class PipeMode {
  private previous = 0;
  private older = 0;
  private a = 0;
  private readonly b: number;
  private gain = 0;
  private readonly radius: number;

  constructor(frequency: number, decay: number) {
    const radius = Math.exp(-1 / (sampleRate * decay));
    this.radius = radius;
    this.b = radius * radius;
    this.tune(frequency);
  }

  tune(frequency: number): void {
    this.a = 2 * this.radius * Math.cos((2 * Math.PI * frequency) / sampleRate);
    this.gain =
      (1 - this.radius) * Math.sin((2 * Math.PI * frequency) / sampleRate);
  }

  process(input: number): number {
    const next =
      input * this.gain + this.a * this.previous - this.b * this.older;
    this.older = this.previous;
    this.previous = next;
    return next;
  }
}

/** Tuned synthesis: blowdown envelope, lossy pipe reflections, and outlet radiation. */
class ExhaustBank {
  private slow = 0;
  private fast = 0;
  private turbulence = 0;
  private low = 0;
  private low2 = 0;
  private reflected = 0;
  private dc = 0;
  private cursor = 0;
  private readonly delay: Float32Array;
  private readonly body: PipeMode;
  private readonly bark: PipeMode;
  private readonly throat: PipeMode;
  private readonly fastDecay = Math.exp(-1 / (0.00019 * sampleRate));
  private readonly noiseDecay = Math.exp(-1 / (0.004 * sampleRate));
  private readonly reflectionSmooth =
    1 - Math.exp((-2 * Math.PI * 1800) / sampleRate);
  // Outlet radiation rolls off long wavelengths; this also removes source DC.
  private readonly dcSmooth = 1 - Math.exp((-2 * Math.PI * 140) / sampleRate);
  private slowDecay = 0;
  private cutoff = 0;
  private delaySamples = 0;
  private openness = 1;
  private roughness = 1;
  private readonly bank: number;

  constructor(bank: number) {
    this.bank = bank;
    this.delay = new Float32Array(Math.ceil(sampleRate * 0.014));
    this.body = new PipeMode(bank ? 91 : 83, 0.018);
    this.bark = new PipeMode(bank ? 367 : 331, 0.006);
    this.throat = new PipeMode(bank ? 810 : 740, 0.003);
    this.tune(0.5);
  }

  tune(
    load: number,
    openness = 1,
    resonance = 1,
    roughness = 1,
    retard = 0,
  ): void {
    this.openness = openness;
    this.roughness = roughness;
    this.slowDecay = Math.exp(
      -1 / (sampleRate * (0.0024 - 0.0011 * load + retard * 0.000025)),
    );
    this.cutoff =
      1 -
      Math.exp(
        (-2 * Math.PI * (1100 + 3400 * load) * (0.38 + 0.62 * openness)) /
          sampleRate,
      );
    this.delaySamples = Math.min(
      this.delay.length - 2,
      (sampleRate * (this.bank ? 0.0053 : 0.0048)) / resonance,
    );
    this.body.tune((this.bank ? 91 : 83) * resonance);
    this.bark.tune((this.bank ? 367 : 331) * resonance);
    this.throat.tune((this.bank ? 810 : 740) * resonance);
  }

  fire(strength: number, fraction: number): void {
    // Fractional event age avoids quantizing combustion timing to whole samples.
    this.slow += strength * Math.pow(this.slowDecay, fraction);
    this.fast += strength * Math.pow(this.fastDecay, fraction);
    this.turbulence += strength;
  }

  process(noise: number, load: number): number {
    const pulse = this.slow - this.fast;
    this.slow *= this.slowDecay;
    this.fast *= this.fastDecay;
    this.turbulence *= this.noiseDecay;
    const source =
      pulse + noise * this.turbulence * (0.018 + 0.07 * load) * this.roughness;
    // Two low-pass stages remove the hard digital edge before pipe excitation.
    this.low += this.cutoff * (source - this.low);
    this.low2 += this.cutoff * (this.low - this.low2);
    const read =
      (this.cursor - this.delaySamples + this.delay.length) % this.delay.length;
    const whole = Math.floor(read),
      fraction = read - whole;
    const returning =
      this.delay[whole] * (1 - fraction) +
      this.delay[(whole + 1) % this.delay.length] * fraction;
    this.reflected += this.reflectionSmooth * (returning - this.reflected);
    this.delay[this.cursor] =
      this.low2 + (0.3 + 0.13 * this.openness) * this.reflected;
    this.cursor = (this.cursor + 1) % this.delay.length;
    const outlet = this.low2 - 0.58 * returning;
    const colored =
      outlet +
      1.8 * this.body.process(outlet) +
      (0.5 + 0.9 * this.openness) * this.bark.process(outlet) +
      8 * this.throat.process(outlet);
    this.dc += this.dcSmooth * (colored - this.dc);
    return colored - this.dc;
  }
}

class Exhaust extends AudioWorkletProcessor {
  rpm = 2400;
  amplitude = 0.5;
  running = false;
  private configured = false;
  private speed = 2400;
  private load = 0.5;
  private gate = 0;
  private phase = 0;
  private event = 0;
  private tone: WorkletTone = defaultTone;
  private openness = 1;
  private resonance = 1;
  private roughness = 1;
  private retard = 0;
  private cabinMix = 0;
  private engineMix = 0;
  private roadsideMix = 0;
  private distance = 0;
  private roadSpeed = 0;
  private faultDepth = 0;
  private overrunTail = 0;
  private mechanicalPhase = 0;
  private cabinLeft = 0;
  private cabinRight = 0;
  private cabinLeft2 = 0;
  private cabinRight2 = 0;
  private readonly toneSmooth = 1 - Math.exp(-1 / (0.04 * sampleRate));
  private readonly cabinSmooth =
    1 - Math.exp((-2 * Math.PI * 300) / sampleRate);
  private readonly overrunDecay = Math.exp(-1 / (0.14 * sampleRate));
  private randomState = 0x21f0aaad;
  private readonly left = new ExhaustBank(0);
  private readonly right = new ExhaustBank(1);
  private readonly speedSmooth = 1 - Math.exp(-1 / (0.09 * sampleRate));
  private readonly loadSmooth = 1 - Math.exp(-1 / (0.045 * sampleRate));
  private readonly gateSmooth = 1 - Math.exp(-1 / (0.018 * sampleRate));
  // 1-8-4-3-6-5-7-2: even total spacing, uneven spacing within each bank.
  private readonly banks = [0, 1, 1, 0, 1, 0, 0, 1];
  private readonly crossOrder = [1, 8, 4, 3, 6, 5, 7, 2];
  // A representative flat-plane sequence; both banks fire every 180 crank degrees.
  private readonly flatOrder = [1, 2, 5, 6, 3, 4, 7, 8];

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!isWorkletParameters(event.data)) return;
      const nextTone = event.data.tone ?? defaultTone;
      // Optional residual-fuel afterfire only follows a substantial throttle closure.
      // This is a bounded synthesis effect, not a prediction of exhaust chemistry.
      if (
        nextTone.overrun &&
        event.data.running &&
        this.running &&
        this.amplitude > 0.35 &&
        this.amplitude - event.data.amplitude > 0.18 &&
        this.speed > 1800
      )
        this.overrunTail = Math.min(
          0.22,
          (this.amplitude - event.data.amplitude) * 0.25,
        );
      if (!nextTone.overrun || !event.data.running) this.overrunTail = 0;
      if (nextTone.disabledCylinder !== this.tone.disabledCylinder)
        this.faultDepth = 0;
      this.tone = nextTone;
      this.rpm = event.data.rpm;
      this.amplitude = event.data.amplitude;
      this.running = event.data.running;
      if (!this.configured) {
        this.speed = this.rpm;
        this.load = this.amplitude;
        this.openness =
          this.tone.exhaust === "stock"
            ? 0
            : this.tone.exhaust === "open"
              ? 2
              : 1;
        this.resonance = this.tone.resonance;
        this.roughness = this.tone.roughness;
        this.retard = this.tone.timingRetard;
        this.cabinMix = this.tone.listening === "cabin" ? 1 : 0;
        this.engineMix = this.tone.listening === "engine" ? 1 : 0;
        this.roadsideMix = this.tone.listening === "roadside" ? 1 : 0;
        this.distance = this.tone.distanceM;
        this.roadSpeed = this.tone.speedMS;
        this.configured = true;
      }
    };
  }

  private noise(): number {
    // Reproducible variation for offline audio tests and demos.
    let seed = this.randomState;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    this.randomState = seed;
    return (seed >>> 0) / 2147483648 - 1;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels?.[0]) return true;
    // Five metres lateral clearance avoids a distance singularity at the observer.
    const pipeRange = Math.hypot(5, this.distance);
    const radialVelocity = (this.roadSpeed * this.distance) / pipeRange;
    const pipeDoppler =
      1 + this.roadsideMix * (343 / (343 + radialVelocity) - 1);
    this.left.tune(
      this.load,
      this.openness,
      this.resonance * pipeDoppler,
      this.roughness,
      this.retard,
    );
    this.right.tune(
      this.load,
      this.openness,
      this.resonance * pipeDoppler,
      this.roughness,
      this.retard,
    );
    for (let i = 0; i < channels[0].length; i++) {
      this.speed += this.speedSmooth * (this.rpm - this.speed);
      this.load += this.loadSmooth * (this.amplitude - this.load);
      this.gate += this.gateSmooth * ((this.running ? 1 : 0) - this.gate);
      this.openness +=
        this.toneSmooth *
        ((this.tone.exhaust === "stock"
          ? 0
          : this.tone.exhaust === "open"
            ? 2
            : 1) -
          this.openness);
      this.resonance +=
        this.toneSmooth * (this.tone.resonance - this.resonance);
      this.roughness +=
        this.toneSmooth * (this.tone.roughness - this.roughness);
      this.retard += this.toneSmooth * (this.tone.timingRetard - this.retard);
      this.cabinMix +=
        this.toneSmooth *
        ((this.tone.listening === "cabin" ? 1 : 0) - this.cabinMix);
      this.engineMix +=
        this.toneSmooth *
        ((this.tone.listening === "engine" ? 1 : 0) - this.engineMix);
      this.roadsideMix +=
        this.toneSmooth *
        ((this.tone.listening === "roadside" ? 1 : 0) - this.roadsideMix);
      this.distance += this.toneSmooth * (this.tone.distanceM - this.distance);
      this.roadSpeed += this.toneSmooth * (this.tone.speedMS - this.roadSpeed);
      const range = Math.hypot(5, this.distance);
      const doppler =
        1 +
        this.roadsideMix *
          (343 / (343 + (this.roadSpeed * this.distance) / range) - 1);
      this.faultDepth +=
        this.toneSmooth *
        ((this.tone.disabledCylinder === null ? 0 : 1) - this.faultDepth);
      this.overrunTail *= this.overrunDecay;
      if (this.running) {
        const step = (this.speed * doppler) / (15 * sampleRate);
        this.phase += step;
        // Ignition retard delays the pressure event by the corresponding crank angle.
        if (this.phase >= 1 + this.retard / 90) {
          this.phase -= 1;
          const flat = this.tone.crank === "flat-plane";
          const bank = flat ? this.event % 2 : this.banks[this.event];
          const cylinder = (flat ? this.flatOrder : this.crossOrder)[
            this.event
          ];
          const variation =
            1 +
            this.noise() * (0.035 + 0.045 * (1 - this.load)) * this.roughness;
          const strength =
            (0.15 * Math.sqrt(this.load) + 0.85 * this.load) *
            variation *
            (1 - this.retard / 100) *
            (cylinder === this.tone.disabledCylinder ? 1 - this.faultDepth : 1);
          const age = (this.phase - this.retard / 90) / step;
          (bank ? this.right : this.left).fire(strength, age);
          if (this.event % 4 === 2 && this.overrunTail > 0.002)
            (bank ? this.right : this.left).fire(this.overrunTail, age);
          this.event = (this.event + 1) % 8;
        }
      }
      const left = this.left.process(this.noise(), this.load);
      const right = this.right.process(this.noise(), this.load);
      // Cross-feed joins the banks without losing their distinct exhaust rhythm.
      const gain = 2.7 * this.gate * (0.65 + 0.35 * this.openness);
      let l = left + 0.27 * right,
        r = right + 0.27 * left;
      this.cabinLeft += this.cabinSmooth * (l - this.cabinLeft);
      this.cabinRight += this.cabinSmooth * (r - this.cabinRight);
      this.cabinLeft2 += this.cabinSmooth * (this.cabinLeft - this.cabinLeft2);
      this.cabinRight2 +=
        this.cabinSmooth * (this.cabinRight - this.cabinRight2);
      this.mechanicalPhase =
        (this.mechanicalPhase + (this.speed * doppler) / (60 * sampleRate)) % 1;
      const mechanical =
        this.load *
        (0.09 * Math.sin(2 * Math.PI * this.mechanicalPhase * 4) +
          0.025 * Math.sin(2 * Math.PI * this.mechanicalPhase * 16));
      l +=
        this.cabinMix * (0.38 * this.cabinLeft2 - l) +
        this.engineMix * (mechanical - 0.6 * l);
      r +=
        this.cabinMix * (0.38 * this.cabinRight2 - r) +
        this.engineMix * (mechanical - 0.6 * r);
      // Relative free-field spreading plus continuous stereo direction, not absolute SPL.
      const attenuation = 1 + this.roadsideMix * (5 / range - 1);
      const pan = ((this.roadsideMix * this.distance) / range) * 0.7;
      l = 0.82 * Math.tanh(l * gain * attenuation * Math.sqrt(1 - pan));
      r = 0.82 * Math.tanh(r * gain * attenuation * Math.sqrt(1 + pan));
      channels[0][i] = channels[1] ? l : (l + r) * 0.5;
      if (channels[1]) channels[1][i] = r;
    }
    return true;
  }
}
registerProcessor("v8-exhaust", Exhaust);
