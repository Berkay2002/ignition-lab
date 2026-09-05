/** Browser AudioWorklet globals are not included in TypeScript's DOM library. */
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean;
}
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;
