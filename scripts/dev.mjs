import ts from "typescript";
import { createServer } from "node:http";
import { readFile, copyFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join, resolve, sep, extname } from "node:path";
import { root, output, publicFiles, copySite } from "./site.mjs";

await copySite();
const config = join(root, "tsconfig.json");
const host = ts.createWatchCompilerHost(
  config,
  {},
  ts.sys,
  ts.createSemanticDiagnosticsBuilderProgram,
);
const compiler = ts.createWatchProgram(host);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".map": "application/json",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = resolve(
      output,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (!file.startsWith(output + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
const watcher = watch(root, (_event, name) => {
  if (name && publicFiles.includes(name))
    copyFile(join(root, name), join(output, name)).catch((error) =>
      console.error(error.message),
    );
});
const port = Number(process.env.PORT || 8765);
server.listen(port, "127.0.0.1", () =>
  console.log(`Ignition Lab: http://127.0.0.1:${port} (refresh after edits)`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    compiler.close();
    watcher.close();
    server.close();
  });
