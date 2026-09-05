type WorkletParameters = import("./types.js").AudioParameters;
type Impulse = { age: number; bank: number; amp: number };

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

class Exhaust extends AudioWorkletProcessor {
  rpm = 2400;
  amplitude = 0.5;
  running = true;
  phase = 0;
  event = -1;
  impulses: Impulse[] = [];

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!isWorkletParameters(event.data)) return;
      this.rpm = event.data.rpm;
      this.amplitude = event.data.amplitude;
      this.running = event.data.running;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels?.[0]) return true;
    const n = channels[0].length,
      order = [1, 8, 4, 3, 6, 5, 7, 2];
    for (let i = 0; i < n; i++) {
      if (this.running) {
        this.phase += (this.rpm * 6) / sampleRate;
        const current = Math.floor((this.phase - 180) / 90);
        if (current !== this.event) {
          this.event = current;
          const cylinder = order[((current % 8) + 8) % 8];
          this.impulses.push({
            age: 0,
            bank: cylinder % 2,
            amp: this.amplitude,
          });
        }
      }
      let left = 0,
        right = 0;
      for (let j = this.impulses.length - 1; j >= 0; j--) {
        const pulse = this.impulses[j],
          t = pulse.age++ / sampleRate;
        if (t > 0.12) {
          this.impulses.splice(j, 1);
          continue;
        }
        const f = pulse.bank ? 83 : 97;
        const wave =
          pulse.amp *
          (Math.exp(-t * 85) * Math.sin(2 * Math.PI * f * t) +
            0.36 * Math.exp(-t * 145) * Math.sin(2 * Math.PI * f * 2.7 * t) +
            0.16 * Math.exp(-t * 650) * Math.sin(2 * Math.PI * 1250 * t));
        left += wave * (pulse.bank ? 1 : 0.55);
        right += wave * (pulse.bank ? 0.55 : 1);
      }
      channels[0][i] = Math.tanh(left * 0.75) * 0.65;
      if (channels[1]) channels[1][i] = Math.tanh(right * 0.75) * 0.65;
    }
    return true;
  }
}
registerProcessor("v8-exhaust", Exhaust);
