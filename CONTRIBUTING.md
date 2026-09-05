# Contributing

Keep the browser runtime free of libraries. Use the existing TypeScript modules and native browser APIs. Small changes with a clear before/after example are easiest to review.

Use Node 22 or 24 LTS, run `npm ci`, then `npm run dev`. Open the printed local URL. Run `npm run check` before submitting; it typechecks, checks formatting, builds, and runs the model/audio/asset tests. `npm run format` formats maintained source. Keep `strict` enabled and validate external inputs instead of adding type assertions or suppressions.

For physics changes, explain the equation, units, boundary conditions, and expected numerical effect. The checks test geometry, energy balance, convergence, and parameter extremes. For UI changes, inspect desktop and mobile, mouse and keyboard interaction, reduced motion, and the model dialog. Keep sound opt-in.

The `.blend` file is the editable art source. Browser geometry uses shared meshes with separate per-part transforms. Editing the Blender scene alone does not update the runtime: export updated mesh data and adjust `src/scene.ts` if transforms or assembly structure change. Keep all three formats consistent.

Reports should include the browser, viewport, view mode, parameter values, and steps to reproduce. Model outputs are educational; claims of real-engine accuracy require independent evidence.
