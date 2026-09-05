import type {
  CarProfile,
  DriveControls,
  DriveScenario,
  DriveState,
} from "./vehicle-types.js";

/** Explicit assumptions, not fitted acceleration figures or measured dyno data. */
export const vehicleModel = {
  gravityMS2: 9.80665,
  airDensityKgM3: 1.225,
  rollingCoefficient: 0.015,
  launchSlipRpm: 1200,
  engineBrakingFraction: 0.12,
  timingTorqueLossPerDegree: 0.01,
  dynoRollerResistanceN: 350,
  maximumRunSeconds: 90,
  maximumStepSeconds: 1 / 120,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const finiteControl = (value: number, max = 1) =>
  Number.isFinite(value) ? clamp(value, 0, max) : 0;

function validateProfile(profile: CarProfile): void {
  const positive = [
    profile.massKg,
    profile.tyreRadiusM,
    profile.finalDrive,
    profile.idleRpm,
    profile.redlineRpm,
    profile.peakPowerKw,
    profile.peakTorqueNm,
    profile.shiftSeconds,
    profile.tractionMu,
    profile.drivetrainEfficiency,
  ];
  if (
    positive.some((value) => !Number.isFinite(value) || value <= 0) ||
    !Number.isFinite(profile.dragAreaM2) ||
    profile.dragAreaM2 < 0 ||
    profile.drivetrainEfficiency > 1 ||
    profile.redlineRpm <= profile.idleRpm ||
    profile.gears.length === 0 ||
    profile.gears.some(
      (ratio, index) =>
        !Number.isFinite(ratio) ||
        ratio <= 0 ||
        (index > 0 && ratio >= profile.gears[index - 1]),
    ) ||
    profile.torqueCurve.length < 2 ||
    profile.torqueCurve.some(
      ([rpm, torque], index) =>
        !Number.isFinite(rpm) ||
        !Number.isFinite(torque) ||
        rpm < 0 ||
        torque < 0 ||
        (index > 0 && rpm <= profile.torqueCurve[index - 1][0]),
    )
  ) {
    throw new RangeError(
      "Vehicle profile requires finite physical values, descending positive gears, and an ordered torque curve.",
    );
  }
}

/** Interpolated input curve bounded by published torque and power peaks, in N m. */
export function torqueAt(profile: CarProfile, rpm: number): number {
  if (
    !Number.isFinite(rpm) ||
    rpm < 0 ||
    rpm > profile.redlineRpm ||
    profile.torqueCurve.length < 2 ||
    !Number.isFinite(profile.peakPowerKw) ||
    profile.peakPowerKw <= 0 ||
    !Number.isFinite(profile.peakTorqueNm) ||
    profile.peakTorqueNm <= 0
  )
    return 0;
  const first = profile.torqueCurve[0];
  const envelope = (torque: number) =>
    Math.max(
      0,
      Math.min(
        torque,
        profile.peakTorqueNm,
        rpm > 0
          ? (profile.peakPowerKw * 60000) / (2 * Math.PI * rpm)
          : Infinity,
      ),
    );
  if (rpm <= first[0]) return envelope(first[1]);
  for (let index = 1; index < profile.torqueCurve.length; index++) {
    const left = profile.torqueCurve[index - 1];
    const right = profile.torqueCurve[index];
    if (rpm <= right[0])
      return envelope(
        left[1] +
          ((right[1] - left[1]) * (rpm - left[0])) / (right[0] - left[0]),
      );
  }
  return envelope(profile.torqueCurve[profile.torqueCurve.length - 1][1]);
}

export function wheelRpm(
  profile: CarProfile,
  speedMS: number,
  gear: number,
): number {
  const ratio = profile.gears[gear - 1];
  if (!Number.isFinite(ratio) || ratio <= 0)
    throw new RangeError("Gear is outside this transmission.");
  return (
    ((speedMS / profile.tyreRadiusM) * ratio * profile.finalDrive * 60) /
    (2 * Math.PI)
  );
}

function gearForSpeed(profile: CarProfile, speedMS: number): number {
  for (let gear = 1; gear <= profile.gears.length; gear++) {
    if (wheelRpm(profile, speedMS, gear) < profile.redlineRpm * 0.88)
      return gear;
  }
  return profile.gears.length;
}

export function createRun(
  profile: CarProfile,
  scenario: DriveScenario,
): DriveState {
  validateProfile(profile);
  let speedMS =
    scenario === "sprint"
      ? 100 / 3.6
      : scenario === "rolling"
        ? 80 / 3.6
        : scenario === "braking"
          ? 160 / 3.6
          : 0;
  let gear = gearForSpeed(profile, speedMS);
  if (scenario === "dyno") {
    gear = profile.gears.reduce(
      (best, ratio, index) =>
        Math.abs(ratio - 1) < Math.abs(profile.gears[best - 1] - 1)
          ? index + 1
          : best,
      1,
    );
    speedMS = profile.idleRpm / wheelRpm(profile, 1, gear);
  }
  const initialRpm = Math.max(
    profile.idleRpm,
    wheelRpm(profile, speedMS, gear),
  );
  if (initialRpm > profile.redlineRpm)
    throw new RangeError(
      "Scenario starting speed exceeds this transmission's redline speed.",
    );
  return {
    scenario,
    status: "ready",
    stage: "idle",
    elapsed: 0,
    speedMS,
    distanceM: 0,
    rpm: Math.min(profile.redlineRpm, initialRpm),
    gear,
    throttle: 0,
    acceleration: 0,
    torqueNm: 0,
    powerKw: 0,
    wheelPowerKw: 0,
    shiftRemaining: 0,
    shiftFromRpm: 0,
    shiftTargetGear: gear,
    lastShiftAt: -10,
  };
}

function beginShift(
  state: DriveState,
  profile: CarProfile,
  direction: -1 | 1,
): void {
  const next = state.gear + direction;
  if (
    state.shiftRemaining > 0 ||
    next < 1 ||
    next > profile.gears.length ||
    wheelRpm(profile, state.speedMS, next) > profile.redlineRpm * 0.98
  )
    return;
  state.shiftFromRpm = state.rpm;
  state.shiftTargetGear = next;
  state.shiftRemaining = profile.shiftSeconds;
  state.lastShiftAt = state.elapsed;
}

function finish(state: DriveState, status: "complete" | "limited"): void {
  state.status = status;
  state.stage = "done";
}

function integrate(
  state: DriveState,
  profile: CarProfile,
  dt: number,
  controls: DriveControls,
): void {
  const dyno = state.scenario === "dyno";
  const braking = state.scenario === "braking";
  const throttle = braking
    ? 0
    : state.scenario === "free"
      ? finiteControl(controls.throttle)
      : 1;
  const brake = braking
    ? 0.65
    : state.scenario === "free"
      ? finiteControl(controls.brake)
      : 0;
  const coupledRpm = wheelRpm(profile, state.speedMS, state.gear);
  if (
    controls.transmission === "auto" &&
    !dyno &&
    state.shiftRemaining <= 0 &&
    state.elapsed - state.lastShiftAt > 0.5
  ) {
    if (throttle > 0.1 && coupledRpm > profile.redlineRpm * 0.96)
      beginShift(state, profile, 1);
    else if (
      state.gear > 1 &&
      coupledRpm < profile.redlineRpm * (brake > 0 ? 0.42 : 0.3)
    )
      beginShift(state, profile, -1);
  }
  const shifting = state.shiftRemaining > 0;
  if (shifting) {
    const fraction = clamp(
      1 - (state.shiftRemaining - dt) / profile.shiftSeconds,
      0,
      1,
    );
    const targetRpm = Math.max(
      profile.idleRpm,
      wheelRpm(profile, state.speedMS, state.shiftTargetGear),
    );
    state.rpm =
      state.shiftFromRpm + (targetRpm - state.shiftFromRpm) * fraction;
    state.stage = state.shiftTargetGear < state.gear ? "rev-match" : "shift";
    state.shiftRemaining = Math.max(0, state.shiftRemaining - dt);
    if (state.shiftRemaining === 0) state.gear = state.shiftTargetGear;
  } else {
    // Idealized slipping clutch holds a launch RPM. Lost slip power is not sent to the wheels.
    const launchRpm =
      profile.idleRpm + (dyno ? 0 : throttle * vehicleModel.launchSlipRpm);
    state.rpm = Math.max(launchRpm, coupledRpm);
    state.stage =
      brake > 0
        ? "brake"
        : throttle === 0
          ? "coast"
          : coupledRpm < launchRpm
            ? "launch"
            : "pull";
  }
  state.rpm = clamp(state.rpm, profile.idleRpm, profile.redlineRpm);
  const limiter = coupledRpm >= profile.redlineRpm ? 0 : 1;
  const cylinderOff =
    controls.disabledCylinder !== null &&
    Number.isInteger(controls.disabledCylinder) &&
    controls.disabledCylinder >= 1 &&
    controls.disabledCylinder <= 8;
  const cylinderFactor = cylinderOff ? 7 / 8 : 1;
  const timingFactor =
    1 -
    finiteControl(controls.timingRetard, 30) *
      vehicleModel.timingTorqueLossPerDegree;
  state.throttle = shifting ? 0 : throttle * limiter;
  state.torqueNm =
    torqueAt(profile, state.rpm) *
    state.throttle *
    cylinderFactor *
    timingFactor;
  const ratio = profile.gears[state.gear - 1] * profile.finalDrive;
  const traction =
    profile.tractionMu * profile.massKg * vehicleModel.gravityMS2;
  const driveForce = Math.min(
    traction,
    (state.torqueNm * ratio * profile.drivetrainEfficiency) /
      profile.tyreRadiusM,
  );
  const engineDrag =
    !shifting && coupledRpm > profile.idleRpm && throttle < 1
      ? ((1 - throttle) *
          vehicleModel.engineBrakingFraction *
          profile.peakTorqueNm *
          (state.rpm / profile.redlineRpm) *
          ratio) /
        profile.tyreRadiusM
      : 0;
  const roadResistance = dyno
    ? vehicleModel.dynoRollerResistanceN
    : vehicleModel.rollingCoefficient *
        profile.massKg *
        vehicleModel.gravityMS2 +
      0.5 *
        vehicleModel.airDensityKgM3 *
        profile.dragAreaM2 *
        state.speedMS ** 2;
  // Service brakes and engine braking share the same tyre contact limit.
  const tyreForce = clamp(
    driveForce - engineDrag - brake * traction,
    -traction,
    traction,
  );
  const oldSpeed = state.speedMS;
  const acceleration = (tyreForce - roadResistance) / profile.massKg;
  // Locate the hard limiter within this step; a driven wheel cannot overrun its coupled redline.
  const redlineSpeed = profile.redlineRpm / wheelRpm(profile, 1, state.gear);
  const proposedSpeed = Math.max(
    0,
    Math.min(
      driveForce > 0 ? redlineSpeed : Infinity,
      oldSpeed + acceleration * dt,
    ),
  );
  const target =
    state.scenario === "launch"
      ? 100 / 3.6
      : state.scenario === "sprint"
        ? 200 / 3.6
        : state.scenario === "rolling"
          ? 160 / 3.6
          : dyno
            ? profile.redlineRpm / wheelRpm(profile, 1, state.gear)
            : Infinity;
  const crossedTarget = proposedSpeed >= target && oldSpeed < target;
  const stopped = braking && proposedSpeed <= 0;
  // Interpolate event time within the integration step instead of quantizing the stopwatch.
  const usedDt = crossedTarget
    ? (dt * (target - oldSpeed)) / (proposedSpeed - oldSpeed)
    : stopped && acceleration < 0
      ? Math.min(dt, oldSpeed / -acceleration)
      : dt;
  state.speedMS = crossedTarget ? target : proposedSpeed;
  state.acceleration = usedDt > 0 ? (state.speedMS - oldSpeed) / usedDt : 0;
  state.distanceM += dyno ? 0 : (oldSpeed + state.speedMS) * 0.5 * usedDt;
  state.elapsed += usedDt;
  if (!shifting)
    state.rpm = clamp(
      Math.max(
        profile.idleRpm + (dyno ? 0 : throttle * vehicleModel.launchSlipRpm),
        wheelRpm(profile, state.speedMS, state.gear),
      ),
      profile.idleRpm,
      profile.redlineRpm,
    );
  // Report the endpoint curve value, not the preceding integration sample at a different RPM.
  state.torqueNm =
    torqueAt(profile, state.rpm) *
    state.throttle *
    cylinderFactor *
    timingFactor;
  state.powerKw = (state.torqueNm * state.rpm * ((2 * Math.PI) / 60)) / 1000;
  state.wheelPowerKw =
    (Math.min(
      traction,
      (state.torqueNm * ratio * profile.drivetrainEfficiency) /
        profile.tyreRadiusM,
    ) *
      state.speedMS) /
    1000;
  if (crossedTarget || stopped) finish(state, "complete");
  else if (
    state.elapsed >= vehicleModel.maximumRunSeconds &&
    state.scenario !== "free"
  )
    finish(state, "limited");
}

/** SI-unit longitudinal simulation. Caller controls pause by withholding ticks or changing status. */
export function stepRun(
  state: DriveState,
  profile: CarProfile,
  dt: number,
  controls: DriveControls,
): void {
  if (state.status !== "running" || !Number.isFinite(dt) || dt <= 0) return;
  validateProfile(profile);
  if (
    controls.transmission === "manual" &&
    controls.shift !== 0 &&
    state.scenario !== "dyno"
  )
    beginShift(state, profile, controls.shift);
  // Ignore time spent in suspended tabs, rather than performing an unbounded catch-up.
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-10 && state.status === "running") {
    const timeToLimit =
      state.scenario === "free"
        ? remaining
        : vehicleModel.maximumRunSeconds - state.elapsed;
    const step = Math.min(
      remaining,
      vehicleModel.maximumStepSeconds,
      timeToLimit,
    );
    if (step <= 1e-10) {
      finish(state, "limited");
      break;
    }
    integrate(state, profile, step, controls);
    remaining -= step;
  }
}
