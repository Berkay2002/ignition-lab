# Ignition Lab

A V8 engine built from equations, with an open Blender assembly. Turn the throttle, follow the pistons, watch pressure become work, and hear the exhaust pulses. Written in strict TypeScript and compiled to native browser modules, with **zero runtime dependencies**.

[![Model and asset checks](https://github.com/Berkay2002/ignition-lab/actions/workflows/checks.yml/badge.svg)](https://github.com/Berkay2002/ignition-lab/actions/workflows/checks.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-567b90.svg)](LICENSE)

**[Open the interactive lab](https://ignition-lab-berkay.vercel.app/)** · **[Project showcase](https://ignition-lab-berkay.vercel.app/showcase.html)** · **[Download the Blender scene](https://github.com/Berkay2002/ignition-lab/releases/latest)**

[![Assembled V8 studio render](v8-assembled.png)](https://ignition-lab-berkay.vercel.app/)

## Try it

| Demo | What to explore |
| --- | --- |
| [Assembled](https://ignition-lab-berkay.vercel.app/?view=assembled) | Orbit the engine, click a part, hide or isolate its assembly. |
| [Cutaway](https://ignition-lab-berkay.vercel.app/?view=cutaway) | Follow the pistons, rods, and valve gear while the pressure loop advances. |
| [Exploded](https://ignition-lab-berkay.vercel.app/?view=exploded) | Separate the ten layers and inspect the block, heads, bearings, and sump. |

Drag to orbit, scroll to zoom, or focus the canvas and use the arrow keys. Select a cylinder to follow its cycle. Scrub crank angle to pause and inspect a moment. Adjust RPM, throttle, compression, and ignition advance to solve a new cycle. Sound starts only after you click **Start sound**; it follows engine RPM independently of the slower study animation.

## Calculus you can see

The cylinder volume comes from slider-crank geometry. A Wiebe burn curve releases heat into an ideal gas; a fourth-order Runge-Kutta integrator follows its energy through compression and expansion. The signed area inside the pressure-volume loop gives cycle work:

```math
\begin{aligned}
W &= \oint p\,\mathrm{d}V \\
P_{\mathrm{ind}} &= 8W\frac{\mathrm{RPM}}{120}
\end{aligned}
```

The model uses prescribed RPM and a steady cycle. It does **not** simulate crank acceleration, chemical kinetics, CFD, knock, or mechanical losses. The sound is synthesized from exhaust events, not a recording. [Read the equations, assumptions, and validation](docs/model.md).

## Open 3D assets

865 named parts in ten groups: block, crank and pistons, main bearings, oil pan, cylinder heads, valvetrain, valve covers, intake, exhaust, and timing/flywheel. Details include bore liners, piston rings, fasteners, springs, ribbed covers, beveled castings, and hollow covers and sump.

| Asset | Use |
| --- | --- |
| [v8-engine.blend](https://github.com/Berkay2002/ignition-lab/releases/latest/download/v8-engine.blend) | Editable scene, named collections, materials, studio lights, and an explosion controller. Saved and checked in Blender 5.2.1. |
| [v8-engine.glb](https://github.com/Berkay2002/ignition-lab/releases/latest/download/v8-engine.glb) | Static assembled interchange model. |
| [Assembled render](v8-assembled.png) / [Exploded render](v8-exploded.png) | Full-resolution studio images. |

In Blender, select **Assembly controls** and change its **explode** custom property. The saved scene has a zero-degree mechanical pose; JavaScript provides the live crank, piston, rod, and valve motion in the browser. The geometry was refined in Blender 4.5.9, then synchronized and saved in 5.2.1. This is educational geometry, not manufacturing CAD.

<details>
<summary>See the exploded render</summary>

![Exploded V8 studio render](v8-exploded.png)

</details>

## Run locally

```sh
git clone https://github.com/Berkay2002/ignition-lab.git
cd ignition-lab
npm ci
npm run dev
```

Use Node 22 or 24 LTS. Open [localhost:8765](http://localhost:8765). The development server recompiles TypeScript and copies changed HTML/CSS; refresh the browser after edits. A modern browser with WebGL is required; audio also needs AudioWorklet and a secure context, which localhost provides.

## Verify and deploy

With dependencies installed:

```sh
npm run check
npm run build
```

The check command runs strict typechecking, formatting checks, a production build, and the tests. The tests cover 81 parameter combinations, geometric constraints, shared crank pins, positive finite pressures, energy balance, integration convergence, and bounded audio at 600, 2400, and 7000 RPM. Asset checks validate mesh normals, the 865-part GLB, local references, and compiled JavaScript syntax. GitHub Actions runs these checks on pushes and pull requests.

At the default settings the model produces 663.2 J per cylinder per cycle and 106.1 kW indicated power. The energy residual is 0.042 J; halving the integration step changes work by 0.014 J. These checks establish internal consistency, not agreement with an actual engine.

Vercel runs `npm ci --include=dev` and `npm run build`. TypeScript emits ES2022 modules into `dist/js/`, and `scripts/site.mjs` copies the public pages and assets into `dist/`. Connect a fork to Vercel using the included `vercel.json`; no environment variables or backend are required. TypeScript and Prettier are pinned development dependencies, with versions recorded in the lockfile.

The generated `blender-meshes.js` remains an asset rather than a hand-maintained TypeScript source file. Its data is validated at the typed renderer boundary. The audio worklet is compiled separately; its input messages are checked before updating processor state.

## Inside the repo

| File | Responsibility |
| --- | --- |
| `src/engine.ts` | Geometry, burn curve, energy integration, cycle work |
| `src/scene.ts`, `src/assembly.ts` | WebGL assembly, picking, layers, cutaway, explosion |
| `blender-meshes.js`, `src/geometry.ts` | Refined mesh templates and procedural fallback |
| `src/renderer.ts` | Pressure-volume plot |
| `src/app.ts` | Typed UI state, animation, orbit, audio lifecycle |
| `src/exhaust-worklet.ts` | Typed audio processor and message boundary |
| `src/types.ts`, `src/blender-assets.ts` | Spatial/color tuples, shared contracts, asset validation |
| `model.css`, `ui.css`, `style.css` | Typeset model dialog, shared theme, overlay layout |
| `showcase.html` | Project page, demos, renders, and asset downloads |
| `tests/` | Numerical, audio, and asset verification |
