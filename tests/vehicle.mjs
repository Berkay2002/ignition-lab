import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const moduleUrl = process.env.VEHICLE_MODULE_PATH
  ? pathToFileURL(process.env.VEHICLE_MODULE_PATH).href
  : new URL("../dist/js/vehicle.js", import.meta.url).href;
const { createRun, stepRun, torqueAt, wheelRpm, vehicleModel } = await import(
  moduleUrl
);
const { profiles } = await import(new URL("./profiles.js", moduleUrl).href);

// Synthetic inputs exercise equations; no published acceleration time is a target.
const profile = {
  id: "fixture",
  name: "Synthetic test car",
  engine: "Test V8",
  displacementLitres: 4,
  crank: "cross-plane",
  aspiration: "natural",
  idleRpm: 800,
  redlineRpm: 7000,
  peakPowerKw: 300,
  peakTorqueNm: 450,
  massKg: 1450,
  dragAreaM2: 0.64,
  tyreRadiusM: 0.33,
  finalDrive: 3.7,
  gears: [3.3, 2.2, 1.6, 1.2, 1, 0.8],
  shiftSeconds: 0.2,
  tractionMu: 0.95,
  drivetrainEfficiency: 0.9,
  torqueCurve: [
    [800, 230],
    [2000, 380],
    [4000, 450],
    [6000, 420],
    [7000, 350],
  ],
  sound: { resonance: 1, roughness: 0.2 },
  sources: [],
  assumptions: "Synthetic test fixture",
};
const controls = {
  transmission: "auto",
  throttle: 1,
  brake: 0,
  shift: 0,
  disabledCylinder: null,
  timingRetard: 0,
};
function run(
  scenario,
  car = profile,
  input = controls,
  dt = 1 / 60,
  observe = () => {},
) {
  const state = createRun(car, scenario);
  state.status = "running";
  for (
    let tick = 0;
    state.status === "running" && tick < Math.ceil(91 / dt);
    tick++
  ) {
    const previousGear = state.gear;
    stepRun(state, car, dt, input);
    observe(state, previousGear);
    for (const field of [
      "elapsed",
      "speedMS",
      "distanceM",
      "rpm",
      "acceleration",
      "torqueNm",
      "powerKw",
      "wheelPowerKw",
    ]) {
      assert.ok(Number.isFinite(state[field]), `${scenario}: finite ${field}`);
    }
    assert.ok(state.speedMS >= 0);
    assert.ok(
      state.wheelPowerKw <= state.powerKw * car.drivetrainEfficiency + 1e-7,
      "Clutch slip and traction cannot create power at the wheels",
    );
    assert.ok(state.rpm >= car.idleRpm && state.rpm <= car.redlineRpm);
    assert.ok(state.torqueNm <= car.peakTorqueNm + 1e-9);
    assert.ok(state.powerKw <= car.peakPowerKw + 1e-9);
    assert.ok(
      state.acceleration <= car.tractionMu * vehicleModel.gravityMS2 + 1e-8,
    );
  }
  return state;
}

assert.equal(torqueAt(profile, 3000), 415);
assert.equal(torqueAt(profile, 7001), 0);
assert.equal(torqueAt(profile, NaN), 0);
assert.equal(torqueAt({ ...profile, peakTorqueNm: 300 }, 3000), 300);
assert.ok(
  Math.abs(
    (torqueAt({ ...profile, peakPowerKw: 50 }, 3000) * 3000 * 2 * Math.PI) /
      60000 -
      50,
  ) < 1e-10,
);
assert.throws(
  () => createRun({ ...profile, gears: [] }, "launch"),
  /Vehicle profile/,
);
assert.throws(
  () => createRun({ ...profile, massKg: NaN }, "launch"),
  /Vehicle profile/,
);
for (const peakPowerKw of [0, -1, NaN, Infinity]) {
  assert.throws(
    () => createRun({ ...profile, peakPowerKw }, "launch"),
    /Vehicle profile/,
  );
}
assert.throws(
  () => createRun({ ...profile, gears: [1, 2] }, "launch"),
  /Vehicle profile/,
);
assert.throws(
  () =>
    createRun(
      {
        ...profile,
        torqueCurve: [
          [1000, 100],
          [1000, 200],
        ],
      },
      "launch",
    ),
  /Vehicle profile/,
);
assert.throws(() => wheelRpm(profile, 20, 0), /Gear/);

