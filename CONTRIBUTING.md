# Contributing

Keep the browser runtime free of libraries. Use the existing JavaScript modules and native browser APIs. Small changes with a clear before/after example are easiest to review.

Serve the repository with `python -m http.server 8765 --bind 127.0.0.1`, then open the local URL. Run `npm test` and `npm run build` with Node 22 or later. There is no install step.

For physics changes, explain the equation, units, boundary conditions, and expected numerical effect. The checks test geometry, energy balance, convergence, and parameter extremes. For UI changes, inspect desktop and mobile, mouse and keyboard interaction, reduced motion, and the model dialog. Keep sound opt-in.

The `.blend` file is the editable art source. Browser geometry uses shared meshes with separate per-part transforms. Editing the Blender scene alone does not update the runtime: export updated mesh data and adjust `scene.js` if transforms or assembly structure change. Keep all three formats consistent.

Reports should include the browser, viewport, view mode, parameter values, and steps to reproduce. Model outputs are educational; claims of real-engine accuracy require independent evidence.
