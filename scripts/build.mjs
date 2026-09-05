import { rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { root, output, copySite } from "./site.mjs";

// This directory contains only generated output. Never clean a caller-supplied path.
if (output !== join(root, "dist") || dirname(output) !== root)
  throw new Error("Invalid build output path.");
await rm(output, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    join(root, "tsconfig.json"),
  ],
  { stdio: "inherit" },
);
await copySite();
console.log("Built strict TypeScript and public assets in dist/.");