const ready = createRun(profile, "launch");
const original = structuredClone(ready);
stepRun(ready, profile, 1 / 60, controls);
assert.deepEqual(ready, original, "Ready state does not advance");
for (const status of ["complete", "limited"]) {
  ready.status = status;
  const before = structuredClone(ready);
  stepRun(ready, profile, 1 / 60, controls);
  assert.deepEqual(ready, before);
}

const results = {};
for (const [scenario, target] of [
  ["launch", 100 / 3.6],
  ["sprint", 200 / 3.6],
  ["rolling", 160 / 3.6],
  ["braking", 0],
]) {
  const state = run(scenario);
  assert.equal(
    state.status,
    "complete",
    `${scenario} reaches its physical target`,
  );
  assert.ok(Math.abs(state.speedMS - target) < 1e-10);
  results[scenario] = Number(state.elapsed.toFixed(4));
}

const healthy = run("launch");
const disabled = run("launch", profile, { ...controls, disabledCylinder: 3 });
const retarded = run("launch", profile, { ...controls, timingRetard: 15 });
assert.ok(
  disabled.elapsed > healthy.elapsed,
  "Lost combustion torque slows acceleration",
);
assert.ok(
  retarded.elapsed > healthy.elapsed,
  "Illustrative timing penalty slows acceleration",
);
const weak = {
  ...profile,
  torqueCurve: [
    [800, 20],
    [7000, 20],
  ],
};
const limited = run("sprint", weak);
assert.equal(limited.status, "limited");
assert.equal(limited.elapsed, vehicleModel.maximumRunSeconds);
const firstGearOnly = run("launch", profile, {
  ...controls,
  transmission: "manual",
});
assert.equal(
  firstGearOnly.status,
  "limited",
  "An unshifted gear cannot reach a target beyond its redline speed",
);

const coast = createRun(profile, "free");
coast.status = "running";
coast.gear = 4;
coast.speedMS = 30;
coast.rpm = wheelRpm(profile, coast.speedMS, coast.gear);
const braked = structuredClone(coast);
const fullBraked = structuredClone(coast);
const manual = { ...controls, transmission: "manual", throttle: 0 };
stepRun(coast, profile, 0.2, manual);
stepRun(braked, profile, 0.2, { ...manual, brake: 0.7 });
const roadDeceleration =
  vehicleModel.rollingCoefficient * vehicleModel.gravityMS2 +
  (0.5 *
    vehicleModel.airDensityKgM3 *
    profile.dragAreaM2 *
    fullBraked.speedMS ** 2) /
    profile.massKg;
stepRun(fullBraked, profile, 1 / 120, { ...manual, brake: 1 });
assert.ok(
  Math.abs(
    fullBraked.acceleration +
      profile.tractionMu * vehicleModel.gravityMS2 +
      roadDeceleration,
  ) < 1e-9,
  "Service and engine braking share one tyre traction limit",
);
assert.ok(coast.speedMS < 30 && braked.speedMS < coast.speedMS);
assert.ok(
  Math.abs(coast.rpm - wheelRpm(profile, coast.speedMS, coast.gear)) < 1e-9,
  "Locked drivetrain RPM derives from wheel speed",
);
assert.ok(
  Math.abs(
    wheelRpm(profile, 30, 3) / wheelRpm(profile, 30, 4) -
      profile.gears[2] / profile.gears[3],
  ) < 1e-12,
);

const shifting = createRun(profile, "free");
Object.assign(shifting, {
  status: "running",
  speedMS: 25,
  gear: 2,
  rpm: wheelRpm(profile, 25, 2),
});
const beforeRpm = shifting.rpm;
stepRun(shifting, profile, 1 / 120, { ...manual, throttle: 1, shift: 1 });
assert.equal(shifting.stage, "shift");
assert.equal(shifting.torqueNm, 0, "Shift interrupts tractive torque");
for (let index = 0; index < 30; index++)
  stepRun(shifting, profile, 1 / 120, { ...manual, throttle: 1 });
