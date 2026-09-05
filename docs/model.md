# Model and validation

A library-free browser engine lab. WebGL draws the movable parts, Canvas draws the pressure loop, and Web Audio synthesizes the exhaust events.

Install Node 22 or 24 LTS, then run:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8765 and click Start sound to enable audio. The production build in `dist/` can be served by any static HTTP host.

Drag the engine to orbit; release for a short eased stop. Scroll to zoom. Arrow keys also rotate the focused canvas. Reset view restores the camera. Select a cylinder to follow its pressure trace and work integral. Scrubbing crank angle pauses animation. Visual speed controls animation only; sound follows Engine speed. The small info control opens the typeset equations and model assumptions.

## Explore the assembly

Switch between Assembled, Cutaway, and Exploded. Exploded pauses playback and separates the layers; use Separation to adjust the spacing. Click a part to identify it, hide its layer, or isolate it. The ten layer checkboxes control visibility, and Show all restores them.

The assembly has 865 named parts across the block, crank and pistons, main bearings, oil pan, heads, valvetrain, valve covers, intake, exhaust, and timing/flywheel groups. The browser animates the crank, pistons, rods, and valve gear from its equations. It uses Blender-exported mesh data directly in native WebGL, with no runtime libraries.

`v8-engine.blend` is the editable Blender scene. Select `Assembly controls` and adjust its `explode` custom property to separate the ten collections. The file stores the zero-degree assembly pose; the browser supplies the live mechanical animation. `v8-engine.glb` is a static assembled interchange export. The PNGs are studio renders.

The geometry detail pass used Blender 4.5.9. Blender 5.2.1 was used to open, check, synchronize, save the final 865-part scene, and export the GLB. The final file's explosion drivers and ten layer groups were verified in 5.2.1.

## What the numbers mean

The engine has an 86 mm bore and stroke, 143 mm rods, and a 90-degree cross-plane V8 arrangement. Paired connecting rods share crank-pin coordinates. The proportions start from parameterized geometry, with Blender-refined bevels, normals, bores, and hollow shells. This is an educational assembly, not manufacturing CAD.

The model uses ideal-gas energy, a prescribed Wiebe burn curve, a simple wall heat-transfer term, and ideal intake/exhaust pressure boundaries. The closed portion is solved by fourth-order Runge-Kutta at 0.5 crank degrees. Changing a parameter re-solves the steady cycle. It does not simulate chemical kinetics, fluid flow, knock, friction, mechanical loading, or acceleration. Power is indicated gas power, before mechanical losses. Exhaust sound is a pressure-scaled resonator approximation.

At the default settings (2400 RPM, 65% throttle, 10:1 compression, 18 degrees advance), the calculated work is 663.2 J per cylinder per cycle and indicated power is 106.1 kW. These are model outputs, not measurements of a real engine.

## Verification

Numerical checks covered 81 combinations of the exposed parameter limits. They checked positive finite states, constant rod length, paired crank pins, compression ratio, volume derivatives, energy balance, and integration convergence. The default energy residual was 0.042 J. Halving the integration step changed cycle work by 0.014 J. Offline audio checks exercised 600, 2400, and 7000 RPM and confirmed bounded output and clean decay when stopped.

Browser checks also covered assembly presets, direct part picking, isolation and restoration, exploded framing, and mobile layer layout with no horizontal overflow at 390 CSS pixels. Browser checks covered tuning, cylinder selection, scrubbing, pause/resume, real-time playback, sound startup/mute, orbit/reset, model notes, desktop alignment, and mobile overflow. The numerical checks validate internal consistency; the model has not been calibrated against an engine or an acoustic recording.

## Files

- `src/engine.ts`: geometry and thermodynamic cycle.
- `src/scene.ts`: native WebGL assembly, picking, lighting, and camera.
- `src/assembly.ts`: layer definitions and view state.
- `blender-meshes.js`: Blender-refined mesh data.
- `src/geometry.ts`: procedural fallback meshes.
- `v8-engine.blend` / `v8-engine.glb`: editable assembly and interchange export.
- `src/renderer.ts`: pressure-volume chart.
- `src/app.ts`: typed controls, animation, and audio lifecycle.
- `src/exhaust-worklet.ts`: typed audio processor and validated control messages.
- `style.css`: full-screen scene and responsive overlay cards.

Background: [NASA cycle thermodynamics](https://www.grc.nasa.gov/www/k-12/BGP/ottoa.html) and [NASA gas work](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/work-done-by-a-gas-3/).
