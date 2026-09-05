// Offline audio uses the same calculated vehicle state and worklet as the app.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { profiles } from "../dist/js/profiles.js";
import { createRun, stepRun } from "../dist/js/vehicle.js";
const require = createRequire(import.meta.url);
const { createProcessor, configure, render } = require("../tests/audio.cjs");
const sampleRate = 48000;
const manifest = [];
for (const id of ["audi-r8", "mustang-gt", "ferrari-458"]) {
  const profile = profiles.find((p) => p.id === id);
  if (!profile) throw new Error(`Missing profile: ${id}`);
  const run = createRun(profile, "sprint");
  run.status = "running";
  const controls = {
    transmission: "auto",
    throttle: 1,
    brake: 0,
    shift: 0,
    disabledCylinder: null,
    timingRetard: 0,
  };
  const processor = createProcessor(sampleRate),
    blocks = [];
  let tail = 0;
  while (run.status === "running" || tail < 0.6) {
    const dt = 128 / sampleRate;
    if (run.status === "running") stepRun(run, profile, dt, controls);
    else tail += dt;
    configure(
      processor,
      run.rpm,
      0.04 + 0.96 * run.throttle,
      run.status === "running",
      {
        exhaust: "sport",
        listening: "tailpipe",
        crank: profile.crank,
        resonance: profile.sound.resonance,
        roughness: profile.sound.roughness,
        overrun: false,
        disabledCylinder: null,
        timingRetard: 0,
        speedMS: run.speedMS,
        distanceM: run.distanceM - 80,
      },
    );
    const sound = render(processor, 128),
      block = Buffer.alloc(512);
    for (let i = 0; i < 128; i++)
      for (let c = 0; c < 2; c++)
        block.writeInt16LE(
          Math.round(sound[c][i] * 0.35 * 32767),
          (i * 2 + c) * 2,
        );
    blocks.push(block);
  }
  const pcm = Buffer.concat(blocks),
    header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  const file = `drive-${id}.wav`;
  await writeFile(
    new URL(`../${file}`, import.meta.url),
    Buffer.concat([header, pcm]),
  );
  manifest.push({
    profile: profile.name,
    scenario: "100 to 200 km/h",
    file,
    seconds: run.elapsed,
    status: run.status,
    source:
      "calculated vehicle model and procedural worklet; not a production car recording",
  });
}
await writeFile(
  new URL("../driving-demos.json", import.meta.url),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(manifest);