assert.equal(shifting.gear, 3);
assert.ok(
  shifting.rpm < beforeRpm,
  "Upshift drops RPM according to gear ratio",
);
stepRun(shifting, profile, 1 / 120, { ...manual, shift: -1 });
assert.equal(shifting.stage, "rev-match");

const dyno = run("dyno");
assert.equal(dyno.status, "complete");
assert.equal(dyno.rpm, profile.redlineRpm);
assert.equal(dyno.gear, 5, "Sweep uses the closest gear to direct drive");
assert.equal(dyno.distanceM, 0, "Roller speed is not road distance");
assert.ok(
  Math.abs(dyno.powerKw - (dyno.torqueNm * dyno.rpm * 2 * Math.PI) / 60000) <
    1e-10,
);

const coarse = run("sprint", profile, controls, 1 / 30);
const fine = run("sprint", profile, controls, 1 / 240);
assert.ok(
  Math.abs(coarse.elapsed - fine.elapsed) / fine.elapsed < 0.005,
  "Time-step convergence within 0.5%",
);
const suspended = createRun(profile, "free");
suspended.status = "running";
stepRun(suspended, profile, 30, controls);
assert.ok(
  suspended.elapsed <= 0.25 + 1e-10,
  "Suspended tabs cannot create a catch-up burst",
);

const profileScenarios = {};
assert.equal(profiles.length, 6);
for (const car of profiles) {
  for (let rpm = car.idleRpm; rpm <= car.redlineRpm; rpm += 1) {
    const torque = torqueAt(car, rpm);
    assert.ok(
      torque <= car.peakTorqueNm + 1e-9,
      `${car.id}: torque envelope at ${rpm} RPM`,
    );
    assert.ok(
      (torque * rpm * 2 * Math.PI) / 60000 <= car.peakPowerKw + 1e-9,
      `${car.id}: power envelope at ${rpm} RPM`,
    );
  }
  const calculated = {};
  for (const scenario of [
    "launch",
    "sprint",
    "rolling",
    "braking",
    "dyno",
    "free",
  ]) {
    let upshifts = 0;
    let downshifts = 0;
    const input = { ...controls };
    const state = run(scenario, car, input, 1 / 60, (current, previousGear) => {
      if (current.gear > previousGear) {
        upshifts++;
        assert.ok(
          current.rpm < current.shiftFromRpm,
          `${car.id}: upshift RPM drops`,
        );
      }
      if (current.gear < previousGear) downshifts++;
      if (current.stage === "shift" || current.stage === "rev-match")
        assert.equal(current.torqueNm, 0);
      if (scenario === "free") {
        input.throttle = current.elapsed < 5 ? 1 : 0;
        input.brake = current.elapsed > 7 ? 0.6 : 0;
      }
    });
    if (scenario === "free") {
      assert.equal(
        state.status,
        "running",
        `${car.id}: free drive has no scripted finish`,
      );
      assert.equal(
        state.speedMS,
        0,
        `${car.id}: free controls can stop the vehicle`,
      );
    } else {
      assert.equal(
        state.status,
        "complete",
        `${car.id}: ${scenario} is reachable with the configured drivetrain`,
      );
      assert.ok(state.elapsed > 0 && state.elapsed < 90);
      calculated[scenario] = Number(state.elapsed.toFixed(4));
    }
    if (scenario === "launch")
      assert.ok(
        upshifts >= 1,
        `${car.id}: launch requires an actual ratio change`,
      );
    if (scenario === "braking") {
      assert.equal(state.speedMS, 0);
      assert.ok(downshifts >= 1, `${car.id}: braking includes downshifts`);
    }
    if (scenario === "dyno") {
      assert.equal(
        upshifts + downshifts,
        0,
        `${car.id}: dyno gear stays fixed`,
      );
      assert.ok(Math.abs(state.rpm - car.redlineRpm) < 1e-8);
      assert.equal(state.distanceM, 0);
    }
  }
  profileScenarios[car.id] = calculated;
}
console.log(
  JSON.stringify({
    vehicle: "passed",
    syntheticSeconds: results,
    convergenceSeconds: Math.abs(coarse.elapsed - fine.elapsed),
    dynoResistanceN: vehicleModel.dynoRollerResistanceN,
    profileScenarios,
  }),
);
