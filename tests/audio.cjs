const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const source = app.match(/const workletSource=`([\s\S]*?)`;/)[1];
let Processor;
vm.runInNewContext(source, { sampleRate: 48000, AudioWorkletProcessor: class { constructor() { this.port = {}; } }, registerProcessor: (name, type) => Processor = type });
for (const rpm of [600, 2400, 7000]) {
  const processor = new Processor(); processor.rpm = rpm;
  let peak = 0, energy = 0;
  for (let block = 0; block < 375; block++) {
    const channels = [new Float32Array(128), new Float32Array(128)];
    assert.equal(processor.process([], [channels]), true);
    for (const channel of channels) for (const sample of channel) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
  }
  assert.ok(peak > 0.01 && peak <= 0.65);
  assert.ok(Math.abs(processor.phase - rpm * 6) < 0.01);
  processor.running = false;
  for (let block = 0; block < 50; block++) processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
  assert.equal(processor.impulses.length, 0);
  console.log(JSON.stringify({ rpm, peak, rms: Math.sqrt(energy / 96000), stoppedCleanly: true }));
}
