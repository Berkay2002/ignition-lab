// Render the actual worklet offline: idle, acceleration, load, coast, then stop.
const fs = require("node:fs");
const path = require("node:path");
const { createProcessor, configure, render } = require("../tests/audio.cjs");
const rate = 48000,
  frames = rate * 13;
const processor = createProcessor(rate);
const pcm = Buffer.alloc(frames * 4);
for (let offset = 0; offset < frames; offset += 128) {
  const t = offset / rate;
  let rpm = 850,
    load = 0.18;
  if (t >= 2 && t < 6) {
    rpm = 850 + (5650 * (t - 2)) / 4;
    load = 0.85;
  } else if (t >= 6 && t < 7.5) {
    rpm = 6500;
    load = 0.95;
  } else if (t >= 7.5 && t < 10) {
    rpm = 6500 - (5650 * (t - 7.5)) / 2.5;
    load = 0.08;
  }
  configure(processor, rpm, load, t < 12);
  const block = render(processor, Math.min(128, frames - offset));
  for (let i = 0; i < block[0].length; i++)
    for (let channel = 0; channel < 2; channel++)
      pcm.writeInt16LE(
        Math.round(block[channel][i] * 0.35 * 32767),
        ((offset + i) * 2 + channel) * 2,
      );
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const destination = path.join(__dirname, "../v8-exhaust-demo.wav");
fs.writeFileSync(destination, Buffer.concat([header, pcm]));
console.log("Rendered 13-second stereo exhaust demo.");
