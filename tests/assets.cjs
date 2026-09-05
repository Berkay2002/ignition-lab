const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name));
const context = {};
vm.runInNewContext(read("blender-meshes.js").toString(), context);
assert.equal(context.BlenderAssetInfo.parts, 1494);
assert.equal(context.BlenderAssetInfo.validatedWith, "5.2.1 LTS");
assert.equal(Object.keys(context.BlenderMeshes).length, 15);
for (const [name, mesh] of Object.entries(context.BlenderMeshes)) {
  assert.ok(
    mesh.length > 0 && mesh.length % 18 === 0,
    `${name}: complete position/normal triangles`,
  );
  for (const value of mesh)
    assert.ok(Number.isFinite(value), `${name}: finite geometry`);
  for (let i = 3; i < mesh.length; i += 6) {
    assert.ok(
      Math.abs(Math.hypot(mesh[i], mesh[i + 1], mesh[i + 2]) - 1) < 0.005,
      `${name}: normalized normals`,
    );
  }
}
const glb = read("v8-engine.glb");
assert.equal(glb.subarray(0, 4).toString(), "glTF");
assert.equal(glb.readUInt32LE(4), 2);
assert.equal(glb.readUInt32LE(8), glb.length);
const scene = JSON.parse(
  glb
    .subarray(20, 20 + glb.readUInt32LE(12))
    .toString()
    .trim(),
);
assert.equal(
  scene.nodes.filter((node) => node.mesh !== undefined).length,
  1494,
);
for (const name of [
  "Alternator",
  "Serpentine belt",
  "Spark plug 8",
  "Fuel injector 8",
  "Oil pickup & windage tray",
  "Right V8 nameplate",
])
  assert.ok(
    scene.nodes.some((node) => node.extras?.part === name),
    `${name}: included in public GLB`,
  );
const assembly = JSON.parse(read("model/assembly.json"));
assert.equal(assembly.parts.length, context.BlenderAssetInfo.parts);
assert.equal(new Set(assembly.parts.map((part) => part.layer)).size, 10);
for (const part of assembly.parts) {
  assert.ok(part.size.every((value) => Number.isFinite(value) && value > 0));
  assert.ok([...part.center, ...part.basis.flat()].every(Number.isFinite));
}
const demo = read("v8-exhaust-demo.wav");
assert.equal(demo.subarray(0, 4).toString(), "RIFF");
assert.equal(demo.readUInt32LE(4) + 8, demo.length);
assert.equal(demo.readUInt32LE(24), 48000);
assert.equal(read("v8-engine.blend").subarray(0, 7).toString(), "BLENDER");
for (const page of ["index.html", "showcase.html"]) {
  const html = read(page).toString();
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    if (/^(https?:|\/|\.)/.test(reference)) continue;
    assert.ok(
      fs.existsSync(path.join(root, "dist", reference)),
      `${page}: ${reference} exists`,
    );
  }
}
const { spawnSync } = require("node:child_process");
for (const name of fs
  .readdirSync(path.join(root, "dist/js"))
  .filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, "dist/js", name)],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
console.log(
  "Assets: 15 valid mesh templates, 1494 GLB parts, Blender file, audio demo, local references and JavaScript syntax passed.",
);
