type WorkletParameters = import("./types.js").AudioParameters;

function isWorkletParameters(value: unknown): value is WorkletParameters {
  return (
    typeof value === "object" &&
    value !== null &&
    "rpm" in value &&
    typeof value.rpm === "number" &&
    Number.isFinite(value.rpm) &&
    value.rpm >= 600 &&
    value.rpm <= 7000 &&
    "amplitude" in value &&
    typeof value.amplitude === "number" &&
    Number.isFinite(value.amplitude) &&
    value.amplitude >= 0 &&
    value.amplitude <= 1 &&
    "running" in value &&
    typeof value.running === "boolean"
  );
}

/** A damped pipe mode, normalized so its gain does not depend on sample rate. */
class PipeMode {
  private previous = 0;
  private older = 0;
  private readonly a: number;
  private readonly b: number;
  private readonly gain: number;

  constructor(frequency: number, decay: number) {
    const radius = Math.exp(-1 / (sampleRate * decay));
    this.a = 2 * radius * Math.cos((2 * Math.PI * frequency) / sampleRate);
    this.b = radius * radius;
    this.gain = (1 - radius) * Math.sin((2 * Math.PI * frequency) / sampleRate);
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
  private readonly fastDecay = Math.exp(-1 / (0.00019 * sampleRate));
  private readonly noiseDecay = Math.exp(-1 / (0.004 * sampleRate));
  private readonly reflectionSmooth =
    1 - Math.exp((-2 * Math.PI * 1800) / sampleRate);
  private readonly dcSmooth = 1 - Math.exp((-2 * Math.PI * 24) / sampleRate);
  private slowDecay = 0;
  private cutoff = 0;

  constructor(bank: number) {
    this.delay = new Float32Array(
      Math.round(sampleRate * (bank ? 0.0053 : 0.0048)),
    );
    this.body = new PipeMode(bank ? 91 : 83, 0.018);
    this.bark = new PipeMode(bank ? 367 : 331, 0.006);
    this.tune(0.5);
  }

  tune(load: number): void {
    this.slowDecay = Math.exp(-1 / (sampleRate * (0.0024 - 0.0011 * load)));
    this.cutoff =
      1 - Math.exp((-2 * Math.PI * (1100 + 3400 * load)) / sampleRate);
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
    const source = pulse + noise * this.turbulence * (0.018 + 0.07 * load);
    // Two low-pass stages remove the hard digital edge before pipe excitation.
    this.low += this.cutoff * (source - this.low);
    this.low2 += this.cutoff * (this.low - this.low2);
    const returning = this.delay[this.cursor];
    this.reflected += this.reflectionSmooth * (returning - this.reflected);
    this.delay[this.cursor] = this.low2 + 0.43 * this.reflected;
    this.cursor = (this.cursor + 1) % this.delay.length;
    const outlet = this.low2 - 0.58 * returning;
    const colored =
      outlet +
      2.8 * this.body.process(outlet) +
      1.4 * this.bark.process(outlet);
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
  private randomState = 0x21f0aaad;
  private readonly left = new ExhaustBank(0);
  private readonly right = new ExhaustBank(1);
  private readonly speedSmooth = 1 - Math.exp(-1 / (0.09 * sampleRate));
  private readonly loadSmooth = 1 - Math.exp(-1 / (0.045 * sampleRate));
  private readonly gateSmooth = 1 - Math.exp(-1 / (0.018 * sampleRate));
  // 1-8-4-3-6-5-7-2: even total spacing, uneven spacing within each bank.
  private readonly banks = [0, 1, 1, 0, 1, 0, 0, 1];

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!isWorkletParameters(event.data)) return;
      this.rpm = event.data.rpm;
      this.amplitude = event.data.amplitude;
      this.running = event.data.running;
      if (!this.configured) {
        this.speed = this.rpm;
        this.load = this.amplitude;
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
    this.left.tune(this.load);
    this.right.tune(this.load);
    for (let i = 0; i < channels[0].length; i++) {
      this.speed += this.speedSmooth * (this.rpm - this.speed);
      this.load += this.loadSmooth * (this.amplitude - this.load);
      this.gate += this.gateSmooth * ((this.running ? 1 : 0) - this.gate);
      if (this.running) {
        const step = this.speed / (15 * sampleRate);
        this.phase += step;
        if (this.phase >= 1) {
          this.phase -= 1;
          const bank = this.banks[this.event];
          const variation =
            1 + this.noise() * (0.035 + 0.045 * (1 - this.load));
          const strength =
            (0.15 * Math.sqrt(this.load) + 0.85 * this.load) * variation;
          (bank ? this.right : this.left).fire(strength, this.phase / step);
          this.event = (this.event + 1) % 8;
        }
      }
      const left = this.left.process(this.noise(), this.load);
      const right = this.right.process(this.noise(), this.load);
      // Cross-feed joins the banks without losing their distinct exhaust rhythm.
      const gain = 2.7 * this.gate;
      const l = 0.82 * Math.tanh((left + 0.27 * right) * gain);
      const r = 0.82 * Math.tanh((right + 0.27 * left) * gain);
      channels[0][i] = channels[1] ? l : (l + r) * 0.5;
      if (channels[1]) channels[1][i] = r;
    }
    return true;
  }
}
registerProcessor("v8-exhaust", Exhaust);
