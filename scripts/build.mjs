// Copy only the public site into Vercel's output directory. No bundler required.
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const files = ['index.html', 'showcase.html', 'style.css', 'model.css', 'ui.css', 'showcase.css',
  'engine.js', 'renderer.js', 'geometry.js', 'assembly.js', 'blender-meshes.js', 'scene.js', 'app.js',
  'favicon.svg', 'v8-engine.blend', 'v8-engine.glb', 'v8-assembled.png', 'v8-exploded.png', 'LICENSE'];
await mkdir(new URL('dist/', root), { recursive: true });
for (const name of files) await copyFile(new URL(name, root), new URL(`dist/${name}`, root));
console.log(`Built ${files.length} public files in ${fileURLToPath(new URL('dist/', root))}`);
