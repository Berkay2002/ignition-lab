import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
export const output = join(root, "dist");
export const publicFiles = [
  "index.html",
  "showcase.html",
  "style.css",
  "model.css",
  "ui.css",
  "driving.css",
  "showcase.css",
  "blender-meshes.js",
  "favicon.svg",
  "v8-engine.blend",
  "v8-engine.glb",
  "v8-assembled.png",
  "v8-exploded.png",
  "v8-exhaust-demo.wav",
  "drive-audi-r8.wav",
  "drive-mustang-gt.wav",
  "drive-ferrari-458.wav",
  "driving-demos.json",
  "LICENSE",
];

export async function copySite() {
  await mkdir(output, { recursive: true });
  await Promise.all(
    publicFiles.map((name) => copyFile(join(root, name), join(output, name))),
  );
}
