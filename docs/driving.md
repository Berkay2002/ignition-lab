# Driving lab

The driving lab integrates a longitudinal vehicle model. It does not play a prerecorded acceleration clip or interpolate toward a chosen 0 to 100 time. Six [vehicle profiles](profiles.md) supply published peak specifications and explicitly estimated inputs.

## Vehicle calculation

Wheel force is engine torque multiplied by gear ratio, final drive and drivetrain efficiency, divided by tyre radius. Tyre friction limits drive and brake force. Air drag is `0.5 × air density × CdA × speed²`; rolling resistance is `0.015 × mass × gravity`. Net force divided by mass gives acceleration. Speed and distance are integrated with steps no larger than 1/120 second. See [NASA's drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/) for the aerodynamic term.

RPM follows wheel speed and gearing. A simplified launch clutch permits slip; shifts cut torque and interpolate engine RPM toward the next ratio. Automatic operation changes the specified gearbox's shift control, not its physical ratios. A manual profile can therefore be driven by the automatic controller.

The torque input is piecewise linear and capped at the profile's published peak torque and power. It is not a measured dyno curve. There is no fitted target acceleration time, tyre temperature, weight transfer, differential model, turbo spool model, aerodynamic lift, road gradient or full driveline elasticity. Air density is fixed at 1.225 kg/m³. Test convergence checks establish numerical consistency, not real-car accuracy.

Scenarios are standing 0 to 100 km/h, 100 to 200 km/h, 80 to 160 km/h, braking from 160 km/h, a single-gear dyno sweep, and free drive. Target runs stop after 90 simulated seconds if they cannot finish. The dyno uses vehicle-equivalent inertia with 350 N roller resistance; it displays the input torque curve and corresponding crank power, not an independently measured output. Free drive has throttle, brake and manual shifts, plus a finish button. Timing retard reduces available torque by 1% per degree up to 30%; a disabled cylinder removes one eighth of torque. These fault responses are deliberately simplified.

Engine study and driving mode have separate models. The original 4.0 L pressure-volume calculation remains available in Engine study. It does not produce the vehicle profiles' torque curves. The 1,494-part cross-plane cutaway is shared by all profiles, including the flat-plane Ferrari profile, and its display motion is slowed.

## Sound

The AudioWorklet generates exhaust events at the current calculated RPM and responds to throttle and shifts. Exhaust choices change damping and resonances. Listening positions add cabin filtering, engine-bay texture, or roadside distance, panning and Doppler. The roadside observer is 80 m from the run's starting point. Cross-plane and flat-plane profiles have different bank firing cadence. Disabling a cylinder removes its firing event. Optional afterfire is triggered by throttle closure, rather than a looping crackle recording.

These are procedural, empirically tuned profiles. They are not authenticated recordings of the named vehicles or a calibrated acoustic solver. Gear whine, intake, exhaust and mechanical texture are approximations.

An Audi acceleration MP3 supplied privately by the user was analyzed for broad spectral balance. It had no confirmed vehicle model, RPM trace, microphone position or exhaust configuration. That comparison motivated stronger midrange pipe resonances; it cannot establish vehicle-specific acoustic accuracy. The private reference is not included in the repository.

The user also suggested the [Soundsnap Mustang catalogue](https://www.soundsnap.com/tags/mustang). It contains multiple generations and microphone perspectives, including 1968 Fastback recordings, unknown-year idle/rev recordings and unrelated door effects. Catalogue labels alone cannot calibrate the 2018 GT profile. Downloads on the inspected public page lead to a subscription prompt. No Soundsnap recordings are bundled, and no subjective listening or spectral match to those clips is claimed.

## Compare and export

Completed runs appear in the results card. Select an earlier run of the same scenario to overlay its trace. The six most recent results remain in this tab. Free-drive traces retain the latest 12,000 samples. JSON export includes profile inputs, final controls, the calculated result and sampled telemetry; it is a model result, not road-test evidence.

Record video + sound starts the selected scenario again and captures the rendered engine, speed, RPM, gear, time, trace, generic pressure-volume reference and synthesized audio. Capture uses Canvas, Web Audio and MediaRecorder locally. It ends at scenario completion, after 60 seconds, when changing mode/profile/scenario, or when the page is hidden. The last two recordings can be compared and downloaded in Clips & comparison. Browser support determines WebM or MP4 availability. No microphone, upload, account or recording service is used. Muting the engine also mutes its captured output.

## Validation

`npm run check` tests all 36 profile/scenario combinations, target reachability, gear changes, power and torque envelopes, braking traction, control faults and timestep convergence. The DSP suite checks stability at 44.1, 48 and 96 kHz, cross/flat-plane cadence, all eight cylinder faults, exhaust and listening filters, Doppler, transitions and clean stopping. These checks do not establish a perceptual match to a production car.
